-- Company Compute Wallet — Phase 0 (shadow metering) scaffold.
--
-- See COMPUTE_WALLET_PLAN.md. In Phase 0 the metering wrapper only WRITES
-- compute_ledger rows with type='shadow' (recording what each AI action WOULD
-- cost). No balances are decremented, no AI is blocked, nothing customer-facing
-- changes. The wallet table + debit_compute RPC ship now so Phases 1–3 build on
-- a stable, audited schema — but nothing enforces yet.

-- ── Wallet: one row per company, two balances (included resets monthly,
--    purchased persists). Unused in Phase 0; populated starting Phase 1.
create table if not exists public.compute_wallet (
  company_id            integer primary key references public.companies(id) on delete cascade,
  included_balance      integer     not null default 0,   -- resets monthly (tier + agents)
  purchased_balance     integer     not null default 0,   -- persists (bought packs)
  included_grant        integer     not null default 0,   -- current monthly grant size
  period_start          date        not null default (date_trunc('month', now())::date),
  cap_credits           integer,                            -- NULL = stop at grant
  auto_refill_pack      text,
  auto_refill_threshold integer     not null default 0,
  low_balance_alert_at  timestamptz,
  updated_at            timestamptz not null default now()
);

-- ── Ledger: append-only audit of every compute event. Source of truth.
create table if not exists public.compute_ledger (
  id                bigserial primary key,
  company_id        integer     not null references public.companies(id) on delete cascade,
  user_id           uuid,
  ts                timestamptz not null default now(),
  type              text        not null,            -- shadow | grant | debit | purchase | refund | adjust
  feature_slug      text        not null,            -- 'receipt_scan', 'lenard_fixture_analyze', ...
  agent_slug        text,                            -- 'zach','lenard',... NULL for built-in AI
  model             text,
  input_tokens      integer     not null default 0,
  output_tokens     integer     not null default 0,
  cache_read_tokens integer     not null default 0,
  cost_usd          numeric(10,5) not null default 0,  -- our COGS for this action
  credits           integer     not null default 0,   -- +grant/+purchase, -debit; shadow stores the would-be debit as positive
  bucket            text,                              -- included | purchased
  stripe_ref        text,
  idempotency_key   text
);

create unique index if not exists compute_ledger_idem_uniq
  on public.compute_ledger(idempotency_key) where idempotency_key is not null;
create index if not exists compute_ledger_company_ts_idx
  on public.compute_ledger(company_id, ts desc);
create index if not exists compute_ledger_feature_idx
  on public.compute_ledger(company_id, feature_slug, ts desc);

-- ── RLS: company members read their own wallet + ledger (powers the Phase 1
--    meter UI). Writes are service-role only (bypasses RLS), so no
--    INSERT/UPDATE policy is defined here.
alter table public.compute_wallet  enable row level security;
alter table public.compute_ledger  enable row level security;

do $$ begin
  create policy compute_wallet_select on public.compute_wallet
    for select using (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

do $$ begin
  create policy compute_ledger_select on public.compute_ledger
    for select using (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

-- ── debit_compute: atomic enforce + ledger write. NOT called in Phase 0 —
--    ships now so Phase 3 enforcement has a stable, audited path. Draws
--    included_balance first, then purchased_balance; idempotent on key.
create or replace function public.debit_compute(
  p_company_id    integer,
  p_user_id       uuid,
  p_feature       text,
  p_agent         text,
  p_model         text,
  p_input_tokens  integer,
  p_output_tokens integer,
  p_cache_tokens  integer,
  p_cost_usd      numeric,
  p_credits       integer,
  p_idempotency   text
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  w          public.compute_wallet%rowtype;
  from_incl  integer := 0;
  from_purch integer := 0;
  remaining  integer := p_credits;
begin
  -- Idempotency: a retried invocation must not double-debit.
  if p_idempotency is not null and exists (
    select 1 from public.compute_ledger where idempotency_key = p_idempotency
  ) then
    select * into w from public.compute_wallet where company_id = p_company_id;
    return jsonb_build_object('ok', true, 'duplicate', true,
      'included_balance',  coalesce(w.included_balance, 0),
      'purchased_balance', coalesce(w.purchased_balance, 0));
  end if;

  select * into w from public.compute_wallet where company_id = p_company_id for update;
  if not found then
    insert into public.compute_wallet(company_id) values (p_company_id) returning * into w;
  end if;

  from_incl  := least(w.included_balance, remaining);
  remaining  := remaining - from_incl;
  from_purch := least(w.purchased_balance, remaining);
  remaining  := remaining - from_purch;

  if remaining > 0 then
    -- Insufficient credits. Caller decides what to do (Phase 3 blocks + prompts
    -- a top-up). Phase 0 never reaches here because it doesn't call this fn.
    return jsonb_build_object('ok', false, 'reason', 'insufficient_credits',
      'shortfall', remaining,
      'included_balance', w.included_balance,
      'purchased_balance', w.purchased_balance);
  end if;

  update public.compute_wallet
     set included_balance  = included_balance  - from_incl,
         purchased_balance = purchased_balance - from_purch,
         updated_at = now()
   where company_id = p_company_id;

  insert into public.compute_ledger(
    company_id, user_id, type, feature_slug, agent_slug, model,
    input_tokens, output_tokens, cache_read_tokens, cost_usd, credits, bucket, idempotency_key)
  values (
    p_company_id, p_user_id, 'debit', p_feature, p_agent, p_model,
    p_input_tokens, p_output_tokens, p_cache_tokens, p_cost_usd, -p_credits,
    case when from_incl = 0 and from_purch > 0 then 'purchased' else 'included' end,
    p_idempotency);

  return jsonb_build_object('ok', true,
    'included_balance',  w.included_balance  - from_incl,
    'purchased_balance', w.purchased_balance - from_purch);
end $$;

revoke all on function public.debit_compute(integer,uuid,text,text,text,integer,integer,integer,numeric,integer,text) from public;
grant execute on function public.debit_compute(integer,uuid,text,text,text,integer,integer,integer,numeric,integer,text) to service_role;

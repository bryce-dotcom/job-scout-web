-- =====================================================================
-- State unemployment (SUI) rate — the Gusto model.
--
-- Nobody can look an employer's SUI rate up: the state assigns it from the
-- employer's own claims history and mails it (Utah DWS: the "Contribution
-- Rate Notice", box J, every December). Gusto's answer, which we adopt:
--   1. tell the user exactly where the number is;
--   2. let them run payroll on a temporary "new employer" rate meanwhile;
--   3. when the real rate lands, true-up the quarter — book the difference
--      as a liability (or a credit), never amend a paystub;
--   4. every year, ask for the new one and flag a stale rate.
--
-- Three nullable columns on companies say what the rate on file IS (an
-- estimate or an assigned rate, from when, and the notice it came from),
-- and company_sui_rates keeps every rate ever entered, so the Form 33H for
-- a past quarter uses the rate that was in force THEN, not the one entered
-- since. (Bryce, 14 Sep: "build it the gusto way with the true-up".)
-- =====================================================================

alter table public.companies
  add column if not exists sui_rate_source text
    check (sui_rate_source in ('notice', 'provider', 'estimate', 'manual')),
  add column if not exists sui_rate_effective_date date,
  add column if not exists sui_rate_notice_path text;

comment on column public.companies.sui_rate_source is
  'Where sui_rate_pct came from: notice = the agency rate notice; provider = copied from Gusto/another payroll provider; estimate = the state new-employer rate used until the notice arrives (flagged everywhere, blocks Form 33H); manual = typed, origin unknown.';
comment on column public.companies.sui_rate_effective_date is
  'The date the rate on file took effect (Utah: January 1). The health check flags a rate whose year has passed.';

create table if not exists public.company_sui_rates (
  id              serial primary key,
  company_id      integer not null references public.companies(id) on delete cascade,
  rate_pct        numeric(6,4) not null,
  effective_date  date not null,
  source          text not null check (source in ('notice', 'provider', 'estimate', 'manual')),
  notice_path     text,
  entered_by      text,
  note            text,
  created_at      timestamptz not null default now()
);

create index if not exists company_sui_rates_company_idx
  on public.company_sui_rates (company_id, effective_date desc, created_at desc);

alter table public.company_sui_rates enable row level security;

do $$ begin
  create policy tenant_isolation on public.company_sui_rates
    for all to authenticated
    using (company_id in (select public.current_user_company_ids()))
    with check (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

-- The trial read-only gate (20260722000000) was applied by looping over the
-- tables that existed that day. A table born later has to ask for it.
do $$ begin
  create policy require_writable_ins on public.company_sui_rates
    as restrictive for insert to authenticated with check (public.company_can_write(company_id));
  create policy require_writable_upd on public.company_sui_rates
    as restrictive for update to authenticated using (public.company_can_write(company_id)) with check (public.company_can_write(company_id));
  create policy require_writable_del on public.company_sui_rates
    as restrictive for delete to authenticated using (public.company_can_write(company_id));
exception when duplicate_object then null; end $$;

-- A tax rate is company identity: Admin and above, same as the columns on
-- the company record (guard_rate_books refuses below Admin and names the
-- operation; reused rather than copied, as in 20260827170000 §C).
drop trigger if exists guard_rate_books on public.company_sui_rates;
create trigger guard_rate_books
  before insert or update or delete on public.company_sui_rates
  for each row execute function public.guard_rate_books();

-- ---------------------------------------------------------------------
-- The company-identity guard (20260827170000 §B) lists the tax columns
-- nothing below Admin may touch. Re-created from the live definition with
-- the three new columns added; nothing else changes.
-- ---------------------------------------------------------------------
create or replace function public.guard_company_identity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
  changed text[] := array[]::text[];
  col text;
begin
  if jwt_email is null then return new; end if;
  if public.current_user_access_level() >= 3 then return new; end if;

  foreach col in array array[
    'billing_status','billing_email','billing_notes','billing_payment_method_brand',
    'billing_payment_method_last4','master_stripe_customer_id','master_stripe_subscription_id',
    'trial_ends_at','subscription_tier','prospecting_tier','prospecting_stripe_sub_id',
    'ein','legal_name','tax_exempt_number','entity_type','state_of_incorporation',
    'license_number','insurance_policy_number','workers_comp_policy','bond_amount',
    'state_employer_id','sui_account_number','sui_rate_pct','sui_wage_base',
    'sui_rate_source','sui_rate_effective_date','sui_rate_notice_path',
    'futa_rate_pct','federal_deposit_schedule','state_deposit_schedule',
    'efile_efin','bso_user_id','active'] loop
    if to_jsonb(new) -> col is distinct from to_jsonb(old) -> col then
      changed := array_append(changed, col);
    end if;
  end loop;

  if cardinality(changed) > 0 then
    raise exception 'Only an admin can change % on the company record.', array_to_string(changed, ', ')
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_company_identity on public.companies;
create trigger guard_company_identity
  before update on public.companies
  for each row execute function public.guard_company_identity();

-- ---------------------------------------------------------------------
-- Backfill: a rate that was already on file becomes the first history row
-- (origin unknown, so 'manual', effective the first of this year — the
-- only date the calculator has ever applied it from). No company had one
-- on 14 Sep 2026, so this is here for the tenants that come after.
-- ---------------------------------------------------------------------
insert into public.company_sui_rates (company_id, rate_pct, effective_date, source, note)
select c.id, c.sui_rate_pct,
       make_date(extract(year from now())::int, 1, 1),
       'manual',
       'Backfilled from companies.sui_rate_pct on ' || to_char(now(), 'YYYY-MM-DD')
from public.companies c
where c.sui_rate_pct is not null
  and not exists (select 1 from public.company_sui_rates r where r.company_id = c.id);

update public.companies
   set sui_rate_source = coalesce(sui_rate_source, 'manual'),
       sui_rate_effective_date = coalesce(sui_rate_effective_date, make_date(extract(year from now())::int, 1, 1))
 where sui_rate_pct is not null;

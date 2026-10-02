-- Simple, sequential invoice numbers, per tenant.
--
-- Christopher (7d03fcec): "Having a simple number instead of a complicated
-- alphabetical one would make communicating with clients their invoice numbers
-- easier." Today an invoice is INV-MUOH7H6Y — a base-36 Date.now(), minted in
-- eight different places. Nobody can read that down a phone.
--
-- Allocation has to happen in the DATABASE. The number was previously built in
-- the browser, where two people invoicing in the same millisecond-ish window
-- have no way to agree, and `invoices.invoice_id` has no unique index to catch
-- it. One atomic UPDATE ... RETURNING per allocation is the whole mechanism.
--
-- Deliberately NOT adding a unique index on invoice_id: a customer invoice and
-- its paired utility invoice SHARE one number on purpose, so the two reconcile
-- to the same line on the utility's books (JobDetail.createBothInvoices).
-- There are 69 such pairs; a unique index would reject them all.
--
-- Existing numbers are left exactly as they are — no backfill (Bryce: "just
-- start from here"). Nothing in the data is numerically numbered yet, so the
-- new sequence cannot collide with an old number.

create table if not exists public.invoice_number_counters (
  company_id  integer primary key references public.companies(id) on delete cascade,
  next_number integer not null default 1001,   -- 1001 so a first invoice does not read "1"
  updated_at  timestamptz not null default now()
);

alter table public.invoice_number_counters enable row level security;

do $$ begin
  create policy tenant_isolation on public.invoice_number_counters
    for all using (company_id in (select public.current_user_company_ids()));
exception when duplicate_object then null; end $$;

-- Hand out the next number for one company, atomically.
--
-- SECURITY DEFINER so it can write the counter regardless of the caller's
-- policies, but it refuses a company the caller is not part of — otherwise any
-- authenticated user could burn another tenant's numbering.
create or replace function public.next_invoice_number(p_company_id integer)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  n integer;
begin
  if p_company_id is null then
    raise exception 'next_invoice_number: company_id is required';
  end if;
  -- The service role (edge functions — estimate conversion mints the deposit
  -- invoice) carries no JWT, so current_user_company_ids() is empty for it and
  -- the tenant check below would refuse every server-side allocation. It is
  -- already trusted with every table; the check exists to stop one AUTHENTICATED
  -- tenant burning another tenant's numbering.
  -- The caller's role comes from the JWT, NOT from current_user: this function
  -- is SECURITY DEFINER, so inside it current_user is the function's owner and
  -- never tells you who called.
  if coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '') <> 'service_role'
     and not exists (select 1 from public.current_user_company_ids() c where c = p_company_id) then
    raise exception 'next_invoice_number: not your company';
  end if;

  insert into public.invoice_number_counters (company_id)
  values (p_company_id)
  on conflict (company_id) do nothing;

  -- The allocation. Returns the number taken and leaves the next one behind,
  -- under a row lock, so concurrent callers cannot be handed the same value.
  update public.invoice_number_counters
     set next_number = next_number + 1,
         updated_at  = now()
   where company_id = p_company_id
  returning next_number - 1 into n;

  return n;
end;
$$;

grant execute on function public.next_invoice_number(integer) to authenticated;

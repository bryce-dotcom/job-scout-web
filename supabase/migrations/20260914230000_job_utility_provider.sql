-- A job knows which utility it is with.
--
-- Until now the only place a job's utility lived was the lighting audit behind
-- it. A job with no audit raised a utility record named "Utility", and its
-- customer invoice printed "Utility Incentive" with no name on it (Alayda,
-- 550b056d — three of her September invoices). The job page now carries the
-- provider, pre-filled from the audit or the company's default, and the record,
-- the invoice, the portal and the email all read it.
alter table public.jobs
  add column if not exists utility_provider_id integer references public.utility_providers(id) on delete set null;
create index if not exists jobs_utility_provider_id_idx on public.jobs (utility_provider_id);

-- The company default lives in settings under key 'default_utility_provider_id'.
-- Every page saves a setting with upsert(..., { onConflict: 'company_id,key' }),
-- and there has never been a unique constraint for that to match: Postgres
-- refused every one of those saves (42P10) and the pages did not check —
-- Books' accounting basis, Employees (3 sites), Payroll (8 sites) all silently
-- kept the old value. No duplicate (company_id, key) rows exist as of
-- 2026-09-14, so the constraint can go on and those saves start working.
create unique index if not exists settings_company_key_uniq on public.settings (company_id, key);

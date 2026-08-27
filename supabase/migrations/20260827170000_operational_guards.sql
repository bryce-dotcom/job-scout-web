-- =====================================================================
-- Intra-tenant authorization — stage 4: the operational tier.
--
-- The audit ranked these 73 tables moderate, and most of them deserve
-- that: jobs, leads, time clock, inventory, job lines. Writing those IS
-- the work. Locking them down would be locking down the product.
--
-- Two things were hiding in the bucket, though, because the tier was
-- assigned by "everything that isn't money, payroll, pricing or people":
--
--   COMPANY CONFIGURATION. `settings` carries business units, lead
--   sources, service types, upsells, pipeline stages, job statuses,
--   payment and Plaid config. `companies` carries billing, tax and legal
--   identity. Neither is operational in any useful sense.
--
--   DESTRUCTION OF WORK HISTORY. Deleting a job or a lead is not an
--   edit. It removes the row every invoice, quote and commission joins
--   back to.
--
-- Both are guarded here. The other ~60 tables are deliberately left
-- alone: they are the daily work, and there is no version of restricting
-- them that is worth the risk of a silent denial mid-job.
--
-- The line is MANAGER (level 2), not Admin, everywhere it can be. That
-- is deliberate. PMJobSetter writes job_statuses, job_section_statuses
-- and job_calendars, and ProductsServices writes product_sections —
-- config screens that project managers legitimately run. Admin-only
-- would have broken both. Manager still shuts out every field tech,
-- which is the actual exposure.
--
-- Service-role callers are exempt throughout (no JWT email).
-- =====================================================================


-- ---------------------------------------------------------------------
-- A. Company configuration needs a manager.
-- ---------------------------------------------------------------------
create or replace function public.guard_company_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
begin
  if jwt_email is null then return coalesce(new, old); end if;
  if public.current_user_access_level() >= 2 then return coalesce(new, old); end if;
  raise exception 'Changing company settings needs manager access.'
    using errcode = '42501';
end;
$$;

drop trigger if exists guard_company_settings on public.settings;
create trigger guard_company_settings
  before insert or update or delete on public.settings
  for each row execute function public.guard_company_settings();


-- ---------------------------------------------------------------------
-- B. The company record. LeadSetter.jsx updates `companies`, and setters
--    are not managers — so the table stays open and the columns that
--    carry billing, tax and legal identity are guarded instead. Nothing
--    below Admin has any reason to touch those.
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
-- C. Admin consoles. One admin-only screen writes each of these, so the
--    whole write surface closes. guard_rate_books() already does exactly
--    this job (refuse below Admin, name the operation); reusing it keeps
--    one behaviour rather than a second near-copy.
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['system_settings', 'agents', 'saved_queries'] loop
    execute format('drop trigger if exists guard_rate_books on public.%I', t);
    execute format($p$
      create trigger guard_rate_books
        before insert or update or delete on public.%I
        for each row execute function public.guard_rate_books()
    $p$, t);
  end loop;
end $$;


-- ---------------------------------------------------------------------
-- D. Deleting work history needs a manager.
--
--    Editing a job or a lead stays open — that is the job. Removing one
--    takes with it the row that invoices, quotes, commissions and job
--    lines all point back to, and nothing restores it.
--
--    Manager rather than Admin again: a PM closing out bad data is
--    normal, a field tech deleting a job is not.
-- ---------------------------------------------------------------------
create or replace function public.guard_history_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  jwt_email text := nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '');
begin
  if jwt_email is null then return old; end if;
  if public.current_user_access_level() >= 2 then return old; end if;
  raise exception 'Deleting a % needs manager access.', rtrim(tg_table_name, 's')
    using errcode = '42501';
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['jobs', 'leads'] loop
    execute format('drop trigger if exists guard_history_delete on public.%I', t);
    execute format($p$
      create trigger guard_history_delete
        before delete on public.%I
        for each row execute function public.guard_history_delete()
    $p$, t);
  end loop;
end $$;

notify pgrst, 'reload schema';

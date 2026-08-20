-- =====================================================================
-- Tenant-isolation RLS rollout — STAGE 3 (reference / catalog tables).
--
-- Split into two groups because a data check found SHARED reference rows:
--
--   SHARED/MIXED: utility_providers/programs/rate_schedules/forms are
--   100% global (company_id IS NULL — real utilities like SRP/APS that
--   every tenant reads); incentive_measures & prescriptive_measures mix
--   global baseline rows with per-company rows. The plain policy would
--   hide the NULL rows and blank out the whole utility/lighting/rebate
--   feature. These get: WRITE own-company only (FOR ALL), READ own +
--   global (extra FOR SELECT policy on company_id IS NULL). Global rows
--   are maintained by the ai-utility-research / parse-utility-pdf edge
--   functions on the service role (which bypasses RLS).
--
--   PER-COMPANY: the rest have no NULL rows → the standard policy.
--
-- Reversible per table via DISABLE ROW LEVEL SECURITY.
-- =====================================================================

-- ── Group A: shared/mixed (read own+global, write own) ───────────────
do $$
declare
  t text;
  tables text[] := array[
    'utility_providers','utility_programs','utility_rate_schedules',
    'utility_forms','incentive_measures','prescriptive_measures'
  ];
begin
  foreach t in array tables loop
    if not exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      raise notice 'skip % (no table)', t; continue;
    end if;

    -- writes + own-row reads
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$
      create policy tenant_isolation on public.%I
        for all to authenticated
        using (company_id in (select public.current_user_company_ids()))
        with check (company_id in (select public.current_user_company_ids()))
    $p$, t);

    -- read-only visibility of shared/global rows (company_id IS NULL)
    execute format('drop policy if exists tenant_read_global on public.%I', t);
    execute format($p$
      create policy tenant_read_global on public.%I
        for select to authenticated
        using (company_id is null)
    $p$, t);

    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    raise notice 'RLS enabled + own/global policies: %', t;
  end loop;
end $$;

-- ── Group B: per-company reference/catalog (standard policy) ──────────
do $$
declare
  t text;
  tables text[] := array[
    'utility_invoices','incentives','fixture_types','products_services',
    'product_components','product_groups','labor_rates','lawn_pricing',
    'migration_jobs','rebate_update_log'
  ];
begin
  foreach t in array tables loop
    if not exists (select 1 from pg_tables where schemaname='public' and tablename=t) then
      raise notice 'skip % (no table)', t; continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
       where table_schema='public' and table_name=t and column_name='company_id'
    ) then
      raise notice 'skip % (no company_id)', t; continue;
    end if;

    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$
      create policy tenant_isolation on public.%I
        for all to authenticated
        using (company_id in (select public.current_user_company_ids()))
        with check (company_id in (select public.current_user_company_ids()))
    $p$, t);

    execute format('alter table public.%I enable row level security', t);
    execute format('alter table public.%I force row level security', t);
    raise notice 'RLS enabled + tenant policy: %', t;
  end loop;
end $$;

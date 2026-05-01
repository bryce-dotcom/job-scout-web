-- =====================================================================
-- Tenant isolation via Row-Level Security.
--
-- BLOCKER for beta: every tenant table was readable by anonymous
-- requests. A stranger with the published anon key + curl could pull
-- every customer / job / invoice in the database. This migration:
--
--   1. Adds a SECURITY DEFINER helper that returns the company_id(s)
--      the currently authenticated user belongs to.
--   2. Enables RLS on every public tenant table.
--   3. Adds a single permissive policy per table that gates rows by
--      that helper.
--
-- Service-role connections (edge functions, scripts/*.cjs) bypass RLS
-- and continue to work unchanged. Authenticated users get rows for
-- their own company only. Anonymous users get nothing back.
--
-- Linkage from auth.users to companies goes through the existing
-- employees.email column — that's how the app already determines the
-- current company. No new column / FK needed.
--
-- Special tables:
--   - companies          -> see your own company row
--   - employees          -> see employees in your company
--   - customer_portal_tokens -> public reads must keep working via the
--                               edge function (service role); anon
--                               select stays denied (already was)
--   - beta_invite_codes  -> the beta-signup edge function uses service
--                           role; lock anon out completely
-- =====================================================================

-- 1. Helper: get company_ids for the authenticated user.
-- SECURITY DEFINER so the function itself can bypass RLS on employees
-- (otherwise we'd recurse).
CREATE OR REPLACE FUNCTION public.current_user_company_ids()
RETURNS SETOF integer
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT company_id
    FROM public.employees
   WHERE active = TRUE
     AND lower(email) = lower(coalesce(
           current_setting('request.jwt.claims', true)::jsonb ->> 'email',
           ''
         ))
$$;

REVOKE ALL ON FUNCTION public.current_user_company_ids() FROM public;
GRANT EXECUTE ON FUNCTION public.current_user_company_ids() TO authenticated, anon;

-- 2. Helper for boolean checks (handy from policies).
CREATE OR REPLACE FUNCTION public.belongs_to_company(target_company_id integer)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.current_user_company_ids() c
     WHERE c = target_company_id
  )
$$;

CREATE OR REPLACE FUNCTION public.belongs_to_company(target_company_id bigint)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.current_user_company_ids() c
     WHERE c::bigint = target_company_id
  )
$$;

GRANT EXECUTE ON FUNCTION public.belongs_to_company(integer) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.belongs_to_company(bigint) TO authenticated, anon;

-- 3. Bulk-enable RLS + add the standard tenant policy on every table
-- that has a company_id column. Wrapped in DO blocks with EXCEPTION
-- handlers so re-running the migration is idempotent.
DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'customers', 'leads', 'jobs', 'invoices', 'quotes', 'quote_lines',
    'payments', 'time_off_requests', 'time_entries', 'verification_reports',
    'verification_photos', 'feedback', 'lighting_audits', 'audit_areas',
    'fleet', 'fleet_maintenance', 'fleet_rentals', 'inventory', 'expenses',
    'manual_expenses', 'plaid_transactions', 'plaid_items', 'utility_invoices',
    'company_notifications', 'appointments', 'products_services',
    'lead_payments', 'leads_payments', 'job_sections', 'job_lines',
    'time_log_entries', 'payroll_adjustments', 'settings',
    'company_agents', 'audit_log', 'communications_log', 'deal_activities',
    'document_packages', 'custom_forms', 'fixture_types', 'helpers',
    'incentives', 'liabilities', 'utility_providers', 'utility_programs',
    'rebate_rates', 'prescriptive_measures', 'bookings',
    'file_attachments', 'task_lists', 'tasks', 'job_costing',
    'manual_payments', 'expense_categories', 'bank_accounts',
    'audit_photos'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    -- Skip if table doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t
    ) THEN
      RAISE NOTICE 'skip % (table not found)', t;
      CONTINUE;
    END IF;

    -- Skip if column doesn't exist
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = t AND column_name = 'company_id'
    ) THEN
      RAISE NOTICE 'skip % (no company_id column)', t;
      CONTINUE;
    END IF;

    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);

    -- Drop any pre-existing version of the standard policy first so this
    -- migration is idempotent
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);

    -- Permissive: rows visible / writable when company_id belongs to caller
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON public.%I
        FOR ALL
        TO authenticated
        USING (public.belongs_to_company(company_id))
        WITH CHECK (public.belongs_to_company(company_id))
    $p$, t);
    RAISE NOTICE 'RLS + policy applied: %', t;
  END LOOP;
END $$;

-- =====================================================================
-- 4. companies table — special case. Users need to read their own
-- company row to know what they're a member of.
-- =====================================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.companies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.companies;
CREATE POLICY tenant_isolation ON public.companies
  FOR ALL
  TO authenticated
  USING (public.belongs_to_company(id))
  WITH CHECK (public.belongs_to_company(id));

-- =====================================================================
-- 5. employees table — users need to see employees in their company.
-- =====================================================================
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.employees;
CREATE POLICY tenant_isolation ON public.employees
  FOR ALL
  TO authenticated
  USING (public.belongs_to_company(company_id))
  WITH CHECK (public.belongs_to_company(company_id));

-- =====================================================================
-- 6. customer_portal_tokens — anon must NOT read/write directly.
-- The /portal/:token page hits the get-portal-document edge function
-- which uses the service role, so anon access stays denied.
-- =====================================================================
ALTER TABLE public.customer_portal_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_portal_tokens FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON public.customer_portal_tokens;
CREATE POLICY tenant_isolation ON public.customer_portal_tokens
  FOR ALL
  TO authenticated
  USING (public.belongs_to_company(company_id))
  WITH CHECK (public.belongs_to_company(company_id));

-- =====================================================================
-- 7. beta_invite_codes — locked down. Reading codes happens server-
-- side via the beta-signup edge function (service role).
-- =====================================================================
ALTER TABLE public.beta_invite_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.beta_invite_codes FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS no_anon_access ON public.beta_invite_codes;
-- Authenticated developers can list codes; everyone else gets nothing
CREATE POLICY no_anon_access ON public.beta_invite_codes
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.employees
       WHERE lower(email) = lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''))
         AND is_developer = TRUE
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.employees
       WHERE lower(email) = lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email', ''))
         AND is_developer = TRUE
    )
  );

-- =====================================================================
-- 8. company_portal_settings — used by Zach instant-quote public route
-- (reads settings by company slug). Allow anon SELECT for the slug
-- mapping but nothing else.
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'settings') THEN
    -- settings table holds public-ish per-company config. The slug
    -- routes (Zach instant-quote, Lenard agents) hit settings by key
    -- through edge functions (service role). Authenticated tenant
    -- isolation is already in place via the bulk loop above.
    NULL;
  END IF;
END $$;

-- =====================================================================
-- Audit log entry so future migrations know this baseline exists
-- =====================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'audit_log') THEN
    INSERT INTO public.audit_log (company_id, user_email, action, table_name, record_id, new_values, created_at)
    VALUES (NULL, 'system@migration', 'enable_rls_baseline', 'public', 'all_tenant_tables',
            jsonb_build_object('migration', '20260501222808_enable_rls_tenant_isolation'), NOW());
  END IF;
END $$;

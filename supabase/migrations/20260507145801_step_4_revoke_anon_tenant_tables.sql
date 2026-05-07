-- ====================================================================
-- Step 4 — Defense-in-depth: REVOKE all anon grants from tenant tables
-- that don't already have RLS.
--
-- Approach: NO RLS on these tables (would risk the breakage we hit
-- last time). Instead, simply remove the anon role's table-level
-- privileges. Authenticated users keep working because supabase-js
-- switches them to the `authenticated` role once their JWT is in
-- session.
--
-- Tables KEPT open to anon (for public Lenard agents, login flow,
-- shared reference data) — explicitly NOT in this list:
--   companies, employees, agents, ai_modules, settings, helpers,
--   company_agents, fixture_types, fixture_categories,
--   fixture_wattage_reference, lamp_types, visual_identification_guide,
--   prescriptive_measures, utility_providers, utility_programs,
--   utility_rate_schedules, incentive_measures, system_settings,
--   rebate_update_log, form_registry
--
-- REVERT (paste into SQL Editor):
--   GRANT SELECT, INSERT, UPDATE, DELETE ON
--     <comma-separated table list below>
--   TO anon;
--   NOTIFY pgrst, 'reload schema';
-- ====================================================================

DO $$
DECLARE
  tenant_tables text[] := ARRAY[
    -- Operations
    'appointments', 'bookings', 'routes',
    -- Time + Verification
    'time_off_requests', 'time_log', 'time_clock',
    'verification_reports', 'verification_photos',
    -- Financials (long tail; the big ones are RLS-locked already)
    'expenses', 'manual_expenses', 'expense_categories',
    'utility_invoices', 'incentives',
    'bank_accounts', 'liabilities',
    'customer_payment_methods',
    -- Payroll (PII-heavy)
    'payroll_runs', 'paystubs',
    'lead_commissions', 'setter_commissions',
    'labor_rates',
    -- Activity / audit
    'communications_log', 'audit_log', 'deal_activities',
    'company_notifications',
    -- AI / chat history (per tenant)
    'ai_messages', 'ai_sessions',
    -- Documents
    'document_packages', 'custom_forms',
    -- Inventory / fleet
    'inventory', 'fleet', 'fleet_maintenance', 'fleet_rentals',
    'assets',
    -- Lighting (per tenant)
    'lighting_audits', 'audit_areas',
    -- Catalog (per tenant)
    'products_services', 'product_groups',
    -- Misc per-tenant
    'reports', 'saved_queries', 'search_index', 'sync_log',
    'webhook_form', 'feedback'
  ];
  t text;
BEGIN
  FOREACH t IN ARRAY tenant_tables
  LOOP
    -- Only revoke if the table actually exists; skip silently otherwise.
    IF EXISTS (SELECT 1 FROM pg_class c
               JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relname = t AND c.relkind = 'r') THEN
      EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
      RAISE NOTICE 'revoked anon on %', t;
    ELSE
      RAISE NOTICE 'skipped % (table not found)', t;
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- Step 3e — RLS on `invoices` + `payments` + `lead_payments`.
--
-- All three have company_id. Same pattern as everything in Step 3.
-- These are the financial tables — locking them down is the most
-- security-critical step of the RLS rollout.
--
-- REVERT:
--   DROP POLICY IF EXISTS tenant_isolation ON public.invoices;
--   DROP POLICY IF EXISTS tenant_isolation ON public.payments;
--   DROP POLICY IF EXISTS tenant_isolation ON public.lead_payments;
--   ALTER TABLE public.invoices       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.invoices       NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.payments       DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.payments       NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.lead_payments  DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.lead_payments  NO FORCE ROW LEVEL SECURITY;
--   GRANT ALL ON public.invoices, public.payments, public.lead_payments
--     TO anon, authenticated;
--   NOTIFY pgrst, 'reload schema';
-- ====================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname, c.relname
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname IN ('invoices','payments','lead_payments')
      AND c.relnamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.polname, r.relname);
  END LOOP;
END $$;

REVOKE ALL ON public.invoices, public.payments, public.lead_payments FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE
  ON public.invoices, public.payments, public.lead_payments
  TO authenticated;

ALTER TABLE public.invoices      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoices      FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.payments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments      FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.lead_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_payments FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.invoices
  AS PERMISSIVE FOR ALL TO authenticated
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

CREATE POLICY tenant_isolation ON public.payments
  AS PERMISSIVE FOR ALL TO authenticated
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

CREATE POLICY tenant_isolation ON public.lead_payments
  AS PERMISSIVE FOR ALL TO authenticated
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

NOTIFY pgrst, 'reload schema';

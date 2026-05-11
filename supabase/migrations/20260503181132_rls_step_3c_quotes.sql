-- ====================================================================
-- Step 3c — RLS on `quotes` + `quote_lines`.
--
-- Both tables have company_id directly. Same pattern as customers/leads.
--
-- REVERT:
--   DROP POLICY IF EXISTS tenant_isolation ON public.quotes;
--   DROP POLICY IF EXISTS tenant_isolation ON public.quote_lines;
--   ALTER TABLE public.quotes      DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.quotes      NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.quote_lines DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.quote_lines NO FORCE ROW LEVEL SECURITY;
--   GRANT ALL ON public.quotes, public.quote_lines TO anon, authenticated;
--   NOTIFY pgrst, 'reload schema';
-- ====================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname, c.relname
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname IN ('quotes','quote_lines') AND c.relnamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.polname, r.relname);
  END LOOP;
END $$;

REVOKE ALL ON public.quotes, public.quote_lines FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.quotes, public.quote_lines TO authenticated;

ALTER TABLE public.quotes      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes      FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_lines FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.quotes
  AS PERMISSIVE FOR ALL TO authenticated
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

CREATE POLICY tenant_isolation ON public.quote_lines
  AS PERMISSIVE FOR ALL TO authenticated
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

NOTIFY pgrst, 'reload schema';

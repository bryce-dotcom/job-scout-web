-- ====================================================================
-- Step 3d — RLS on `jobs` + `job_lines` + `job_sections`.
--
-- All three have company_id. Same pattern as customers/leads/quotes.
--
-- Note: the Lenard signature flow ALSO updated jobs directly via anon
-- before. That was already migrated to the lenard-capture-signature
-- edge function in Step 3b, so jobs is safe to lock strictly.
--
-- REVERT:
--   DROP POLICY IF EXISTS tenant_isolation ON public.jobs;
--   DROP POLICY IF EXISTS tenant_isolation ON public.job_lines;
--   DROP POLICY IF EXISTS tenant_isolation ON public.job_sections;
--   ALTER TABLE public.jobs         DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.jobs         NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.job_lines    DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.job_lines    NO FORCE ROW LEVEL SECURITY;
--   ALTER TABLE public.job_sections DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.job_sections NO FORCE ROW LEVEL SECURITY;
--   GRANT ALL ON public.jobs, public.job_lines, public.job_sections
--     TO anon, authenticated;
--   NOTIFY pgrst, 'reload schema';
-- ====================================================================

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname, c.relname
    FROM pg_policy p JOIN pg_class c ON c.oid = p.polrelid
    WHERE c.relname IN ('jobs','job_lines','job_sections')
      AND c.relnamespace = 'public'::regnamespace
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.polname, r.relname);
  END LOOP;
END $$;

REVOKE ALL ON public.jobs, public.job_lines, public.job_sections FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE
  ON public.jobs, public.job_lines, public.job_sections
  TO authenticated;

ALTER TABLE public.jobs         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.jobs         FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.job_lines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_lines    FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.job_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.job_sections FORCE  ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation ON public.jobs
  AS PERMISSIVE FOR ALL TO authenticated
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

CREATE POLICY tenant_isolation ON public.job_lines
  AS PERMISSIVE FOR ALL TO authenticated
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

CREATE POLICY tenant_isolation ON public.job_sections
  AS PERMISSIVE FOR ALL TO authenticated
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

NOTIFY pgrst, 'reload schema';

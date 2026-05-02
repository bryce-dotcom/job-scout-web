-- ====================================================================
-- EMERGENCY REVERT — disable RLS everywhere I enabled it.
--
-- The tenant-isolation policies broke real workflows in HHH (AI crew
-- vanished from menu, Arnie missing, feedback broken, base camp unable
-- to load). Restoring the prior open-access state immediately so the
-- production app keeps working. Tenant isolation will be redone in a
-- careful staged plan after diagnosis — see BETA_READINESS.md.
--
-- This drops every policy I added and disables RLS on every public
-- table that has RLS turned on. It is safe to run multiple times.
-- ====================================================================

DO $$
DECLARE
  rec record;
BEGIN
  -- 1. Drop every policy I created (tenant_isolation,
  --    no_anon_access, anon_signature_capture, anon_insert)
  FOR rec IN
    SELECT
      n.nspname AS schemaname,
      c.relname AS tablename,
      p.polname AS policyname
    FROM pg_policy p
    JOIN pg_class c   ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polname IN ('tenant_isolation', 'no_anon_access', 'anon_signature_capture', 'anon_insert')
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, rec.tablename);
    RAISE NOTICE 'dropped policy % on %', rec.policyname, rec.tablename;
  END LOOP;

  -- 2. Disable RLS on every public table where it's currently enabled.
  FOR rec IN
    SELECT n.nspname AS schemaname, c.relname AS tablename
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity = TRUE
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', rec.tablename);
    EXECUTE format('ALTER TABLE public.%I NO FORCE ROW LEVEL SECURITY', rec.tablename);
    RAISE NOTICE 'RLS disabled on %', rec.tablename;
  END LOOP;
END $$;

-- 3. Drop the helper functions I created (kept for now in case of
-- partial rollback, but they're not referenced by anything).
DROP FUNCTION IF EXISTS public.belongs_to_company(integer);
DROP FUNCTION IF EXISTS public.belongs_to_company(bigint);
DROP FUNCTION IF EXISTS public.current_user_company_ids();

-- 4. Force PostgREST schema reload so the API picks up the change
NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- Step 3b — STRICT RLS on `leads`.
--
-- Anon needs no special access — the Lenard public agents now call the
-- lenard-capture-signature edge function instead of UPDATE-ing leads
-- directly. The edge function uses service-role inside, so RLS is
-- bypassed for that one specific operation.
--
-- Net effect:
--   - Anon: 0 rows, no INSERT/UPDATE/DELETE
--   - Authenticated: only own-tenant rows
--   - Service role: bypass (admin scripts unaffected)
--
-- REVERT (paste into SQL Editor if needed):
--   DROP POLICY IF EXISTS tenant_isolation ON public.leads;
--   ALTER TABLE public.leads DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.leads NO FORCE ROW LEVEL SECURITY;
--   GRANT ALL ON public.leads TO anon, authenticated;
--   NOTIFY pgrst, 'reload schema';
-- ====================================================================

-- 1. Drop any prior policies (including the anon carve-out the previous
-- 3b migration created).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy WHERE polrelid = 'public.leads'::regclass
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.leads', r.polname);
  END LOOP;
END $$;

-- 2. Reset grants. Strip anon completely; restore authenticated.
REVOKE ALL ON public.leads FROM anon;
GRANT  SELECT, INSERT, UPDATE, DELETE ON public.leads TO authenticated;

-- 3. Enable + force RLS.
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads FORCE  ROW LEVEL SECURITY;

-- 4. Single tenant-isolation policy.
CREATE POLICY tenant_isolation
  ON public.leads
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING      (company_id IN (SELECT public.current_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));

-- 5. Reload PostgREST schema cache.
NOTIFY pgrst, 'reload schema';

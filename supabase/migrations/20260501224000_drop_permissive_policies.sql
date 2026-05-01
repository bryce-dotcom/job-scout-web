-- Drop the pre-existing permissive RLS policies that left every tenant
-- table publicly readable. They were "USING: true" policies attached
-- to no specific role (i.e. PUBLIC), which OR'd against my new
-- tenant_isolation policy and made the latter useless.
--
-- After this, only tenant_isolation remains -> rows visible to the
-- authenticated owning company, denied to anon.

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT
      n.nspname AS schemaname,
      c.relname AS tablename,
      p.polname AS policyname
    FROM pg_policy p
    JOIN pg_class c   ON c.oid = p.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND p.polname <> 'tenant_isolation'
      AND p.polname <> 'no_anon_access'
  LOOP
    -- Belt and suspenders: only drop policies that aren't ours.
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', rec.policyname, rec.tablename);
    RAISE NOTICE 'dropped policy % on %', rec.policyname, rec.tablename;
  END LOOP;
END $$;

-- Force PostgREST to reload its schema so the policy changes take effect immediately
NOTIFY pgrst, 'reload schema';

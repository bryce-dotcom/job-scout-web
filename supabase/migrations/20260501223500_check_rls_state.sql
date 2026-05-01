-- Diagnostic: a function to read pg_class.relrowsecurity for any table
-- so we can check from a service-role JS client whether RLS is on.

CREATE OR REPLACE FUNCTION public.check_rls_state(target_table text)
RETURNS TABLE (table_name text, rls_enabled boolean, rls_forced boolean, policy_count integer)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    n.nspname || '.' || c.relname,
    c.relrowsecurity,
    c.relforcerowsecurity,
    (SELECT COUNT(*)::integer FROM pg_policy p WHERE p.polrelid = c.oid)
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relname = target_table
$$;

GRANT EXECUTE ON FUNCTION public.check_rls_state(text) TO service_role, authenticated;

CREATE OR REPLACE FUNCTION public.list_policies(target_table text)
RETURNS TABLE (policy_name text, cmd text, roles text[], qual text, with_check text)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    p.polname,
    CASE p.polcmd WHEN 'r' THEN 'SELECT' WHEN 'a' THEN 'INSERT' WHEN 'w' THEN 'UPDATE' WHEN 'd' THEN 'DELETE' WHEN '*' THEN 'ALL' END,
    ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY(p.polroles)),
    pg_get_expr(p.polqual, p.polrelid),
    pg_get_expr(p.polwithcheck, p.polrelid)
  FROM pg_policy p
  JOIN pg_class c ON c.oid = p.polrelid
  WHERE c.relname = target_table
$$;

GRANT EXECUTE ON FUNCTION public.list_policies(text) TO service_role, authenticated;

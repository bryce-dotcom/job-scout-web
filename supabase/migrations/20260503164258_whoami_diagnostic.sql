-- whoami() — read-only diagnostic. Returns the calling user's resolved
-- identity so we can prove JWT-to-company resolution works BEFORE
-- enabling any RLS policies. If this returns the right thing for HHH
-- and a beta tester, RLS is safe to roll out. If it returns null /
-- empty / wrong, RLS is OFF the table for now.
--
-- No data is modified. No policies are touched. Pure diagnostic.

CREATE OR REPLACE FUNCTION public.whoami()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  jwt_email text;
  emp_record record;
  company_ids integer[];
  result jsonb;
BEGIN
  jwt_email := current_setting('request.jwt.claims', true)::jsonb ->> 'email';

  SELECT array_agg(DISTINCT company_id)
    INTO company_ids
    FROM public.employees
   WHERE active = true
     AND lower(email) = lower(coalesce(jwt_email, ''));

  SELECT id, name, email, role, user_role, company_id
    INTO emp_record
    FROM public.employees
   WHERE active = true
     AND lower(email) = lower(coalesce(jwt_email, ''))
   ORDER BY id
   LIMIT 1;

  result := jsonb_build_object(
    'jwt_email', jwt_email,
    'jwt_role', current_setting('request.jwt.claims', true)::jsonb ->> 'role',
    'session_user', current_user,
    'resolved_company_ids', to_jsonb(coalesce(company_ids, ARRAY[]::integer[])),
    'resolved_employee', CASE WHEN emp_record.id IS NOT NULL THEN
      jsonb_build_object(
        'id', emp_record.id,
        'name', emp_record.name,
        'email', emp_record.email,
        'role', emp_record.role,
        'user_role', emp_record.user_role,
        'company_id', emp_record.company_id
      )
    ELSE NULL END,
    'note', 'Read-only diagnostic. If resolved_company_ids is empty, JWT lookup is broken.'
  );

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.whoami() TO authenticated, anon;

COMMENT ON FUNCTION public.whoami() IS
  'Diagnostic: returns the calling user''s JWT email and resolved company_ids. Used to validate JWT-to-tenant resolution before RLS rollout.';

-- Hosted Supabase installs pgcrypto into the `extensions` schema, not
-- `public`, so the unqualified pgp_sym_encrypt() / pgp_sym_decrypt()
-- calls in the previous migration fail with "function does not exist".
-- Fix: add `extensions` to the search_path on both functions.

CREATE OR REPLACE FUNCTION public.encrypt_ssn(p_ssn text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  k text := public.get_payroll_secret();
BEGIN
  IF k IS NULL OR length(k) < 16 THEN
    RAISE EXCEPTION 'payroll secret is not configured. An admin must run set_payroll_secret() first.';
  END IF;
  IF p_ssn IS NULL OR length(regexp_replace(p_ssn, '\D', '', 'g')) <> 9 THEN
    RAISE EXCEPTION 'SSN must be 9 digits';
  END IF;
  RETURN pgp_sym_encrypt(regexp_replace(p_ssn, '\D', '', 'g'), k);
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_ssn_for_payroll_admin(p_employee_id integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  k text := public.get_payroll_secret();
  caller_email text := lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email',''));
  emp_co integer;
  is_admin boolean := false;
  enc bytea;
BEGIN
  IF k IS NULL THEN RAISE EXCEPTION 'payroll secret is not configured.'; END IF;

  SELECT company_id INTO emp_co FROM public.employees WHERE id = p_employee_id;
  IF emp_co IS NULL THEN RAISE EXCEPTION 'employee not found'; END IF;

  SELECT (has_hr_access OR is_developer OR coalesce(user_role,'') IN ('Admin','Owner','Super Admin'))
    INTO is_admin
    FROM public.employees
   WHERE company_id = emp_co
     AND lower(email) = caller_email
     AND active = true
   LIMIT 1;

  IF NOT is_admin THEN
    RAISE EXCEPTION 'caller is not a payroll admin for this company';
  END IF;

  SELECT ssn_encrypted INTO enc FROM public.employees WHERE id = p_employee_id;
  IF enc IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(enc, k);
END;
$$;

GRANT EXECUTE ON FUNCTION public.encrypt_ssn(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_ssn_for_payroll_admin(integer) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- Switch SSN crypto over to Supabase Vault.
--
-- Why: hosted Supabase blocks `ALTER DATABASE … SET app.payroll_secret`
-- (superuser-only), so the GUC-based approach used in the previous
-- migration can't be initialized. Vault is the supported alternative
-- and stores secrets encrypted with the project's vault key.
--
-- After this migration runs, an admin calls public.set_payroll_secret(
--   '<long random string>'
-- ) once. encrypt_ssn / decrypt_ssn_for_payroll_admin then read the
-- secret out of vault.decrypted_secrets at call time.
--
-- Prereq: Supabase Vault is enabled. It's available by default on all
-- hosted projects (see vault.create_secret in vault schema). If the
-- migration fails on `vault.create_secret`, enable Vault in the
-- Supabase dashboard → Database → Extensions → vault (it's already on
-- for projects post-2023, but flagging just in case).
-- ====================================================================

-- 1. Helper that returns the current payroll secret from vault.
--    Returns NULL when the secret hasn't been set yet — callers
--    raise a clear error in that case.
CREATE OR REPLACE FUNCTION public.get_payroll_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  s text;
BEGIN
  SELECT decrypted_secret
    INTO s
    FROM vault.decrypted_secrets
   WHERE name = 'payroll_ssn_key'
   LIMIT 1;
  RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION public.get_payroll_secret() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_payroll_secret() TO postgres, service_role;

-- 2. set_payroll_secret() — admin-only entrypoint that the setup script
--    calls. Creates the vault row if missing, otherwise updates it.
CREATE OR REPLACE FUNCTION public.set_payroll_secret(p_value text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  existing uuid;
BEGIN
  IF p_value IS NULL OR length(p_value) < 32 THEN
    RAISE EXCEPTION 'payroll secret must be at least 32 characters';
  END IF;

  SELECT id INTO existing FROM vault.secrets WHERE name = 'payroll_ssn_key' LIMIT 1;
  IF existing IS NULL THEN
    PERFORM vault.create_secret(p_value, 'payroll_ssn_key', 'JobScout SSN encryption key');
    RETURN 'created';
  ELSE
    PERFORM vault.update_secret(existing, p_value);
    RETURN 'updated';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_payroll_secret(text) FROM PUBLIC, anon, authenticated;
-- Only callable with the service role key (used by the server-side
-- setup script, never from the browser).
GRANT EXECUTE ON FUNCTION public.set_payroll_secret(text) TO postgres, service_role;

-- 3. Rewrite encrypt_ssn to read the secret from vault instead of GUC.
CREATE OR REPLACE FUNCTION public.encrypt_ssn(p_ssn text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

-- 4. Rewrite decrypt_ssn_for_payroll_admin similarly.
CREATE OR REPLACE FUNCTION public.decrypt_ssn_for_payroll_admin(p_employee_id integer)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
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

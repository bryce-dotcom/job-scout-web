-- ====================================================================
-- 1099 Contractor (W-9) fields on employees
--
-- For workers with tax_classification = '1099'. The existing tax_setup
-- columns (W-4) are still there but unused for 1099s. The portal /
-- employee Tax Info section branches on tax_classification to show the
-- right form.
-- ====================================================================

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS w9_legal_name             text,
  ADD COLUMN IF NOT EXISTS w9_business_name          text,
  ADD COLUMN IF NOT EXISTS w9_federal_classification text
    CHECK (w9_federal_classification IS NULL OR w9_federal_classification IN (
      'individual','sole_prop','llc_c','llc_s','llc_p','c_corp','s_corp','partnership','trust','other'
    )),
  ADD COLUMN IF NOT EXISTS w9_other_classification   text,
  ADD COLUMN IF NOT EXISTS w9_exempt_payee_code      text,
  ADD COLUMN IF NOT EXISTS w9_exempt_fatca_code      text,
  ADD COLUMN IF NOT EXISTS w9_tin_type               text
    CHECK (w9_tin_type IS NULL OR w9_tin_type IN ('ssn','ein')),
  ADD COLUMN IF NOT EXISTS w9_ein_encrypted          bytea,
  ADD COLUMN IF NOT EXISTS w9_ein_last4              text,
  ADD COLUMN IF NOT EXISTS w9_backup_withholding     boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS w9_signed_at              date;

COMMENT ON COLUMN public.employees.w9_ein_encrypted IS 'pgcrypto-encrypted EIN. Decrypt only via decrypt_ein_for_payroll_admin. Distinct from ssn_encrypted because contractors may use either.';

-- EIN crypto helpers (Vault-backed, same pattern as encrypt_ssn)
CREATE OR REPLACE FUNCTION public.encrypt_ein(p_ein text)
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
  IF p_ein IS NULL OR length(regexp_replace(p_ein, '\D', '', 'g')) <> 9 THEN
    RAISE EXCEPTION 'EIN must be 9 digits';
  END IF;
  RETURN pgp_sym_encrypt(regexp_replace(p_ein, '\D', '', 'g'), k);
END;
$$;

CREATE OR REPLACE FUNCTION public.decrypt_ein_for_payroll_admin(p_employee_id integer)
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
  IF NOT is_admin THEN RAISE EXCEPTION 'caller is not a payroll admin for this company'; END IF;
  SELECT w9_ein_encrypted INTO enc FROM public.employees WHERE id = p_employee_id;
  IF enc IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(enc, k);
END;
$$;

GRANT EXECUTE ON FUNCTION public.encrypt_ein(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_ein_for_payroll_admin(integer) TO authenticated;

-- Extend signed_documents kinds to include W-9 + ICA
ALTER TABLE public.signed_documents DROP CONSTRAINT IF EXISTS signed_documents_document_kind_check;
ALTER TABLE public.signed_documents ADD CONSTRAINT signed_documents_document_kind_check
  CHECK (document_kind IN (
    'w4','state_w4','i9_section1','i9_section2','direct_deposit_auth',
    'handbook_ack','emergency_contact','workers_comp','background_check_auth',
    'custom_policy','training_acknowledgment','offer_letter',
    'w9','independent_contractor_agreement','1099_consent'
  ));

NOTIFY pgrst, 'reload schema';

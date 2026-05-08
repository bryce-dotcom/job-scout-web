-- ====================================================================
-- Payroll Tax Foundation
--
-- Adds the data the system needs to start computing net pay, tracking
-- tax liabilities, and producing IRS / state forms. This is the schema
-- layer; the calculation engine and UI ship in follow-on commits.
--
-- Design rules:
--  * SSN is stored encrypted via pgcrypto (column suffix _encrypted).
--    A SECURITY DEFINER function returns the masked last-4 to anyone
--    who's not a payroll admin.
--  * Every new column is nullable / has a default so we don't break
--    the existing employee + payroll flows.
--  * payroll_tax_liabilities is the single source of truth for "what
--    do we owe whom by when". Every payroll run writes rows into it;
--    the Payroll Inbox UI reads from it.
-- ====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----- EMPLOYEES: tax setup fields -----------------------------------
-- W-4 (Form W-4 2020+) — needed to compute federal income tax withholding.
-- We capture only what Pub 15-T's percentage method needs.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS ssn_encrypted bytea,
  ADD COLUMN IF NOT EXISTS ssn_last4 text,
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS termination_date date,
  ADD COLUMN IF NOT EXISTS home_address text,
  ADD COLUMN IF NOT EXISTS home_city text,
  ADD COLUMN IF NOT EXISTS home_state text,
  ADD COLUMN IF NOT EXISTS home_zip text,
  -- W-4 fields
  ADD COLUMN IF NOT EXISTS w4_filing_status text
    CHECK (w4_filing_status IN ('single','married_jointly','head_of_household')),
  ADD COLUMN IF NOT EXISTS w4_multiple_jobs boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS w4_dependents_amount numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS w4_other_income numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS w4_deductions numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS w4_extra_withholding numeric(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS w4_signed_at date,
  -- State withholding (Utah currently uses federal W-4 since 2018; other
  -- states differ. Storing the additional fields some states need.)
  ADD COLUMN IF NOT EXISTS state_filing_status text,
  ADD COLUMN IF NOT EXISTS state_allowances integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS state_extra_withholding numeric(10,2) DEFAULT 0,
  -- Direct deposit (encrypted at rest)
  ADD COLUMN IF NOT EXISTS dd_account_encrypted bytea,
  ADD COLUMN IF NOT EXISTS dd_routing_encrypted bytea,
  ADD COLUMN IF NOT EXISTS dd_account_last4 text,
  ADD COLUMN IF NOT EXISTS dd_account_type text CHECK (dd_account_type IN ('checking','savings')),
  -- New-hire reporting compliance — Utah DWS requires within 20 days
  ADD COLUMN IF NOT EXISTS new_hire_reported_at date,
  ADD COLUMN IF NOT EXISTS new_hire_report_method text;

COMMENT ON COLUMN public.employees.ssn_encrypted IS 'pgcrypto-encrypted SSN. Decrypt only via security-definer fn';
COMMENT ON COLUMN public.employees.ssn_last4 IS 'Plain last-4 for display (e.g. ***-**-1234). Never the full SSN.';

-- ----- COMPANIES: tax / compliance settings --------------------------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS ein text,
  -- Filing entity
  ADD COLUMN IF NOT EXISTS legal_name text,
  ADD COLUMN IF NOT EXISTS business_type text,  -- LLC, S-Corp, C-Corp, Sole Prop
  -- State withholding
  ADD COLUMN IF NOT EXISTS state_employer_id text,        -- e.g. Utah TC ID
  ADD COLUMN IF NOT EXISTS state_employer_id_state text,  -- 'UT'
  -- State unemployment (per-state account + assigned rate)
  ADD COLUMN IF NOT EXISTS sui_account_number text,
  ADD COLUMN IF NOT EXISTS sui_rate_pct numeric(6,4),     -- e.g. 1.2000 for 1.2%
  ADD COLUMN IF NOT EXISTS sui_wage_base numeric(10,2),   -- Utah 2025 = 48900
  -- FUTA (federal unemployment) — usually 0.6% after credit
  ADD COLUMN IF NOT EXISTS futa_rate_pct numeric(6,4) DEFAULT 0.6,
  -- IRS-assigned deposit schedule
  ADD COLUMN IF NOT EXISTS federal_deposit_schedule text
    CHECK (federal_deposit_schedule IN ('monthly','semiweekly','annually','quarterly')),
  ADD COLUMN IF NOT EXISTS state_deposit_schedule text,
  -- Workers' comp + e-file readiness
  ADD COLUMN IF NOT EXISTS workers_comp_class_codes jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS efile_efin text,                -- IRS e-file ID (optional)
  ADD COLUMN IF NOT EXISTS bso_user_id text;               -- SSA Business Services Online

-- ----- PAYSTUBS: extend with net pay + tax breakdown -----------------
-- Existing columns we keep: regular_hours, overtime_hours, pto_hours,
-- gross_pay. Adding the post-gross fields.
ALTER TABLE public.paystubs
  ADD COLUMN IF NOT EXISTS bonus_pay numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_pay numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reimbursement_pay numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS taxable_wages numeric(12,2) DEFAULT 0,  -- gross minus pre-tax
  ADD COLUMN IF NOT EXISTS federal_income_tax numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS state_income_tax numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS social_security_employee numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS social_security_employer numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medicare_employee numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medicare_employer numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS additional_medicare numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS futa numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sui numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pre_tax_deductions numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS post_tax_deductions numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_pay numeric(12,2) DEFAULT 0,
  -- Audit / amendment trail
  ADD COLUMN IF NOT EXISTS amends_paystub_id integer REFERENCES public.paystubs(id),
  ADD COLUMN IF NOT EXISTS amendment_reason text;

-- ----- PAYROLL_TAX_LIABILITIES: the inbox source of truth ------------
CREATE TABLE IF NOT EXISTS public.payroll_tax_liabilities (
  id              bigserial PRIMARY KEY,
  company_id      integer  NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  payroll_run_id  integer  REFERENCES public.payroll_runs(id) ON DELETE SET NULL,

  -- What kind of tax + who it goes to
  jurisdiction    text     NOT NULL CHECK (jurisdiction IN ('federal','state','local')),
  agency          text     NOT NULL,             -- 'IRS', 'Utah State Tax Commission', 'Utah DWS'
  kind            text     NOT NULL,             -- 'federal_income_tax','social_security','medicare','futa','state_income_tax','sui','additional_medicare'

  -- The money + the period it covers
  period_start    date     NOT NULL,
  period_end      date     NOT NULL,
  amount_employee numeric(12,2) DEFAULT 0,       -- portion withheld from employees
  amount_employer numeric(12,2) DEFAULT 0,       -- portion paid by employer
  amount_total    numeric(12,2) GENERATED ALWAYS AS (COALESCE(amount_employee,0) + COALESCE(amount_employer,0)) STORED,

  -- The deadline + payment record
  due_date        date     NOT NULL,
  paid_at         timestamptz,
  paid_via        text     CHECK (paid_via IN ('eftps','check','ach','state_portal','other')),
  confirmation_number text,
  filed_form      text,                          -- e.g. '941-Q1-2026','TC-941-Q1-2026'
  filed_at        timestamptz,
  notes           text,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_liab_company_due
  ON public.payroll_tax_liabilities (company_id, due_date)
  WHERE paid_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tax_liab_run
  ON public.payroll_tax_liabilities (payroll_run_id);

-- RLS — same tenant_isolation pattern as everywhere else
REVOKE ALL ON public.payroll_tax_liabilities FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_tax_liabilities TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.payroll_tax_liabilities_id_seq TO authenticated;
ALTER TABLE public.payroll_tax_liabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_tax_liabilities FORCE  ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON public.payroll_tax_liabilities
    AS PERMISSIVE FOR ALL TO authenticated
    USING      (company_id IN (SELECT public.current_user_company_ids()))
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----- PAYROLL_TAX_FILINGS: per-form filing record -------------------
-- One row per generated form (941, 940, W-2, W-3, TC-941, etc.).
-- Stores the rendered PDF path + status so the Payroll Inbox can show
-- "Q1 941 filed ✓" with a link to download the saved copy.
CREATE TABLE IF NOT EXISTS public.payroll_tax_filings (
  id            bigserial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  form_kind     text    NOT NULL,        -- '941','940','W-2','W-3','TC-941','Form-33H','1099-NEC','1096','941-X'
  jurisdiction  text    NOT NULL CHECK (jurisdiction IN ('federal','state','local')),
  period_start  date    NOT NULL,
  period_end    date    NOT NULL,
  -- For employee-specific forms (W-2, 1099-NEC). Null for company-level forms.
  employee_id   integer REFERENCES public.employees(id),
  -- Rendered PDF in storage
  pdf_storage_path text,
  -- Snapshot of the values used (so re-render is reproducible)
  values_snapshot jsonb DEFAULT '{}'::jsonb,
  -- Lifecycle
  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready_to_file','filed','amended','superseded')),
  filed_at      timestamptz,
  filed_method  text CHECK (filed_method IN ('mail','efile','hand_deliver','portal')),
  confirmation_number text,
  amends_filing_id bigint REFERENCES public.payroll_tax_filings(id),
  created_by    integer REFERENCES public.employees(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tax_filings_company_period
  ON public.payroll_tax_filings (company_id, period_end DESC);

REVOKE ALL ON public.payroll_tax_filings FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_tax_filings TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.payroll_tax_filings_id_seq TO authenticated;
ALTER TABLE public.payroll_tax_filings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payroll_tax_filings FORCE  ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY tenant_isolation ON public.payroll_tax_filings
    AS PERMISSIVE FOR ALL TO authenticated
    USING      (company_id IN (SELECT public.current_user_company_ids()))
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ----- SSN crypto helpers --------------------------------------------
-- Symmetric encryption keyed by the company id + a server-side secret.
-- For now we use a fixed app secret stored via supabase secrets;
-- migrate to per-company KMS later. The wrapping functions are
-- SECURITY DEFINER so the secret is never exposed to clients.
--
-- NOTE: the secret must be set with:
--   ALTER DATABASE postgres SET app.payroll_secret TO '<long random string>';
-- We don't set it in the migration so it can't leak to git. The
-- functions raise a clear error if the GUC is missing.

CREATE OR REPLACE FUNCTION public.encrypt_ssn(p_ssn text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k text := current_setting('app.payroll_secret', true);
BEGIN
  IF k IS NULL OR length(k) < 16 THEN
    RAISE EXCEPTION 'app.payroll_secret is not set on this database. Run: ALTER DATABASE postgres SET app.payroll_secret TO ''<long-random-string>''';
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
SET search_path = public, pg_temp
AS $$
DECLARE
  k text := current_setting('app.payroll_secret', true);
  caller_email text := lower(coalesce(current_setting('request.jwt.claims', true)::jsonb ->> 'email',''));
  emp_co integer;
  is_admin boolean := false;
  enc bytea;
BEGIN
  IF k IS NULL THEN RAISE EXCEPTION 'app.payroll_secret missing'; END IF;

  -- Caller must be a payroll admin in the same company as the employee.
  SELECT company_id INTO emp_co FROM public.employees WHERE id = p_employee_id;
  IF emp_co IS NULL THEN RAISE EXCEPTION 'employee not found'; END IF;

  SELECT (has_hr_access OR is_developer OR coalesce(user_role,'') IN ('Admin','Owner'))
    INTO is_admin
    FROM public.employees
   WHERE company_id = emp_co
     AND lower(email) = caller_email
     AND active = true;

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

-- ----- updated_at trigger on the new tables --------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_tax_liab_touch ON public.payroll_tax_liabilities;
CREATE TRIGGER trg_tax_liab_touch BEFORE UPDATE ON public.payroll_tax_liabilities
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

DROP TRIGGER IF EXISTS trg_tax_filings_touch ON public.payroll_tax_filings;
CREATE TRIGGER trg_tax_filings_touch BEFORE UPDATE ON public.payroll_tax_filings
FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

NOTIFY pgrst, 'reload schema';

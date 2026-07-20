-- Employee benefits & deductions enrollment.
--
-- Paystubs already carry pre_tax_deductions / post_tax_deductions as running
-- TOTALS, but nothing recorded WHAT those deductions are or what an employee is
-- enrolled in (health, dental, 401k, HSA…). This table is that itemized record
-- — one row per benefit/deduction line for an employee. My Pay reads it to show
-- "what's coming out of my check" and what the company contributes.
--
-- Deliberately ADDITIVE: this migration changes no existing pay math. A later,
-- separately-tested step can sum the active pre-tax vs post-tax lines into the
-- paystub deduction totals during a payroll run; until then the totals on
-- paystubs are untouched.

CREATE TABLE IF NOT EXISTS employee_benefits (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  benefit_type TEXT NOT NULL
    CHECK (benefit_type IN ('health','dental','vision','life','disability','retirement_401k','hsa','fsa','other')),
  plan_name TEXT,                                          -- "Blue Cross Blue Shield PPO"
  employee_contribution NUMERIC(12,2) NOT NULL DEFAULT 0,  -- what the EMPLOYEE pays, per the frequency below
  employer_contribution NUMERIC(12,2) NOT NULL DEFAULT 0,  -- what the COMPANY pays (informational)
  is_pre_tax BOOLEAN NOT NULL DEFAULT true,                -- pre-tax (medical, 401k) vs post-tax (Roth, some life)
  frequency TEXT NOT NULL DEFAULT 'per_paycheck'
    CHECK (frequency IN ('per_paycheck','monthly','annual')),
  effective_date DATE,
  end_date DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','ended')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_employee_benefits_company_emp
  ON employee_benefits (company_id, employee_id, status);

ALTER TABLE employee_benefits ENABLE ROW LEVEL SECURITY;

-- Company isolation, matching the rest of the app (job_bonuses, paystubs…):
-- authenticated users act on their own company's rows; the app layer further
-- scopes My Pay to the signed-in employee and gates cross-employee views on HR
-- permission.
DO $$ BEGIN
  CREATE POLICY "employee_benefits_company" ON employee_benefits
    FOR ALL
    USING (company_id = get_user_company_id())
    WITH CHECK (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

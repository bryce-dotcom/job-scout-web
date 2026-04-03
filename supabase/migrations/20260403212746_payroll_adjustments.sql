-- Payroll adjustments: deductions and additions per employee per pay period
CREATE TABLE IF NOT EXISTS payroll_adjustments (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id BIGINT NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('deduction', 'addition')),
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  reason TEXT NOT NULL DEFAULT '',
  recurring BOOLEAN NOT NULL DEFAULT false,
  pay_period_start DATE,
  pay_period_end DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT REFERENCES employees(id)
);

-- RLS
ALTER TABLE payroll_adjustments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "payroll_adjustments_company" ON payroll_adjustments
    FOR ALL USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::bigint);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_payroll_adj_company_employee ON payroll_adjustments(company_id, employee_id);
CREATE INDEX IF NOT EXISTS idx_payroll_adj_period ON payroll_adjustments(company_id, pay_period_start, pay_period_end);

-- Utility-processor commission support.
--
-- "Processor" = the office person who handles the utility incentive
-- paperwork (e.g., Alayda at HHH). They earn a fixed commission on every
-- utility invoice they process, independent of the salesperson who sold
-- the job.

-- 1. Per-employee processor rate (same shape as services / goods / setter).
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS commission_processor_rate NUMERIC NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS commission_processor_type TEXT NOT NULL DEFAULT 'percent';

COMMENT ON COLUMN employees.commission_processor_rate IS
  'Processor commission paid on utility invoices this employee handles. % of incentive_amount (if type=percent) or flat dollars (if type=flat).';

-- 2. Optional per-invoice override. When null the company-wide default
--    processor (stored in payroll_config.utility_processor_employee_id)
--    is used.
ALTER TABLE utility_invoices
  ADD COLUMN IF NOT EXISTS processor_id INT REFERENCES employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN utility_invoices.processor_id IS
  'Employee who processed this utility invoice. If null the company-level default processor (from payroll_config) is used.';

CREATE INDEX IF NOT EXISTS utility_invoices_processor_idx
  ON utility_invoices(company_id, processor_id)
  WHERE processor_id IS NOT NULL;

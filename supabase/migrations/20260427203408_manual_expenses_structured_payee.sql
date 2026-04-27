-- Structured payee on manual_expenses.
-- Polymorphic: at most one of payee_employee_id / payee_vendor_id may be set.
-- payee_name is a free-text fallback for one-off payees ("contractor", etc.)
-- and may coexist with either FK (or stand alone). All three are nullable so
-- existing rows continue to validate.
--
-- vendors table does not currently exist in this schema, so payee_vendor_id
-- is added as a plain INTEGER (no FK). When a vendors table is introduced
-- later, a follow-up migration can add the FK constraint.

ALTER TABLE public.manual_expenses
  ADD COLUMN IF NOT EXISTS payee_employee_id INTEGER REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS payee_vendor_id   INTEGER,
  ADD COLUMN IF NOT EXISTS payee_name        TEXT;

-- At most one structured FK may be set. Both null is OK; both set is rejected.
DO $$ BEGIN
  ALTER TABLE public.manual_expenses
    ADD CONSTRAINT manual_expenses_payee_one_of_chk
    CHECK (payee_employee_id IS NULL OR payee_vendor_id IS NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Index for the per-employee YTD payroll rollup.
CREATE INDEX IF NOT EXISTS idx_manual_expenses_company_payee_employee
  ON public.manual_expenses(company_id, payee_employee_id);

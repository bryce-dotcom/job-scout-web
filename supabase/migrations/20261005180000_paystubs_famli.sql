-- Colorado FAMLI premiums on the paystub.
--
-- Colorado's paid family and medical leave premium (0.88% of wages in 2026,
-- half withheld from the employee after tax, half paid by the employer; the
-- employer half waived at 9 or fewer employees) is a line on every Colorado
-- paycheck. Without its own columns the employee share could only hide in
-- post_tax_deductions and the employer share nowhere, so neither the stub
-- nor year-to-date could show it. Zero for every other state.
--
-- Idempotent. Applied directly to production and recorded with
-- `supabase migration repair` (see memory: migrations-apply-directly).

ALTER TABLE public.paystubs
  ADD COLUMN IF NOT EXISTS famli_employee numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS famli_employer numeric(12,2) DEFAULT 0;

COMMENT ON COLUMN public.paystubs.famli_employee IS 'Colorado FAMLI premium withheld from the employee (after tax). 0 outside Colorado.';
COMMENT ON COLUMN public.paystubs.famli_employer IS 'Colorado FAMLI premium paid by the employer. 0 outside Colorado and for employers with 9 or fewer employees.';

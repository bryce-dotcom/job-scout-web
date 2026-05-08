-- Per-employee overtime mode override.
--
-- Companies set a default OT mode (companies.overtime_mode in payroll
-- settings — currently stored in payroll_settings JSON). Some employees
-- need a different rule than the default — Energy Scout employees at
-- HHH should be on 'bonus' mode (no OT premium, over-threshold hours
-- go to a bonus pool) while standard W2 employees stay on 'overtime'.
--
-- NULL = inherit company default. Otherwise overrides.
--   'overtime' — 1.5x for hours over threshold (legal default)
--   'bonus'    — 1.0x for over-threshold hours (bonus pool tracks them)
--   'none'     — no OT distinction; all hours = base rate

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS overtime_mode text;

ALTER TABLE public.employees
  DROP CONSTRAINT IF EXISTS employees_overtime_mode_check;

ALTER TABLE public.employees
  ADD CONSTRAINT employees_overtime_mode_check
  CHECK (overtime_mode IS NULL OR overtime_mode IN ('overtime', 'bonus', 'none'));

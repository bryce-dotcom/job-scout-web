-- Arizona withholding is an employee election, not a table.
--
-- Form A-4 lets the employee pick a flat rate of their Arizona gross wages
-- (0.5% to 3.5% in half-point steps, or 0% with a claim of exemption); an
-- employee who files no A-4 is withheld at 2.0%. The W-4 columns cannot
-- carry that, so the rate gets its own column. NULL means "no A-4 on
-- file" and the engine uses the state default.
--
-- Idempotent. Applied directly to production and recorded with
-- `supabase migration repair` (see memory: migrations-apply-directly).

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS state_withholding_rate_pct numeric(5,2);

COMMENT ON COLUMN public.employees.state_withholding_rate_pct IS 'Flat state withholding rate the employee elected (Arizona Form A-4). NULL = none on file, state default applies.';

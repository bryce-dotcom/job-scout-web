-- Override commission: a manager's percentage of the team's sales.
--
-- Bryce, 2026-10-15: "a pay type called override, typically a commission for
-- managers: a percentage of their team's work. Cole should have 0.75 of a
-- point over anyone who gets a commission, calculated the same way the
-- salesperson's is: a rep sells a $10k job, the rep gets 8.5%, the override
-- person gets 0.75% of the $10k."
--
-- The override rides the rep's own commission row: same invoice, same
-- payment, same basis, same timing. It is a rep_commissions row of kind
-- 'override' for the manager, pointing at the rep it is over.
--
-- Idempotent. Applied directly to production and recorded with
-- `supabase migration repair` (see memory: migrations-apply-directly).

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS override_rate_pct numeric(6,3) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_team integer[],
  ADD COLUMN IF NOT EXISTS override_since date;

COMMENT ON COLUMN public.employees.override_rate_pct IS 'Percent of the team''s sales this person earns as an override (0.75 = 0.75%). 0 = none.';
COMMENT ON COLUMN public.employees.override_team IS 'Employee ids the override is over. NULL or empty = everyone in the company who earns a sales commission, except this person.';
COMMENT ON COLUMN public.employees.override_since IS 'Sales earned on or after this date count. Set when the rate is first entered, so an override never reaches back over the whole year by accident.';

ALTER TABLE public.rep_commissions
  ADD COLUMN IF NOT EXISTS override_for_employee_id integer REFERENCES public.employees(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.rep_commissions.override_for_employee_id IS 'For kind = override: the rep whose sale this override is on.';

CREATE INDEX IF NOT EXISTS rep_commissions_override_for_idx ON public.rep_commissions (override_for_employee_id) WHERE override_for_employee_id IS NOT NULL;

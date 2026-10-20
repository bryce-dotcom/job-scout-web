-- job_bonuses.paid_payroll_run_id — the column cd4165d7 writes to.
--
-- cd4165d7 ("A paid bonus now names the cheque that paid it") stamps the
-- payroll run on a bonus the way lead_commissions and rep_commissions have
-- done since 20261008013748. Its message says "the column has been sitting on
-- job_bonuses unused" — it has not. It exists on the two commission tables and
-- never on this one, so the write it ships fails outright:
--
--   PATCH /rest/v1/job_bonuses  {"paid_payroll_run_id": …}
--   400 PGRST204 "Could not find the 'paid_payroll_run_id' column of
--                 'job_bonuses' in the schema cache"
--
-- Verified against the live database on 2026-10-20 with a filter matching no
-- rows; the same request naming an existing column returns 204.
--
-- WHY THIS MATTERS MORE THAN A MISSING COLUMN USUALLY DOES. The whole update
-- is one statement, so the failure takes `status = 'paid'` down with it.
-- runPayroll catches the error, pushes "efficiency bonuses" onto notMarkedPaid
-- and carries on — payroll completes, people are paid, and not one bonus is
-- ever marked paid. That is Alayda's 2026-10-19 ticket and London's 09-28 one
-- word for word ("already paid jobs showing as owed"), and it would have
-- recurred on the very next run. HHH has exactly one bonus row marked paid in
-- its entire history.
--
-- Nullable with no backfill, deliberately: a row paid before today genuinely
-- has no run recorded, and inventing one would make the history look
-- reconstructed when it is not. See the reconciliation report — $11,396 of
-- paid_at stamps never reached a paystub, and only the 2026-09-20 rows match
-- one to the cent. From here on a paid bonus names its run and the question
-- "what have we paid on?" has an answer that can be checked.

alter table job_bonuses
  add column if not exists paid_payroll_run_id bigint;

comment on column job_bonuses.paid_payroll_run_id is
  'The payroll run that paid this bonus. Written by runPayroll alongside status=paid; null on rows paid before 2026-10-20, which cannot be attributed. Mirrors lead_commissions / rep_commissions.';

-- The report reads "what did this run pay out", so it looks up by run.
create index if not exists job_bonuses_paid_run_idx
  on job_bonuses (paid_payroll_run_id)
  where paid_payroll_run_id is not null;

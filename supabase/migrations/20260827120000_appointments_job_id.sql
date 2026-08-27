-- =====================================================================
-- appointments.job_id — the column five call sites already believed in.
--
-- JobDetail and PMJobSetter between them filter appointments on job_id in
-- five places: the job's calendar two-way sync, the hard-delete cleanup, the
-- drag-to-reschedule sync, the appointment editor's job sync, and the
-- "unschedule" button. The column was never created. PostgREST 400s the whole
-- request on an unknown column and the app's `const { data } = await ...`
-- pattern swallows it, so every one of those failed in silence:
--
--   * editing a job's date left a stale event on the calendar (this is Doug's
--     complaint, which we believed we had fixed — the fix never ran)
--   * dragging an event on the calendar never moved the job
--   * deleting or unscheduling a job left its appointments orphaned there
--
-- Rewriting those queries onto customer_id was considered and rejected. A
-- customer has many jobs and many non-job appointments; the reads would show
-- the wrong events, and JobDetail's hard-delete would have deleted every
-- appointment that customer has, including sales calls. The relationship the
-- code wants is job -> appointments, and it is a real one.
--
-- ON DELETE SET NULL, not CASCADE: an appointment records that someone's time
-- was booked. It outlives the job row for payroll and history, the same choice
-- 20260515062844_relax_appointment_fks.sql made for every other FK into this
-- table. JobDetail's explicit delete still removes them when a job is truly
-- hard-deleted.
--
-- Backfill runs separately (scripts/backfill-appointment-job-id.mjs) — it is
-- heuristic, matching on customer + title, and belongs somewhere it can be
-- inspected and re-run rather than buried in a migration.
-- =====================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS job_id integer REFERENCES public.jobs(id) ON DELETE SET NULL;

-- Every read of this column is "the appointments for job X, in company Y",
-- which is exactly this index.
CREATE INDEX IF NOT EXISTS idx_appointments_job_id
  ON public.appointments (company_id, job_id)
  WHERE job_id IS NOT NULL;

COMMENT ON COLUMN public.appointments.job_id IS
  'The job this appointment was booked for, when it came from job scheduling. NULL for sales appointments (see lead_id) and for job appointments created before 2026-08-27 that the backfill could not match.';

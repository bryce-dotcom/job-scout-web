-- Add a dedicated completed_at column on jobs.
--
-- Background: JobDetail.jsx and Jobs.jsx both stamped end_date := now()
-- whenever a job's status flipped to "Completed". end_date was supposed
-- to be the *scheduled* end of the job (driving calendar spans, route
-- planning, ETC), but the completion-time write clobbered that — turning
-- a 2-hour job that was verified two weeks late into a 14-day calendar
-- bar.
--
-- Going forward, completion time gets its own column. end_date stays
-- the scheduled end and is no longer touched by status changes.
--
-- Backfill: copy end_date into completed_at for any job whose status is
-- terminal AND whose end_date sits 1+ days after start_date — that's
-- the population whose end_date had been hijacked. Pure-completion jobs
-- where end_date is null get their updated_at as a best-effort guess.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.jobs.completed_at IS
  'Actual completion timestamp (set when status flips to Completed/Verified Complete). Different from end_date, which is the SCHEDULED end of the job for calendar/routing.';

UPDATE public.jobs
   SET completed_at = end_date
 WHERE completed_at IS NULL
   AND end_date IS NOT NULL
   AND start_date IS NOT NULL
   AND end_date > start_date + INTERVAL '1 day'
   AND status IN ('Completed', 'Verified Complete', 'Archived', 'Cancelled', 'Closed', 'Invoiced', 'Job Complete', 'Done');

UPDATE public.jobs
   SET completed_at = updated_at
 WHERE completed_at IS NULL
   AND status IN ('Completed', 'Verified Complete', 'Archived', 'Cancelled', 'Closed', 'Invoiced', 'Job Complete', 'Done')
   AND updated_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_completed_at ON public.jobs(company_id, completed_at)
  WHERE completed_at IS NOT NULL;

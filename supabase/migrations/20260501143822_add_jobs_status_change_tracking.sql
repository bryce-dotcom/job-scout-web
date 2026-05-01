-- Track WHEN a job's status last changed, so revenue/delivery metrics can
-- ask "which jobs entered a 'delivered' status this month?" without depending
-- on `updated_at` (which fires on any field edit) or `start_date` (which is
-- when work was scheduled, not when it finished).
--
-- The `category` distinction (open vs delivered) lives in each company's
-- job_statuses settings JSON, NOT in the DB — companies can add custom
-- statuses with their own category. This trigger only records WHEN the status
-- changed; the app filters by which category the new status belongs to.

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS last_status_change_at timestamptz;

-- Backfill: for existing rows we don't know the historical change time, so
-- approximate using updated_at. Better than null for the next 90 days of
-- reporting; will self-correct as users move jobs through their pipelines.
UPDATE public.jobs
   SET last_status_change_at = COALESCE(updated_at, created_at)
 WHERE last_status_change_at IS NULL;

-- Trigger: stamp last_status_change_at whenever the status field is
-- modified. Don't fire on other field edits — that would defeat the
-- purpose. NEW.last_status_change_at = OLD.last_status_change_at preserves
-- the existing value when status didn't change.
CREATE OR REPLACE FUNCTION public.jobs_stamp_status_change()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.last_status_change_at := COALESCE(NEW.last_status_change_at, NOW());
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.last_status_change_at := NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_status_change_stamp ON public.jobs;
CREATE TRIGGER jobs_status_change_stamp
BEFORE INSERT OR UPDATE OF status ON public.jobs
FOR EACH ROW EXECUTE FUNCTION public.jobs_stamp_status_change();

-- Partial index — most queries will look at "delivered jobs in the last 90
-- days" so an index on this column dramatically speeds up the dashboard.
CREATE INDEX IF NOT EXISTS idx_jobs_last_status_change_at
  ON public.jobs(last_status_change_at DESC);

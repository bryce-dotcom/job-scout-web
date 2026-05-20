-- Auto-close a job when every invoice attached to it has been fully paid.
--
-- Trigger fires only when an invoice's payment_status transitions to 'Paid'
-- (not on every update). It then:
--   1. checks every other invoice on the same job is also Paid
--   2. resolves the company's "closed" job status from settings.job_statuses
--      (the entry flagged isClosed = true). If the company never configured
--      one, the trigger does nothing — never invent a status name.
--   3. flips jobs.status to that status only if the job isn't already there
--
-- Safe to run repeatedly; idempotent. Touching jobs.status causes the
-- pipeline view to repaint the card in the Closed column without any
-- frontend changes.

CREATE OR REPLACE FUNCTION public.maybe_close_paid_job()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_job_id        bigint;
  v_company_id    bigint;
  v_current_status text;
  v_unpaid_count  integer;
  v_closed_name   text;
  v_statuses      jsonb;
BEGIN
  -- Only act when payment_status flipped INTO Paid (not on every UPDATE).
  IF NEW.payment_status IS NULL
     OR NEW.payment_status <> 'Paid'
     OR (TG_OP = 'UPDATE' AND OLD.payment_status = 'Paid') THEN
    RETURN NEW;
  END IF;

  v_job_id := NEW.job_id;
  IF v_job_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Are there any OTHER invoices on this job that aren't fully paid?
  SELECT COUNT(*) INTO v_unpaid_count
  FROM invoices
  WHERE job_id = v_job_id
    AND id <> NEW.id
    AND COALESCE(payment_status, '') <> 'Paid';

  IF v_unpaid_count > 0 THEN
    RETURN NEW;
  END IF;

  -- Get job's company and current status.
  SELECT company_id, status INTO v_company_id, v_current_status
  FROM jobs
  WHERE id = v_job_id;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Resolve the configured "closed" status name. The settings value is
  -- a JSON array of { id, name, isClosed?, isDelivery?, color? } objects.
  -- Pull the first entry where isClosed = true. If the tenant never set
  -- this up, we skip rather than guess.
  SELECT value INTO v_statuses
  FROM settings
  WHERE company_id = v_company_id
    AND key = 'job_statuses'
  LIMIT 1;

  IF v_statuses IS NULL OR jsonb_typeof(v_statuses) <> 'array' THEN
    RETURN NEW;
  END IF;

  SELECT (s ->> 'name') INTO v_closed_name
  FROM jsonb_array_elements(v_statuses) AS s
  WHERE (s ->> 'isClosed')::boolean IS TRUE
  LIMIT 1;

  IF v_closed_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_current_status = v_closed_name THEN
    RETURN NEW;  -- already there
  END IF;

  UPDATE jobs
  SET status = v_closed_name,
      updated_at = NOW()
  WHERE id = v_job_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_maybe_close_paid_job ON invoices;
CREATE TRIGGER trg_maybe_close_paid_job
AFTER UPDATE OF payment_status ON invoices
FOR EACH ROW
EXECUTE FUNCTION public.maybe_close_paid_job();

-- Also fire on INSERT in case someone creates an invoice that's already Paid
-- (rare, but happens with manual entries / backfills).
DROP TRIGGER IF EXISTS trg_maybe_close_paid_job_insert ON invoices;
CREATE TRIGGER trg_maybe_close_paid_job_insert
AFTER INSERT ON invoices
FOR EACH ROW
WHEN (NEW.payment_status = 'Paid' AND NEW.job_id IS NOT NULL)
EXECUTE FUNCTION public.maybe_close_paid_job();

COMMENT ON FUNCTION public.maybe_close_paid_job IS
  'When an invoice flips to Paid and every other invoice on the same job is also Paid, advance jobs.status to the company''s configured isClosed=true status. No-op if the company has not configured a closed status.';

-- Auto-move a job to the company's "Paid" pipeline stage when every
-- invoice attached is fully paid. Previously moved straight to "Closed"
-- (the isClosed=true stage), which made it impossible to see "what just
-- got paid" in the pipeline — Paid jobs and archived-long-ago jobs both
-- sat in the same column.
--
-- New resolution order in settings.job_statuses:
--   1. First entry where isPaid = true   → preferred destination
--   2. Else first entry where isClosed = true (legacy fallback)
--   3. Else no-op (tenant hasn't configured either)
--
-- This is a transparent upgrade — companies that haven't added a Paid
-- stage yet still get the old behavior. As soon as they add `isPaid:
-- true` to a stage in settings, payments start landing in that column.

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
  v_target_name   text;
  v_statuses      jsonb;
BEGIN
  IF NEW.payment_status IS NULL
     OR NEW.payment_status <> 'Paid'
     OR (TG_OP = 'UPDATE' AND OLD.payment_status = 'Paid') THEN
    RETURN NEW;
  END IF;

  v_job_id := NEW.job_id;
  IF v_job_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(*) INTO v_unpaid_count
  FROM invoices
  WHERE job_id = v_job_id
    AND id <> NEW.id
    AND COALESCE(payment_status, '') <> 'Paid';

  IF v_unpaid_count > 0 THEN
    RETURN NEW;
  END IF;

  SELECT company_id, status INTO v_company_id, v_current_status
  FROM jobs
  WHERE id = v_job_id;

  IF v_company_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT value INTO v_statuses
  FROM settings
  WHERE company_id = v_company_id
    AND key = 'job_statuses'
  LIMIT 1;

  IF v_statuses IS NULL OR jsonb_typeof(v_statuses) <> 'array' THEN
    RETURN NEW;
  END IF;

  -- Prefer the isPaid stage; fall back to isClosed for tenants that
  -- haven't configured a Paid column yet.
  SELECT (s ->> 'name') INTO v_target_name
  FROM jsonb_array_elements(v_statuses) AS s
  WHERE (s ->> 'isPaid')::boolean IS TRUE
  LIMIT 1;

  IF v_target_name IS NULL THEN
    SELECT (s ->> 'name') INTO v_target_name
    FROM jsonb_array_elements(v_statuses) AS s
    WHERE (s ->> 'isClosed')::boolean IS TRUE
    LIMIT 1;
  END IF;

  IF v_target_name IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_current_status = v_target_name THEN
    RETURN NEW;
  END IF;

  UPDATE jobs
  SET status = v_target_name,
      updated_at = NOW()
  WHERE id = v_job_id;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.maybe_close_paid_job IS
  'When an invoice flips to Paid and every other invoice on the same job is also Paid, advance jobs.status to the company''s configured isPaid stage (preferred) or isClosed stage (fallback). No-op if the company has not configured either.';

-- Fix two real-world issues in maybe_close_paid_job (20260519220000):
--   1. settings.value for job_statuses is stored as a JSON-encoded
--      string for some tenants (jsonb_typeof = 'string'), not as a
--      proper jsonb array. Unwrap before iterating.
--   2. The frontend injects a virtual "Closed" stage rather than
--      requiring tenants to configure isClosed=true. So if no entry
--      is flagged isClosed (the common case), fall back to the
--      literal name 'Closed' — that's what the kanban drag writes,
--      so we'll match the existing behavior.

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

  -- Pull the configured statuses. Settings.value is jsonb but some
  -- writers (older clients) stored it as a JSON-encoded string. Unwrap.
  SELECT value INTO v_statuses
  FROM settings
  WHERE company_id = v_company_id
    AND key = 'job_statuses'
  LIMIT 1;

  IF v_statuses IS NOT NULL AND jsonb_typeof(v_statuses) = 'string' THEN
    BEGIN
      v_statuses := (v_statuses #>> '{}')::jsonb;
    EXCEPTION WHEN OTHERS THEN
      v_statuses := NULL;
    END;
  END IF;

  -- Look for an explicit isClosed entry, then a category=closed entry.
  IF v_statuses IS NOT NULL AND jsonb_typeof(v_statuses) = 'array' THEN
    SELECT (s ->> 'name') INTO v_closed_name
    FROM jsonb_array_elements(v_statuses) AS s
    WHERE (s ->> 'isClosed')::boolean IS TRUE
    LIMIT 1;

    IF v_closed_name IS NULL THEN
      SELECT (s ->> 'name') INTO v_closed_name
      FROM jsonb_array_elements(v_statuses) AS s
      WHERE (s ->> 'category') = 'closed'
      LIMIT 1;
    END IF;
  END IF;

  -- Fallback: the frontend injects a virtual "Closed" stage and that's
  -- the value the kanban writes to jobs.status when dropped there. If
  -- nothing in settings tags itself as closed, use the literal name.
  IF v_closed_name IS NULL THEN
    v_closed_name := 'Closed';
  END IF;

  IF v_current_status = v_closed_name THEN
    RETURN NEW;
  END IF;

  UPDATE jobs
  SET status = v_closed_name,
      updated_at = NOW()
  WHERE id = v_job_id;

  RETURN NEW;
END;
$$;

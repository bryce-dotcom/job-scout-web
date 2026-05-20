-- Refinement: don't resurrect Archived jobs back into the kanban.
-- An archived job is already a terminal state; receiving payment on its
-- invoice should not pull it back into the active pipeline as Closed.
-- Everything else (Completed, Verified Complete, Post Inspection,
-- Scheduled, Chillin, etc.) is still eligible to advance.

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

  -- Archived is its own terminal state — leave it alone.
  IF v_current_status = 'Archived' THEN
    RETURN NEW;
  END IF;

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

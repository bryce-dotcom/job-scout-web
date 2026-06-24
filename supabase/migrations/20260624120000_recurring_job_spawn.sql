-- Recurring jobs: make jobs.recurrence actually DO something.
--
-- The recurrence dropdown (None/Daily/Weekly/Bi-Weekly/Monthly/Every 6 Weeks/
-- Bi-Monthly/Quarterly/Bi-Annually/Annually) has existed for a while but was
-- dead metadata — nothing ever created the next occurrence. Field staff
-- (Christopher "ONE Spot One Touch", Alayda "a recurring job option would be
-- great") schedule a lot of repeat work and had to re-enter it every time.
--
-- Now: when a recurring job is marked Completed, auto-spawn the NEXT occurrence
-- — same crew/customer/scope/line-items, date advanced by the interval, status
-- Scheduled. One open occurrence at a time (guarded), so completing each visit
-- rolls the series forward with zero re-entry. Lawn-care jobs are EXCLUDED
-- (lawn_property_id set) — those are managed by the lawn_property_sync trigger.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recurrence_parent_id BIGINT REFERENCES jobs(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_jobs_recurrence_parent ON jobs (recurrence_parent_id) WHERE recurrence_parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION spawn_next_recurring_job()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_interval INTERVAL;
  v_root_id  BIGINT;
  v_new_id   BIGINT;
BEGIN
  -- Only on the transition INTO Completed.
  IF NOT (NEW.status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed') THEN
    RETURN NEW;
  END IF;
  -- Must be a real recurring job that isn't lawn-managed and has a date to advance.
  IF COALESCE(NEW.recurrence, 'None') IN ('None', '') OR NEW.lawn_property_id IS NOT NULL OR NEW.start_date IS NULL THEN
    RETURN NEW;
  END IF;

  v_interval := CASE NEW.recurrence
    WHEN 'Daily'         THEN INTERVAL '1 day'
    WHEN 'Weekly'        THEN INTERVAL '7 days'
    WHEN 'Bi-Weekly'     THEN INTERVAL '14 days'
    WHEN 'Every 6 Weeks' THEN INTERVAL '42 days'
    WHEN 'Monthly'       THEN INTERVAL '1 month'
    WHEN 'Bi-Monthly'    THEN INTERVAL '2 months'
    WHEN 'Quarterly'     THEN INTERVAL '3 months'
    WHEN 'Bi-Annually'   THEN INTERVAL '6 months'
    WHEN 'Annually'      THEN INTERVAL '1 year'
    ELSE NULL
  END;
  IF v_interval IS NULL THEN
    RETURN NEW;
  END IF;

  -- Chain root: the first job in the series. Guard against double-spawning —
  -- if an open occurrence already exists in this chain, do nothing.
  v_root_id := COALESCE(NEW.recurrence_parent_id, NEW.id);
  IF EXISTS (
    SELECT 1 FROM public.jobs
     WHERE recurrence_parent_id = v_root_id
       AND status NOT IN ('Completed', 'Cancelled', 'Archived')
  ) THEN
    RETURN NEW;
  END IF;

  -- Copy only the fields that should carry to the next visit; everything else
  -- (calendar event ids, signatures, work-order pdf, invoice status, quote
  -- link, completed_at...) starts fresh by being omitted.
  INSERT INTO public.jobs (
    company_id, job_id, job_title, status, start_date, end_date,
    customer_id, customer_name, business_name, job_address, gps_location,
    business_unit, service_type, salesperson_id, salesperson, lead_id,
    lead_source, lead_source_name, pm_id, job_lead_id, audit_id, assigned_team, team,
    allotted_time_hours, calculated_allotted_time, profit_margin,
    discount, discount_description, details, notes, email, phone, address,
    recurrence, recurrence_parent_id, source_system, created_at, updated_at
  )
  SELECT
    company_id,
    'JOB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
    job_title, 'Scheduled',
    NEW.start_date + v_interval,
    CASE WHEN NEW.end_date IS NOT NULL THEN NEW.end_date + v_interval ELSE NULL END,
    customer_id, customer_name, business_name, job_address, gps_location,
    business_unit, service_type, salesperson_id, salesperson, lead_id,
    lead_source, lead_source_name, pm_id, job_lead_id, audit_id, assigned_team, team,
    allotted_time_hours, calculated_allotted_time, profit_margin,
    discount, discount_description, details, notes, email, phone, address,
    recurrence, v_root_id, 'recurrence_spawn', now(), now()
  FROM public.jobs
  WHERE id = NEW.id
  RETURNING id INTO v_new_id;

  -- Carry the scope (line items) onto the next visit.
  INSERT INTO public.job_lines (
    company_id, job_id, job_line_id, item_id, quantity, price, total,
    description, notes, totals, discount, labor_cost, item_name, kind,
    taxable, unit_of_measure, in_utility_scope, created_at, updated_at
  )
  SELECT
    company_id, v_new_id,
    'JL-' || upper(substr(md5(random()::text || id::text || clock_timestamp()::text), 1, 10)),
    item_id, quantity, price, total, description, notes, totals, discount,
    labor_cost, item_name, kind, taxable, unit_of_measure, in_utility_scope,
    now(), now()
  FROM public.job_lines
  WHERE job_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_spawn_next_recurring_job ON jobs;
CREATE TRIGGER trg_spawn_next_recurring_job
  AFTER UPDATE OF status ON jobs
  FOR EACH ROW
  EXECUTE FUNCTION spawn_next_recurring_job();

NOTIFY pgrst, 'reload schema';

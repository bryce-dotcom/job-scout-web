-- Recurring jobs, unified: ONE spawn engine, now honoring an end date and a
-- landing mode.
--
-- Background / bug fix:
--   Two code paths used to create recurring occurrences. This trigger
--   (spawn_next_recurring_job) spawns the NEXT occurrence one-at-a-time when a
--   job is completed, guarded so a chain never has two open occurrences. The
--   Job Board's schedule modal ALSO eagerly bulk-created every future occurrence
--   up front -- but WITHOUT setting recurrence_parent_id. Because those eager
--   rows weren't linked into the chain, this trigger's guard couldn't see them
--   and would spawn extra duplicates on completion. The eager path is retired in
--   the app (PMJobSetter.jsx); this trigger is now the single source of truth.
--
-- New behavior:
--   * recurrence_end_date -- stop spawning once the next occurrence would fall
--     past this date (NULL = repeat forever). Makes the UI's "Ends" option real
--     and prevents an unbounded series.
--   * recurrence_landing  -- where the next occurrence shows up:
--       'schedule' (default): next occurrence gets start_date + 'Scheduled'
--                   status, so it lands on the Calendar / Job Board.
--       'services': next occurrence gets service_due_date + 'Chillin' status,
--                   so it lands in the "Services" (upcoming due) list for staff
--                   to schedule and call the customer.
--
-- Purely additive: new nullable columns; existing recurring jobs default to
-- 'schedule' landing and no end date -- i.e. unchanged behavior except that the
-- double-spawn can no longer happen.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recurrence_end_date DATE;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recurrence_landing TEXT DEFAULT 'schedule';

CREATE OR REPLACE FUNCTION spawn_next_recurring_job()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_interval INTERVAL;
  v_root_id  BIGINT;
  v_new_id   BIGINT;
  v_base_ts  TIMESTAMPTZ;
  v_next_ts  TIMESTAMPTZ;
  v_landing  TEXT;
BEGIN
  -- Only on the transition INTO Completed.
  IF NOT (NEW.status = 'Completed' AND OLD.status IS DISTINCT FROM 'Completed') THEN
    RETURN NEW;
  END IF;
  -- Must be a real recurring job that isn't lawn-managed (lawn has its own sync).
  IF COALESCE(NEW.recurrence, 'None') IN ('None', '') OR NEW.lawn_property_id IS NOT NULL THEN
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

  -- Advance from the visit's scheduled date, or its service-due date if it was a
  -- services-landing visit that hadn't been given a start_date.
  v_base_ts := COALESCE(NEW.start_date, NEW.service_due_date::timestamptz);
  IF v_base_ts IS NULL THEN
    RETURN NEW;
  END IF;
  v_next_ts := v_base_ts + v_interval;

  -- Respect the end date (NULL = forever).
  IF NEW.recurrence_end_date IS NOT NULL AND v_next_ts::date > NEW.recurrence_end_date THEN
    RETURN NEW;
  END IF;

  -- Chain root + one-open-occurrence guard (this is what prevents double-spawn).
  v_root_id := COALESCE(NEW.recurrence_parent_id, NEW.id);
  IF EXISTS (
    SELECT 1 FROM public.jobs
     WHERE recurrence_parent_id = v_root_id
       AND status NOT IN ('Completed', 'Cancelled', 'Archived')
  ) THEN
    RETURN NEW;
  END IF;

  v_landing := COALESCE(NEW.recurrence_landing, 'schedule');

  -- Copy only the fields that should carry to the next visit; everything else
  -- (calendar event ids, signatures, work-order pdf, invoice status, quote
  -- link, completed_at...) starts fresh by being omitted.
  INSERT INTO public.jobs (
    company_id, job_id, job_title, status, start_date, end_date, service_due_date,
    customer_id, customer_name, business_name, job_address, gps_location,
    business_unit, service_type, salesperson_id, salesperson, lead_id,
    lead_source, lead_source_name, pm_id, job_lead_id, audit_id, assigned_team, team,
    allotted_time_hours, calculated_allotted_time, profit_margin,
    discount, discount_description, details, notes, email, phone, address,
    recurrence, recurrence_parent_id, recurrence_end_date, recurrence_landing,
    source_system, created_at, updated_at
  )
  SELECT
    company_id,
    'JOB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
    job_title,
    CASE WHEN v_landing = 'services' THEN 'Chillin' ELSE 'Scheduled' END,
    CASE WHEN v_landing = 'services' THEN NULL ELSE v_next_ts END,
    CASE WHEN v_landing = 'services' THEN NULL
         WHEN NEW.end_date IS NOT NULL THEN NEW.end_date + v_interval
         ELSE NULL END,
    CASE WHEN v_landing = 'services' THEN v_next_ts::date ELSE NULL END,
    customer_id, customer_name, business_name, job_address, gps_location,
    business_unit, service_type, salesperson_id, salesperson, lead_id,
    lead_source, lead_source_name, pm_id, job_lead_id, audit_id, assigned_team, team,
    allotted_time_hours, calculated_allotted_time, profit_margin,
    discount, discount_description, details, notes, email, phone, address,
    recurrence, v_root_id, recurrence_end_date, recurrence_landing,
    'recurrence_spawn', now(), now()
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

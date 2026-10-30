-- A recurring visit keeps its price (Bryce, 2026-10-30: "count the recurring visits").
--
-- spawn_next_recurring_job copied the visit's line items but not its
-- job_total, so every automatically booked visit carried a blank total until
-- someone opened and saved it: it counted $0 in Sold (lib/soldTotals values a
-- job at its own job_total) and read unpriced on the board. HHH's Specialists
-- in Orthodontics and Christenson November visits (JOB-B8383C8E33,
-- JOB-8E3C7C7F3C) were sitting at null. The lines are copied one for one, so
-- the total — and where it came from, lines or typed by hand — is the visit's
-- own. Otherwise identical to 20261030120000.

CREATE OR REPLACE FUNCTION public.spawn_next_recurring_job()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_interval INTERVAL;
  v_root_id  BIGINT;
  v_new_id   BIGINT;
  v_base_ts  TIMESTAMPTZ;
  v_next_ts  TIMESTAMPTZ;
  v_landing  TEXT;
  v_steps    INT := 0;
  -- Finished = the visit is done. Not finished and not called off = open.
  c_finished CONSTANT TEXT[] := ARRAY['Completed', 'Job Complete', 'Verified Complete', 'Invoiced', 'Paid', 'Closed', 'Done'];
  c_off      CONSTANT TEXT[] := ARRAY['Cancelled', 'Canceled', 'Archived', 'Void', 'Voided'];
BEGIN
  -- Only on the move INTO a finished status from an unfinished one.
  IF NOT (NEW.status = ANY (c_finished))
     OR (OLD.status IS NOT NULL AND OLD.status = ANY (c_finished)) THEN
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
  -- Never book a visit already in the past (capped so a bad date cannot spin).
  WHILE v_next_ts::date < current_date AND v_steps < 1000 LOOP
    v_next_ts := v_next_ts + v_interval;
    v_steps := v_steps + 1;
  END LOOP;

  -- Respect the end date (NULL = forever).
  IF NEW.recurrence_end_date IS NOT NULL AND v_next_ts::date > NEW.recurrence_end_date THEN
    RETURN NEW;
  END IF;

  -- Chain root + one-open-occurrence guard (this is what prevents double-spawn).
  v_root_id := COALESCE(NEW.recurrence_parent_id, NEW.id);
  IF EXISTS (
    SELECT 1 FROM public.jobs
     WHERE (recurrence_parent_id = v_root_id OR id = v_root_id)
       AND id <> NEW.id
       AND NOT (status = ANY (c_finished))
       AND NOT (status = ANY (c_off))
  ) THEN
    RETURN NEW;
  END IF;

  -- The same visit already booked outside the chain (months entered as
  -- separate recurring jobs): do not add a duplicate.
  IF NEW.customer_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.jobs
     WHERE company_id = NEW.company_id
       AND customer_id = NEW.customer_id
       AND id <> NEW.id
       AND recurrence = NEW.recurrence
       AND btrim(COALESCE(job_title, '')) = btrim(COALESCE(NEW.job_title, ''))
       AND NOT (status = ANY (c_finished))
       AND NOT (status = ANY (c_off))
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
    job_total, job_total_source,
    source_system, created_at, updated_at
  )
  SELECT
    company_id,
    'JOB-' || upper(substr(md5(random()::text || clock_timestamp()::text), 1, 10)),
    job_title,
    CASE WHEN v_landing = 'services' THEN 'Chillin' ELSE 'Scheduled' END,
    CASE WHEN v_landing = 'services' THEN NULL ELSE v_next_ts END,
    CASE WHEN v_landing = 'services' THEN NULL
         WHEN NEW.end_date IS NOT NULL THEN NEW.end_date + v_interval * (v_steps + 1)
         ELSE NULL END,
    CASE WHEN v_landing = 'services' THEN v_next_ts::date ELSE NULL END,
    customer_id, customer_name, business_name, job_address, gps_location,
    business_unit, service_type, salesperson_id, salesperson, lead_id,
    lead_source, lead_source_name, pm_id, job_lead_id, audit_id, assigned_team, team,
    allotted_time_hours, calculated_allotted_time, profit_margin,
    discount, discount_description, details, notes, email, phone, address,
    recurrence, v_root_id, recurrence_end_date, recurrence_landing,
    job_total, job_total_source,
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
$function$;

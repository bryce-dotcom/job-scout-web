-- ====================================================================
-- Step 2: lawn_property → jobs sync (Postgres trigger)
--
-- When a lawn_property is saved with mow_day + mow_frequency:
--   • Create a recurring `jobs` row if none exists for that property
--   • Update the existing recurring job if mow_day / frequency / etc.
--     changed (e.g., customer moves from Monday to Tuesday route)
--   • Archive the job if active goes false
--
-- After this, Zach's Properties page becomes the source of truth for
-- the route. Field Scout, Job Board, Calendar, payroll, reports all
-- "just work" because they read from `jobs` — they never need to know
-- lawn_properties exists.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.sync_lawn_property_to_job()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing_job_id  INTEGER;
  v_recurrence       TEXT;
  v_dow              INTEGER;
  v_today_dow        INTEGER;
  v_days_ahead       INTEGER;
  v_next_date        TIMESTAMPTZ;
  v_customer_label   TEXT;
  v_job_title        TEXT;
BEGIN
  -- Inactive property → archive any existing recurring jobs, stop.
  IF NEW.active = FALSE THEN
    UPDATE public.jobs
       SET status = 'Archived', updated_at = NOW()
     WHERE lawn_property_id = NEW.id
       AND service_type = 'Mowing'
       AND status NOT IN ('Completed', 'Cancelled', 'Archived');
    RETURN NEW;
  END IF;

  -- Need both a day and a frequency to schedule anything.
  IF NEW.mow_day IS NULL OR NEW.mow_frequency IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map frequency string → jobs.recurrence value.
  v_recurrence := CASE LOWER(REPLACE(NEW.mow_frequency, '-', ''))
    WHEN 'weekly'   THEN 'weekly'
    WHEN 'biweekly' THEN 'biweekly'
    WHEN 'monthly'  THEN 'monthly'
    ELSE NULL
  END;
  IF v_recurrence IS NULL THEN
    RETURN NEW;
  END IF;

  -- Map weekday name → integer (0=Sunday). Compute next occurrence.
  v_dow := CASE LOWER(NEW.mow_day)
    WHEN 'sunday'    THEN 0
    WHEN 'monday'    THEN 1
    WHEN 'tuesday'   THEN 2
    WHEN 'wednesday' THEN 3
    WHEN 'thursday'  THEN 4
    WHEN 'friday'    THEN 5
    WHEN 'saturday'  THEN 6
    ELSE NULL
  END;
  IF v_dow IS NULL THEN
    RETURN NEW;
  END IF;

  v_today_dow  := EXTRACT(DOW FROM CURRENT_DATE)::INTEGER;
  v_days_ahead := MOD((v_dow - v_today_dow + 7), 7);
  IF v_days_ahead = 0 THEN v_days_ahead := 7; END IF;
  v_next_date := (CURRENT_DATE + (v_days_ahead || ' days')::INTERVAL)::TIMESTAMPTZ
                 + INTERVAL '8 hours';  -- 8am local-ish

  -- Resolve a label for the job_title.
  v_customer_label := NULL;
  IF NEW.customer_id IS NOT NULL THEN
    SELECT COALESCE(business_name, name) INTO v_customer_label
      FROM public.customers WHERE id = NEW.customer_id;
  END IF;
  v_job_title := 'Mow — ' || COALESCE(NEW.property_name, v_customer_label, 'Property #' || NEW.id::TEXT);

  -- Existing recurring mow job for this property?
  SELECT id INTO v_existing_job_id
    FROM public.jobs
   WHERE lawn_property_id = NEW.id
     AND service_type = 'Mowing'
     AND status NOT IN ('Completed', 'Cancelled', 'Archived')
   ORDER BY id DESC
   LIMIT 1;

  IF v_existing_job_id IS NOT NULL THEN
    -- Update in place: only refresh start_date if it's already in the past.
    UPDATE public.jobs
       SET recurrence  = v_recurrence,
           start_date  = CASE
             WHEN start_date IS NULL OR start_date < CURRENT_DATE::TIMESTAMPTZ
               THEN v_next_date
             ELSE start_date
           END,
           job_title   = v_job_title,
           job_address = NEW.address,
           customer_id = NEW.customer_id,
           updated_at  = NOW()
     WHERE id = v_existing_job_id;
  ELSE
    -- New recurring job. job_id is a stable string so the row is easy
    -- to spot in reports — pattern matches the import naming.
    INSERT INTO public.jobs (
      company_id, customer_id, lawn_property_id,
      job_id, job_title, status,
      start_date, job_address,
      service_type, recurrence,
      notes, source_system,
      created_at, updated_at
    ) VALUES (
      NEW.company_id, NEW.customer_id, NEW.id,
      'JOB-LAWN-' || NEW.id::TEXT,
      v_job_title, 'Chillin',
      v_next_date, NEW.address,
      'Mowing', v_recurrence,
      'Auto-created from lawn property', 'lawn_property_sync',
      NOW(), NOW()
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Drop + recreate the trigger so re-running this migration is safe.
DROP TRIGGER IF EXISTS sync_lawn_property_to_job_trigger ON public.lawn_properties;

CREATE TRIGGER sync_lawn_property_to_job_trigger
AFTER INSERT OR UPDATE OF
  mow_day, mow_frequency, active, customer_id, address, property_name
ON public.lawn_properties
FOR EACH ROW
EXECUTE FUNCTION public.sync_lawn_property_to_job();

NOTIFY pgrst, 'reload schema';

-- ====================================================================
-- Step 4: jobs → lawn_visits sidecar sync
--
-- When a Mowing job transitions to Completed in Field Scout (or
-- anywhere else), automatically write a lawn_visits row with the
-- property linkage, today's date, and the billed flag.
--
-- The crew can still enrich the sidecar from the ZachVisits page
-- (weather, treatment notes, photos) but the minimum row exists
-- without anyone touching that page.
-- ====================================================================

CREATE OR REPLACE FUNCTION public.sync_job_to_lawn_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit_date DATE;
BEGIN
  -- Only act on Mowing jobs that just transitioned to Completed AND
  -- have a property to point at.
  IF NEW.service_type   IS DISTINCT FROM 'Mowing'  THEN RETURN NEW; END IF;
  IF NEW.status         IS DISTINCT FROM 'Completed' THEN RETURN NEW; END IF;
  IF OLD.status                = 'Completed'         THEN RETURN NEW; END IF;
  IF NEW.lawn_property_id IS NULL                    THEN RETURN NEW; END IF;

  v_visit_date := COALESCE(NEW.completed_at::DATE, CURRENT_DATE);

  -- Idempotency: skip if a mow visit already exists on this date for
  -- this property.
  IF EXISTS (
    SELECT 1 FROM public.lawn_visits
     WHERE property_id  = NEW.lawn_property_id
       AND visit_date   = v_visit_date
       AND service_type = 'mow'
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.lawn_visits (
    company_id, property_id, visit_date, service_type,
    billed, invoice_id, notes, created_at, updated_at
  ) VALUES (
    NEW.company_id, NEW.lawn_property_id, v_visit_date, 'mow',
    COALESCE(NEW.billed, FALSE), NULL,
    'Auto-logged from Field Scout job completion (#' || NEW.id::TEXT || ')',
    NOW(), NOW()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_job_to_lawn_visit_trigger ON public.jobs;

CREATE TRIGGER sync_job_to_lawn_visit_trigger
AFTER UPDATE OF status ON public.jobs
FOR EACH ROW
EXECUTE FUNCTION public.sync_job_to_lawn_visit();

NOTIFY pgrst, 'reload schema';

-- Fix: previous version of sync_job_to_lawn_visit() referenced
-- NEW.billed which doesn't exist on the jobs table. lawn_visits.billed
-- defaults to FALSE in the schema — just omit it on insert. The crew
-- can flip it from the ZachVisits UI when payment lands.

CREATE OR REPLACE FUNCTION public.sync_job_to_lawn_visit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_visit_date DATE;
BEGIN
  IF NEW.service_type   IS DISTINCT FROM 'Mowing'    THEN RETURN NEW; END IF;
  IF NEW.status         IS DISTINCT FROM 'Completed' THEN RETURN NEW; END IF;
  IF OLD.status                = 'Completed'         THEN RETURN NEW; END IF;
  IF NEW.lawn_property_id IS NULL                    THEN RETURN NEW; END IF;

  v_visit_date := COALESCE(NEW.completed_at::DATE, CURRENT_DATE);

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
    notes, created_at, updated_at
  ) VALUES (
    NEW.company_id, NEW.lawn_property_id, v_visit_date, 'mow',
    'Auto-logged from Field Scout job completion (#' || NEW.id::TEXT || ')',
    NOW(), NOW()
  );

  RETURN NEW;
END;
$$;

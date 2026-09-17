-- The one-time conversion of next_pm_due / last_pm_date into a schedule row
-- (20260917200000) closed the backlog. This makes it a standing rule, so a
-- writer that still sets those columns by hand — the demo seed does, a CSV
-- import might — cannot leave an asset with a due date and no schedule behind
-- it. Same arithmetic as the backfill, living in one place.
--
-- Guarded by pg_trigger_depth(): the cache refresh in
-- fleet_refresh_pm_dates() writes these same columns from inside a trigger,
-- and that write must not be mistaken for a person typing a date.
CREATE OR REPLACE FUNCTION public.fleet_legacy_pm_dates_to_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_interval integer;
BEGIN
  IF pg_trigger_depth() > 1 THEN RETURN NEW; END IF;
  IF NEW.next_pm_due IS NULL AND NEW.last_pm_date IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.next_pm_due IS NOT DISTINCT FROM OLD.next_pm_due
     AND NEW.last_pm_date IS NOT DISTINCT FROM OLD.last_pm_date THEN RETURN NEW; END IF;
  IF EXISTS (SELECT 1 FROM public.fleet_pm_schedules s WHERE s.fleet_id = NEW.id AND s.active) THEN RETURN NEW; END IF;

  v_interval := GREATEST(30, COALESCE(NEW.next_pm_due - NEW.last_pm_date, 90));
  INSERT INTO public.fleet_pm_schedules
    (company_id, fleet_id, name, category, interval_days, last_done_date, lead_days, source, notes)
  VALUES
    (NEW.company_id, NEW.id, 'Preventive maintenance', 'service', v_interval,
     COALESCE(NEW.last_pm_date, NEW.next_pm_due - v_interval), 14, 'template',
     'Carried over from a typed PM date. Edit the interval, or replace it with a full schedule from Freddy.');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fleet_legacy_pm_dates_to_schedule ON public.fleet;
CREATE TRIGGER trg_fleet_legacy_pm_dates_to_schedule
  AFTER INSERT OR UPDATE OF next_pm_due, last_pm_date ON public.fleet
  FOR EACH ROW EXECUTE FUNCTION public.fleet_legacy_pm_dates_to_schedule();

-- Retire the single-date PM log, and let a machine's problems reach a person.
--
-- Two things were true at once on every asset page. A "Log Maintenance"
-- button set next_pm_due to ninety days out whatever was logged, and a real
-- schedule sat underneath it with its own clocks. The card, the calendar and
-- the dashboard all read the ninety-day date. Nothing read the schedule.
--
-- The retirement is done at the data layer so the seven screens that read
-- fleet.next_pm_due keep working untouched:
--
--   1. Every legacy date becomes a real schedule row, so no tenant's due date
--      disappears in the switch.
--   2. next_pm_due / last_pm_date become a CACHE of the schedule, recomputed by
--      trigger. Nothing writes them by hand any more; the readers stay right.
--   3. Completing a service is one insert into fleet_maintenance carrying a
--      schedule_id. A trigger resets the schedule's clocks from that row, so
--      history and schedule can never disagree about when something was done.
--
-- And the half that was missing entirely: notifications addressed to a person
-- that survive them not being online when it happened. company_notifications
-- is a toast to whoever is looking; a driver clocked out at 4pm never saw one.
-- employee_notifications is per person, persistent, and read in Field Scout.

-- =====================================================================
-- 1. History rows know which schedule they completed
-- =====================================================================
ALTER TABLE public.fleet_maintenance
  ADD COLUMN IF NOT EXISTS schedule_id bigint REFERENCES public.fleet_pm_schedules(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS fleet_maintenance_schedule_idx ON public.fleet_maintenance (schedule_id);

-- =====================================================================
-- 2. Legacy dates → a schedule row
--
-- The old flow only ever knew "ninety days after the last log", so the
-- interval is recovered from the two dates where both exist and defaults to
-- ninety otherwise. last_done_date is chosen so the due date the owner was
-- looking at yesterday is the due date they see today.
-- =====================================================================
INSERT INTO public.fleet_pm_schedules
  (company_id, fleet_id, name, category, interval_days, last_done_date, lead_days, source, notes)
SELECT f.company_id, f.id, 'Preventive maintenance', 'service',
       GREATEST(30, COALESCE(f.next_pm_due - f.last_pm_date, 90)) AS interval_days,
       COALESCE(f.last_pm_date,
                f.next_pm_due - GREATEST(30, COALESCE(f.next_pm_due - f.last_pm_date, 90))) AS last_done_date,
       14, 'template',
       'Carried over from the previous single PM date. Edit the interval, or replace it with a full schedule from Freddy.'
  FROM public.fleet f
 WHERE (f.next_pm_due IS NOT NULL OR f.last_pm_date IS NOT NULL)
   AND NOT EXISTS (SELECT 1 FROM public.fleet_pm_schedules s WHERE s.fleet_id = f.id AND s.active);

-- =====================================================================
-- 3. next_pm_due / last_pm_date derived from the schedule
--
-- Earliest calendar due date across the asset's active schedules. A schedule
-- expressed only in miles has no date to offer; it shows through the overdue
-- pills instead, and the column is honest about not knowing rather than
-- inventing one from an assumed daily mileage.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fleet_refresh_pm_dates(p_fleet_id integer)
RETURNS void
LANGUAGE sql
SET search_path = public
AS $$
  UPDATE public.fleet f
     SET next_pm_due = (
           SELECT MIN(s.last_done_date + s.interval_days)
             FROM public.fleet_pm_schedules s
            WHERE s.fleet_id = f.id AND s.active
              AND s.interval_days IS NOT NULL AND s.last_done_date IS NOT NULL),
         last_pm_date = (
           SELECT MAX(s.last_done_date)
             FROM public.fleet_pm_schedules s
            WHERE s.fleet_id = f.id AND s.active)
   WHERE f.id = p_fleet_id;
$$;

CREATE OR REPLACE FUNCTION public.fleet_pm_schedules_refresh_dates()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.fleet_refresh_pm_dates(OLD.fleet_id);
    RETURN OLD;
  END IF;
  PERFORM public.fleet_refresh_pm_dates(NEW.fleet_id);
  IF TG_OP = 'UPDATE' AND NEW.fleet_id <> OLD.fleet_id THEN
    PERFORM public.fleet_refresh_pm_dates(OLD.fleet_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fleet_pm_schedules_refresh_dates ON public.fleet_pm_schedules;
CREATE TRIGGER trg_fleet_pm_schedules_refresh_dates
  AFTER INSERT OR UPDATE OR DELETE ON public.fleet_pm_schedules
  FOR EACH ROW EXECUTE FUNCTION public.fleet_pm_schedules_refresh_dates();

-- Bring every asset's cached dates in line with the schedule it now has.
SELECT public.fleet_refresh_pm_dates(id) FROM public.fleet;

-- =====================================================================
-- 4. Completing a service = one history row; the schedule follows
--
-- Both clocks reset from the row: the date it was done and the meter that
-- day. A row with no meter leaves last_done_meter alone rather than nulling a
-- figure someone typed last time.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fleet_maintenance_completes_schedule()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.schedule_id IS NULL THEN RETURN NEW; END IF;
  UPDATE public.fleet_pm_schedules s
     SET last_done_date  = GREATEST(COALESCE(s.last_done_date, NEW.date::date), NEW.date::date),
         last_done_meter = CASE WHEN NEW.mileage_hours IS NULL THEN s.last_done_meter
                                ELSE GREATEST(COALESCE(s.last_done_meter, 0), NEW.mileage_hours) END,
         updated_at = now()
   WHERE s.id = NEW.schedule_id;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fleet_maintenance_completes_schedule ON public.fleet_maintenance;
CREATE TRIGGER trg_fleet_maintenance_completes_schedule
  AFTER INSERT ON public.fleet_maintenance
  FOR EACH ROW EXECUTE FUNCTION public.fleet_maintenance_completes_schedule();

-- =====================================================================
-- 5. Notifications addressed to a person
-- =====================================================================
CREATE TABLE IF NOT EXISTS public.employee_notifications (
  id            bigserial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  employee_id   integer NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  type          text NOT NULL,
  title         text NOT NULL,
  message       text,
  route         text,                     -- where tapping it goes, e.g. /fleet/32
  metadata      jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- One row per thing worth saying. The PM cron runs daily and a truck stays
  -- overdue for weeks; without this key it would say so every morning.
  dedupe_key    text,
  read_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS employee_notifications_dedupe_idx
  ON public.employee_notifications (employee_id, dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS employee_notifications_unread_idx
  ON public.employee_notifications (employee_id, created_at DESC) WHERE read_at IS NULL;

ALTER TABLE public.employee_notifications ENABLE ROW LEVEL SECURITY;

-- Read your own; managers read the company's. Writes come from triggers and
-- the cron, so the insert policy only needs to admit a colleague's row being
-- created by a colleague (a driver filing a request notifies the managers).
DO $$ BEGIN
  CREATE POLICY employee_notifications_select ON public.employee_notifications FOR SELECT
    USING (company_id IN (SELECT public.current_user_company_ids())
           AND (public.current_user_access_level() >= 2
                OR employee_id IN (SELECT e.id FROM public.employees e
                                    WHERE lower(e.email) = lower(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '')))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY employee_notifications_insert ON public.employee_notifications FOR INSERT
    WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY employee_notifications_update ON public.employee_notifications FOR UPDATE
    USING (company_id IN (SELECT public.current_user_company_ids())
           AND (public.current_user_access_level() >= 2
                OR employee_id IN (SELECT e.id FROM public.employees e
                                    WHERE lower(e.email) = lower(nullif(current_setting('request.jwt.claims', true)::json ->> 'email', '')))));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =====================================================================
-- 6. A service request reaches someone
--
-- Filed → the managers, and the whole company as a toast. An "unsafe to run"
-- is said in those words in the title, because that is the one a manager
-- needs to read from the lock screen.
-- Status moved → the person who reported it. Filing a report into silence is
-- how people stop filing them.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.fleet_service_request_notify()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_asset    text;
  v_reporter text;
  v_title    text;
  v_msg      text;
  v_route    text;
  v_status   text;
BEGIN
  SELECT name INTO v_asset FROM public.fleet WHERE id = NEW.fleet_id;
  v_route := '/fleet/' || NEW.fleet_id;

  IF TG_OP = 'INSERT' THEN
    SELECT name INTO v_reporter FROM public.employees WHERE id = NEW.reported_by;
    v_title := CASE WHEN NEW.severity = 'safety'
                    THEN COALESCE(v_asset, 'A vehicle') || ' reported UNSAFE TO RUN'
                    ELSE 'Repair request: ' || COALESCE(v_asset, 'a vehicle') END;
    v_msg := COALESCE(v_reporter, 'Someone') || ': ' || left(NEW.description, 200);

    INSERT INTO public.employee_notifications (company_id, employee_id, type, title, message, route, metadata, dedupe_key)
    SELECT NEW.company_id, e.id, 'fleet_request_filed', v_title, v_msg, v_route,
           jsonb_build_object('request_id', NEW.id, 'fleet_id', NEW.fleet_id, 'severity', NEW.severity),
           'req:' || NEW.id || ':filed'
      FROM public.employees e
     WHERE e.company_id = NEW.company_id AND e.active
       AND e.id IS DISTINCT FROM NEW.reported_by
       AND (e.user_role IN ('Manager', 'Admin', 'Owner', 'Super Admin') OR e.is_admin)
    ON CONFLICT DO NOTHING;

    INSERT INTO public.company_notifications (company_id, type, title, message, metadata, created_by)
    VALUES (NEW.company_id, 'fleet_request_filed', v_title, v_msg,
            jsonb_build_object('request_id', NEW.id, 'fleet_id', NEW.fleet_id, 'severity', NEW.severity), NULL);
    RETURN NEW;
  END IF;

  -- UPDATE: only a status change is news, and only to the reporter.
  IF NEW.status IS NOT DISTINCT FROM OLD.status OR NEW.reported_by IS NULL THEN RETURN NEW; END IF;
  v_status := CASE NEW.status
                WHEN 'acknowledged' THEN 'was seen'
                WHEN 'scheduled'    THEN 'is scheduled'
                WHEN 'resolved'     THEN 'is fixed'
                WHEN 'declined'     THEN 'was declined'
                ELSE 'changed' END;
  INSERT INTO public.employee_notifications (company_id, employee_id, type, title, message, route, metadata, dedupe_key)
  VALUES (NEW.company_id, NEW.reported_by, 'fleet_request_' || NEW.status,
          'Your report on ' || COALESCE(v_asset, 'the vehicle') || ' ' || v_status,
          left(NEW.description, 200), v_route,
          jsonb_build_object('request_id', NEW.id, 'fleet_id', NEW.fleet_id, 'status', NEW.status),
          'req:' || NEW.id || ':' || NEW.status)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_fleet_service_request_notify ON public.fleet_service_requests;
CREATE TRIGGER trg_fleet_service_request_notify
  AFTER INSERT OR UPDATE OF status ON public.fleet_service_requests
  FOR EACH ROW EXECUTE FUNCTION public.fleet_service_request_notify();

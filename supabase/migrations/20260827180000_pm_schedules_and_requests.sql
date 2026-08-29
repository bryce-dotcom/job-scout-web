-- =====================================================================
-- The operating loop: what is due, and what someone has reported.
--
-- Everything the fleet layer holds so far is written by an owner at a desk
-- after the fact — what a machine cost, what it is worth, what was spent on
-- it. Nothing in it runs the shop. There is no way for the person actually
-- driving a truck to say it needs attention, and no schedule to say what is
-- due before it breaks.
--
-- Maintenance today is two loose columns on fleet: last_pm_date and
-- next_pm_due. Those cannot express how preventive maintenance actually works
-- — "oil every 5,000 miles or 6 months, whichever comes first" is one rule
-- with two clocks, and a machine usually has several such rules at once. A
-- single next-due date collapses all of that into one number somebody has to
-- recompute by hand every time, which is the same as not having it.
--
-- Two tables:
--
--   fleet_pm_schedules      recurring rules. Many per asset. Any interval that
--                           elapses makes the service due — whichever comes
--                           first, because that is the rule people are given.
--   fleet_service_requests  someone reports a problem. Distinct from
--                           fleet_repairs, which records work that HAPPENED.
--                           A request is a question; a repair is an answer,
--                           and conflating them loses every report that was
--                           looked at and declined.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fleet_pm_schedules (
  id            bigserial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fleet_id      integer NOT NULL REFERENCES public.fleet(id) ON DELETE CASCADE,

  name          text NOT NULL,                      -- 'Engine oil & filter'
  -- Rough grouping so a generated schedule can be explained and tuned.
  category      text NOT NULL DEFAULT 'service'
                CHECK (category IN ('service','inspection','safety','seasonal','other')),

  -- The intervals. All optional; at least one must be set, and whichever
  -- elapses first makes the service due. Nullable rather than zero because
  -- zero would read as "due immediately and always".
  interval_miles  integer CHECK (interval_miles  IS NULL OR interval_miles  > 0),
  interval_hours  integer CHECK (interval_hours  IS NULL OR interval_hours  > 0),
  interval_days   integer CHECK (interval_days   IS NULL OR interval_days   > 0),

  -- Where the last one landed, on both clocks. Nullable for a schedule that
  -- has never been done — which is different from one done at zero.
  last_done_date  date,
  last_done_meter numeric(12,1),

  -- How much warning to give. A tyre rotation wants a week; a DOT inspection
  -- wants a month, because booking one takes that long.
  lead_days       integer NOT NULL DEFAULT 14 CHECK (lead_days >= 0),
  lead_meter      numeric(12,1),

  active        boolean NOT NULL DEFAULT true,
  -- 'ai' marks a schedule Freddy proposed, so a generated starting point can
  -- be told apart from something a person decided.
  source        text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','ai','template')),
  notes         text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT fleet_pm_schedules_needs_an_interval
    CHECK (interval_miles IS NOT NULL OR interval_hours IS NOT NULL OR interval_days IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS fleet_pm_schedules_asset_idx
  ON public.fleet_pm_schedules (company_id, fleet_id) WHERE active;

-- ---------------------------------------------------------------------
-- Service requests — the thing a driver can actually do
--
-- Deliberately not fleet_repairs. A repair is work that was done and cost
-- money; a request is somebody saying "this is wrong". Most requests become
-- repairs, some are looked at and declined, and folding the two together
-- loses every one of the latter — which is exactly the history you want when
-- the same complaint comes back a third time.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fleet_service_requests (
  id            bigserial PRIMARY KEY,
  company_id    integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fleet_id      integer NOT NULL REFERENCES public.fleet(id) ON DELETE CASCADE,

  reported_by   integer REFERENCES public.employees(id) ON DELETE SET NULL,
  reported_at   timestamptz NOT NULL DEFAULT now(),

  -- 'safety' is not merely the top of a scale — it asserts the machine should
  -- not be operated, which is a different statement from "fix this soon" and
  -- has to be visible without opening anything.
  severity      text NOT NULL DEFAULT 'normal'
                CHECK (severity IN ('safety','urgent','normal','minor')),
  description   text NOT NULL,
  meter_reading numeric(12,1),
  photo_url     text,

  status        text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','acknowledged','scheduled','resolved','declined')),
  -- Set when the work actually happened, tying the report to its outcome.
  repair_id     bigint REFERENCES public.fleet_repairs(id) ON DELETE SET NULL,
  resolved_at   timestamptz,
  resolved_by   integer REFERENCES public.employees(id) ON DELETE SET NULL,
  resolution_note text,

  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fleet_service_requests_open_idx
  ON public.fleet_service_requests (company_id, status, severity, reported_at DESC);
CREATE INDEX IF NOT EXISTS fleet_service_requests_asset_idx
  ON public.fleet_service_requests (company_id, fleet_id, reported_at DESC);

COMMENT ON COLUMN public.fleet_service_requests.severity IS
  'safety = do not operate. Distinct from urgent, and must surface without anyone opening a screen.';

-- ---------------------------------------------------------------------
-- What is due, in one place
--
-- A view rather than client-side maths, because "is this due" gets asked from
-- the asset card, the driver's own screen, an alert count and eventually a
-- nightly job. Four implementations would disagree, and the one that
-- disagrees quietly is the one that lets an inspection lapse.
--
-- Reports the WORST of the schedule's clocks: a service overdue on miles and
-- fine on days is overdue.
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.fleet_pm_status
  WITH (security_invoker = true) AS
  WITH meters AS (
    SELECT company_id, fleet_id,
           COALESCE(odometer_miles, 0) AS miles,
           COALESCE(engine_hours, 0)   AS hours
      FROM public.fleet_current_meters
  )
  SELECT
    s.id                AS schedule_id,
    s.company_id,
    s.fleet_id,
    f.name              AS asset_name,
    s.name,
    s.category,
    s.interval_miles, s.interval_hours, s.interval_days,
    s.last_done_date, s.last_done_meter, s.lead_days,

    -- Days remaining on the calendar clock, negative once overdue.
    CASE WHEN s.interval_days IS NULL OR s.last_done_date IS NULL THEN NULL
         ELSE (s.last_done_date + s.interval_days) - current_date END AS days_remaining,

    -- Units remaining on the meter clock. Uses whichever meter the interval
    -- is expressed in; a schedule set in miles is measured against miles.
    CASE
      WHEN s.interval_miles IS NOT NULL AND s.last_done_meter IS NOT NULL
        THEN (s.last_done_meter + s.interval_miles) - COALESCE(m.miles, 0)
      WHEN s.interval_hours IS NOT NULL AND s.last_done_meter IS NOT NULL
        THEN (s.last_done_meter + s.interval_hours) - COALESCE(m.hours, 0)
      ELSE NULL
    END AS meter_remaining,

    -- 'never_done' is its own state rather than 'overdue': a schedule added
    -- today with no history is not a failure, it just needs a starting point,
    -- and calling it overdue would bury the genuinely overdue ones.
    CASE
      WHEN s.last_done_date IS NULL AND s.last_done_meter IS NULL THEN 'never_done'
      WHEN (s.interval_days IS NOT NULL AND s.last_done_date IS NOT NULL
            AND (s.last_done_date + s.interval_days) < current_date)
        OR (s.interval_miles IS NOT NULL AND s.last_done_meter IS NOT NULL
            AND (s.last_done_meter + s.interval_miles) < COALESCE(m.miles, 0))
        OR (s.interval_hours IS NOT NULL AND s.last_done_meter IS NOT NULL
            AND (s.last_done_meter + s.interval_hours) < COALESCE(m.hours, 0))
        THEN 'overdue'
      WHEN (s.interval_days IS NOT NULL AND s.last_done_date IS NOT NULL
            AND (s.last_done_date + s.interval_days) <= current_date + s.lead_days)
        THEN 'due_soon'
      ELSE 'ok'
    END AS status
  FROM public.fleet_pm_schedules s
  JOIN public.fleet f ON f.id = s.fleet_id
  LEFT JOIN meters m ON m.fleet_id = s.fleet_id AND m.company_id = s.company_id
  WHERE s.active;

GRANT SELECT ON public.fleet_pm_status TO authenticated;

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
ALTER TABLE public.fleet_pm_schedules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_service_requests  ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['fleet_pm_schedules','fleet_service_requests']
  LOOP
    EXECUTE format(
      'CREATE POLICY tenant_isolation ON public.%I FOR ALL TO authenticated
         USING (company_id in (select public.current_user_company_ids()))
         WITH CHECK (company_id in (select public.current_user_company_ids()))', t);
  END LOOP;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

NOTIFY pgrst, 'reload schema';

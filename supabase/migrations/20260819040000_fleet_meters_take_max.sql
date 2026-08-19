-- =====================================================================
-- The current meter is the HIGHEST reading, not the latest one.
--
-- fleet_current_meters took DISTINCT ON (...) ORDER BY recorded_at DESC —
-- newest row wins. That is correct for a sensor and wrong for a meter.
--
-- Telematics only knows what it has watched since the tracker was fitted. On
-- a 2025 truck with 3,898 miles on the dash and a tracker installed last
-- week, it reports 193.4. So a user would enter the real odometer, see the
-- lifecycle bar light up, and then watch it silently revert the next time the
-- cron ran fifteen minutes later — the newer telematics row overwriting the
-- anchor with a number 3,700 miles too low. The bar would go from a confident
-- valuation back to "not enough data" with nothing to explain why.
--
-- Meters are monotonic: they only ever go up. So take the maximum of each
-- column rather than the newest row, and a dash reading beats an observed
-- one by construction, permanently, without any precedence rules to get
-- wrong later.
--
-- `anchored` replaces `source`: what a caller actually needs to know is
-- whether ANY human-verified reading exists for this asset, not which kind of
-- row happened to be most recent.
-- =====================================================================

DROP VIEW IF EXISTS public.fleet_current_meters;

CREATE VIEW public.fleet_current_meters
  WITH (security_invoker = true) AS
  SELECT
    r.company_id,
    r.fleet_id,
    max(r.recorded_at)                        AS recorded_at,
    max(r.engine_hours)                       AS engine_hours,
    max(r.idle_hours)                         AS idle_hours,
    max(r.odometer_miles)                     AS odometer_miles,
    -- True when a human has confirmed a reading off the machine itself. Only
    -- then is the meter a LIFETIME figure rather than what a tracker has
    -- happened to observe, and only then can it be valued against a market.
    bool_or(r.source IN ('manual', 'import', 'maintenance')) AS anchored,
    -- Kept so callers can still tell how fresh the newest input was.
    max(r.recorded_at) FILTER (WHERE r.source = 'telematics') AS last_telematics_at,
    GREATEST(COALESCE(max(r.engine_hours), 0) - COALESCE(max(r.idle_hours), 0), 0) AS working_hours
  FROM public.fleet_meter_readings r
  GROUP BY r.company_id, r.fleet_id;

GRANT SELECT ON public.fleet_current_meters TO authenticated;

NOTIFY pgrst, 'reload schema';

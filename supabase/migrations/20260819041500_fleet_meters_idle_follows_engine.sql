-- =====================================================================
-- Idle travels with the engine reading it was computed against.
--
-- Taking max() of every column independently is right for odometer and
-- engine hours, which are genuinely monotonic. It is wrong for idle.
--
-- Idle is recomputed each run and is deliberately NULL whenever the ignition
-- record has holes — engine events roll off the provider's ~30-record window,
-- so a period can contain more trips than ignition cycles and every ratio
-- built on it is fiction. max() ignores NULLs, so the withheld value was
-- simply replaced by an older figure computed from mismatched windows: the
-- 3.17h that this very check was added to suppress came straight back, now
-- with no note attached to say it was unreliable.
--
-- So idle is taken from the row holding the highest engine hours — the
-- reading it actually belongs to. When that reading withheld idle, idle stays
-- withheld, and a suppression cannot be undone by an older row outliving it.
-- =====================================================================

DROP VIEW IF EXISTS public.fleet_current_meters;

CREATE VIEW public.fleet_current_meters
  WITH (security_invoker = true) AS
  WITH ranked AS (
    SELECT
      r.*,
      row_number() OVER (
        PARTITION BY r.company_id, r.fleet_id
        -- Highest engine reading is the current one; newest breaks ties, which
        -- is what makes a fresh withholding win over a stale computed value.
        ORDER BY r.engine_hours DESC NULLS LAST, r.recorded_at DESC
      ) AS rn
    FROM public.fleet_meter_readings r
  )
  SELECT
    company_id,
    fleet_id,
    max(recorded_at)                                  AS recorded_at,
    max(engine_hours)                                 AS engine_hours,
    max(idle_hours) FILTER (WHERE rn = 1)             AS idle_hours,
    max(odometer_miles)                               AS odometer_miles,
    bool_or(source IN ('manual', 'import', 'maintenance')) AS anchored,
    max(recorded_at) FILTER (WHERE source = 'telematics')  AS last_telematics_at,
    GREATEST(
      COALESCE(max(engine_hours), 0) - COALESCE(max(idle_hours) FILTER (WHERE rn = 1), 0),
      0
    ) AS working_hours
  FROM ranked
  GROUP BY company_id, fleet_id;

GRANT SELECT ON public.fleet_current_meters TO authenticated;

NOTIFY pgrst, 'reload schema';

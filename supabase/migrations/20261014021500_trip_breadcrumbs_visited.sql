-- Keep the trip breadcrumbs the sync already fetches.
--
-- fleet_trip_locations has existed since the fleet mirror went in (Aug 2026),
-- is RLS-covered, has a natural key and a retention sweep — and has never held
-- a single row. watchdog-sync fetches exactly those points, one call per trip,
-- computes idle seconds from them and throws the points away.
--
-- They are the densest location record the business has: one 65-minute trip on
-- the live account carries 87 points, about one every 45 seconds, against SIX
-- positions for that whole day from polling /devices (a parked tracker sleeps,
-- so the latest-position poll misses most of the driving). HR asked whether a
-- tech was at the jobs he booked hours to, and a phone cannot answer that — a
-- browser takes no fix while suspended — but a truck's own trail can.
--
-- This column is the visited marker. The breadcrumb pass was driven by
-- `idle_seconds is null`, so every trip already idled would never be revisited
-- and its points would stay lost. Stamped per trip whether or not the provider
-- returned any points, so a trip with none is not retried forever; 40 trips a
-- run, which walks the 144 trips on record in four cron ticks.

ALTER TABLE public.fleet_trips
  ADD COLUMN IF NOT EXISTS breadcrumbs_at timestamptz;

COMMENT ON COLUMN public.fleet_trips.breadcrumbs_at IS
  'When watchdog-sync last stored this trip''s breadcrumbs into fleet_trip_locations. NULL = not yet walked; set even when the provider returned no points, so it is not retried forever.';

-- The breadcrumb pass selects on it, oldest-ended first.
CREATE INDEX IF NOT EXISTS fleet_trips_breadcrumbs_pending_idx
  ON public.fleet_trips (company_id, ended_at DESC)
  WHERE breadcrumbs_at IS NULL AND ended_at IS NOT NULL;

-- fleet_trip_locations is read on the location trail, filtered by trip.
-- The natural key covers (trip_id, sequence); this covers the time window
-- lookup a shift asks for.
CREATE INDEX IF NOT EXISTS fleet_trip_locations_time_idx
  ON public.fleet_trip_locations (company_id, recorded_at);

-- =====================================================================
-- Freddy: mirror Moto Watchdog instead of depending on partner tokens.
--
-- WHY THIS EXISTS
-- Freddy's GPS data comes from partner.api.motowatchdog.com, which needs
-- two credentials: our PARTNER key (we have it) and a per-customer
-- AUTH_TOKEN that Watchdog has to mint. They won't mint them. So every
-- tenant dead-ends on the Freddy Settings screen with a token field they
-- can never fill.
--
-- The workaround: the customer connects their OWN Watchdog account, and
-- we read the same JSON API their web app reads. This migration lays
-- down the two halves that makes possible —
--
--   1. Somewhere safe to keep the customer's credentials.
--   2. Somewhere to cache what we pull, so we poll Watchdog once per
--      company instead of once per open browser tab.
--
-- ON (2): today FreddyTracking polls watchdog-proxy every 60s from every
-- tab, and persists nothing. Ten users watching the map is ten times the
-- traffic and still no trip history. These tables invert that — one
-- server-side sync writes, every client reads Postgres. That's the whole
-- cost story; the extraction tier barely matters by comparison.
--
-- ON (1): the existing watchdog_auth_token lives in plaintext inside
-- company_agents.settings, and store.fetchCompanyAgents pulls that jsonb
-- into the browser for every user who can open the Freddy workspace.
-- That's already too loose for a token and would be indefensible for a
-- password. Credentials here are encrypted at rest with a Vault key and
-- the table is service-role only — the browser gets a status view with
-- no secrets in it.
-- =====================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================================
-- 1. Vault key + crypto helpers (mirrors the payroll SSN pattern in
--    20260509002420_payroll_secret_vault.sql).
--
--    After this migration runs, an admin calls
--      select public.set_fleet_secret('<64+ random chars>');
--    once with the service role. Until then, connecting an account
--    raises a clear error rather than storing anything weakly.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.get_fleet_secret()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  s text;
BEGIN
  SELECT decrypted_secret INTO s
    FROM vault.decrypted_secrets
   WHERE name = 'fleet_integration_key'
   LIMIT 1;
  RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION public.get_fleet_secret() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_fleet_secret() TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.set_fleet_secret(p_value text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, pg_temp
AS $$
DECLARE
  existing uuid;
BEGIN
  IF p_value IS NULL OR length(p_value) < 32 THEN
    RAISE EXCEPTION 'fleet integration secret must be at least 32 characters';
  END IF;

  SELECT id INTO existing FROM vault.secrets WHERE name = 'fleet_integration_key' LIMIT 1;
  IF existing IS NULL THEN
    PERFORM vault.create_secret(p_value, 'fleet_integration_key', 'JobScout fleet integration credential key');
    RETURN 'created';
  ELSE
    PERFORM vault.update_secret(existing, p_value);
    RETURN 'updated';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.set_fleet_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_fleet_secret(text) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.encrypt_fleet_cred(p_value text)
RETURNS bytea
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k text := public.get_fleet_secret();
BEGIN
  IF k IS NULL OR length(k) < 32 THEN
    RAISE EXCEPTION 'fleet integration key is not configured. Run set_fleet_secret() first.';
  END IF;
  IF p_value IS NULL OR length(p_value) = 0 THEN
    RETURN NULL;
  END IF;
  RETURN pgp_sym_encrypt(p_value, k);
END;
$$;
REVOKE ALL ON FUNCTION public.encrypt_fleet_cred(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.encrypt_fleet_cred(text) TO postgres, service_role;

CREATE OR REPLACE FUNCTION public.decrypt_fleet_cred(p_value bytea)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  k text := public.get_fleet_secret();
BEGIN
  IF k IS NULL THEN RAISE EXCEPTION 'fleet integration key is not configured.'; END IF;
  IF p_value IS NULL THEN RETURN NULL; END IF;
  RETURN pgp_sym_decrypt(p_value, k);
END;
$$;
-- Deliberately NOT granted to authenticated. Only edge functions running
-- with the service role ever turn a stored credential back into plaintext.
REVOKE ALL ON FUNCTION public.decrypt_fleet_cred(bytea) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decrypt_fleet_cred(bytea) TO postgres, service_role;

-- =====================================================================
-- 2. fleet_integrations — one connected provider account per company.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fleet_integrations (
  id                 serial PRIMARY KEY,
  company_id         integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  provider           text    NOT NULL DEFAULT 'moto_watchdog',

  -- Credentials. account_email is readable (it's shown back to the user
  -- as "connected as ..."); the password only ever exists as ciphertext.
  account_email      text,
  password_encrypted bytea,

  -- How we're currently talking to the provider.
  --   partner  — a real partner AUTH_TOKEN exists (the happy path, if
  --              Watchdog ever starts issuing them again)
  --   mirror   — session derived from the customer's own login
  auth_mode          text NOT NULL DEFAULT 'mirror'
                     CHECK (auth_mode IN ('partner', 'mirror')),
  partner_auth_token_encrypted bytea,

  -- Live session captured by the headless login. session_data holds the
  -- cookie jar when the provider is cookie-based rather than bearer.
  session_token_encrypted bytea,
  session_carrier    text CHECK (session_carrier IN ('bearer', 'cookie', 'header')),
  session_data       jsonb,
  session_expires_at timestamptz,
  api_base           text,

  status             text NOT NULL DEFAULT 'disconnected'
                     CHECK (status IN ('disconnected', 'connected', 'needs_reauth', 'error')),
  last_error         text,
  last_error_at      timestamptz,
  last_sync_at       timestamptz,
  last_sync_tier     smallint,   -- 0 session replay, 1 DOM, 2 vision

  -- Consent. The customer is handing us the keys to a third-party
  -- account, so record that they actually agreed, when, and to what
  -- wording — and make revoking it a first-class action.
  consent_at         timestamptz,
  consent_by         integer REFERENCES public.employees(id) ON DELETE SET NULL,
  consent_ip         text,
  consent_version    text,
  revoked_at         timestamptz,

  sync_interval_seconds integer NOT NULL DEFAULT 300,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_integrations_company_provider_idx
  ON public.fleet_integrations (company_id, provider);

-- Locked down: no policy for `authenticated` at all, so RLS denies the
-- browser everything. Edge functions use the service role, which
-- bypasses RLS. Reads for the UI go through the status view below.
ALTER TABLE public.fleet_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_integrations FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fleet_integrations FROM anon, authenticated;

-- Secret-free projection for the Settings screen.
CREATE OR REPLACE VIEW public.fleet_integration_status AS
  SELECT
    id, company_id, provider, account_email, auth_mode, status,
    last_error, last_error_at, last_sync_at, last_sync_tier,
    session_expires_at, sync_interval_seconds,
    consent_at, consent_by, consent_version, revoked_at,
    created_at, updated_at,
    (password_encrypted IS NOT NULL
      OR partner_auth_token_encrypted IS NOT NULL) AS has_credentials
  FROM public.fleet_integrations
  WHERE company_id IN (SELECT public.current_user_company_ids());

GRANT SELECT ON public.fleet_integration_status TO authenticated;

-- =====================================================================
-- 3. Cached provider data.
--
-- Every table carries company_id so the standard tenant_isolation
-- policy applies, and a stable natural key so the sync can upsert
-- overlapping windows without creating duplicates.
-- =====================================================================

-- The device link lives on fleet.gps_device_id, which FleetDetail
-- already writes but DATABASE_SCHEMA.md doesn't list. Add it defensively
-- so the join below is guaranteed to have something to join on.
ALTER TABLE public.fleet ADD COLUMN IF NOT EXISTS gps_device_id text;
CREATE INDEX IF NOT EXISTS fleet_gps_device_id_idx
  ON public.fleet (company_id, gps_device_id)
  WHERE gps_device_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.fleet_positions (
  id             bigserial PRIMARY KEY,
  company_id     integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fleet_id       integer REFERENCES public.fleet(id) ON DELETE SET NULL,
  device_id      text NOT NULL,
  recorded_at    timestamptz NOT NULL,
  latitude       numeric(10,7),
  longitude      numeric(10,7),
  speed_mph      numeric(6,2),
  heading        numeric(6,2),
  ignition       boolean,
  fuel_percent   numeric(5,2),
  battery_percent numeric(5,2),
  odometer       numeric(12,1),
  address        text,
  raw            jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_positions_natural_key
  ON public.fleet_positions (company_id, device_id, recorded_at);
CREATE INDEX IF NOT EXISTS fleet_positions_latest_idx
  ON public.fleet_positions (company_id, device_id, recorded_at DESC);

-- The live map only ever wants the newest ping per device. DISTINCT ON does
-- that in one index scan against fleet_positions_latest_idx; doing it in the
-- client would mean shipping the whole history to sort it there.
--
-- `online` is derived rather than stored: a tracker that stopped reporting
-- never sends a "went offline" event, so staleness is the only real signal.
--
-- security_invoker so the view respects fleet_positions' RLS as the calling
-- user. Without it the view would run with owner rights and hand every
-- tenant's positions to anyone — views bypass RLS by default.
CREATE OR REPLACE VIEW public.fleet_latest_positions
  WITH (security_invoker = true) AS
  SELECT DISTINCT ON (p.company_id, p.device_id)
    p.company_id, p.device_id, p.fleet_id, p.recorded_at,
    p.latitude, p.longitude, p.speed_mph, p.heading, p.ignition,
    p.fuel_percent, p.battery_percent, p.odometer, p.address, p.raw,
    (p.recorded_at > now() - interval '30 minutes') AS online
  FROM public.fleet_positions p
  ORDER BY p.company_id, p.device_id, p.recorded_at DESC;

GRANT SELECT ON public.fleet_latest_positions TO authenticated;

CREATE TABLE IF NOT EXISTS public.fleet_trips (
  id                bigserial PRIMARY KEY,
  company_id        integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fleet_id          integer REFERENCES public.fleet(id) ON DELETE SET NULL,
  device_id         text,
  external_id       text NOT NULL,
  started_at        timestamptz,
  ended_at          timestamptz,
  start_latitude    numeric(10,7),
  start_longitude   numeric(10,7),
  end_latitude      numeric(10,7),
  end_longitude     numeric(10,7),
  start_address     text,
  end_address       text,
  distance_miles    numeric(10,2),
  duration_seconds  integer,
  idle_seconds      integer,
  max_speed_mph     numeric(6,2),
  avg_speed_mph     numeric(6,2),
  harsh_brake_count integer,
  harsh_accel_count integer,
  speeding_count    integer,
  driver_employee_id integer REFERENCES public.employees(id) ON DELETE SET NULL,
  raw               jsonb,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_trips_natural_key
  ON public.fleet_trips (company_id, external_id);
CREATE INDEX IF NOT EXISTS fleet_trips_window_idx
  ON public.fleet_trips (company_id, started_at DESC);
CREATE INDEX IF NOT EXISTS fleet_trips_vehicle_idx
  ON public.fleet_trips (company_id, fleet_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.fleet_trip_locations (
  id          bigserial PRIMARY KEY,
  company_id  integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  trip_id     bigint NOT NULL REFERENCES public.fleet_trips(id) ON DELETE CASCADE,
  sequence    integer NOT NULL,
  recorded_at timestamptz,
  latitude    numeric(10,7),
  longitude   numeric(10,7),
  speed_mph   numeric(6,2)
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_trip_locations_natural_key
  ON public.fleet_trip_locations (trip_id, sequence);

CREATE TABLE IF NOT EXISTS public.fleet_alerts (
  id              bigserial PRIMARY KEY,
  company_id      integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  fleet_id        integer REFERENCES public.fleet(id) ON DELETE SET NULL,
  device_id       text,
  external_id     text NOT NULL,
  alert_type      text,
  severity        text,
  occurred_at     timestamptz,
  latitude        numeric(10,7),
  longitude       numeric(10,7),
  speed_mph       numeric(6,2),
  message         text,
  raw             jsonb,
  acknowledged_at timestamptz,
  acknowledged_by integer REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_alerts_natural_key
  ON public.fleet_alerts (company_id, external_id);
CREATE INDEX IF NOT EXISTS fleet_alerts_feed_idx
  ON public.fleet_alerts (company_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.fleet_geofences (
  id             bigserial PRIMARY KEY,
  company_id     integer NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  external_id    text,
  name           text,
  latitude       numeric(10,7),
  longitude      numeric(10,7),
  radius_meters  numeric(10,2),
  active         boolean NOT NULL DEFAULT true,
  raw            jsonb,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_geofences_natural_key
  ON public.fleet_geofences (company_id, external_id)
  WHERE external_id IS NOT NULL;

-- =====================================================================
-- 4. fleet_extractor_config — how to talk to the provider.
--
-- Global, not per-tenant: the portal is the same for everyone. Versioned
-- and append-only so the vision repair loop can publish a new version
-- when the provider redesigns, and we can roll back by flipping `active`
-- if the new one turns out worse.
--
-- `source` records who wrote it: 'capture' (the discovery script),
-- 'vision' (Claude re-derived it after a break), or 'manual'.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fleet_extractor_config (
  id          serial PRIMARY KEY,
  provider    text NOT NULL DEFAULT 'moto_watchdog',
  version     integer NOT NULL,
  api_base    text,
  login       jsonb NOT NULL DEFAULT '{}'::jsonb,   -- url + field/submit selectors + success signal
  endpoints   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- action -> {method, path, query, resultPath}
  field_map   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- provider field -> our column
  selectors   jsonb NOT NULL DEFAULT '{}'::jsonb,   -- Tier 1 DOM fallback
  source      text NOT NULL DEFAULT 'manual'
              CHECK (source IN ('capture', 'vision', 'manual')),
  confidence  numeric(3,2),
  notes       text,
  active      boolean NOT NULL DEFAULT false,
  verified_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fleet_extractor_config_version_idx
  ON public.fleet_extractor_config (provider, version);
-- At most one active config per provider.
CREATE UNIQUE INDEX IF NOT EXISTS fleet_extractor_config_active_idx
  ON public.fleet_extractor_config (provider)
  WHERE active;

ALTER TABLE public.fleet_extractor_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fleet_extractor_config FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.fleet_extractor_config FROM anon, authenticated;

-- =====================================================================
-- 5. fleet_sync_log — one row per sync run.
--
-- This is how we answer "is the mirror still working, and what is it
-- costing?" ai_cost_usd is only ever non-zero on tier 2, which should be
-- rare by design — a steady trickle of tier-2 runs means the repair loop
-- is thrashing and the extractor config needs a human.
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.fleet_sync_log (
  id               bigserial PRIMARY KEY,
  company_id       integer REFERENCES public.companies(id) ON DELETE CASCADE,
  provider         text NOT NULL DEFAULT 'moto_watchdog',
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  tier             smallint,
  ok               boolean,
  devices_synced   integer NOT NULL DEFAULT 0,
  positions_written integer NOT NULL DEFAULT 0,
  trips_written    integer NOT NULL DEFAULT 0,
  alerts_written   integer NOT NULL DEFAULT 0,
  browser_used     boolean NOT NULL DEFAULT false,
  ai_cost_usd      numeric(10,6) NOT NULL DEFAULT 0,
  error            text
);

CREATE INDEX IF NOT EXISTS fleet_sync_log_recent_idx
  ON public.fleet_sync_log (company_id, started_at DESC);

-- =====================================================================
-- 6. Standard tenant isolation for the cache tables.
-- =====================================================================

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'fleet_positions', 'fleet_trips', 'fleet_trip_locations',
    'fleet_alerts', 'fleet_geofences', 'fleet_sync_log'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS tenant_isolation ON public.%I', t);
    EXECUTE format($p$
      CREATE POLICY tenant_isolation ON public.%I
        FOR ALL
        TO authenticated
        USING (company_id IN (SELECT public.current_user_company_ids()))
        WITH CHECK (company_id IN (SELECT public.current_user_company_ids()))
    $p$, t);
  END LOOP;
END $$;

-- =====================================================================
-- 7. fleet_fuel_logs got a `USING (true)` policy in its original
--    migration, which is no isolation at all — any authenticated user
--    could read every tenant's fuel spend. Same shape as the tables
--    above; fix it while we're here.
-- =====================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'fleet_fuel_logs') THEN
    ALTER TABLE public.fleet_fuel_logs ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.fleet_fuel_logs FORCE ROW LEVEL SECURITY;
    -- Drop the permissive originals by name and by sweep, since the
    -- original migration's policy name isn't guaranteed here.
    EXECUTE (
      SELECT coalesce(string_agg(
        format('DROP POLICY IF EXISTS %I ON public.fleet_fuel_logs;', policyname), ' '), '')
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'fleet_fuel_logs'
    );
    CREATE POLICY tenant_isolation ON public.fleet_fuel_logs
      FOR ALL
      TO authenticated
      USING (company_id IN (SELECT public.current_user_company_ids()))
      WITH CHECK (company_id IN (SELECT public.current_user_company_ids()));
  END IF;
END $$;

-- =====================================================================
-- 8. Retention. Raw breadcrumbs are the bulk of the volume and nothing
--    reads them past a quarter — trim so this doesn't grow forever.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.prune_fleet_telemetry(p_days integer DEFAULT 120)
RETURNS TABLE(positions_deleted bigint, locations_deleted bigint, log_deleted bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  cutoff timestamptz := now() - make_interval(days => p_days);
  p bigint; l bigint; g bigint;
BEGIN
  WITH d AS (DELETE FROM public.fleet_positions WHERE recorded_at < cutoff RETURNING 1)
    SELECT count(*) INTO p FROM d;
  WITH d AS (
    DELETE FROM public.fleet_trip_locations tl
     USING public.fleet_trips t
     WHERE tl.trip_id = t.id AND t.started_at < cutoff
     RETURNING 1)
    SELECT count(*) INTO l FROM d;
  WITH d AS (DELETE FROM public.fleet_sync_log WHERE started_at < cutoff RETURNING 1)
    SELECT count(*) INTO g FROM d;
  RETURN QUERY SELECT p, l, g;
END;
$$;
REVOKE ALL ON FUNCTION public.prune_fleet_telemetry(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_fleet_telemetry(integer) TO postgres, service_role;

NOTIFY pgrst, 'reload schema';

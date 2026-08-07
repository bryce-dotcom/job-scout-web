-- Crashes reported by the app itself.
--
-- Sentry is wired (@sentry/react + Sentry.ErrorBoundary) but Sentry.init is
-- gated on VITE_SENTRY_DSN, which is set nowhere — the production bundle has
-- zero references to sentry.io. So every crash has reported to NOTHING.
--
-- That is why bugs arrive as photographs. The Products page threw React error
-- #31 for all 189 products carrying extracted specs, and the only reason we
-- learned of it was Damien photographing his laptop in his car. Cameron's
-- clock-out failed for three days with no error recorded anywhere.
--
-- This is the no-third-party half: the error boundary writes here, and an
-- admin sees crashes in the app they already use. It keeps working whether or
-- not the Sentry DSN ever gets set, and it needs no credential.

CREATE TABLE IF NOT EXISTS client_errors (
  id            bigserial PRIMARY KEY,
  company_id    bigint REFERENCES companies(id) ON DELETE CASCADE,
  employee_id   bigint REFERENCES employees(id) ON DELETE SET NULL,
  message       text NOT NULL,
  stack         text,
  component     text,
  route         text,
  user_agent    text,
  app_build     text,
  seen_count    integer NOT NULL DEFAULT 1,
  resolved      boolean NOT NULL DEFAULT false,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now()
);

-- One row per distinct crash per tenant, counted — 189 products failing the
-- same way is ONE bug, and 189 rows would bury it.
CREATE UNIQUE INDEX IF NOT EXISTS client_errors_dedupe_idx
  ON client_errors (company_id, message, route);

CREATE INDEX IF NOT EXISTS client_errors_recent_idx
  ON client_errors (company_id, resolved, last_seen_at DESC);

ALTER TABLE client_errors ENABLE ROW LEVEL SECURITY;

-- Anyone signed in may REPORT a crash: a report is worthless if the broken
-- state prevents filing it. Reads stay inside the tenant.
DO $$ BEGIN
  CREATE POLICY client_errors_insert ON client_errors
    FOR INSERT TO authenticated WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY client_errors_select ON client_errors
    FOR SELECT TO authenticated
    USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY client_errors_update ON client_errors
    FOR UPDATE TO authenticated
    USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.email()));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- anon must not read crash reports: stacks and routes describe the app's
-- internals. The default grant is the leak we have already had to close once.
REVOKE ALL ON client_errors FROM anon;
GRANT SELECT, INSERT, UPDATE ON client_errors TO authenticated;
GRANT USAGE, SELECT ON SEQUENCE client_errors_id_seq TO authenticated;

COMMENT ON TABLE client_errors IS
  'Crashes caught by the app error boundary. Deduped per (company, message, route) with seen_count.';

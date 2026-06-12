-- AI usage metering + admin alerting.
--
-- Context: one shared ANTHROPIC_API_KEY serves 16 edge functions across all
-- tenants with zero logging. When the account ran out of credits (June 9-10),
-- every AI feature broke at once, raw Anthropic 400s surfaced to field techs,
-- and Victor verification blocked job completion. ai_usage gives per-company /
-- per-feature attribution for cost control and future credit billing;
-- ai_alerts throttles the "tell Bryce before users find out" notifications.
--
-- Writes happen ONLY from edge functions via the service role (bypasses RLS).
-- Reads: admin/developer employees (DataConsole panel).

CREATE TABLE IF NOT EXISTS ai_usage (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id integer,
  feature text NOT NULL,
  model text,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  cache_creation_input_tokens integer NOT NULL DEFAULT 0,
  cache_read_input_tokens integer NOT NULL DEFAULT 0,
  est_cost_usd numeric(12,6) NOT NULL DEFAULT 0,
  success boolean NOT NULL DEFAULT true,
  error_kind text,
  status integer,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_usage_created_idx ON ai_usage (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_company_idx ON ai_usage (company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_usage_feature_idx ON ai_usage (feature, created_at DESC);

COMMENT ON TABLE ai_usage IS
  'One row per Anthropic API call from edge functions (success or failure). est_cost_usd from the per-model price table in supabase/functions/_shared/anthropic.ts.';

-- Alert throttle log — one row per admin alert actually sent, so the shared
-- wrapper can skip re-alerting within the throttle window.
CREATE TABLE IF NOT EXISTS ai_alerts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ai_alerts_kind_idx ON ai_alerts (kind, created_at DESC);

ALTER TABLE ai_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_alerts ENABLE ROW LEVEL SECURITY;

-- Admin/developer read access (writes are service-role only, which bypasses RLS)
DO $$ BEGIN
  CREATE POLICY "Admins can read ai_usage"
    ON ai_usage FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM employees e
        JOIN auth.users u ON e.email = u.email
        WHERE u.id = auth.uid()
          AND (e.is_admin = true OR e.is_developer = true)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "Admins can read ai_alerts"
    ON ai_alerts FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM employees e
        JOIN auth.users u ON e.email = u.email
        WHERE u.id = auth.uid()
          AND (e.is_admin = true OR e.is_developer = true)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

NOTIFY pgrst, 'reload schema';

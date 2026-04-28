-- Zach the Yard Yeti — pricing rules, estimates, geo + learning loop columns.
--
-- Adds:
--   lawn_pricing       : per-company pricing rules (one row per company)
--   lawn_estimates     : every estimate Zach generates (predicted vs actual feedback)
--   lawn_properties.*  : lat/lng/polygon for satellite measurement + effort_factor for learning loop
--   lawn_visits.*      : predicted_duration_minutes so we can compare against actual

-- ============================================================
-- lawn_pricing — one row per company (the rate card)
-- ============================================================
CREATE TABLE IF NOT EXISTS lawn_pricing (
  id                          BIGSERIAL PRIMARY KEY,
  company_id                  INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Mowing
  mow_per_sqft                NUMERIC(8,4) DEFAULT 0.012,   -- $/sqft of turf
  mow_minimum                 NUMERIC(10,2) DEFAULT 45.00,  -- minimum charge per mow
  mow_minutes_per_1000sqft    NUMERIC(6,2) DEFAULT 8.0,     -- used for predicted duration

  -- Edging
  edging_per_lin_ft           NUMERIC(8,4) DEFAULT 0.10,
  edging_default_lin_ft       INTEGER DEFAULT 200,

  -- Fertilizer / weed / grub / iron / lime — most are priced per 1k sqft
  fert_per_1000sqft           NUMERIC(8,2) DEFAULT 12.00,
  weed_per_1000sqft           NUMERIC(8,2) DEFAULT 8.00,
  grub_per_1000sqft           NUMERIC(8,2) DEFAULT 14.00,
  iron_per_1000sqft           NUMERIC(8,2) DEFAULT 6.00,
  lime_per_1000sqft           NUMERIC(8,2) DEFAULT 5.00,
  pre_emergent_per_1000sqft   NUMERIC(8,2) DEFAULT 10.00,

  -- Aeration / overseed
  aeration_per_1000sqft       NUMERIC(8,2) DEFAULT 18.00,
  aeration_minimum            NUMERIC(10,2) DEFAULT 90.00,
  overseed_per_1000sqft       NUMERIC(8,2) DEFAULT 22.00,

  -- Cleanup / extras
  cleanup_per_hour            NUMERIC(8,2) DEFAULT 75.00,
  travel_per_visit            NUMERIC(8,2) DEFAULT 0.00,

  -- Tax / margin
  tax_rate                    NUMERIC(5,4) DEFAULT 0.0,     -- 0.0825 = 8.25%
  margin_multiplier           NUMERIC(5,3) DEFAULT 1.000,   -- multiply the whole sheet (sale, etc.)

  created_at                  TIMESTAMPTZ DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id)
);

CREATE INDEX IF NOT EXISTS lawn_pricing_company_idx ON lawn_pricing(company_id);

-- ============================================================
-- lawn_estimates — every estimate Zach generates (history + learning)
-- ============================================================
CREATE TABLE IF NOT EXISTS lawn_estimates (
  id                  BIGSERIAL PRIMARY KEY,
  company_id          INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id         INTEGER REFERENCES lawn_properties(id) ON DELETE CASCADE,

  -- Snapshot inputs
  turf_sqft           INTEGER,
  effort_factor       NUMERIC(5,3) DEFAULT 1.0,     -- snapshot at time of estimate
  pricing_snapshot    JSONB,                         -- entire pricing row at time of estimate

  -- Line items + totals
  line_items          JSONB,                         -- [{label, qty, unit, rate, total, predicted_minutes}]
  per_visit_total     NUMERIC(10,2),
  annual_program_total NUMERIC(10,2),

  -- Outcome
  status              TEXT DEFAULT 'draft',          -- 'draft' | 'sent' | 'won' | 'lost'
  quote_id            INTEGER,                        -- soft FK to quotes table if pushed

  notes               TEXT,
  created_by          INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lawn_estimates_company_idx  ON lawn_estimates(company_id);
CREATE INDEX IF NOT EXISTS lawn_estimates_property_idx ON lawn_estimates(property_id);

-- ============================================================
-- lawn_properties — geo + learning loop
-- ============================================================
ALTER TABLE lawn_properties
  ADD COLUMN IF NOT EXISTS latitude          NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS longitude         NUMERIC(10,7),
  ADD COLUMN IF NOT EXISTS turf_polygon      JSONB,                  -- [{lat, lng}, ...]
  ADD COLUMN IF NOT EXISTS map_static_url    TEXT,                   -- cached satellite preview
  ADD COLUMN IF NOT EXISTS effort_factor     NUMERIC(5,3) DEFAULT 1.000,  -- learning loop multiplier
  ADD COLUMN IF NOT EXISTS effort_sample_n   INTEGER DEFAULT 0;      -- how many visits inform effort_factor

-- ============================================================
-- lawn_visits — predicted vs actual
-- ============================================================
ALTER TABLE lawn_visits
  ADD COLUMN IF NOT EXISTS predicted_duration_minutes INTEGER;

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE lawn_pricing   ENABLE ROW LEVEL SECURITY;
ALTER TABLE lawn_estimates ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY lawn_pricing_company_isolation ON lawn_pricing
    FOR ALL TO authenticated
    USING  (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')))
    WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY lawn_estimates_company_isolation ON lawn_estimates
    FOR ALL TO authenticated
    USING  (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')))
    WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- service_role bypass
DO $$ BEGIN
  CREATE POLICY lawn_pricing_service ON lawn_pricing FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY lawn_estimates_service ON lawn_estimates FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

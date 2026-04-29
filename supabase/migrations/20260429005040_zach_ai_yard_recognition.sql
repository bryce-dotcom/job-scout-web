-- Zach AI yard recognition — vision-based grass detection + learning loop.
--
-- Adds:
--   lawn_properties.ai_*       : AI's most recent estimate snapshot per property
--   lawn_pricing.ai_calibration_factor : per-company multiplier learned from corrections
--   lawn_ai_corrections        : every (AI guess, user-corrected actual) pair → trains the loop
--   lawn_quote_requests        : inbound public-website quote requests (lead capture)

-- ============================================================
-- lawn_properties — AI snapshot columns
-- ============================================================
ALTER TABLE lawn_properties
  ADD COLUMN IF NOT EXISTS ai_estimated_sqft   INTEGER,
  ADD COLUMN IF NOT EXISTS ai_confidence       NUMERIC(4,2),     -- 0.00 - 1.00
  ADD COLUMN IF NOT EXISTS ai_image_url        TEXT,             -- the satellite tile we analyzed
  ADD COLUMN IF NOT EXISTS ai_obstacles        JSONB,            -- ['driveway','pool','beds']
  ADD COLUMN IF NOT EXISTS ai_reasoning        TEXT,
  ADD COLUMN IF NOT EXISTS ai_estimated_at     TIMESTAMPTZ;

-- ============================================================
-- lawn_pricing — AI calibration factor (the learning multiplier)
-- ============================================================
ALTER TABLE lawn_pricing
  ADD COLUMN IF NOT EXISTS ai_calibration_factor NUMERIC(5,3) DEFAULT 1.000,
  ADD COLUMN IF NOT EXISTS ai_sample_n           INTEGER DEFAULT 0;

-- ============================================================
-- lawn_ai_corrections — every (AI guess, actual) pair the system learns from
-- ============================================================
CREATE TABLE IF NOT EXISTS lawn_ai_corrections (
  id              BIGSERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id     INTEGER REFERENCES lawn_properties(id) ON DELETE SET NULL,

  ai_sqft         INTEGER NOT NULL,
  actual_sqft     INTEGER NOT NULL,
  delta_pct       NUMERIC(6,2),

  ai_obstacles    JSONB,
  ai_confidence   NUMERIC(4,2),
  image_url       TEXT,
  image_zoom      INTEGER DEFAULT 20,
  latitude        NUMERIC(10,7),
  longitude       NUMERIC(10,7),
  notes           TEXT,
  source          TEXT DEFAULT 'manual',

  created_by      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lawn_ai_corrections_company_idx  ON lawn_ai_corrections(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lawn_ai_corrections_property_idx ON lawn_ai_corrections(property_id);

-- ============================================================
-- lawn_quote_requests — inbound from the public instant-quote widget
-- ============================================================
CREATE TABLE IF NOT EXISTS lawn_quote_requests (
  id                    BIGSERIAL PRIMARY KEY,
  company_id            INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  contact_name          TEXT,
  contact_email         TEXT,
  contact_phone         TEXT,
  address               TEXT NOT NULL,
  latitude              NUMERIC(10,7),
  longitude             NUMERIC(10,7),

  ai_estimated_sqft     INTEGER,
  ai_confidence         NUMERIC(4,2),
  ai_image_url          TEXT,
  ai_obstacles          JSONB,

  quote_per_visit       NUMERIC(10,2),
  quote_annual          NUMERIC(10,2),
  quote_breakdown       JSONB,
  pricing_snapshot      JSONB,

  status                TEXT DEFAULT 'new',
  customer_id           INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  property_id           INTEGER REFERENCES lawn_properties(id) ON DELETE SET NULL,
  notes                 TEXT,

  user_agent            TEXT,
  ip_hash               TEXT,

  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lawn_quote_requests_company_idx ON lawn_quote_requests(company_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lawn_quote_requests_status_idx  ON lawn_quote_requests(company_id, status);

-- Companies need a public slug for the widget
ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS public_quote_slug TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS companies_public_quote_slug_uniq
  ON companies(public_quote_slug)
  WHERE public_quote_slug IS NOT NULL;

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE lawn_ai_corrections  ENABLE ROW LEVEL SECURITY;
ALTER TABLE lawn_quote_requests  ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY lawn_ai_corrections_company_isolation ON lawn_ai_corrections
    FOR ALL TO authenticated
    USING  (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')))
    WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY lawn_quote_requests_company_isolation ON lawn_quote_requests
    FOR ALL TO authenticated
    USING  (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')))
    WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY lawn_ai_corrections_service ON lawn_ai_corrections FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY lawn_quote_requests_service ON lawn_quote_requests FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

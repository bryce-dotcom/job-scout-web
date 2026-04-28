-- Zach The Yard Yeti — lawn-care operations data model.
--
-- Three tables:
--   lawn_properties  : the lawn-care file on each customer property
--                      (lot size, mow cadence, gate code, dog, sprinkler quirks).
--   lawn_visits      : log of mow visits (date, crew, duration, notes, photos).
--   lawn_treatments  : seasonal applications (rounds, fert, grub, aeration).
--
-- All multi-tenant via company_id; RLS limits each company to its own rows.

-- ============================================================
-- lawn_properties — one row per lawn we maintain
-- ============================================================
CREATE TABLE IF NOT EXISTS lawn_properties (
  id                 BIGSERIAL PRIMARY KEY,
  company_id         INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  customer_id        INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  property_name      TEXT,                      -- e.g. "Smith — Main St"
  address            TEXT,
  city               TEXT,
  state              TEXT,
  zip                TEXT,
  lot_size_sqft      INTEGER,                   -- total lot
  turf_size_sqft     INTEGER,                   -- mowable area
  turf_type          TEXT,                      -- 'Kentucky Bluegrass', 'Bermuda', 'Fescue', etc.
  mow_frequency      TEXT,                      -- 'Weekly', 'Bi-Weekly', 'Monthly', 'On Call'
  mow_height_inches  NUMERIC(3,1) DEFAULT 3.0,
  mow_day            TEXT,                      -- 'Monday' .. 'Sunday'
  service_start_month SMALLINT DEFAULT 4,       -- 1-12
  service_end_month   SMALLINT DEFAULT 10,
  gate_code          TEXT,
  dog_on_premises    BOOLEAN DEFAULT FALSE,
  dog_notes          TEXT,
  irrigation_notes   TEXT,                      -- "8 zones, controller in garage"
  obstacles          TEXT,                      -- "trampoline back yard, careful around playset"
  hazards            TEXT,
  preferred_crew     TEXT,
  notes              TEXT,
  active             BOOLEAN DEFAULT TRUE,
  created_at         TIMESTAMPTZ DEFAULT NOW(),
  updated_at         TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lawn_properties_company_idx  ON lawn_properties(company_id);
CREATE INDEX IF NOT EXISTS lawn_properties_customer_idx ON lawn_properties(customer_id);
CREATE INDEX IF NOT EXISTS lawn_properties_mow_day_idx  ON lawn_properties(company_id, mow_day);

-- ============================================================
-- lawn_visits — mow / cleanup visit log
-- ============================================================
CREATE TABLE IF NOT EXISTS lawn_visits (
  id              BIGSERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id     INTEGER NOT NULL REFERENCES lawn_properties(id) ON DELETE CASCADE,
  visit_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  crew            TEXT,
  crew_employee_ids INTEGER[],                 -- optional links to employees
  duration_minutes INTEGER,
  weather         TEXT,                         -- 'Sunny 78F', 'Light rain'
  service_type    TEXT DEFAULT 'mow',           -- 'mow' | 'edge' | 'cleanup' | 'fert' | 'aeration' | 'other'
  notes           TEXT,
  photo_urls      TEXT[],                       -- before/after
  billed          BOOLEAN DEFAULT FALSE,
  invoice_id      INTEGER,                      -- soft FK; invoices live in their own table
  created_by      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lawn_visits_company_idx     ON lawn_visits(company_id);
CREATE INDEX IF NOT EXISTS lawn_visits_property_idx    ON lawn_visits(property_id);
CREATE INDEX IF NOT EXISTS lawn_visits_visit_date_idx  ON lawn_visits(company_id, visit_date DESC);

-- ============================================================
-- lawn_treatments — scheduled seasonal applications
-- ============================================================
CREATE TABLE IF NOT EXISTS lawn_treatments (
  id              BIGSERIAL PRIMARY KEY,
  company_id      INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  property_id     INTEGER NOT NULL REFERENCES lawn_properties(id) ON DELETE CASCADE,
  round_number    SMALLINT,                     -- e.g. 1..6
  treatment_type  TEXT NOT NULL,                -- 'pre-emergent', 'fert', 'weed-control', 'grub-control', 'aeration', 'overseed', 'lime', 'other'
  product_name    TEXT,
  scheduled_date  DATE,
  completed_date  DATE,
  applied_by      INTEGER REFERENCES employees(id) ON DELETE SET NULL,
  amount_used     NUMERIC(10,2),
  amount_unit     TEXT,                         -- 'lbs', 'gal', 'oz'
  cost            NUMERIC(10,2),
  notes           TEXT,
  status          TEXT DEFAULT 'scheduled',     -- 'scheduled' | 'completed' | 'skipped'
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lawn_treatments_company_idx  ON lawn_treatments(company_id);
CREATE INDEX IF NOT EXISTS lawn_treatments_property_idx ON lawn_treatments(property_id);
CREATE INDEX IF NOT EXISTS lawn_treatments_status_idx   ON lawn_treatments(company_id, status, scheduled_date);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE lawn_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE lawn_visits     ENABLE ROW LEVEL SECURITY;
ALTER TABLE lawn_treatments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY lawn_properties_company_isolation ON lawn_properties
    FOR ALL TO authenticated
    USING  (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')))
    WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY lawn_visits_company_isolation ON lawn_visits
    FOR ALL TO authenticated
    USING  (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')))
    WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY lawn_treatments_company_isolation ON lawn_treatments
    FOR ALL TO authenticated
    USING  (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')))
    WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE LOWER(email) = LOWER(auth.jwt()->>'email')));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- service_role bypass (for the admin scripts and seed flows)
DO $$ BEGIN
  CREATE POLICY lawn_properties_service ON lawn_properties FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY lawn_visits_service     ON lawn_visits     FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  CREATE POLICY lawn_treatments_service ON lawn_treatments FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

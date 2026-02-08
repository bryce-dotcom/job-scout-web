-- ============================================================
-- 1. RENAME rebate_rates → incentive_measures
--    Add new columns, keep backward-compatible existing columns
-- ============================================================

ALTER TABLE rebate_rates RENAME TO incentive_measures;

-- Add new columns
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS measure_type TEXT;
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS rate_value NUMERIC;
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS cap_amount NUMERIC;
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS cap_percent NUMERIC;
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS requirements TEXT;

-- Copy existing "rate" data into "rate_value" so nothing is lost
UPDATE incentive_measures SET rate_value = rate WHERE rate_value IS NULL AND rate IS NOT NULL;

-- Default measure_type based on existing data
UPDATE incentive_measures SET measure_type = 'LED Retrofit' WHERE measure_type IS NULL;

-- Update RLS policy name to match new table
DROP POLICY IF EXISTS "Allow all access to rebate_rates" ON incentive_measures;
DROP POLICY IF EXISTS "Allow all access to incentive_measures" ON incentive_measures;
CREATE POLICY "Allow all access to incentive_measures" ON incentive_measures
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 2. CREATE utility_rate_schedules for electric rates
-- ============================================================

CREATE TABLE IF NOT EXISTS utility_rate_schedules (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  provider_id INTEGER REFERENCES utility_providers(id),
  schedule_name TEXT NOT NULL,
  customer_category TEXT,
  rate_per_kwh NUMERIC,
  demand_charge NUMERIC,
  time_of_use BOOLEAN DEFAULT false,
  description TEXT,
  effective_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_utility_rate_schedules_provider
  ON utility_rate_schedules(provider_id);
CREATE INDEX IF NOT EXISTS idx_utility_rate_schedules_category
  ON utility_rate_schedules(customer_category);

ALTER TABLE utility_rate_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to utility_rate_schedules" ON utility_rate_schedules;
CREATE POLICY "Allow all access to utility_rate_schedules" ON utility_rate_schedules
  FOR ALL USING (true) WITH CHECK (true);

-- Create labor_rates table
CREATE TABLE IF NOT EXISTS labor_rates (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  rate_per_hour DECIMAL NOT NULL,
  description TEXT,
  multiplier DECIMAL DEFAULT 1.0,
  active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index on company_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_labor_rates_company_id ON labor_rates(company_id);

-- Enable Row Level Security
ALTER TABLE labor_rates ENABLE ROW LEVEL SECURITY;

-- Create open policy for authenticated users (same pattern as other tables)
CREATE POLICY "Enable all access for authenticated users" ON labor_rates
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Also allow anon access for now (matching other tables in this project)
CREATE POLICY "Enable all access for anon users" ON labor_rates
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

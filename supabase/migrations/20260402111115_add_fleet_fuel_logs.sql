-- Fleet fuel logs for tracking fuel fill-ups and costs
CREATE TABLE IF NOT EXISTS fleet_fuel_logs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  fleet_id INTEGER REFERENCES fleet(id) ON DELETE CASCADE NOT NULL,
  employee_id INTEGER REFERENCES employees(id),
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  gallons DECIMAL(8,3),
  cost_per_gallon DECIMAL(6,3),
  total_cost DECIMAL(10,2),
  odometer DECIMAL(12,1),
  fuel_percent_before DECIMAL(5,2),
  fuel_percent_after DECIMAL(5,2),
  fuel_type TEXT,
  station TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE fleet_fuel_logs ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "fleet_fuel_logs_all_access"
    ON fleet_fuel_logs FOR ALL
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fleet_fuel_logs_company ON fleet_fuel_logs(company_id);
CREATE INDEX IF NOT EXISTS idx_fleet_fuel_logs_fleet ON fleet_fuel_logs(fleet_id);
CREATE INDEX IF NOT EXISTS idx_fleet_fuel_logs_date ON fleet_fuel_logs(log_date);

-- Time Clock table
CREATE TABLE IF NOT EXISTS time_clock (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  employee_id INTEGER REFERENCES employees(id),
  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ,
  clock_in_lat DECIMAL,
  clock_in_lng DECIMAL,
  clock_in_address TEXT,
  clock_out_lat DECIMAL,
  clock_out_lng DECIMAL,
  clock_out_address TEXT,
  lunch_start TIMESTAMPTZ,
  lunch_end TIMESTAMPTZ,
  total_hours DECIMAL,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Time Off Requests table
CREATE TABLE IF NOT EXISTS time_off_requests (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  employee_id INTEGER REFERENCES employees(id),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  request_type TEXT DEFAULT 'pto',
  reason TEXT,
  status TEXT DEFAULT 'pending',
  approved_by INTEGER REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Payroll Runs table
CREATE TABLE IF NOT EXISTS payroll_runs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  pay_date DATE NOT NULL,
  status TEXT DEFAULT 'completed',
  total_gross DECIMAL,
  employee_count INTEGER,
  created_by INTEGER REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Paystubs table
CREATE TABLE IF NOT EXISTS paystubs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  employee_id INTEGER REFERENCES employees(id),
  payroll_run_id INTEGER REFERENCES payroll_runs(id),
  period_start DATE,
  period_end DATE,
  pay_date DATE,
  regular_hours DECIMAL DEFAULT 0,
  overtime_hours DECIMAL DEFAULT 0,
  pto_hours DECIMAL DEFAULT 0,
  hourly_rate DECIMAL,
  salary_amount DECIMAL,
  gross_pay DECIMAL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add employee pay fields
ALTER TABLE employees ADD COLUMN IF NOT EXISTS hourly_rate DECIMAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS salary DECIMAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pay_type TEXT[] DEFAULT '{"hourly"}';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pto_days_per_year DECIMAL DEFAULT 10;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pto_accrued DECIMAL DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS pto_used DECIMAL DEFAULT 0;

-- Add company pay settings
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pay_frequency TEXT DEFAULT 'bi-weekly';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pay_day_1 TEXT DEFAULT '20';
ALTER TABLE companies ADD COLUMN IF NOT EXISTS pay_day_2 TEXT DEFAULT '5';

-- RLS
ALTER TABLE time_clock ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE paystubs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "time_clock_all" ON time_clock FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "time_off_requests_all" ON time_off_requests FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "payroll_runs_all" ON payroll_runs FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "paystubs_all" ON paystubs FOR ALL USING (true) WITH CHECK (true);

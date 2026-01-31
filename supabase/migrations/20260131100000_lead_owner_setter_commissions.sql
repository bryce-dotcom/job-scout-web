-- Lead Owner and Setter Fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_owner_id INTEGER REFERENCES employees(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS setter_owner_id INTEGER REFERENCES employees(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source TEXT DEFAULT 'user';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appointment_id INTEGER;

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_leads_lead_owner_id ON leads(lead_owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_setter_owner_id ON leads(setter_owner_id);
CREATE INDEX IF NOT EXISTS idx_leads_lead_source ON leads(lead_source);

-- Recreate appointments table with proper structure
DROP TABLE IF EXISTS appointments CASCADE;
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  lead_id INTEGER REFERENCES leads(id),
  customer_id INTEGER REFERENCES customers(id),
  title TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,
  employee_id INTEGER REFERENCES employees(id),
  salesperson_id INTEGER REFERENCES employees(id),
  setter_id INTEGER REFERENCES employees(id),
  lead_owner_id INTEGER REFERENCES employees(id),
  status TEXT DEFAULT 'Scheduled',
  appointment_type TEXT,
  outcome TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "appointments_all" ON appointments;
CREATE POLICY "appointments_all" ON appointments FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_appointments_company_id ON appointments(company_id);
CREATE INDEX IF NOT EXISTS idx_appointments_lead_id ON appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_appointments_start_time ON appointments(start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_setter_id ON appointments(setter_id);

-- Lead Commissions table
CREATE TABLE IF NOT EXISTS lead_commissions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  lead_id INTEGER REFERENCES leads(id),
  appointment_id INTEGER REFERENCES appointments(id),
  commission_type TEXT NOT NULL, -- 'lead_generation' or 'appointment_set'
  employee_id INTEGER REFERENCES employees(id),
  amount DECIMAL DEFAULT 0,
  rate_type TEXT DEFAULT 'flat', -- 'flat' or 'percent'
  payment_status TEXT DEFAULT 'pending', -- 'pending', 'approved', 'paid'
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lead_commissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "lead_commissions_all" ON lead_commissions;
CREATE POLICY "lead_commissions_all" ON lead_commissions FOR ALL USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_lead_commissions_company_id ON lead_commissions(company_id);
CREATE INDEX IF NOT EXISTS idx_lead_commissions_employee_id ON lead_commissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_lead_commissions_lead_id ON lead_commissions(lead_id);

-- Add foreign key for appointment_id in leads (after appointments table exists)
ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_appointment_id_fkey;
ALTER TABLE leads ADD CONSTRAINT leads_appointment_id_fkey
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE SET NULL;

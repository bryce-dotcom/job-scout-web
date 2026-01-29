-- Lead Setter Workflow + Sales Pipeline Integration
-- Setter Workspace: Kanban leads + Calendar drag-drop to schedule appointments
-- Pipeline Integration: "Appointment Set" stage shows appointment details
-- Setter Commission: Paid per meeting that results in a quote

-- Ensure leads table has all required fields
ALTER TABLE leads ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'New';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS service_type TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS setter_id INTEGER REFERENCES employees(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS salesperson_id INTEGER REFERENCES employees(id);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appointment_time TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS appointment_id INTEGER;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_generated BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contact_at TIMESTAMPTZ;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS contact_attempts INTEGER DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS callback_date DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS callback_notes TEXT;

-- Lead status options: New, Contacted, Callback, Not Qualified, Appointment Set, Qualified, Quoted, Paid, Waiting
-- Setter sees: New, Contacted, Callback, Not Qualified
-- Sales sees (in pipeline): Appointment Set, Qualified, Quoted, etc.

-- Appointments table
CREATE TABLE IF NOT EXISTS appointments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  lead_id INTEGER REFERENCES leads(id),

  -- Scheduling
  title TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  duration_minutes INTEGER DEFAULT 60,
  location TEXT,

  -- Assignment
  salesperson_id INTEGER REFERENCES employees(id),
  setter_id INTEGER REFERENCES employees(id),

  -- Status
  status TEXT DEFAULT 'scheduled', -- scheduled, completed, no_show, cancelled, rescheduled
  outcome TEXT, -- quoted, not_qualified, follow_up

  -- Calendar integration
  calendar_id TEXT,
  event_id TEXT,
  calendar_link TEXT,

  -- Notes
  description TEXT,
  notes TEXT,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Setter Commissions table
CREATE TABLE IF NOT EXISTS setter_commissions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  lead_id INTEGER REFERENCES leads(id),
  appointment_id INTEGER REFERENCES appointments(id),

  -- Who gets paid
  setter_id INTEGER REFERENCES employees(id),
  marketer_id INTEGER REFERENCES employees(id),

  -- Amounts
  setter_amount DECIMAL DEFAULT 0,
  marketer_amount DECIMAL DEFAULT 0,

  -- Status
  payment_status TEXT DEFAULT 'pending', -- pending, approved, paid

  -- Conditions
  requires_quote BOOLEAN DEFAULT true,
  quote_generated BOOLEAN DEFAULT false,
  quote_id INTEGER,

  -- Tracking
  approved_by INTEGER REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,

  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company settings for commission rates
ALTER TABLE companies ADD COLUMN IF NOT EXISTS setter_pay_per_appointment DECIMAL DEFAULT 25.00;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS marketer_pay_per_appointment DECIMAL DEFAULT 10.00;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS commission_requires_quote BOOLEAN DEFAULT true;

-- RLS
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE setter_commissions ENABLE ROW LEVEL SECURITY;

-- Policies for appointments
CREATE POLICY "appointments_select" ON appointments FOR SELECT USING (
  company_id IN (
    SELECT e.company_id FROM employees e
    WHERE e.email = auth.jwt()->>'email' AND e.active = true
  )
);
CREATE POLICY "appointments_insert" ON appointments FOR INSERT WITH CHECK (
  company_id IN (
    SELECT e.company_id FROM employees e
    WHERE e.email = auth.jwt()->>'email' AND e.active = true
  )
);
CREATE POLICY "appointments_update" ON appointments FOR UPDATE USING (
  company_id IN (
    SELECT e.company_id FROM employees e
    WHERE e.email = auth.jwt()->>'email' AND e.active = true
  )
);
CREATE POLICY "appointments_delete" ON appointments FOR DELETE USING (
  company_id IN (
    SELECT e.company_id FROM employees e
    WHERE e.email = auth.jwt()->>'email' AND e.active = true
  )
);

-- Policies for setter_commissions
CREATE POLICY "setter_commissions_select" ON setter_commissions FOR SELECT USING (
  company_id IN (
    SELECT e.company_id FROM employees e
    WHERE e.email = auth.jwt()->>'email' AND e.active = true
  )
);
CREATE POLICY "setter_commissions_insert" ON setter_commissions FOR INSERT WITH CHECK (
  company_id IN (
    SELECT e.company_id FROM employees e
    WHERE e.email = auth.jwt()->>'email' AND e.active = true
  )
);
CREATE POLICY "setter_commissions_update" ON setter_commissions FOR UPDATE USING (
  company_id IN (
    SELECT e.company_id FROM employees e
    WHERE e.email = auth.jwt()->>'email' AND e.active = true
  )
);
CREATE POLICY "setter_commissions_delete" ON setter_commissions FOR DELETE USING (
  company_id IN (
    SELECT e.company_id FROM employees e
    WHERE e.email = auth.jwt()->>'email' AND e.active = true
  )
);

-- Update pipeline_stages - rename first stage to "Appointment Set"
UPDATE pipeline_stages SET name = 'Appointment Set', win_probability = 15 WHERE position = 0 AND name = 'Lead In';

-- Indexes
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(company_id, status);
CREATE INDEX IF NOT EXISTS idx_leads_setter ON leads(setter_id);
CREATE INDEX IF NOT EXISTS idx_leads_appointment ON leads(appointment_id);
CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(company_id, start_time);
CREATE INDEX IF NOT EXISTS idx_appointments_lead ON appointments(lead_id);
CREATE INDEX IF NOT EXISTS idx_setter_commissions_setter ON setter_commissions(setter_id);
CREATE INDEX IF NOT EXISTS idx_setter_commissions_status ON setter_commissions(payment_status);

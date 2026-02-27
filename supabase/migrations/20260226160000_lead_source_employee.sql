-- Add lead_source_employee_id to track which employee sourced a lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_source_employee_id INTEGER REFERENCES employees(id);
CREATE INDEX IF NOT EXISTS idx_leads_source_employee ON leads(lead_source_employee_id);

-- Allow Zach properties to be tied to a lead (prospect), not just a customer.
-- Either customer_id or lead_id may be set (or both, after a lead is converted).

ALTER TABLE lawn_properties
  ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS lawn_properties_lead_idx ON lawn_properties(lead_id);

-- Add converted_customer_id to leads for tracking which customer a lead was converted to
ALTER TABLE leads ADD COLUMN IF NOT EXISTS converted_customer_id INTEGER REFERENCES customers(id);

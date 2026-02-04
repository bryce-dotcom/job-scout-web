-- Add labor_rate_id column to products_services table
ALTER TABLE products_services ADD COLUMN IF NOT EXISTS labor_rate_id INTEGER REFERENCES labor_rates(id);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_services_labor_rate_id ON products_services(labor_rate_id);

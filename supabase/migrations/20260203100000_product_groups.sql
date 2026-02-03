-- Create product_groups table
CREATE TABLE IF NOT EXISTS product_groups (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  service_type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  image_url TEXT,
  icon TEXT DEFAULT 'Package',
  sort_order INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create index on company_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_groups_company_id ON product_groups(company_id);

-- Create index on service_type for filtering
CREATE INDEX IF NOT EXISTS idx_product_groups_service_type ON product_groups(service_type);

-- Enable Row Level Security
ALTER TABLE product_groups ENABLE ROW LEVEL SECURITY;

-- Create open policy for authenticated users (same pattern as other tables)
CREATE POLICY "Enable all access for authenticated users" ON product_groups
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Also allow anon access for now (matching other tables in this project)
CREATE POLICY "Enable all access for anon users" ON product_groups
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Add group_id column to products_services table
ALTER TABLE products_services
  ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES product_groups(id) ON DELETE SET NULL;

-- Create index on group_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_products_services_group_id ON products_services(group_id);

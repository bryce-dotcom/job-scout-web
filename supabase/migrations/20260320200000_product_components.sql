-- Product Components / Bundles junction table
CREATE TABLE IF NOT EXISTS product_components (
  id SERIAL PRIMARY KEY,
  parent_product_id INTEGER NOT NULL REFERENCES products_services(id) ON DELETE CASCADE,
  component_product_id INTEGER NOT NULL REFERENCES products_services(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  company_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(parent_product_id, component_product_id)
);

-- RLS
ALTER TABLE product_components ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "product_components_company_isolation" ON product_components
    FOR ALL USING (company_id = (current_setting('request.jwt.claims', true)::json->>'company_id')::int);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Index for fast lookup by parent
CREATE INDEX IF NOT EXISTS idx_product_components_parent ON product_components(parent_product_id);
CREATE INDEX IF NOT EXISTS idx_product_components_company ON product_components(company_id);

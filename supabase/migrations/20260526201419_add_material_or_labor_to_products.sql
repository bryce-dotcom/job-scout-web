-- Classify products as 'material' or 'labor' so invoices can show a real
-- Materials / Labor breakdown instead of a 70/30 estimate. Bundle products
-- (type = 'Electrical Services (Bundles)') stay NULL because their
-- classification is decided by walking their components; everything else
-- gets explicitly tagged.
ALTER TABLE products_services
  ADD COLUMN IF NOT EXISTS material_or_labor TEXT
  CHECK (material_or_labor IN ('material', 'labor') OR material_or_labor IS NULL);

COMMENT ON COLUMN products_services.material_or_labor IS
  'Either ''material'' (physical product / fixture / equipment) or ''labor'' (install time, lift, relocation, etc.). NULL means unclassified (renderer falls back to 70/30 estimate for any invoice line containing an unclassified component).';

-- Index so the invoice renderer can quickly scan whether all components
-- of a line have been classified.
CREATE INDEX IF NOT EXISTS idx_products_services_material_or_labor
  ON products_services (material_or_labor)
  WHERE material_or_labor IS NOT NULL;

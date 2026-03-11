-- Add spec sheet and product enrichment columns to products_services table
ALTER TABLE products_services
ADD COLUMN IF NOT EXISTS manufacturer TEXT,
ADD COLUMN IF NOT EXISTS model_number TEXT,
ADD COLUMN IF NOT EXISTS product_category TEXT,
ADD COLUMN IF NOT EXISTS dlc_listed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS dlc_listing_number TEXT,
ADD COLUMN IF NOT EXISTS warranty_years NUMERIC,
ADD COLUMN IF NOT EXISTS spec_sheet_url TEXT,
ADD COLUMN IF NOT EXISTS install_guide_url TEXT,
ADD COLUMN IF NOT EXISTS datasheet_json JSONB DEFAULT '{}';

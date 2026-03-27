-- Add DLC document URL column to products_services
ALTER TABLE products_services ADD COLUMN IF NOT EXISTS dlc_document_url text;

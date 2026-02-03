-- Add new columns to inventory table
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS inventory_type TEXT DEFAULT 'Material' CHECK (inventory_type IN ('Material', 'Tool', 'Consumable'));
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS barcode TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS image_url TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS condition TEXT DEFAULT 'Good' CHECK (condition IN ('Good', 'Fair', 'Poor', 'Out of Service'));
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS assigned_to INTEGER REFERENCES employees(id);
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS serial_number TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS group_id INTEGER REFERENCES product_groups(id);

-- Add inventory_types to settings
INSERT INTO settings (company_id, key, value)
VALUES (3, 'inventory_types', '["Material","Tool","Consumable"]')
ON CONFLICT DO NOTHING;

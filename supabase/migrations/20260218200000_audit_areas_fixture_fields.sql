-- Add fixture detail columns to audit_areas to match the audit area modal fields
-- These fields are already being written by the app but were missing from the schema

ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS fixture_category text;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS fixture_count integer DEFAULT 1;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS existing_wattage integer;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS led_wattage integer;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS led_replacement_id integer;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS total_existing_watts integer;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS total_led_watts integer;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS area_watts_reduced integer;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS confirmed boolean DEFAULT false;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS override_notes text;

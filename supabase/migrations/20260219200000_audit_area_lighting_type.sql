-- Add lighting_type column to audit_areas for lamp technology tracking
-- Values: T12, T8, T5, HID, Metal Halide, HPS, Incandescent, CFL, LED, Other
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS lighting_type text;

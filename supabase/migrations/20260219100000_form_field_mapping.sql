-- Add field_mapping JSONB column to utility_forms for PDF form auto-fill
ALTER TABLE utility_forms ADD COLUMN IF NOT EXISTS field_mapping jsonb;

COMMENT ON COLUMN utility_forms.field_mapping IS 'Maps PDF form field names to database data paths (e.g. {"Customer Name": "customer.name"})';

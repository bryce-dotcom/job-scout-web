-- Store Dougie OCR corrections so the AI learns from user edits
CREATE TABLE IF NOT EXISTS dougie_corrections (
  id bigserial PRIMARY KEY,
  company_id integer REFERENCES companies(id),
  field_type text NOT NULL,           -- 'header' or 'fixture'
  field_name text NOT NULL,           -- e.g. 'customerName', 'qty', 'existW', 'name'
  original_value text,                -- what the AI returned
  corrected_value text,               -- what the user changed it to
  context jsonb,                      -- surrounding data for few-shot (e.g. raw transcription snippet, area name)
  created_at timestamptz DEFAULT now()
);

-- Index for fast lookups by company
CREATE INDEX IF NOT EXISTS idx_dougie_corrections_company ON dougie_corrections(company_id, created_at DESC);

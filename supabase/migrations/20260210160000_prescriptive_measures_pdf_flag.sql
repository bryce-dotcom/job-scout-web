-- Add needs_pdf_upload flag and source_pdf_url to prescriptive_measures
-- needs_pdf_upload: true when measure data is from AI general knowledge (not verified from PDF)
-- source_pdf_url: tracks which PDF the data was extracted from

ALTER TABLE prescriptive_measures ADD COLUMN IF NOT EXISTS needs_pdf_upload BOOLEAN DEFAULT false;
ALTER TABLE prescriptive_measures ADD COLUMN IF NOT EXISTS source_pdf_url TEXT;

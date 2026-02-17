-- PDF Enrichment: new columns for tracking PDF processing status and storage paths

-- Track enrichment status on programs
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS pdf_enrichment_status text DEFAULT 'pending';
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS pdf_enriched_at timestamptz;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS pdf_storage_path text;

-- Track PDF verification on incentive_measures
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS source_pdf_url text;
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS pdf_verified boolean DEFAULT false;

-- Storage path for downloaded rate schedule PDFs
ALTER TABLE utility_rate_schedules ADD COLUMN IF NOT EXISTS pdf_storage_path text;

-- Create storage bucket for utility PDFs
INSERT INTO storage.buckets (id, name, public)
VALUES ('utility-pdfs', 'utility-pdfs', true)
ON CONFLICT (id) DO NOTHING;

-- Allow authenticated users to upload to the bucket
CREATE POLICY "Authenticated users can upload utility PDFs"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'utility-pdfs');

-- Allow public read access
CREATE POLICY "Public read access for utility PDFs"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'utility-pdfs');

-- Allow authenticated users to update/delete their uploads
CREATE POLICY "Authenticated users can manage utility PDFs"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'utility-pdfs');

-- Allow service role full access (for edge functions)
CREATE POLICY "Service role full access to utility PDFs"
ON storage.objects FOR ALL
TO service_role
USING (bucket_id = 'utility-pdfs');

-- Add UPDATE policy for utility-pdfs storage bucket
-- Fixes: "new row violates row-level security policy" when re-uploading
-- (upsert requires UPDATE permission on storage.objects)

CREATE POLICY "Authenticated users can update utility PDFs"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'utility-pdfs')
WITH CHECK (bucket_id = 'utility-pdfs');

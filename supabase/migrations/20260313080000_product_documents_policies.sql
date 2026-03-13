-- Add storage policies for product-documents bucket (missing, causing upload failures)

DO $$ BEGIN
  CREATE POLICY "Authenticated users can upload product-documents"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can update product-documents"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'product-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Authenticated users can delete product-documents"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Public read product-documents"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'product-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Storage policies for all buckets used by the app
-- (employee-photos already has policies from previous migration)

-- project-documents
DO $$ BEGIN
  CREATE POLICY "authenticated_upload_project_documents" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'project-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_update_project_documents" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'project-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_read_project_documents" ON storage.objects
    FOR SELECT TO authenticated USING (bucket_id = 'project-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_delete_project_documents" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'project-documents');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- utility-pdfs
DO $$ BEGIN
  CREATE POLICY "authenticated_upload_utility_pdfs" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'utility-pdfs');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_update_utility_pdfs" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'utility-pdfs');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "public_read_utility_pdfs" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'utility-pdfs');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_delete_utility_pdfs" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'utility-pdfs');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- company-logos
DO $$ BEGIN
  CREATE POLICY "authenticated_upload_company_logos" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'company-logos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_update_company_logos" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'company-logos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "public_read_company_logos" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'company-logos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_delete_company_logos" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'company-logos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- product-images
DO $$ BEGIN
  CREATE POLICY "authenticated_upload_product_images" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_update_product_images" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "public_read_product_images" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_delete_product_images" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'product-images');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- audit-photos
DO $$ BEGIN
  CREATE POLICY "authenticated_upload_audit_photos" ON storage.objects
    FOR INSERT TO authenticated WITH CHECK (bucket_id = 'audit-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_update_audit_photos" ON storage.objects
    FOR UPDATE TO authenticated USING (bucket_id = 'audit-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "public_read_audit_photos" ON storage.objects
    FOR SELECT TO public USING (bucket_id = 'audit-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "authenticated_delete_audit_photos" ON storage.objects
    FOR DELETE TO authenticated USING (bucket_id = 'audit-photos');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

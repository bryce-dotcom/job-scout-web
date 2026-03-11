CREATE POLICY "authenticated_upload_employee_photos" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'employee-photos');

CREATE POLICY "authenticated_update_employee_photos" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'employee-photos');

CREATE POLICY "public_read_employee_photos" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'employee-photos');

CREATE POLICY "authenticated_delete_employee_photos" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'employee-photos');

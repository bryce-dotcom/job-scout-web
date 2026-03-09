-- Create company-logos storage bucket (public so logos can be displayed)
INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logos', 'company-logos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for company-logos bucket
CREATE POLICY "company_logos_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'company-logos');

CREATE POLICY "company_logos_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'company-logos');

CREATE POLICY "company_logos_update" ON storage.objects
  FOR UPDATE USING (bucket_id = 'company-logos');

CREATE POLICY "company_logos_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'company-logos');

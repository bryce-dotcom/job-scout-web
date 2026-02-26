-- Create project-documents storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('project-documents', 'project-documents', false)
ON CONFLICT (id) DO NOTHING;

-- Create file_attachments table for linking files to leads/jobs
CREATE TABLE IF NOT EXISTS public.file_attachments (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT REFERENCES public.companies(id),
  lead_id BIGINT REFERENCES public.leads(id) ON DELETE CASCADE,
  job_id BIGINT REFERENCES public.jobs(id) ON DELETE SET NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_type TEXT,
  file_size BIGINT,
  storage_bucket TEXT NOT NULL DEFAULT 'project-documents',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by BIGINT REFERENCES public.employees(id)
);

-- RLS policies
ALTER TABLE public.file_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "file_attachments_select" ON public.file_attachments
  FOR SELECT USING (true);

CREATE POLICY "file_attachments_insert" ON public.file_attachments
  FOR INSERT WITH CHECK (true);

CREATE POLICY "file_attachments_delete" ON public.file_attachments
  FOR DELETE USING (true);

-- Storage policies for project-documents bucket
CREATE POLICY "project_docs_select" ON storage.objects
  FOR SELECT USING (bucket_id = 'project-documents');

CREATE POLICY "project_docs_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'project-documents');

CREATE POLICY "project_docs_delete" ON storage.objects
  FOR DELETE USING (bucket_id = 'project-documents');

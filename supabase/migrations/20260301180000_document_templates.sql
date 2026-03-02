-- Document Templates & Doc Packages
-- Stores form template metadata and links templates to service types

-- document_templates: stores PDF form template metadata and field mappings
CREATE TABLE IF NOT EXISTS public.document_templates (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT REFERENCES public.companies(id),
  form_name TEXT NOT NULL,
  form_code TEXT,
  category TEXT NOT NULL DEFAULT 'CUSTOM',
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_size BIGINT,
  field_count INT NOT NULL DEFAULT 0,
  field_mapping JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'Pending',
  is_custom BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_templates_company
  ON public.document_templates(company_id);

ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_templates_select" ON public.document_templates
  FOR SELECT USING (true);

CREATE POLICY "document_templates_insert" ON public.document_templates
  FOR INSERT WITH CHECK (true);

CREATE POLICY "document_templates_update" ON public.document_templates
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "document_templates_delete" ON public.document_templates
  FOR DELETE USING (true);

-- doc_package_items: links templates to service types
CREATE TABLE IF NOT EXISTS public.doc_package_items (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id BIGINT REFERENCES public.companies(id),
  service_type TEXT NOT NULL,
  template_id BIGINT REFERENCES public.document_templates(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doc_package_items_company
  ON public.doc_package_items(company_id);

ALTER TABLE public.doc_package_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doc_package_items_select" ON public.doc_package_items
  FOR SELECT USING (true);

CREATE POLICY "doc_package_items_insert" ON public.doc_package_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "doc_package_items_update" ON public.doc_package_items
  FOR UPDATE USING (true) WITH CHECK (true);

CREATE POLICY "doc_package_items_delete" ON public.doc_package_items
  FOR DELETE USING (true);

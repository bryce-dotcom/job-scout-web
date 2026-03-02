-- Allow doc_package_items to reference both document_templates and utility_forms
-- Drop the FK constraint and add a source_table column

ALTER TABLE public.doc_package_items
  DROP CONSTRAINT IF EXISTS doc_package_items_template_id_fkey;

ALTER TABLE public.doc_package_items
  ADD COLUMN IF NOT EXISTS source_table TEXT NOT NULL DEFAULT 'document_templates';

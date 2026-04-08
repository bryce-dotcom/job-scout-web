-- Canonical customer signature on leads and jobs
-- One place to resolve "the customer signature for this project" regardless
-- of where it was captured (Formal proposal, Interactive proposal, Lenard
-- UT, Lenard AZ). Populated by approve-document + the Lenard agents.
-- Consumed by documentGenerator when auto-stamping attached signable PDFs.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS customer_signature_path text,
  ADD COLUMN IF NOT EXISTS customer_signature_typed text,
  ADD COLUMN IF NOT EXISTS customer_signature_method text,
  ADD COLUMN IF NOT EXISTS customer_signature_captured_at timestamptz;

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS customer_signature_path text,
  ADD COLUMN IF NOT EXISTS customer_signature_typed text,
  ADD COLUMN IF NOT EXISTS customer_signature_method text,
  ADD COLUMN IF NOT EXISTS customer_signature_captured_at timestamptz;

CREATE INDEX IF NOT EXISTS leads_customer_signature_idx
  ON leads(customer_signature_path) WHERE customer_signature_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS jobs_customer_signature_idx
  ON jobs(customer_signature_path) WHERE customer_signature_path IS NOT NULL;

-- Signature field registry for document templates.
-- Shape: [{ page: 0, x: 95, y: 140, width: 150, height: 40, name: 'customer_signature' }, ...]
-- Empty array = no auto-stamping happens for that template (default).

ALTER TABLE document_templates
  ADD COLUMN IF NOT EXISTS signature_fields jsonb NOT NULL DEFAULT '[]';

ALTER TABLE utility_forms
  ADD COLUMN IF NOT EXISTS signature_fields jsonb NOT NULL DEFAULT '[]';

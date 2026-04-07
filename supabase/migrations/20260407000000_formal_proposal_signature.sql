-- Formal proposal signature + persistence
-- Adds signature capture fields to document_approvals and pointer columns
-- on quotes/jobs so the signed proposal PDF stays with the estimate and
-- automatically travels to the resulting job.

-- 1. Signature capture on the existing approval audit record
ALTER TABLE document_approvals
  ADD COLUMN IF NOT EXISTS signature_image_path text,
  ADD COLUMN IF NOT EXISTS signature_method text,
  ADD COLUMN IF NOT EXISTS signature_typed_text text,
  ADD COLUMN IF NOT EXISTS legal_terms_hash text;

-- 2. Pointer from the estimate to its signed proposal file
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS signed_proposal_attachment_id bigint
    REFERENCES file_attachments(id) ON DELETE SET NULL;

-- 3. Pointer from the resulting job to the same signed proposal
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS signed_proposal_attachment_id bigint
    REFERENCES file_attachments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS quotes_signed_proposal_idx
  ON quotes(signed_proposal_attachment_id);
CREATE INDEX IF NOT EXISTS jobs_signed_proposal_idx
  ON jobs(signed_proposal_attachment_id);

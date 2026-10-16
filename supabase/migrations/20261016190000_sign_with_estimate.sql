-- Documents that ride along with an estimate and are signed with it.
--
-- A rep sends a proposal, the customer signs it, and then — days later, once
-- the job is real — somebody works out that this one also needs a utility
-- application and a W-9. Those get generated after the signing and come back
-- for a second round of chasing. Robert Anderson's job is the example: signed
-- 25 September, his General Application and W-9 generated 14 October.
--
-- file_attachments already carries quote_id, so a document can belong to an
-- estimate. What it could not say is "the customer has to sign this one too",
-- which is the difference between an attachment and a signing packet.

ALTER TABLE public.file_attachments
  ADD COLUMN IF NOT EXISTS sign_with_estimate boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signed_at timestamptz;

COMMENT ON COLUMN public.file_attachments.sign_with_estimate IS
  'Include this document in the estimate''s signing packet: the customer sees it in the portal and one signature covers it.';
COMMENT ON COLUMN public.file_attachments.signed_at IS
  'When the customer''s signature was stamped onto this document.';

-- The portal fetches a packet by quote, every time it loads.
CREATE INDEX IF NOT EXISTS file_attachments_signing_packet_idx
  ON public.file_attachments (quote_id)
  WHERE sign_with_estimate;

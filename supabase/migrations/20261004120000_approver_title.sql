-- Who signed, and in what capacity.
--
-- Tracy (0f05d2a5): an estimate went to a client whose approval has to come
-- from a board member, and the board members change routinely. The contact
-- could not sign it, so they printed it, got a wet signature and sent it back.
--
-- Forwarding the portal link already works — the token is the credential and
-- approve-document never checked the signer against the recipient — but nothing
-- said so, and the portal pre-filled the contact's name under "Confirm your
-- information", which tells a board member the page is not for them.
--
-- Once a signature can legitimately come from someone we never emailed, the
-- record needs to say who they are. A name alone does not answer "were they
-- allowed to approve this": "Jane Okafor, Board Treasurer" does.

alter table public.document_approvals
  add column if not exists approver_title text;

comment on column public.document_approvals.approver_title is
  'Role the signer gave for themselves, e.g. "Board Treasurer". Optional, free
   text, and self-declared — it records what they told us, not a verified fact.';

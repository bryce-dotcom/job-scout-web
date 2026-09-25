-- A quote knows whether it is an estimate, a bid or a proposal.
--
-- Some companies write all three, and the word is not cosmetic: a government
-- buyer who asked for a bid and receives a document headed "Estimate" has
-- been given a reason to doubt you before reading a number. The type drives
-- the format it opens in, what the customer's copy is headed, what the email
-- says, and (once sourced pricing lands) whether an unverified price blocks
-- the send or merely warns.
--
-- NULL means "whatever this company leads with" — settings.document_types
-- { enabled: [...], primary: '...' }, read through lib/documentVocabulary.
-- That way a company that renames does not have to relabel old rows, while a
-- document that was deliberately made a bid stays a bid.

alter table public.quotes add column if not exists document_type text;

alter table public.quotes drop constraint if exists quotes_document_type_check;
alter table public.quotes add constraint quotes_document_type_check
  check (document_type is null or document_type in ('estimate', 'bid', 'proposal'));

create index if not exists quotes_document_type_idx
  on public.quotes (company_id, document_type) where document_type is not null;

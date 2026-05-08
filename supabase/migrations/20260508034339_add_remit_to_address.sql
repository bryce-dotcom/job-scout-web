-- Companies often have a different ADDRESS for billing / remittance than
-- their physical address (PO Box, accounting service address, etc.).
-- Tracy at HHH: customers want our PO Box on the invoice, not the
-- physical address.
--
-- Add a separate `remit_to_address` column. Anywhere we render the
-- company address on a customer-facing document (invoice, statement,
-- estimate) prefers remit_to_address when it's set, otherwise falls
-- back to address (the existing physical-address column).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS remit_to_address text;

-- Optional billing-team email shown on invoices "Questions? Contact ___"
-- so customers know who to reach for accounting matters specifically.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS remit_to_email text;

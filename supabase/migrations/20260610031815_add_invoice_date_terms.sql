-- Editable invoice date override
--
-- Per Tracy's feedback (27da314d): "When I delete and invoice and I have
-- had to generate new invoices for jobs of HHH I noticed that I can't
-- change the invoice date to reflect when the job is actually done."
--
-- Adding invoice_date as an optional override. When NULL the UI + PDF
-- fall back to created_at (existing behavior). When set, it's the
-- effective invoice date for display purposes only — sorting and audit
-- still use created_at.
--
-- due_date already exists from a prior migration. The Tracy ticket also
-- asked for editable terms (f80a20a2) — that's pure UI on the existing
-- due_date column, no schema change needed.

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS invoice_date date;

COMMENT ON COLUMN public.invoices.invoice_date IS
  'Optional override for the "Date:" line on the invoice PDF + UI. When NULL, falls back to created_at::date. Sorting and audit trails still use created_at. Used when an invoice is generated AFTER the work was done and the customer expects the work date on the document.';

-- ====================================================================
-- Invoice display format toggle: itemized (default) vs summary.
--
-- Some customers + utility programs prefer a clean "Parts + Labor"
-- summary instead of the full line-item breakdown. Toggle lives on
-- each invoice individually so HR can override per invoice; the
-- customer-level default seeds new invoices at creation time.
--
-- Summary mode renders just:
--   Parts:  $X,XXX.XX
--   Labor:  $X,XXX.XX
--   ─────────────────
--   Total:  $X,XXX.XX
-- (plus any tax / discount / utility-incentive deductions)
--
-- Itemized mode is unchanged — full per-line breakdown.
-- ====================================================================

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS summary_format boolean NOT NULL DEFAULT false;

ALTER TABLE public.utility_invoices
  ADD COLUMN IF NOT EXISTS summary_format boolean NOT NULL DEFAULT false;

-- Per-customer default: NULL = use system default (itemized), otherwise
-- pre-fill new invoices for this customer with the picked format.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS preferred_invoice_format text
    CHECK (preferred_invoice_format IS NULL OR preferred_invoice_format IN ('itemized','summary'));

COMMENT ON COLUMN public.invoices.summary_format IS
  'When true, the invoice PDF renders Parts/Labor totals only instead of the full line-item list. Toggle on the invoice detail page.';

COMMENT ON COLUMN public.customers.preferred_invoice_format IS
  'Per-customer default for new invoices. NULL = system default (itemized). Set to "summary" for customers who want clean Parts/Labor totals on every invoice without HR having to toggle each one.';

NOTIFY pgrst, 'reload schema';

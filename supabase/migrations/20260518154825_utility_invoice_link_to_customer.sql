-- ====================================================================
-- Link utility_invoices to the customer invoice it represents.
--
-- After this migration:
--   - utility_invoices.invoice_id → invoices(id) — the customer invoice
--     this utility-copy mirrors. NULL for legacy utility invoices made
--     before the link was added; new utility invoices created via
--     "Create Both Invoices" will populate it.
--   - utility_invoices.linked_invoice_number — denormalized human-
--     readable number ("INV-2026-0042") so the utility PDF header can
--     read "Utility copy of INV-2026-0042" without an extra join.
--
-- The customer invoice itself doesn't get a back-link column — instead
-- the relationship is queryable via utility_invoices.invoice_id = ?
-- when needed.
--
-- This is the schema half of Phase 5. The rendering changes (matching
-- numbers + two-section line list on the utility PDF) ship in a
-- follow-on commit.
-- ====================================================================

ALTER TABLE public.utility_invoices
  ADD COLUMN IF NOT EXISTS invoice_id integer REFERENCES public.invoices(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS linked_invoice_number text;

CREATE INDEX IF NOT EXISTS idx_utility_invoices_linked_invoice
  ON public.utility_invoices (invoice_id);

COMMENT ON COLUMN public.utility_invoices.invoice_id IS
  'The customer-side invoice this utility-copy mirrors. NULL on legacy rows pre-Phase-5.';
COMMENT ON COLUMN public.utility_invoices.linked_invoice_number IS
  'Denormalized customer invoice_id (e.g. INV-ABC123) for the utility-PDF header. Always reads through to the same number for reconciliation.';

NOTIFY pgrst, 'reload schema';

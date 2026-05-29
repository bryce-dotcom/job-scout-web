-- ====================================================================
-- Real Parts/Labor split for invoice summary mode.
--
-- The current heuristic (split by product type) is too coarse — most
-- lighting line items are typed "Product" but include both fixture
-- cost (parts) AND install labor priced into the unit_price. The
-- legitimate split needs per-line labor_cost data.
--
-- Changes:
--   1. invoice_lines.labor_cost — copied from job_lines.labor_cost at
--      invoice-creation time. Lets each line carry its own labor split.
--      Parts subtotal per line = line_total - labor_cost.
--   2. invoices.parts_total_override + labor_total_override — manual
--      overrides for when HR wants to force specific Parts/Labor
--      totals on the summary PDF regardless of what the lines say.
--      Common case: utility wants a clean 70/30 split, or HR is doing
--      an after-the-fact reconciliation.
--   3. Same override pair on utility_invoices.
--
-- Computation hierarchy in the PDF renderer (highest priority first):
--   a) invoices.{parts,labor}_total_override (both set)  → use those
--   b) sum of invoice_lines.labor_cost across lines      → split per-line
--   c) item.type === 'Service' | 'Labor'                 → full-line route
--   d) default                                            → all to Parts
-- ====================================================================

ALTER TABLE public.invoice_lines
  ADD COLUMN IF NOT EXISTS labor_cost numeric(12,2) DEFAULT 0;

ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS parts_total_override numeric(12,2),
  ADD COLUMN IF NOT EXISTS labor_total_override numeric(12,2);

ALTER TABLE public.utility_invoices
  ADD COLUMN IF NOT EXISTS parts_total_override numeric(12,2),
  ADD COLUMN IF NOT EXISTS labor_total_override numeric(12,2);

COMMENT ON COLUMN public.invoice_lines.labor_cost IS
  'Labor portion of this line (split from line_total). Copied from job_lines.labor_cost at invoice creation. Drives the per-line Parts/Labor split for summary-format invoices.';
COMMENT ON COLUMN public.invoices.parts_total_override IS
  'When set, the summary-mode PDF uses this as the Parts total instead of computing from line items. Pair with labor_total_override (both NULL = auto-compute).';
COMMENT ON COLUMN public.invoices.labor_total_override IS
  'When set, the summary-mode PDF uses this as the Labor total instead of computing from line items. Pair with parts_total_override (both NULL = auto-compute).';

-- Backfill: for invoice_lines that haven't had labor_cost set yet, pull
-- from the matching job_lines row by item_id when available. Best-effort
-- — only updates rows where there's a clean 1:1 match by (invoice.job_id,
-- item_id, quantity).
UPDATE public.invoice_lines il
   SET labor_cost = jl.labor_cost
  FROM public.invoices inv,
       public.job_lines jl
 WHERE il.invoice_id = inv.id
   AND jl.job_id     = inv.job_id
   AND jl.item_id    = il.item_id
   AND il.labor_cost = 0
   AND jl.labor_cost > 0
   AND COALESCE(jl.quantity, 1) = COALESCE(il.quantity, 1);

NOTIFY pgrst, 'reload schema';

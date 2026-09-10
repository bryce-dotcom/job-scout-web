-- =====================================================================
-- A purchase order may exist before anyone knows who to buy from.
--
-- Bryce: "if a product doesn't have a vendor associated with it it shouldn't
-- block the PO, just use the description in a PO that has no vendors."
--
-- The app already agrees. Every screen that shows a PO's vendor was written
-- for one that has none:
--
--   PurchaseOrders.jsx:286    {po.vendor?.name || '(no vendor)'}
--   PurchaseOrderDetail:831   {po.vendor?.name || '—'}
--   poPdf.js:74               if (vendor?.name) — and its comment says
--                             "a PO with no vendor is risky; kept muted"
--
-- Only the column disagreed. purchase_orders.vendor_id was NOT NULL, so the
-- insert was impossible and the code had to refuse instead — which is how
-- Alayda ended up unable to order for Northwest Standard at all.
--
-- The foreign key stays: a vendor_id that IS set still has to name a real
-- vendor. Dropping NOT NULL only allows "not decided yet".
-- =====================================================================

alter table public.purchase_orders
  alter column vendor_id drop not null;

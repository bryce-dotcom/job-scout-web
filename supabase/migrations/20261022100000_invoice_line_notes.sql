-- A job line's notes carried onto the invoice (Bryce, 2026-10-22: "put the
-- part number in the job line items notes, then allow the invoice to see the
-- notes as well"; "on invoices: toggle for description (already built),
-- toggle on notes").
--
-- invoice_lines are COPIES made when an invoice is generated, so a part
-- number typed onto an invoice is lost the next time it is regenerated (Fast
-- Auto: INV-1006 → INV-1040 → INV-1043 in two days). Notes live on the job
-- line and are copied with it every time; the invoice shows them under the
-- line unless hide_line_notes is set — the same per-invoice switch as
-- hide_line_descriptions.
alter table public.invoice_lines add column if not exists notes text;
alter table public.invoices add column if not exists hide_line_notes boolean not null default false;

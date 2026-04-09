-- Editable material/labor split percentages on each utility invoice.
-- Defaults to 70/30 (70 % material, 30 % labor) but the PM can
-- override per invoice when editing.
ALTER TABLE utility_invoices
  ADD COLUMN IF NOT EXISTS material_pct numeric NOT NULL DEFAULT 70,
  ADD COLUMN IF NOT EXISTS labor_pct   numeric NOT NULL DEFAULT 30;

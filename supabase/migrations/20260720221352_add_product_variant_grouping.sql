-- Product variants (t-shirt-style picker) — Phase 1
--
-- Lets a family of near-identical catalog rows (e.g. the 40 "SMBE Highbay"
-- rows = 5 wattage tiers x 8 install combos) collapse into ONE picker tile
-- with option chips, instead of a rep scrolling 40 rows to find one fixture.
--
-- Design is deliberately additive and non-breaking:
--   * variant_group_id    groups the member rows (NULL = ordinary product,
--                         behaves exactly as before).
--   * variant_group_label the tile's display name ("SMBE Highbay").
--   * variant_options      the structured option map for THIS row, parsed once
--                         by the backfill and stored so the runtime never
--                         re-parses names. e.g.
--                         {"Wattage":"50-110W","Lift":false,"Controls":true,"Relocate":false}
--
-- A variant just resolves to an existing products_services.id at pick time, so
-- quote_lines / job_lines / purchase_orders are untouched.

ALTER TABLE products_services ADD COLUMN IF NOT EXISTS variant_group_id uuid;
ALTER TABLE products_services ADD COLUMN IF NOT EXISTS variant_group_label text;
ALTER TABLE products_services ADD COLUMN IF NOT EXISTS variant_options jsonb;

-- Group lookups are always scoped by company + group; partial so the index
-- only carries the (few) rows that actually belong to a variant family.
CREATE INDEX IF NOT EXISTS idx_products_services_variant_group
  ON products_services (company_id, variant_group_id)
  WHERE variant_group_id IS NOT NULL;

COMMENT ON COLUMN products_services.variant_group_id IS
  'Rows sharing this id are one variant family, shown as a single picker tile. NULL = ordinary standalone product.';
COMMENT ON COLUMN products_services.variant_options IS
  'Structured option map for this row (parsed once at backfill, never re-parsed at runtime). String values = single-select axis (e.g. Wattage); boolean values = toggle (e.g. Lift).';

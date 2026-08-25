-- An audit area records what was surveyed AND what was sold. It only ever
-- recorded the first half.
--
-- audit_areas carried the wattages, the chosen product, the field notes and
-- the photos — and not one number about price. No unit price, no order
-- quantity, no line total. The money died at this boundary.
--
-- So every path that turns an audit into an estimate had to re-invent it.
-- lenard-save rebuilt each line from the catalogue and then scaled every line
-- by (headline total / catalogue sum) to force the arithmetic to close.
-- LightingAuditDetail and NewLightingAudit each did their own thing. Three
-- answers to one question, and the Cocola audit showed the cost: customer
-- lines at 3.27x the price book, because that scale factor was quietly
-- absorbing a lamp multiplier, rep overrides, per-line discounts and the
-- give-me adders all at once.
--
-- These columns let the area row state what it sold, once, so every conversion
-- reads the same numbers instead of guessing at them.

ALTER TABLE public.audit_areas
  ADD COLUMN IF NOT EXISTS unit_price numeric,
  ADD COLUMN IF NOT EXISTS product_qty numeric,
  ADD COLUMN IF NOT EXISTS line_total numeric,
  ADD COLUMN IF NOT EXISTS retrofit_type text,
  ADD COLUMN IF NOT EXISTS lamps_per_fixture integer,
  ADD COLUMN IF NOT EXISTS priced_per_lamp boolean;

COMMENT ON COLUMN public.audit_areas.unit_price IS
  'Price of one unit of the replacement product, after any rep override and line discount. The price actually quoted, not the catalogue price it started from.';

COMMENT ON COLUMN public.audit_areas.product_qty IS
  'Units of the REPLACEMENT product to order and price. Not fixture_count: they differ only when the product is genuinely sold per lamp, in which case this is fixture_count x lamps_per_fixture.';

COMMENT ON COLUMN public.audit_areas.line_total IS
  'unit_price x product_qty. Stored rather than re-derived so a conversion cannot round it differently.';

COMMENT ON COLUMN public.audit_areas.retrofit_type IS
  'lamp or fixture — what is being replaced. Descriptive only; it must never decide pricing on its own. See priced_per_lamp.';

COMMENT ON COLUMN public.audit_areas.lamps_per_fixture IS
  'Lamps in the fixture being REMOVED. Drives the maintenance/relamping baseline. It does not decide how the replacement is priced.';

COMMENT ON COLUMN public.audit_areas.priced_per_lamp IS
  'True only when the replacement product is itself sold per lamp (e.g. "MID 4L T8 4ft Per Lamp" at $15.50), so multiplying by lamps_per_fixture is correct. False for a whole fixture (e.g. an SMBE highbay at $434.98) — thirty 4-lamp fixtures need thirty highbays, not a hundred and twenty. Defaults to false: absent evidence, never multiply.';

NOTIFY pgrst, 'reload schema';

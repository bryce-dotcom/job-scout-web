-- Extended Service Coverage upsell support
--
-- Two related changes:
--
-- 1. products_services gets pricing-rule columns so products like
--    "Extended Service Coverage Tier A" can carry a percent-of-contract
--    formula (2.5% of contract, floor $250, ceiling $3500) instead of
--    a fixed unit price. The quote editor reads these to auto-fill the
--    line price as the rest of the quote total changes.
--
-- 2. jobs gets two coverage_until dates that summarize ALL of HHH's
--    warranty obligations on this install in a single place. Service
--    visits read these dates to pre-fill parts_coverage / labor_coverage
--    on the child job, so dispatch doesn't have to remember "we sold them
--    Tier B in 2024." If we add another coverage upsell next year, the
--    coverage_until date just gets pushed out further.
--
-- Background: HHH's standard offering is 5 yr parts (DLC-mandated for
-- rebate-eligible fixtures) + 1 yr labor. Tier A adds 1 yr labor.
-- Tier B adds 2 yr labor + 2 yr parts.

ALTER TABLE products_services
  ADD COLUMN IF NOT EXISTS pricing_model text,           -- null = flat unit_price, 'percent_of_contract' = formula
  ADD COLUMN IF NOT EXISTS pricing_percent numeric(6,3), -- e.g. 2.5 means 2.5%
  ADD COLUMN IF NOT EXISTS pricing_floor numeric(12,2),  -- minimum dollar amount
  ADD COLUMN IF NOT EXISTS pricing_ceiling numeric(12,2),-- maximum dollar amount
  ADD COLUMN IF NOT EXISTS labor_coverage_months_added integer,
  ADD COLUMN IF NOT EXISTS parts_coverage_months_added integer;

COMMENT ON COLUMN products_services.pricing_model IS
  'How this product is priced. NULL = flat unit_price (default). ''percent_of_contract'' = computed from the rest of the quote/job total.';
COMMENT ON COLUMN products_services.pricing_percent IS
  'Percent of contract value when pricing_model=''percent_of_contract''. e.g. 2.5 = 2.5%.';
COMMENT ON COLUMN products_services.pricing_floor IS
  'Minimum dollar price after the percent calculation.';
COMMENT ON COLUMN products_services.pricing_ceiling IS
  'Maximum dollar price after the percent calculation.';
COMMENT ON COLUMN products_services.labor_coverage_months_added IS
  'How many months of labor warranty this upsell adds on top of the company default. Read at convert-to-job to bump jobs.labor_coverage_until_date.';
COMMENT ON COLUMN products_services.parts_coverage_months_added IS
  'How many months of parts warranty this upsell adds on top of the company default. Read at convert-to-job to bump jobs.parts_coverage_until_date.';

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS labor_coverage_until_date date,
  ADD COLUMN IF NOT EXISTS parts_coverage_until_date date;

COMMENT ON COLUMN jobs.labor_coverage_until_date IS
  'Date HHH stops covering labor on warranty service calls for this install. Set at convert-to-job from company default (1 yr) + sum(labor_coverage_months_added) on the upsell line items.';
COMMENT ON COLUMN jobs.parts_coverage_until_date IS
  'Date HHH stops covering parts on warranty service calls for this install. Set at convert-to-job from company default (5 yr) + sum(parts_coverage_months_added) on the upsell line items. Note: manufacturer warranty (typically 5 yr per DLC) covers parts for free during its window; HHH only pays parts when the manufacturer warranty has expired but HHH''s extended coverage hasn''t.';

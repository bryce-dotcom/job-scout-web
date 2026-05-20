-- Fix Lenard 22003 numeric_field_overflow on save.
--
-- lighting_audits.payback_months was NUMERIC(5,2) — max 999.99 months
-- (~83 years). Lenard computes payback as (net_cost / annual_savings)
-- × 12, which blows past 999 whenever annual savings are tiny relative
-- to project cost (e.g. minor LED swaps in a low-rate facility).
-- Stripe of edge cases triggered Postgres 22003 and aborted the whole
-- save — losing audit, areas, photos, and signature.
--
-- Widen to NUMERIC(10,2) so any sane / insane / pathological value fits
-- and the save succeeds. A nonsense payback like 9,999 still shows up
-- in reports as a clear "fix your inputs" red flag, but it no longer
-- crashes the write.
ALTER TABLE lighting_audits ALTER COLUMN payback_months TYPE NUMERIC(10,2);

-- Drop the introspection helper we used to locate this — it's done.
DROP FUNCTION IF EXISTS public.find_numeric_5_2_cols();

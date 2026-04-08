-- RMP Express Tool Measure Table lookup support
-- Additive only. Existing prescriptive_measures rows + queries unchanged.
-- Enables Lenard UT to look up the correct per-watt incentive rate for a
-- given (program × business type × controls tier × SBE/non-SBE) without
-- relying on hardcoded constants.

ALTER TABLE prescriptive_measures
  ADD COLUMN IF NOT EXISTS rmp_controls_tier text,       -- 'none' | 'control_ready' | 'nlc' | 'lllc' | 'exterior'
  ADD COLUMN IF NOT EXISTS rmp_business_type text,       -- matches the RMP Express Tool business type dropdown
  ADD COLUMN IF NOT EXISTS rmp_is_sbe boolean,           -- true = Small Business Energy row, false = standard Express
  ADD COLUMN IF NOT EXISTS annual_kwh_per_unit numeric,  -- kWh saved per Watt installed per year (RMP column L)
  ADD COLUMN IF NOT EXISTS incremental_cost_per_unit numeric;  -- RMP's $/W incremental cost (column O)

CREATE INDEX IF NOT EXISTS prescriptive_measures_rmp_lookup_idx
  ON prescriptive_measures(program_id, rmp_is_sbe, rmp_controls_tier, rmp_business_type)
  WHERE rmp_controls_tier IS NOT NULL;

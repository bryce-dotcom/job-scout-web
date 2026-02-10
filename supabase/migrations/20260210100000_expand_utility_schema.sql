-- ============================================================
-- Expand utility schema for multi-trade incentives, eligibility,
-- stacking rules, and detailed rate schedules
-- ============================================================

-- ============================================================
-- 1. utility_programs — program types, eligibility, stacking
-- ============================================================

-- What trade/category this program covers
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS program_category TEXT DEFAULT 'Lighting';

-- More specific delivery mechanism beyond program_type
-- (Prescriptive, Custom, Midstream, Direct Install, SMBE, SBDI)
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS delivery_mechanism TEXT;

-- Eligible business sectors
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS eligible_sectors TEXT[];

-- Eligible building types for AI matching
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS eligible_building_types TEXT[];

-- Demand and usage thresholds
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS min_demand_kw NUMERIC;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS max_demand_kw NUMERIC;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS min_annual_kwh NUMERIC;

-- Documentation and process requirements
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS application_required BOOLEAN DEFAULT false;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS post_inspection_required BOOLEAN DEFAULT false;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS contractor_prequalification BOOLEAN DEFAULT false;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS required_documents TEXT[];

-- Stacking rules
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS stacking_allowed BOOLEAN DEFAULT true;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS stacking_rules TEXT;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS stacking_exclusions TEXT[];

-- Funding and processing
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS funding_status TEXT DEFAULT 'Open';
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS funding_budget NUMERIC;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS processing_time_days INTEGER;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS rebate_payment_method TEXT;

-- Free-text AI guidance
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS program_notes_ai TEXT;

-- Backfill delivery_mechanism from existing program_type
UPDATE utility_programs
SET delivery_mechanism = program_type
WHERE delivery_mechanism IS NULL AND program_type IS NOT NULL;

-- ============================================================
-- 2. incentive_measures — multi-trade measures, richer detail
-- ============================================================

-- What trade this measure belongs to
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS measure_category TEXT DEFAULT 'Lighting';

-- Finer detail (VFD, Rooftop Unit, Walk-in Cooler, LED Tube, etc.)
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS measure_subcategory TEXT;

-- Equipment and installation requirements
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS equipment_requirements TEXT;
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS installation_requirements TEXT;

-- Baseline and replacement descriptions for AI validation
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS baseline_description TEXT;
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS replacement_description TEXT;

-- Useful life and tier
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS useful_life_years INTEGER;
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS tier TEXT;

-- Date range for this specific rate
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS expiration_date DATE;

-- Per-unit and project caps
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS per_unit_cap NUMERIC;
ALTER TABLE incentive_measures ADD COLUMN IF NOT EXISTS project_cap_percent NUMERIC;

-- ============================================================
-- 3. utility_rate_schedules — TOU, seasonal, demand detail
-- ============================================================

-- Rate structure type
ALTER TABLE utility_rate_schedules ADD COLUMN IF NOT EXISTS rate_type TEXT DEFAULT 'Flat';

-- Time-of-use rates
ALTER TABLE utility_rate_schedules ADD COLUMN IF NOT EXISTS peak_rate_per_kwh NUMERIC;
ALTER TABLE utility_rate_schedules ADD COLUMN IF NOT EXISTS off_peak_rate_per_kwh NUMERIC;

-- Seasonal rates
ALTER TABLE utility_rate_schedules ADD COLUMN IF NOT EXISTS summer_rate_per_kwh NUMERIC;
ALTER TABLE utility_rate_schedules ADD COLUMN IF NOT EXISTS winter_rate_per_kwh NUMERIC;

-- Additional charges
ALTER TABLE utility_rate_schedules ADD COLUMN IF NOT EXISTS min_demand_charge NUMERIC;
ALTER TABLE utility_rate_schedules ADD COLUMN IF NOT EXISTS customer_charge NUMERIC;

-- Source document link
ALTER TABLE utility_rate_schedules ADD COLUMN IF NOT EXISTS source_url TEXT;

-- ============================================================
-- 4. Indexes for common AI query patterns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_utility_programs_category
  ON utility_programs(program_category);

CREATE INDEX IF NOT EXISTS idx_utility_programs_funding_status
  ON utility_programs(funding_status);

CREATE INDEX IF NOT EXISTS idx_incentive_measures_category
  ON incentive_measures(measure_category);

CREATE INDEX IF NOT EXISTS idx_incentive_measures_measure_type
  ON incentive_measures(measure_type);

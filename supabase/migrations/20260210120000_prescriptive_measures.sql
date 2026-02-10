-- ============================================================
-- prescriptive_measures — granular line-item incentives
-- from utility prescriptive measure tables
--
-- Relationship:
--   utility_providers → utility_programs → prescriptive_measures
--
-- incentive_measures stays as-is for broad category summaries
-- (used in DataConsoleUtilities panels and AI research import).
-- prescriptive_measures is the detailed lookup table that
-- Lenard and other AI agents use for exact rebate calculations.
-- ============================================================

CREATE TABLE IF NOT EXISTS prescriptive_measures (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  program_id INTEGER REFERENCES utility_programs(id) NOT NULL,

  -- Measure identification
  measure_code TEXT,
  measure_name TEXT NOT NULL,
  measure_category TEXT DEFAULT 'Lighting',
  measure_subcategory TEXT,

  -- Baseline (what's being replaced)
  baseline_equipment TEXT,
  baseline_wattage NUMERIC,
  baseline_lamp_count INTEGER,
  baseline_condition TEXT,

  -- Replacement (what it becomes)
  replacement_equipment TEXT,
  replacement_wattage NUMERIC,
  replacement_lamp_count INTEGER,
  watts_reduced NUMERIC
    GENERATED ALWAYS AS (
      COALESCE(baseline_wattage, 0) - COALESCE(replacement_wattage, 0)
    ) STORED,

  -- Incentive amount
  incentive_amount NUMERIC NOT NULL,
  incentive_unit TEXT NOT NULL DEFAULT 'per_fixture',
  incentive_formula TEXT,
  max_incentive NUMERIC,
  max_project_percent NUMERIC,

  -- Quantity constraints
  min_quantity INTEGER,
  max_quantity INTEGER,

  -- Application context
  location_type TEXT,
  application_type TEXT DEFAULT 'retrofit',
  building_type TEXT,
  hours_requirement INTEGER,

  -- Certification requirements
  dlc_required BOOLEAN DEFAULT false,
  dlc_tier TEXT,
  energy_star_required BOOLEAN DEFAULT false,
  other_certification TEXT,

  -- Validity
  effective_date DATE,
  expiration_date DATE,
  is_active BOOLEAN DEFAULT true,

  -- Source verification
  source_page TEXT,
  source_url TEXT,
  source_notes TEXT,

  -- AI agent guidance
  notes TEXT,
  ai_match_keywords TEXT[],

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_prescriptive_measures_program
  ON prescriptive_measures(program_id);
CREATE INDEX IF NOT EXISTS idx_prescriptive_measures_category
  ON prescriptive_measures(measure_category);
CREATE INDEX IF NOT EXISTS idx_prescriptive_measures_active
  ON prescriptive_measures(program_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_prescriptive_measures_baseline_wattage
  ON prescriptive_measures(baseline_wattage);

-- RLS
ALTER TABLE prescriptive_measures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to prescriptive_measures" ON prescriptive_measures;
CREATE POLICY "Allow all access to prescriptive_measures" ON prescriptive_measures
  FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- utility_forms — forms & documents library for utility programs
--
-- Stores application forms, rebate worksheets, pre-approval forms,
-- checklists, W-9 requirements, and other documents associated
-- with utility programs.
--
-- Status workflow: dev → published (promoted to user library)
-- ============================================================

CREATE TABLE IF NOT EXISTS utility_forms (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  provider_id INTEGER REFERENCES utility_providers(id),
  program_id INTEGER REFERENCES utility_programs(id),

  form_name TEXT NOT NULL,
  form_type TEXT DEFAULT 'Application',
  form_url TEXT,
  form_file TEXT,
  version_year INTEGER,
  is_required BOOLEAN DEFAULT false,
  form_notes TEXT,
  status TEXT DEFAULT 'dev',

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_utility_forms_provider
  ON utility_forms(provider_id);
CREATE INDEX IF NOT EXISTS idx_utility_forms_program
  ON utility_forms(program_id);
CREATE INDEX IF NOT EXISTS idx_utility_forms_status
  ON utility_forms(status);

-- RLS
ALTER TABLE utility_forms ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to utility_forms" ON utility_forms;
CREATE POLICY "Allow all access to utility_forms" ON utility_forms
  FOR ALL USING (true) WITH CHECK (true);

-- Victor Agent: verification_reports and verification_photos tables

-- Verification reports - stores AI verification results for completed jobs
CREATE TABLE IF NOT EXISTS verification_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  job_id INTEGER REFERENCES jobs(id),
  verified_by INTEGER REFERENCES employees(id),
  verification_type TEXT DEFAULT 'completion',
  industry TEXT DEFAULT 'general',
  checklist_items JSONB DEFAULT '[]',
  status TEXT DEFAULT 'pending',
  ai_analysis JSONB,
  score INTEGER,
  grade TEXT,
  summary TEXT,
  issues_found JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Verification photos - stores uploaded photos and per-photo AI analysis
CREATE TABLE IF NOT EXISTS verification_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  verification_id UUID NOT NULL REFERENCES verification_reports(id) ON DELETE CASCADE,
  job_id INTEGER REFERENCES jobs(id),
  file_path TEXT NOT NULL,
  storage_bucket TEXT DEFAULT 'project-documents',
  photo_type TEXT DEFAULT 'general',
  ai_analysis JSONB,
  ai_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_verification_reports_company ON verification_reports(company_id);
CREATE INDEX IF NOT EXISTS idx_verification_reports_job ON verification_reports(job_id);
CREATE INDEX IF NOT EXISTS idx_verification_reports_status ON verification_reports(company_id, status);
CREATE INDEX IF NOT EXISTS idx_verification_photos_verification ON verification_photos(verification_id);

-- RLS
ALTER TABLE verification_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE verification_photos ENABLE ROW LEVEL SECURITY;

-- Permissive policies (matching existing project pattern)
CREATE POLICY "verification_reports_select" ON verification_reports FOR SELECT USING (true);
CREATE POLICY "verification_reports_insert" ON verification_reports FOR INSERT WITH CHECK (true);
CREATE POLICY "verification_reports_update" ON verification_reports FOR UPDATE USING (true);
CREATE POLICY "verification_reports_delete" ON verification_reports FOR DELETE USING (true);

CREATE POLICY "verification_photos_select" ON verification_photos FOR SELECT USING (true);
CREATE POLICY "verification_photos_insert" ON verification_photos FOR INSERT WITH CHECK (true);
CREATE POLICY "verification_photos_update" ON verification_photos FOR UPDATE USING (true);
CREATE POLICY "verification_photos_delete" ON verification_photos FOR DELETE USING (true);

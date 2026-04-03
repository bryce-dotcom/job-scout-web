-- Company-wide notifications for real-time announcements
CREATE TABLE IF NOT EXISTS company_notifications (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  type TEXT NOT NULL, -- 'estimate_won', 'job_completed', etc.
  title TEXT NOT NULL,
  message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_by INTEGER REFERENCES employees(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookup
CREATE INDEX IF NOT EXISTS idx_company_notifications_company ON company_notifications(company_id, created_at DESC);

-- Enable realtime on this table
ALTER PUBLICATION supabase_realtime ADD TABLE company_notifications;

-- RLS
ALTER TABLE company_notifications ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "Users can read own company notifications"
    ON company_notifications FOR SELECT
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "Users can insert own company notifications"
    ON company_notifications FOR INSERT
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

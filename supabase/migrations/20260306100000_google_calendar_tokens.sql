-- Google Calendar OAuth token storage
CREATE TABLE IF NOT EXISTS google_calendar_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id INTEGER NOT NULL REFERENCES companies(id),
  employee_id INTEGER NOT NULL REFERENCES employees(id),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT 'active',
  UNIQUE(employee_id)
);

ALTER TABLE google_calendar_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own tokens" ON google_calendar_tokens
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own tokens" ON google_calendar_tokens
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own tokens" ON google_calendar_tokens
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete own tokens" ON google_calendar_tokens
  FOR DELETE USING (true);

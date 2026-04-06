-- Invoice email delivery tracking via Resend webhooks
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS email_id text,
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_bounce_reason text,
  ADD COLUMN IF NOT EXISTS email_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_clicked_at timestamptz;

CREATE INDEX IF NOT EXISTS invoices_email_id_idx ON invoices(email_id);

-- Full event log for audit trail and multi-event history
CREATE TABLE IF NOT EXISTS email_events (
  id bigserial PRIMARY KEY,
  email_id text NOT NULL,
  event_type text NOT NULL,
  recipient text,
  bounce_reason text,
  raw_payload jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_events_email_id_idx ON email_events(email_id);
CREATE INDEX IF NOT EXISTS email_events_created_at_idx ON email_events(created_at DESC);

ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "email_events read for authenticated"
    ON email_events FOR SELECT
    TO authenticated
    USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

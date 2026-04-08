-- Estimate / formal proposal email delivery tracking (same pattern as invoices)
-- Resend webhook will update these columns via the shared resend-webhook function.
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS email_id text,
  ADD COLUMN IF NOT EXISTS email_status text,
  ADD COLUMN IF NOT EXISTS email_status_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_bounce_reason text,
  ADD COLUMN IF NOT EXISTS email_opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_clicked_at timestamptz;

CREATE INDEX IF NOT EXISTS quotes_email_id_idx ON quotes(email_id);

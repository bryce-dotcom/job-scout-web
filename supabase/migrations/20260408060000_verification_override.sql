-- Admin override columns for Victor verification reports.
-- Keeps an audit trail of the original AI score/grade so we can always
-- see what Victor actually returned vs. what an admin set it to in
-- cases where the system misbehaved.

ALTER TABLE verification_reports
  ADD COLUMN IF NOT EXISTS original_score int,
  ADD COLUMN IF NOT EXISTS original_grade text,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS override_by bigint REFERENCES employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS override_at timestamptz,
  ADD COLUMN IF NOT EXISTS voided boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS verification_reports_override_idx
  ON verification_reports(override_at)
  WHERE override_at IS NOT NULL;

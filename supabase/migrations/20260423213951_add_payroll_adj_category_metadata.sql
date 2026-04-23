-- Add category + metadata JSONB to payroll_adjustments so we can tag
-- admin bonus overrides (category='bonus_override') and store the
-- job_id / employee_id they apply to. Nullable so existing rows stay valid.

ALTER TABLE payroll_adjustments
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB;

COMMENT ON COLUMN payroll_adjustments.category IS
  'Optional tag for adjustment type — e.g. bonus_override when an admin releases a bonus that the Victor gate would have blocked.';
COMMENT ON COLUMN payroll_adjustments.metadata IS
  'Arbitrary JSON payload. For bonus overrides: { job_id, employee_id, blocked_reason, saved_hours, would_have_earned }.';

CREATE INDEX IF NOT EXISTS payroll_adjustments_category_idx
  ON payroll_adjustments(company_id, category)
  WHERE category IS NOT NULL;

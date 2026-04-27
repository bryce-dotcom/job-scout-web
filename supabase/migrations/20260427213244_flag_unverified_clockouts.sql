-- Add review-flag columns to time_clock for payroll review of bypassed entries.
ALTER TABLE public.time_clock
  ADD COLUMN IF NOT EXISTS flagged_for_review BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS review_reason TEXT;

COMMENT ON COLUMN public.time_clock.flagged_for_review IS
  'True when this entry needs payroll/manager review before approval (e.g. closed under buggy verification gate, GPS missing, etc.).';
COMMENT ON COLUMN public.time_clock.review_reason IS
  'Human-readable explanation of why flagged_for_review is true.';

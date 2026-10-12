-- What applying a verdict actually wrote (plain-English lines from
-- lib/verdictApply), so a row Frankie booked on his own can be read back and
-- undone. Status 'auto' = booked by Frankie under settings.books_autobook.
ALTER TABLE books_verdicts
  ADD COLUMN IF NOT EXISTS applied JSONB,
  ADD COLUMN IF NOT EXISTS applied_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_books_verdicts_company_applied ON books_verdicts(company_id, applied_at DESC);

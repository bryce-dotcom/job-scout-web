-- Reuse utility_invoices for warranty / manufacturer claims so the existing
-- AR pipeline (totals, alerts, payment recording) just works for both
-- "utility owes us a rebate" and "manufacturer owes us reimbursement for
-- warranty parts." A single new column distinguishes the two so the UI can
-- relabel appropriately.

ALTER TABLE utility_invoices
  ADD COLUMN IF NOT EXISTS claim_type TEXT DEFAULT 'utility_incentive';

COMMENT ON COLUMN utility_invoices.claim_type IS
  'utility_incentive (default — utility owes us a lighting rebate)
   | manufacturer_warranty (manufacturer owes us reimbursement for warranty parts/labor)
   | other (free-form claim against a 3rd party)';

UPDATE utility_invoices
  SET claim_type = 'utility_incentive'
  WHERE claim_type IS NULL;

CREATE INDEX IF NOT EXISTS idx_utility_invoices_claim_type
  ON utility_invoices (claim_type);

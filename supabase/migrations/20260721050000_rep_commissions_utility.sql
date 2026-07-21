-- Extend the frozen rep-commission ledger to cover utility + processor
-- commissions, so those become stageable ("Add to current Payroll") too instead
-- of auto-including. utility_commission = a rep's services/goods rate on a paid
-- utility incentive for a job they own; processor_commission = the processor's
-- rate on incentives they process. Both are earned when the utility invoice is
-- paid, keyed by the utility invoice (no standard payment row).

ALTER TABLE rep_commissions DROP CONSTRAINT IF EXISTS rep_commissions_kind_check;
ALTER TABLE rep_commissions ADD CONSTRAINT rep_commissions_kind_check
  CHECK (kind IN ('services','goods','processor','utility'));

ALTER TABLE rep_commissions ADD COLUMN IF NOT EXISTS utility_invoice_id BIGINT;

NOTIFY pgrst, 'reload schema';

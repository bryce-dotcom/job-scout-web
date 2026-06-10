-- Two real-world deductions (whole-project discount + utility incentive)
-- were fighting over the single discount_applied column (Alayda,
-- INV-MQ8C2T1X: $971 project discount + $3,294 incentive — only one fit).
--
-- discount_applied STAYS the total deduction, so every consumer of
-- "amount - discount_applied" (Books, portal balance, Stripe charges,
-- Frankie collections) is unaffected. project_discount records how much
-- of that total is a whole-project discount; the remainder is the
-- incentive and/or rolled-in deposit credit (deposit identified via
-- parent_invoice_id, same as before).
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS project_discount numeric;

COMMENT ON COLUMN invoices.project_discount IS
  'Portion of discount_applied that is a whole-project discount (display breakout). discount_applied remains the TOTAL deduction used in balance math.';

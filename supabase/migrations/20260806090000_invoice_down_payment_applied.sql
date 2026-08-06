-- Break the down payment out of discount_applied on the invoice.
--
-- discount_applied is the TOTAL deduction. invoiceDiscountBreakout splits it
-- into deposit credit + project discount + "everything else = utility
-- incentive". A down payment therefore landed inside the incentive, and the
-- PDF for JOB-MQZGV1FN printed "Utility Incentive -$15,602.85" when the
-- incentive was $13,652.85 and the remaining $1,950 was the down payment.
-- The customer could not follow the arithmetic.
--
-- Mirrors project_discount: a nullable breakout column that says how much of
-- discount_applied came from this source, so the document can name each
-- deduction instead of merging them.

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS down_payment_applied numeric(12,2);

DO $$ BEGIN
  ALTER TABLE invoices
    ADD CONSTRAINT invoices_down_payment_applied_nonneg
    CHECK (down_payment_applied IS NULL OR down_payment_applied >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN invoices.down_payment_applied IS
  'Portion of discount_applied that is a down payment credit. Breakout only — discount_applied remains the total. Never records WHO funded it; that is internal to the job.';

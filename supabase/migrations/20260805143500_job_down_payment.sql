-- Down payment taken on a job.
--
-- A rep often leaves a walkthrough with a cheque in hand and there is no
-- invoice yet, so the money needs somewhere to live on the job itself.
--
-- down_payment_funded_by is the INTERNAL distinction:
--   'customer' — real money in. Reduces the balance and counts as revenue.
--   'jobscout' — JobScout covered it to win the job. A discount: reduces the
--                balance, no money collected, cost lands on job margin.
-- The customer's invoice shows the credit either way and never says which.
--
-- Default 'customer': an amount entered without a flag is a real payment.
-- Defaulting the other way would silently understate revenue.

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS down_payment_amount    numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS down_payment_funded_by text          NOT NULL DEFAULT 'customer',
  ADD COLUMN IF NOT EXISTS down_payment_method    text,
  ADD COLUMN IF NOT EXISTS down_payment_date      date,
  ADD COLUMN IF NOT EXISTS down_payment_notes     text;

DO $$ BEGIN
  ALTER TABLE jobs
    ADD CONSTRAINT jobs_down_payment_funded_by_check
    CHECK (down_payment_funded_by IN ('customer', 'jobscout'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE jobs
    ADD CONSTRAINT jobs_down_payment_amount_nonneg
    CHECK (down_payment_amount >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

COMMENT ON COLUMN jobs.down_payment_funded_by IS
  'INTERNAL ONLY: customer = real money collected; jobscout = discount funded by us. Never shown on customer documents.';

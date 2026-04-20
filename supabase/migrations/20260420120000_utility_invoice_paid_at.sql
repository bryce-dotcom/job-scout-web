-- Utility incentive payment date tracking.
-- Today, "Mark as Paid" only flips payment_status — there's no record of WHEN
-- the utility actually paid out. Commission timing relies on this date, so
-- without it commissions key off whatever week the button happened to be
-- clicked. Add a paid_at timestamp + an editable date input on the page.

ALTER TABLE public.utility_invoices
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- Backfill: anything already marked Paid gets its updated_at as a best-guess
-- so existing commission calculations don't suddenly see NULL.
UPDATE public.utility_invoices
SET paid_at = updated_at
WHERE payment_status = 'Paid' AND paid_at IS NULL;

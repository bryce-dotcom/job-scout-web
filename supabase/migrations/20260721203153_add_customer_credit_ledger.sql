-- Trade-credit ledger — credit HHH holds WITH a trade partner.
--
-- Christopher does trade work for e.g. Haven Light, accruing credit HHH can
-- draw down later. SUM(amount) per customer = current credit balance:
--   (+) amount  = credit earned / added
--   (-) amount  = credit applied to an invoice (or otherwise used)
--
-- "Apply to an invoice" also inserts a normal payments row (method
-- 'Trade Credit') so the invoice's existing balance / payment_status logic
-- picks it up untouched; payment_id links the two for reversal.

CREATE TABLE IF NOT EXISTS public.customer_credits (
  id          bigserial PRIMARY KEY,
  company_id  integer     NOT NULL,
  customer_id integer     NOT NULL,
  amount      numeric     NOT NULL,
  kind        text        NOT NULL DEFAULT 'earned',  -- earned | applied | adjustment
  note        text,
  invoice_id  integer,                                -- set when applied to an invoice
  payment_id  integer,                                -- the payments row an 'applied' entry created
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_credits_cust
  ON public.customer_credits (company_id, customer_id);

COMMENT ON TABLE public.customer_credits IS
  'Trade-credit ledger: credit HHH holds with a trade partner. SUM(amount) per customer = balance. (+) earned, (-) applied/used.';

ALTER TABLE public.customer_credits ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "customer_credits company access" ON public.customer_credits
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

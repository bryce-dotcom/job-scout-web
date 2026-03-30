-- Add Stripe customer ID to customers table
ALTER TABLE customers ADD COLUMN IF NOT EXISTS stripe_customer_id text;

-- Saved payment methods table
CREATE TABLE IF NOT EXISTS customer_payment_methods (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL,
  customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  stripe_payment_method_id TEXT NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  brand TEXT,
  last_four TEXT,
  exp_month INTEGER,
  exp_year INTEGER,
  is_default BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ
);

-- RLS
ALTER TABLE customer_payment_methods ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "customer_payment_methods_all" ON customer_payment_methods
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cpm_customer ON customer_payment_methods(customer_id);
CREATE INDEX IF NOT EXISTS idx_cpm_company ON customer_payment_methods(company_id);

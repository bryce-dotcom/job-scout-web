-- Plaid connected bank accounts
CREATE TABLE IF NOT EXISTS connected_accounts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  plaid_item_id TEXT,
  plaid_account_id TEXT UNIQUE,
  institution_name TEXT,
  institution_id TEXT,
  account_name TEXT,
  account_type TEXT,
  account_subtype TEXT,
  mask TEXT,
  current_balance DECIMAL,
  available_balance DECIMAL,
  currency_code TEXT DEFAULT 'USD',
  status TEXT DEFAULT 'active',
  last_synced TIMESTAMPTZ,
  sync_cursor TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Plaid synced transactions
CREATE TABLE IF NOT EXISTS plaid_transactions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  connected_account_id INT REFERENCES connected_accounts(id),
  plaid_transaction_id TEXT UNIQUE,
  amount DECIMAL,
  date DATE,
  authorized_date DATE,
  merchant_name TEXT,
  name TEXT,
  plaid_category TEXT[],
  plaid_personal_finance_category TEXT,
  ai_category TEXT,
  ai_tax_category TEXT,
  ai_form_1065_line TEXT,
  ai_confidence DECIMAL,
  user_category TEXT,
  user_tax_category TEXT,
  confirmed BOOLEAN DEFAULT false,
  is_transfer BOOLEAN DEFAULT false,
  notes TEXT,
  pending BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- AI category rules (learns from user corrections)
CREATE TABLE IF NOT EXISTS category_rules (
  id SERIAL PRIMARY KEY,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  merchant_pattern TEXT,
  assigned_category TEXT,
  assigned_tax_category TEXT,
  match_type TEXT DEFAULT 'contains',
  priority INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add connected_account_id FK to existing bank_accounts table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'bank_accounts' AND column_name = 'connected_account_id'
  ) THEN
    ALTER TABLE bank_accounts ADD COLUMN connected_account_id INT REFERENCES connected_accounts(id);
  END IF;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS idx_connected_accounts_company ON connected_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_company ON plaid_transactions(company_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_date ON plaid_transactions(date);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_plaid_id ON plaid_transactions(plaid_transaction_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_merchant ON plaid_transactions(merchant_name);
CREATE INDEX IF NOT EXISTS idx_category_rules_company ON category_rules(company_id);

-- RLS
ALTER TABLE connected_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE plaid_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE category_rules ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "connected_accounts_all" ON connected_accounts USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "plaid_transactions_all" ON plaid_transactions USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY "category_rules_all" ON category_rules USING (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

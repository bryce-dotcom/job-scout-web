-- Books Page - Financial Dashboard Tables
-- Bank accounts, expense categories, manual expenses, assets, and liabilities

-- Bank Accounts
CREATE TABLE IF NOT EXISTS bank_accounts (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  name TEXT,
  account_type TEXT DEFAULT 'checking',
  current_balance DECIMAL DEFAULT 0,
  last_synced TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Expense Categories
CREATE TABLE IF NOT EXISTS expense_categories (
  id SERIAL PRIMARY KEY,
  company_id INTEGER,
  name TEXT,
  icon TEXT DEFAULT '📄',
  color TEXT DEFAULT '#6b7280',
  type TEXT DEFAULT 'expense',
  sort_order INTEGER DEFAULT 0
);

-- Manual Expenses
CREATE TABLE IF NOT EXISTS manual_expenses (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  description TEXT,
  amount DECIMAL,
  expense_date DATE,
  vendor TEXT,
  category_id INTEGER REFERENCES expense_categories(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Assets
CREATE TABLE IF NOT EXISTS assets (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  name TEXT,
  asset_type TEXT,
  purchase_price DECIMAL,
  current_value DECIMAL,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Liabilities
CREATE TABLE IF NOT EXISTS liabilities (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id),
  name TEXT,
  liability_type TEXT,
  current_balance DECIMAL,
  monthly_payment DECIMAL,
  lender TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE liabilities ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist and create new ones
DO $$
BEGIN
    DROP POLICY IF EXISTS "all_access" ON bank_accounts;
    DROP POLICY IF EXISTS "all_access" ON expense_categories;
    DROP POLICY IF EXISTS "all_access" ON manual_expenses;
    DROP POLICY IF EXISTS "all_access" ON assets;
    DROP POLICY IF EXISTS "all_access" ON liabilities;
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

CREATE POLICY "all_access" ON bank_accounts FOR ALL USING (true);
CREATE POLICY "all_access" ON expense_categories FOR ALL USING (true);
CREATE POLICY "all_access" ON manual_expenses FOR ALL USING (true);
CREATE POLICY "all_access" ON assets FOR ALL USING (true);
CREATE POLICY "all_access" ON liabilities FOR ALL USING (true);

-- Seed default expense categories (only if table is empty)
INSERT INTO expense_categories (name, icon, color, type, sort_order)
SELECT * FROM (VALUES
  ('Fuel', '⛽', '#f97316', 'expense', 1),
  ('Supplies', '📦', '#3b82f6', 'expense', 2),
  ('Equipment', '🔧', '#8b5cf6', 'expense', 3),
  ('Marketing', '📣', '#ec4899', 'expense', 4),
  ('Insurance', '🛡️', '#06b6d4', 'expense', 5),
  ('Utilities', '💡', '#eab308', 'expense', 6),
  ('Payroll', '💰', '#22c55e', 'expense', 7),
  ('Other', '📄', '#6b7280', 'expense', 8),
  ('Sales', '💵', '#22c55e', 'income', 10),
  ('Service', '🔨', '#3b82f6', 'income', 11),
  ('Other Income', '💰', '#10b981', 'income', 12)
) AS v(name, icon, color, type, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM expense_categories LIMIT 1);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bank_accounts_company ON bank_accounts(company_id);
CREATE INDEX IF NOT EXISTS idx_manual_expenses_company ON manual_expenses(company_id);
CREATE INDEX IF NOT EXISTS idx_manual_expenses_date ON manual_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_assets_company ON assets(company_id);
CREATE INDEX IF NOT EXISTS idx_liabilities_company ON liabilities(company_id);

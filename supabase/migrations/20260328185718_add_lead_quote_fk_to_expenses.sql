-- Add lead_id and quote_id foreign key columns to expenses table
-- These allow tracking which lead/quote an expense originated from

ALTER TABLE expenses ADD COLUMN IF NOT EXISTS lead_id INTEGER REFERENCES leads(id) ON DELETE SET NULL;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS quote_id INTEGER REFERENCES quotes(id) ON DELETE SET NULL;

-- Add indexes for the new FK columns
CREATE INDEX IF NOT EXISTS idx_expenses_lead_id ON expenses(lead_id);
CREATE INDEX IF NOT EXISTS idx_expenses_quote_id ON expenses(quote_id);

-- Add vendor column if missing (used by expense inserts across app)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS vendor TEXT;

-- Add notes column if missing (used by Expenses.jsx form)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS notes TEXT;

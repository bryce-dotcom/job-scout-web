-- Job Costing: Link plaid transactions to jobs, link expenses to receipts

-- Add job prediction columns to plaid_transactions
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS job_id INTEGER REFERENCES jobs(id);
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS ai_job_id INTEGER REFERENCES jobs(id);
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS ai_job_confidence DECIMAL;
ALTER TABLE plaid_transactions ADD COLUMN IF NOT EXISTS expense_id INTEGER REFERENCES expenses(id);

-- Add reconciliation + receipt columns to expenses
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS plaid_transaction_id INTEGER REFERENCES plaid_transactions(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS receipt_storage_path TEXT;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_job_id ON plaid_transactions(job_id);
CREATE INDEX IF NOT EXISTS idx_plaid_transactions_expense_id ON plaid_transactions(expense_id);
CREATE INDEX IF NOT EXISTS idx_expenses_plaid_transaction_id ON expenses(plaid_transaction_id);

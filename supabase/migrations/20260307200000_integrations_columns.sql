-- QuickBooks sync columns on customers and invoices
ALTER TABLE customers ADD COLUMN IF NOT EXISTS qb_customer_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS qb_sync_at TIMESTAMPTZ;

ALTER TABLE invoices ADD COLUMN IF NOT EXISTS qb_invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS qb_sync_at TIMESTAMPTZ;

-- Index for quick QB ID lookups during sync
CREATE INDEX IF NOT EXISTS idx_customers_qb_id ON customers(company_id, qb_customer_id) WHERE qb_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_qb_id ON invoices(company_id, qb_invoice_id) WHERE qb_invoice_id IS NOT NULL;

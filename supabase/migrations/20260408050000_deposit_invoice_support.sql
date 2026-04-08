-- Deposit / progress / final invoice typing.
-- All existing rows default to 'standard' so nothing changes for them.
-- Adds a parent_invoice_id pointer so a final invoice can reference the
-- deposit it replaces (for "Deposit Applied" credit lines later).

ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS invoice_type text NOT NULL DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS parent_invoice_id bigint REFERENCES invoices(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS invoices_invoice_type_idx ON invoices(invoice_type);
CREATE INDEX IF NOT EXISTS invoices_parent_idx ON invoices(parent_invoice_id);

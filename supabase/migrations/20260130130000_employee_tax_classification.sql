-- Employee Tax Classification
-- W2 (employee) or 1099 (contractor)

ALTER TABLE employees ADD COLUMN IF NOT EXISTS tax_classification TEXT DEFAULT 'W2';

-- Create index for filtering by tax classification
CREATE INDEX IF NOT EXISTS idx_employees_tax_classification ON employees(tax_classification);

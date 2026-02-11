-- Prevent duplicate AI module entries per company
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_modules_unique_per_company
  ON ai_modules(company_id, module_name);

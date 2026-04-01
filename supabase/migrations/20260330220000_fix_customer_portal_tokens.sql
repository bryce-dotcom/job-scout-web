-- Fix customer_portal_tokens: use integer types matching existing schema

-- Drop old table if it exists with wrong types (safe since it's not in production yet)
DROP TABLE IF EXISTS document_approvals;
DROP TABLE IF EXISTS customer_portal_tokens;

-- Portal tokens for public document access
CREATE TABLE IF NOT EXISTS customer_portal_tokens (
  id SERIAL PRIMARY KEY,
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL CHECK (document_type IN ('estimate', 'invoice')),
  document_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  customer_id INTEGER REFERENCES customers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN DEFAULT false,
  accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0
);

-- Approval audit trail (ESIGN Act compliant)
CREATE TABLE IF NOT EXISTS document_approvals (
  id SERIAL PRIMARY KEY,
  document_type TEXT NOT NULL,
  document_id INTEGER NOT NULL,
  company_id INTEGER NOT NULL REFERENCES companies(id),
  portal_token_id INTEGER REFERENCES customer_portal_tokens(id),
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  approver_name TEXT,
  approver_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  document_hash TEXT NOT NULL
);

-- Columns on existing tables (safe IF NOT EXISTS)
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS portal_token TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS portal_token TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_to_email TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_place_id TEXT;

-- RLS policies
ALTER TABLE customer_portal_tokens ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "company_access" ON customer_portal_tokens FOR ALL
    USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt() ->> 'email' AND active = true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE document_approvals ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "company_access" ON document_approvals FOR ALL
    USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt() ->> 'email' AND active = true));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

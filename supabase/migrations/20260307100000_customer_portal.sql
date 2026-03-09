-- Customer Portal: tokens, approvals, and supporting columns

-- Portal tokens for public document access
CREATE TABLE IF NOT EXISTS customer_portal_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token UUID UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL CHECK (document_type IN ('estimate', 'invoice')),
  document_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  customer_id UUID REFERENCES customers(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  is_revoked BOOLEAN DEFAULT false,
  accessed_at TIMESTAMPTZ,
  access_count INTEGER DEFAULT 0
);

-- Approval audit trail (ESIGN Act compliant)
CREATE TABLE IF NOT EXISTS document_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_type TEXT NOT NULL,
  document_id UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES companies(id),
  portal_token_id UUID REFERENCES customer_portal_tokens(id),
  approved_at TIMESTAMPTZ DEFAULT NOW(),
  approver_name TEXT,
  approver_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  document_hash TEXT NOT NULL
);

-- Columns on existing tables
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS portal_token TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS portal_token TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS sent_to_email TEXT;
ALTER TABLE companies ADD COLUMN IF NOT EXISTS google_place_id TEXT;

-- RLS policies
ALTER TABLE customer_portal_tokens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access" ON customer_portal_tokens FOR ALL
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt() ->> 'email' AND active = true));

ALTER TABLE document_approvals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "company_access" ON document_approvals FOR ALL
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt() ->> 'email' AND active = true));

-- Fix customer_portal_tokens RLS to match the pattern used by all other
-- company-scoped tables. The original policy used a subquery against
-- employees with auth.jwt() ->> 'email' which fails for users whose JWT
-- doesn't carry an email claim, breaking "Send Proposal" / "Send Invoice"
-- which both insert into this table.
--
-- Use get_user_company_id() like quotes, invoices, jobs, etc. — this is
-- the canonical pattern and works for all authenticated users.
-- Also explicitly add WITH CHECK so INSERT/UPDATE work, not just SELECT.

DROP POLICY IF EXISTS "company_access" ON customer_portal_tokens;
CREATE POLICY "Company isolation" ON customer_portal_tokens
  FOR ALL
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

DROP POLICY IF EXISTS "company_access" ON document_approvals;
CREATE POLICY "Company isolation" ON document_approvals
  FOR ALL
  USING (company_id = get_user_company_id())
  WITH CHECK (company_id = get_user_company_id());

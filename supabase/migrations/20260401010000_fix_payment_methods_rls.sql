-- Fix RLS policy on customer_payment_methods to restrict by company
DROP POLICY IF EXISTS "customer_payment_methods_all" ON customer_payment_methods;

DO $$ BEGIN
  CREATE POLICY "company_access" ON customer_payment_methods FOR ALL
    USING (company_id IN (
      SELECT company_id FROM employees
      WHERE email = auth.jwt() ->> 'email' AND active = true
    ));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

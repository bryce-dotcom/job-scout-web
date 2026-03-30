-- Fix broken RLS policy on product_components
-- The original policy used JWT company_id claim which doesn't exist in this app
DROP POLICY IF EXISTS "product_components_company_isolation" ON product_components;

-- Match the pattern used by all other tables in this app
DO $$ BEGIN
  CREATE POLICY "product_components_all" ON product_components
    FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

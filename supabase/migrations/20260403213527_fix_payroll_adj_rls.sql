-- Fix RLS policy to match existing patterns (permissive, app enforces company_id filtering)
DROP POLICY IF EXISTS "payroll_adjustments_company" ON payroll_adjustments;

DO $$ BEGIN
  CREATE POLICY "payroll_adjustments_all" ON payroll_adjustments FOR ALL USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

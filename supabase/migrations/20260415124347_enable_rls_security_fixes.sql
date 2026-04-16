-- Enable RLS on 4 tables flagged by Supabase Security Advisor

-- 1. location_pings — has company_id, company isolation
ALTER TABLE location_pings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Company isolation" ON location_pings
    FOR ALL USING (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. dougie_corrections — has company_id, company isolation
ALTER TABLE dougie_corrections ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Company isolation" ON dougie_corrections
    FOR ALL USING (company_id = get_user_company_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 3. form_registry — shared reference data (no company_id)
--    All authenticated users can read; only service role should write.
ALTER TABLE form_registry ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Authenticated read access" ON form_registry
    FOR SELECT USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 4. document_packages — no company_id (uses dealer_id)
--    Authenticated users can read/write.
ALTER TABLE document_packages ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "Authenticated access" ON document_packages
    FOR ALL USING (auth.role() = 'authenticated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

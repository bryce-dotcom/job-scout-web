-- Add open RLS policies for utility/rebate tables
-- These tables have RLS enabled but no policies, blocking all anon key operations

-- utility_providers
DROP POLICY IF EXISTS "Allow all access to utility_providers" ON utility_providers;
CREATE POLICY "Allow all access to utility_providers" ON utility_providers
  FOR ALL USING (true) WITH CHECK (true);

-- utility_programs
DROP POLICY IF EXISTS "Allow all access to utility_programs" ON utility_programs;
CREATE POLICY "Allow all access to utility_programs" ON utility_programs
  FOR ALL USING (true) WITH CHECK (true);

-- rebate_rates
DROP POLICY IF EXISTS "Allow all access to rebate_rates" ON rebate_rates;
CREATE POLICY "Allow all access to rebate_rates" ON rebate_rates
  FOR ALL USING (true) WITH CHECK (true);

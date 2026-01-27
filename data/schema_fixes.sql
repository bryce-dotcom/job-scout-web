-- Job Scout Schema Fixes
-- Run in Supabase SQL Editor
-- Generated: January 26, 2026

-- =====================================================
-- BOOKINGS TABLE (Create if not exists + add columns)
-- =====================================================
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  booking_id TEXT,
  business_unit TEXT,
  customer_name TEXT,
  email TEXT,
  phone TEXT,
  address TEXT,
  service_type TEXT,
  preferred_date DATE,
  status TEXT DEFAULT 'Pending',
  suggested_slots TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "bookings_select" ON bookings FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "bookings_insert" ON bookings FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "bookings_update" ON bookings FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "bookings_delete" ON bookings FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- CUSTOMERS TABLE - Add missing columns
-- =====================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS customer_id TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS preferred_contact TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS tags TEXT[];
ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_name TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_email TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_phone TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS secondary_contact_role TEXT;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS marketing_opt_in BOOLEAN DEFAULT true;
ALTER TABLE customers ADD COLUMN IF NOT EXISTS business_name TEXT;

-- =====================================================
-- EMPLOYEES TABLE - Add missing columns
-- =====================================================
ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_id TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS headshot TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gusto_uuid TEXT;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS gps_opt_in BOOLEAN DEFAULT false;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS business_unit TEXT;

-- =====================================================
-- LEADS TABLE - Add missing columns
-- =====================================================
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lead_id TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS quote_generated BOOLEAN DEFAULT false;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS business_name TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ;

-- =====================================================
-- LEAD_PAYMENTS TABLE - Add missing columns
-- =====================================================
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS lead_source TEXT;
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS payment_status TEXT DEFAULT 'Pending';
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS date_created TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS setter_pay_per_appointment DECIMAL(10,2);
ALTER TABLE lead_payments ADD COLUMN IF NOT EXISTS marketer_pay_per_appointment DECIMAL(10,2);

-- =====================================================
-- APPOINTMENTS TABLE - Add missing columns
-- =====================================================
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS meeting_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS calendar_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS event_id TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS edit_link TEXT;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ;

-- =====================================================
-- COMMUNICATIONS_LOG TABLE - Add missing columns
-- =====================================================
ALTER TABLE communications_log ADD COLUMN IF NOT EXISTS communication_id TEXT;
ALTER TABLE communications_log ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE communications_log ADD COLUMN IF NOT EXISTS trigger TEXT;
ALTER TABLE communications_log ADD COLUMN IF NOT EXISTS recipient TEXT;
ALTER TABLE communications_log ADD COLUMN IF NOT EXISTS response TEXT;

-- =====================================================
-- CUSTOM_FORMS TABLE (Create if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS custom_forms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  form_id TEXT,
  business_unit TEXT,
  job_id UUID REFERENCES jobs(id),
  field_name TEXT,
  field_value TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE custom_forms ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "custom_forms_select" ON custom_forms FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "custom_forms_insert" ON custom_forms FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "custom_forms_update" ON custom_forms FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "custom_forms_delete" ON custom_forms FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- EXPENSES TABLE - Add missing columns
-- =====================================================
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS expense_id TEXT;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS business_unit TEXT;

-- =====================================================
-- FLEET TABLE - Add missing columns
-- =====================================================
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS asset_id TEXT;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS last_pm_date DATE;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS next_pm_due DATE;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS mileage_hours DECIMAL(12,2);
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS repair_id TEXT;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS repair_date DATE;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS repair_description TEXT;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS repair_cost DECIMAL(10,2);
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS rental_id TEXT;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS rental_start_date DATE;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS rental_end_date DATE;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS rental_customer TEXT;
ALTER TABLE fleet ADD COLUMN IF NOT EXISTS rental_rate DECIMAL(10,2);

-- =====================================================
-- FLEET_MAINTENANCE TABLE - Add missing columns
-- =====================================================
ALTER TABLE fleet_maintenance ADD COLUMN IF NOT EXISTS maintenance_id TEXT;
ALTER TABLE fleet_maintenance ADD COLUMN IF NOT EXISTS mileage_hours DECIMAL(12,2);

-- =====================================================
-- FLEET_RENTALS TABLE - Add missing columns
-- =====================================================
ALTER TABLE fleet_rentals ADD COLUMN IF NOT EXISTS rental_id TEXT;

-- =====================================================
-- HELPERS TABLE (Create if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS helpers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  list_name TEXT,
  dynamic_list TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE helpers ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "helpers_select" ON helpers FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "helpers_insert" ON helpers FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "helpers_update" ON helpers FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "helpers_delete" ON helpers FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- INVENTORY TABLE - Add missing columns
-- =====================================================
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS item_id TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS min_quantity INTEGER DEFAULT 0;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS available INTEGER;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS location TEXT;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS last_updated TIMESTAMPTZ;
ALTER TABLE inventory ADD COLUMN IF NOT EXISTS ordering_trigger TEXT;

-- =====================================================
-- INCENTIVES TABLE - Add missing columns
-- =====================================================
ALTER TABLE incentives ADD COLUMN IF NOT EXISTS incentive_id TEXT;
ALTER TABLE incentives ADD COLUMN IF NOT EXISTS incentive_amount DECIMAL(10,2);
ALTER TABLE incentives ADD COLUMN IF NOT EXISTS utility_name TEXT;

-- =====================================================
-- INVOICES TABLE - Add missing columns
-- =====================================================
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS invoice_id TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS discount_applied DECIMAL(10,2);
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS credit_card_fee DECIMAL(10,2);

-- =====================================================
-- JOBS TABLE - Add missing columns
-- =====================================================
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_id TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS allotted_time_hours DECIMAL(8,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS assigned_team TEXT[];
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS time_tracked DECIMAL(8,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS recurrence TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS expense_amount DECIMAL(10,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS job_address TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gps_location TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS profit_margin DECIMAL(5,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS incentive_amount DECIMAL(10,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS utility_name TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS incentive_status TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS utility_incentive DECIMAL(10,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2);
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS discount_description TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS work_order_pdf TEXT;
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS generate_work_order BOOLEAN DEFAULT false;

-- =====================================================
-- JOB_LINES TABLE - Add missing columns
-- =====================================================
ALTER TABLE job_lines ADD COLUMN IF NOT EXISTS job_line_id TEXT;

-- =====================================================
-- PRODUCTS_SERVICES TABLE - Add missing columns
-- =====================================================
ALTER TABLE products_services ADD COLUMN IF NOT EXISTS item_id TEXT;
ALTER TABLE products_services ADD COLUMN IF NOT EXISTS image TEXT;
ALTER TABLE products_services ADD COLUMN IF NOT EXISTS allotted_time_hours DECIMAL(6,2);

-- =====================================================
-- QUOTES TABLE - Add missing columns
-- =====================================================
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_id TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS contract_required BOOLEAN DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS contract_signed BOOLEAN DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_1 DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS follow_up_2 DATE;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS temp_customer_id TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS temp_job_id TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS job_title TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS utility_incentive DECIMAL(10,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount DECIMAL(10,2);
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS discount_description TEXT;

-- =====================================================
-- QUOTE_LINES TABLE - Add missing columns
-- =====================================================
ALTER TABLE quote_lines ADD COLUMN IF NOT EXISTS line_id TEXT;

-- =====================================================
-- REPORTS TABLE (Create if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metric TEXT,
  business_unit TEXT,
  value DECIMAL(15,2),
  category TEXT,
  date DATE,
  profit DECIMAL(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "reports_select" ON reports FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "reports_insert" ON reports FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "reports_update" ON reports FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "reports_delete" ON reports FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- ROUTES TABLE - Add missing columns
-- =====================================================
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_id TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS team TEXT;
ALTER TABLE routes ADD COLUMN IF NOT EXISTS job_ids TEXT[];
ALTER TABLE routes ADD COLUMN IF NOT EXISTS route_order INTEGER[];
ALTER TABLE routes ADD COLUMN IF NOT EXISTS total_distance DECIMAL(10,2);
ALTER TABLE routes ADD COLUMN IF NOT EXISTS total_time DECIMAL(8,2);

-- =====================================================
-- SALES_PIPELINE TABLE - Add missing columns
-- =====================================================
ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS lead_id TEXT;
ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS quote_sent_date DATE;
ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS quote_status TEXT;
ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS contract_required BOOLEAN DEFAULT false;
ALTER TABLE sales_pipeline ADD COLUMN IF NOT EXISTS contract_signed BOOLEAN DEFAULT false;

-- =====================================================
-- SEARCH_INDEX TABLE (Create if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS search_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  business_unit TEXT,
  type TEXT,
  name TEXT,
  status TEXT,
  salesperson TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE search_index ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "search_index_select" ON search_index FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "search_index_insert" ON search_index FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "search_index_update" ON search_index FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "search_index_delete" ON search_index FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- TIME_LOG TABLE - Add missing columns
-- =====================================================
ALTER TABLE time_log ADD COLUMN IF NOT EXISTS time_log_id TEXT;
ALTER TABLE time_log ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE time_log ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE time_log ADD COLUMN IF NOT EXISTS gusto_synced BOOLEAN DEFAULT false;
ALTER TABLE time_log ADD COLUMN IF NOT EXISTS is_clocked_in BOOLEAN DEFAULT false;

-- =====================================================
-- UTILITY_INVOICES TABLE - Add missing columns
-- =====================================================
ALTER TABLE utility_invoices ADD COLUMN IF NOT EXISTS utility_invoice_id TEXT;
ALTER TABLE utility_invoices ADD COLUMN IF NOT EXISTS business_unit TEXT;
ALTER TABLE utility_invoices ADD COLUMN IF NOT EXISTS utility_name TEXT;

-- =====================================================
-- AI_SESSIONS TABLE (Create if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  session_id TEXT,
  user_email TEXT,
  started TIMESTAMPTZ DEFAULT NOW(),
  last_activity TIMESTAMPTZ,
  status TEXT DEFAULT 'active',
  current_module TEXT,
  context_json JSONB DEFAULT '{}',
  pending_action TEXT,
  pending_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "ai_sessions_select" ON ai_sessions FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "ai_sessions_insert" ON ai_sessions FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "ai_sessions_update" ON ai_sessions FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "ai_sessions_delete" ON ai_sessions FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- AI_MESSAGES TABLE (Create if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  message_id TEXT,
  session_id UUID REFERENCES ai_sessions(id),
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  role TEXT,
  content TEXT,
  intent_detected TEXT,
  module_used TEXT,
  entities_json JSONB,
  actions_taken TEXT[],
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "ai_messages_select" ON ai_messages FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "ai_messages_insert" ON ai_messages FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "ai_messages_update" ON ai_messages FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "ai_messages_delete" ON ai_messages FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- AI_MODULES TABLE (Create if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_modules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_id TEXT,
  module_name TEXT,
  description TEXT,
  trigger_keywords TEXT[],
  icon TEXT,
  status TEXT DEFAULT 'active',
  tables_used TEXT[],
  system_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_modules ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "ai_modules_select" ON ai_modules FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "ai_modules_insert" ON ai_modules FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "ai_modules_update" ON ai_modules FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "ai_modules_delete" ON ai_modules FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- LIGHTING_AUDITS TABLE - Add missing columns
-- =====================================================
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS audit_id TEXT;
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES employees(id);
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS electric_rate DECIMAL(8,4);
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS operating_hours DECIMAL(8,2);
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS operating_days INTEGER;
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS total_proposed_watts DECIMAL(12,2);
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS total_fixtures INTEGER;
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS annual_savings_kwh DECIMAL(12,2);
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS annual_savings_dollars DECIMAL(12,2);
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS estimated_rebate DECIMAL(12,2);
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS est_project_cost DECIMAL(12,2);
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS net_cost DECIMAL(12,2);
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS payback_months DECIMAL(8,2);
ALTER TABLE lighting_audits ADD COLUMN IF NOT EXISTS proposal_pdf TEXT;

-- =====================================================
-- AUDIT_AREAS TABLE - Add missing columns
-- =====================================================
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS area_id TEXT;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS photos TEXT[];
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS ceiling_height DECIMAL(8,2);
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS ai_analysis_json JSONB;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS fixture_type_detected TEXT;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS fixture_category TEXT;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS fixture_count INTEGER;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS existing_wattage DECIMAL(8,2);
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS total_existing_watts DECIMAL(12,2);
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS led_replacement UUID REFERENCES products_services(id);
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS led_wattage DECIMAL(8,2);
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS total_led_watts DECIMAL(12,2);
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS confirmed BOOLEAN DEFAULT false;
ALTER TABLE audit_areas ADD COLUMN IF NOT EXISTS override_notes TEXT;

-- =====================================================
-- FIXTURE_TYPES TABLE - Add missing columns
-- =====================================================
ALTER TABLE fixture_types ADD COLUMN IF NOT EXISTS fixture_id TEXT;
ALTER TABLE fixture_types ADD COLUMN IF NOT EXISTS lamp_type TEXT;
ALTER TABLE fixture_types ADD COLUMN IF NOT EXISTS lamp_count INTEGER;
ALTER TABLE fixture_types ADD COLUMN IF NOT EXISTS system_wattage DECIMAL(8,2);
ALTER TABLE fixture_types ADD COLUMN IF NOT EXISTS visual_characteristics TEXT;
ALTER TABLE fixture_types ADD COLUMN IF NOT EXISTS led_replacement_watts DECIMAL(8,2);

-- =====================================================
-- UTILITY_PROVIDERS TABLE - Add missing columns
-- =====================================================
ALTER TABLE utility_providers ADD COLUMN IF NOT EXISTS provider_id TEXT;
ALTER TABLE utility_providers ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE utility_providers ADD COLUMN IF NOT EXISTS service_territory TEXT;
ALTER TABLE utility_providers ADD COLUMN IF NOT EXISTS has_rebate_program BOOLEAN DEFAULT false;
ALTER TABLE utility_providers ADD COLUMN IF NOT EXISTS rebate_program_url TEXT;
ALTER TABLE utility_providers ADD COLUMN IF NOT EXISTS contact_phone TEXT;

-- =====================================================
-- UTILITY_PROGRAMS TABLE - Add missing columns
-- =====================================================
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS program_id TEXT;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS utility_name TEXT;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS program_type TEXT;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS effective_date DATE;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS expiration_date DATE;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS max_cap_percent DECIMAL(5,2);
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS annual_cap_dollars DECIMAL(12,2);
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS business_size TEXT;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS dlc_required BOOLEAN DEFAULT false;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS pre_approval_required BOOLEAN DEFAULT false;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS contact_phone TEXT;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS program_url TEXT;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS pdf_url TEXT;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS last_verified DATE;
ALTER TABLE utility_programs ADD COLUMN IF NOT EXISTS ai_can_update BOOLEAN DEFAULT false;

-- =====================================================
-- REBATE_RATES TABLE - Add missing columns
-- =====================================================
ALTER TABLE rebate_rates ADD COLUMN IF NOT EXISTS rate_id TEXT;
ALTER TABLE rebate_rates ADD COLUMN IF NOT EXISTS location_type TEXT;
ALTER TABLE rebate_rates ADD COLUMN IF NOT EXISTS fixture_category TEXT;
ALTER TABLE rebate_rates ADD COLUMN IF NOT EXISTS control_level TEXT;
ALTER TABLE rebate_rates ADD COLUMN IF NOT EXISTS calc_method TEXT;
ALTER TABLE rebate_rates ADD COLUMN IF NOT EXISTS rate DECIMAL(10,4);
ALTER TABLE rebate_rates ADD COLUMN IF NOT EXISTS rate_unit TEXT;
ALTER TABLE rebate_rates ADD COLUMN IF NOT EXISTS min_watts DECIMAL(8,2);
ALTER TABLE rebate_rates ADD COLUMN IF NOT EXISTS max_watts DECIMAL(8,2);

-- =====================================================
-- REBATE_UPDATE_LOG TABLE (Create if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS rebate_update_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  log_id TEXT,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  program_id UUID REFERENCES utility_programs(id),
  action TEXT,
  old_value TEXT,
  new_value TEXT,
  source_url TEXT,
  verified_by TEXT,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE rebate_update_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "rebate_update_log_select" ON rebate_update_log FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "rebate_update_log_insert" ON rebate_update_log FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "rebate_update_log_update" ON rebate_update_log FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "rebate_update_log_delete" ON rebate_update_log FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- SYNCLOG TABLE (Create if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ DEFAULT NOW(),
  action TEXT,
  event_id TEXT,
  status TEXT,
  details TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "sync_log_select" ON sync_log FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "sync_log_insert" ON sync_log FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "sync_log_update" ON sync_log FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "sync_log_delete" ON sync_log FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- WEBHOOK_FORM TABLE (Create if not exists)
-- =====================================================
CREATE TABLE IF NOT EXISTS webhook_form (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  action TEXT,
  lead_id UUID REFERENCES leads(id),
  customer_name TEXT,
  appointment_time TIMESTAMPTZ,
  service_type TEXT,
  address TEXT,
  event_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE webhook_form ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "webhook_form_select" ON webhook_form FOR SELECT
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "webhook_form_insert" ON webhook_form FOR INSERT
  WITH CHECK (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "webhook_form_update" ON webhook_form FOR UPDATE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));
CREATE POLICY IF NOT EXISTS "webhook_form_delete" ON webhook_form FOR DELETE
  USING (company_id IN (SELECT company_id FROM employees WHERE email = auth.jwt()->>'email'));

-- =====================================================
-- PAYMENTS TABLE - Add missing columns
-- =====================================================
ALTER TABLE payments ADD COLUMN IF NOT EXISTS payment_id TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS method TEXT;
ALTER TABLE payments ADD COLUMN IF NOT EXISTS status TEXT;

-- =====================================================
-- CREATE INDEXES FOR PERFORMANCE
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_bookings_company ON bookings(company_id);
CREATE INDEX IF NOT EXISTS idx_bookings_status ON bookings(status);
CREATE INDEX IF NOT EXISTS idx_custom_forms_company ON custom_forms(company_id);
CREATE INDEX IF NOT EXISTS idx_custom_forms_job ON custom_forms(job_id);
CREATE INDEX IF NOT EXISTS idx_helpers_company ON helpers(company_id);
CREATE INDEX IF NOT EXISTS idx_reports_company ON reports(company_id);
CREATE INDEX IF NOT EXISTS idx_search_index_company ON search_index(company_id);
CREATE INDEX IF NOT EXISTS idx_search_index_type ON search_index(type);
CREATE INDEX IF NOT EXISTS idx_ai_sessions_company ON ai_sessions(company_id);
CREATE INDEX IF NOT EXISTS idx_ai_messages_session ON ai_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_modules_company ON ai_modules(company_id);
CREATE INDEX IF NOT EXISTS idx_rebate_update_log_program ON rebate_update_log(program_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_company ON sync_log(company_id);
CREATE INDEX IF NOT EXISTS idx_webhook_form_company ON webhook_form(company_id);

-- Done!
SELECT 'Schema fixes applied successfully!' as result;

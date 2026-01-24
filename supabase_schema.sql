-- =====================================================
-- JOB SCOUT - COMPLETE SUPABASE SCHEMA
-- Generated: January 24, 2026
-- Multi-tenant architecture with company_id on all tables
-- =====================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- CORE TABLES
-- =====================================================

-- Companies (Multi-tenant root)
CREATE TABLE companies (
  id SERIAL PRIMARY KEY,
  company_name TEXT NOT NULL,
  owner_email TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  website TEXT,
  logo_url TEXT,
  primary_color TEXT DEFAULT '#2563eb',
  timezone TEXT DEFAULT 'America/Denver',
  active BOOLEAN DEFAULT true,
  subscription_tier TEXT DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_companies_owner_email ON companies(owner_email);

-- Employees
CREATE TABLE employees (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  employee_id TEXT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  role TEXT,
  department TEXT,
  hire_date DATE,
  hourly_rate DECIMAL(10,2),
  salary DECIMAL(12,2),
  commission_rate DECIMAL(5,2),
  photo_url TEXT,
  emergency_contact TEXT,
  emergency_phone TEXT,
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_employees_company ON employees(company_id);
CREATE INDEX idx_employees_active ON employees(company_id, active);

-- Customers
CREATE TABLE customers (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  customer_id TEXT,
  name TEXT NOT NULL,
  business_name TEXT,
  contact_first_name TEXT,
  contact_last_name TEXT,
  email TEXT,
  phone TEXT,
  mobile_phone TEXT,
  fax TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  country TEXT DEFAULT 'USA',
  billing_address TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_zip TEXT,
  salesperson_id INTEGER REFERENCES employees(id),
  customer_type TEXT,
  status TEXT DEFAULT 'Active',
  credit_limit DECIMAL(12,2),
  payment_terms TEXT,
  tax_exempt BOOLEAN DEFAULT false,
  tax_id TEXT,
  notes TEXT,
  tags TEXT,
  source TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_customers_company ON customers(company_id);
CREATE INDEX idx_customers_status ON customers(company_id, status);
CREATE INDEX idx_customers_salesperson ON customers(salesperson_id);

-- Leads
CREATE TABLE leads (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  lead_id TEXT,
  customer_name TEXT NOT NULL,
  business_name TEXT,
  email TEXT,
  phone TEXT,
  mobile_phone TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  service_type TEXT,
  lead_source TEXT,
  status TEXT DEFAULT 'New',
  salesperson_id INTEGER REFERENCES employees(id),
  assigned_to INTEGER REFERENCES employees(id),
  priority TEXT,
  estimated_value DECIMAL(12,2),
  probability DECIMAL(5,2),
  follow_up_date TIMESTAMPTZ,
  last_contact TIMESTAMPTZ,
  appointment_time TIMESTAMPTZ,
  appointment_notes TEXT,
  property_type TEXT,
  property_size TEXT,
  utility_provider TEXT,
  current_fixtures INTEGER,
  notes TEXT,
  tags TEXT,
  converted_customer_id INTEGER REFERENCES customers(id),
  converted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_leads_company ON leads(company_id);
CREATE INDEX idx_leads_status ON leads(company_id, status);
CREATE INDEX idx_leads_salesperson ON leads(salesperson_id);

-- Sales Pipeline
CREATE TABLE sales_pipeline (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  lead_id INTEGER REFERENCES leads(id),
  customer_id INTEGER REFERENCES customers(id),
  salesperson_id INTEGER REFERENCES employees(id),
  stage TEXT DEFAULT 'New Lead',
  deal_value DECIMAL(12,2),
  probability DECIMAL(5,2),
  expected_close_date DATE,
  actual_close_date DATE,
  won BOOLEAN,
  lost_reason TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_pipeline_company ON sales_pipeline(company_id);
CREATE INDEX idx_pipeline_stage ON sales_pipeline(company_id, stage);

-- Appointments
CREATE TABLE appointments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  lead_id INTEGER REFERENCES leads(id),
  customer_id INTEGER REFERENCES customers(id),
  employee_id INTEGER REFERENCES employees(id),
  title TEXT NOT NULL,
  description TEXT,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  all_day BOOLEAN DEFAULT false,
  location TEXT,
  address TEXT,
  appointment_type TEXT,
  status TEXT DEFAULT 'Scheduled',
  reminder_sent BOOLEAN DEFAULT false,
  outcome TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_appointments_company ON appointments(company_id);
CREATE INDEX idx_appointments_date ON appointments(company_id, start_time);
CREATE INDEX idx_appointments_employee ON appointments(employee_id);

-- Lead Payments
CREATE TABLE lead_payments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  lead_id INTEGER REFERENCES leads(id),
  amount DECIMAL(12,2) NOT NULL,
  payment_date DATE NOT NULL,
  payment_method TEXT,
  payment_type TEXT,
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_lead_payments_company ON lead_payments(company_id);
CREATE INDEX idx_lead_payments_lead ON lead_payments(lead_id);

-- =====================================================
-- PRODUCTS & QUOTES
-- =====================================================

-- Products and Services
CREATE TABLE products_services (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  sku TEXT,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  subcategory TEXT,
  unit_price DECIMAL(12,2),
  cost DECIMAL(12,2),
  unit_of_measure TEXT,
  taxable BOOLEAN DEFAULT true,
  tax_rate DECIMAL(5,2),
  manufacturer TEXT,
  model_number TEXT,
  warranty_info TEXT,
  image_url TEXT,
  active BOOLEAN DEFAULT true,
  inventory_tracked BOOLEAN DEFAULT false,
  reorder_level INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_products_company ON products_services(company_id);
CREATE INDEX idx_products_active ON products_services(company_id, active);
CREATE INDEX idx_products_category ON products_services(company_id, category);

-- Quotes
CREATE TABLE quotes (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  quote_id TEXT,
  lead_id INTEGER REFERENCES leads(id),
  customer_id INTEGER REFERENCES customers(id),
  salesperson_id INTEGER REFERENCES employees(id),
  job_address TEXT,
  job_city TEXT,
  job_state TEXT,
  job_zip TEXT,
  quote_date DATE DEFAULT CURRENT_DATE,
  expiration_date DATE,
  sent_date TIMESTAMPTZ,
  approved_date TIMESTAMPTZ,
  rejected_date TIMESTAMPTZ,
  status TEXT DEFAULT 'Draft',
  quote_amount DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  discount_percent DECIMAL(5,2),
  tax_amount DECIMAL(12,2) DEFAULT 0,
  tax_rate DECIMAL(5,2),
  subtotal DECIMAL(12,2),
  total DECIMAL(12,2),
  utility_incentive DECIMAL(12,2) DEFAULT 0,
  out_of_pocket DECIMAL(12,2),
  deposit_required DECIMAL(12,2),
  deposit_received DECIMAL(12,2),
  payment_terms TEXT,
  warranty_terms TEXT,
  terms_conditions TEXT,
  notes TEXT,
  internal_notes TEXT,
  contract_required BOOLEAN DEFAULT false,
  contract_signed BOOLEAN DEFAULT false,
  contract_signed_date TIMESTAMPTZ,
  contract_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_quotes_company ON quotes(company_id);
CREATE INDEX idx_quotes_status ON quotes(company_id, status);
CREATE INDEX idx_quotes_customer ON quotes(customer_id);

-- Quote Lines
CREATE TABLE quote_lines (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  quote_id INTEGER REFERENCES quotes(id) ON DELETE CASCADE NOT NULL,
  item_id INTEGER REFERENCES products_services(id),
  line_number INTEGER,
  description TEXT,
  quantity DECIMAL(12,2) DEFAULT 1,
  unit_price DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  discount_percent DECIMAL(5,2),
  line_total DECIMAL(12,2) DEFAULT 0,
  taxable BOOLEAN DEFAULT true,
  notes TEXT,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_quote_lines_quote ON quote_lines(quote_id);
CREATE INDEX idx_quote_lines_company ON quote_lines(company_id);

-- =====================================================
-- JOBS & WORK
-- =====================================================

-- Jobs
CREATE TABLE jobs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  job_id TEXT,
  job_title TEXT,
  customer_id INTEGER REFERENCES customers(id),
  quote_id INTEGER REFERENCES quotes(id),
  salesperson_id INTEGER REFERENCES employees(id),
  project_manager_id INTEGER REFERENCES employees(id),
  job_address TEXT,
  job_city TEXT,
  job_state TEXT,
  job_zip TEXT,
  job_location TEXT,
  job_type TEXT,
  job_category TEXT,
  priority TEXT DEFAULT 'Normal',
  status TEXT DEFAULT 'Scheduled',
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  scheduled_start TIMESTAMPTZ,
  scheduled_end TIMESTAMPTZ,
  actual_start TIMESTAMPTZ,
  actual_end TIMESTAMPTZ,
  assigned_team TEXT,
  assigned_crew TEXT,
  crew_size INTEGER,
  allotted_time_hours DECIMAL(10,2),
  time_tracked DECIMAL(10,2) DEFAULT 0,
  estimated_hours DECIMAL(10,2),
  actual_hours DECIMAL(10,2),
  labor_cost DECIMAL(12,2),
  material_cost DECIMAL(12,2),
  other_cost DECIMAL(12,2),
  total_cost DECIMAL(12,2),
  contract_amount DECIMAL(12,2),
  profit_margin DECIMAL(5,2),
  billing_type TEXT,
  hourly_rate DECIMAL(10,2),
  invoice_status TEXT DEFAULT 'Not Invoiced',
  invoice_id INTEGER,
  po_number TEXT,
  permit_required BOOLEAN DEFAULT false,
  permit_number TEXT,
  permit_status TEXT,
  inspection_required BOOLEAN DEFAULT false,
  inspection_date TIMESTAMPTZ,
  inspection_status TEXT,
  warranty_start DATE,
  warranty_end DATE,
  warranty_terms TEXT,
  details TEXT,
  scope_of_work TEXT,
  notes TEXT,
  internal_notes TEXT,
  customer_signature TEXT,
  completion_signature TEXT,
  completion_notes TEXT,
  rating INTEGER,
  feedback TEXT,
  photos TEXT,
  documents TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_jobs_company ON jobs(company_id);
CREATE INDEX idx_jobs_status ON jobs(company_id, status);
CREATE INDEX idx_jobs_customer ON jobs(customer_id);
CREATE INDEX idx_jobs_date ON jobs(company_id, start_date);

-- Job Lines
CREATE TABLE job_lines (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE NOT NULL,
  item_id INTEGER REFERENCES products_services(id),
  line_number INTEGER,
  description TEXT,
  quantity DECIMAL(12,2) DEFAULT 1,
  unit_price DECIMAL(12,2) DEFAULT 0,
  cost DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  line_total DECIMAL(12,2) DEFAULT 0,
  completed BOOLEAN DEFAULT false,
  completed_date TIMESTAMPTZ,
  completed_by INTEGER REFERENCES employees(id),
  notes TEXT,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_job_lines_job ON job_lines(job_id);
CREATE INDEX idx_job_lines_company ON job_lines(company_id);

-- Custom Forms
CREATE TABLE custom_forms (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  job_id INTEGER REFERENCES jobs(id) ON DELETE CASCADE,
  form_name TEXT NOT NULL,
  form_type TEXT,
  form_data JSONB,
  submitted_by INTEGER REFERENCES employees(id),
  submitted_at TIMESTAMPTZ,
  approved_by INTEGER REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  status TEXT DEFAULT 'Draft',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_custom_forms_job ON custom_forms(job_id);
CREATE INDEX idx_custom_forms_company ON custom_forms(company_id);

-- Time Log
CREATE TABLE time_log (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  job_id INTEGER REFERENCES jobs(id),
  employee_id INTEGER REFERENCES employees(id) NOT NULL,
  clock_in TIMESTAMPTZ NOT NULL,
  clock_out TIMESTAMPTZ,
  break_start TIMESTAMPTZ,
  break_end TIMESTAMPTZ,
  break_minutes INTEGER DEFAULT 0,
  total_hours DECIMAL(10,2),
  hourly_rate DECIMAL(10,2),
  labor_cost DECIMAL(12,2),
  overtime_hours DECIMAL(10,2),
  overtime_rate DECIMAL(10,2),
  work_type TEXT,
  task_description TEXT,
  location TEXT,
  gps_clock_in TEXT,
  gps_clock_out TEXT,
  approved BOOLEAN DEFAULT false,
  approved_by INTEGER REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_time_log_company ON time_log(company_id);
CREATE INDEX idx_time_log_job ON time_log(job_id);
CREATE INDEX idx_time_log_employee ON time_log(employee_id);
CREATE INDEX idx_time_log_date ON time_log(company_id, clock_in);

-- Expenses
CREATE TABLE expenses (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  job_id INTEGER REFERENCES jobs(id),
  employee_id INTEGER REFERENCES employees(id),
  expense_date DATE NOT NULL,
  category TEXT,
  vendor TEXT,
  description TEXT,
  amount DECIMAL(12,2) NOT NULL,
  tax_amount DECIMAL(12,2),
  total_amount DECIMAL(12,2),
  payment_method TEXT,
  reimbursable BOOLEAN DEFAULT false,
  reimbursed BOOLEAN DEFAULT false,
  reimbursed_date DATE,
  billable BOOLEAN DEFAULT false,
  billed BOOLEAN DEFAULT false,
  receipt_url TEXT,
  receipt_number TEXT,
  po_number TEXT,
  approved BOOLEAN DEFAULT false,
  approved_by INTEGER REFERENCES employees(id),
  approved_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_expenses_company ON expenses(company_id);
CREATE INDEX idx_expenses_job ON expenses(job_id);
CREATE INDEX idx_expenses_employee ON expenses(employee_id);
CREATE INDEX idx_expenses_date ON expenses(company_id, expense_date);

-- =====================================================
-- INVOICING & PAYMENTS
-- =====================================================

-- Invoices
CREATE TABLE invoices (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  invoice_id TEXT,
  invoice_number TEXT,
  customer_id INTEGER REFERENCES customers(id),
  job_id INTEGER REFERENCES jobs(id),
  quote_id INTEGER REFERENCES quotes(id),
  billing_address TEXT,
  billing_city TEXT,
  billing_state TEXT,
  billing_zip TEXT,
  invoice_date DATE DEFAULT CURRENT_DATE,
  due_date DATE,
  sent_date TIMESTAMPTZ,
  paid_date DATE,
  status TEXT DEFAULT 'Draft',
  subtotal DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  discount_percent DECIMAL(5,2),
  tax_rate DECIMAL(5,2),
  tax_amount DECIMAL(12,2) DEFAULT 0,
  shipping DECIMAL(12,2) DEFAULT 0,
  total DECIMAL(12,2) DEFAULT 0,
  amount_paid DECIMAL(12,2) DEFAULT 0,
  balance_due DECIMAL(12,2) DEFAULT 0,
  deposit_applied DECIMAL(12,2),
  payment_terms TEXT,
  payment_method TEXT,
  po_number TEXT,
  notes TEXT,
  internal_notes TEXT,
  footer_text TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_invoices_company ON invoices(company_id);
CREATE INDEX idx_invoices_status ON invoices(company_id, status);
CREATE INDEX idx_invoices_customer ON invoices(customer_id);
CREATE INDEX idx_invoices_job ON invoices(job_id);

-- Invoice Lines
CREATE TABLE invoice_lines (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  invoice_id INTEGER REFERENCES invoices(id) ON DELETE CASCADE NOT NULL,
  item_id INTEGER REFERENCES products_services(id),
  line_number INTEGER,
  description TEXT,
  quantity DECIMAL(12,2) DEFAULT 1,
  unit_price DECIMAL(12,2) DEFAULT 0,
  discount DECIMAL(12,2) DEFAULT 0,
  line_total DECIMAL(12,2) DEFAULT 0,
  taxable BOOLEAN DEFAULT true,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_invoice_lines_invoice ON invoice_lines(invoice_id);

-- Payments
CREATE TABLE payments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  invoice_id INTEGER REFERENCES invoices(id),
  customer_id INTEGER REFERENCES customers(id),
  job_id INTEGER REFERENCES jobs(id),
  payment_date DATE NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method TEXT,
  payment_type TEXT,
  reference_number TEXT,
  check_number TEXT,
  transaction_id TEXT,
  processor TEXT,
  processor_fee DECIMAL(12,2),
  net_amount DECIMAL(12,2),
  deposited BOOLEAN DEFAULT false,
  deposited_date DATE,
  bank_account TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_payments_company ON payments(company_id);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_customer ON payments(customer_id);
CREATE INDEX idx_payments_date ON payments(company_id, payment_date);

-- Utility Invoices (for utility rebate tracking)
CREATE TABLE utility_invoices (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  job_id INTEGER REFERENCES jobs(id),
  customer_id INTEGER REFERENCES customers(id),
  utility_provider_id INTEGER,
  program_id INTEGER,
  invoice_number TEXT,
  submission_date DATE,
  approval_date DATE,
  payment_date DATE,
  status TEXT DEFAULT 'Pending',
  rebate_amount DECIMAL(12,2),
  kwh_savings DECIMAL(12,2),
  fixtures_replaced INTEGER,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_utility_invoices_company ON utility_invoices(company_id);
CREATE INDEX idx_utility_invoices_job ON utility_invoices(job_id);
CREATE INDEX idx_utility_invoices_status ON utility_invoices(company_id, status);

-- Incentives
CREATE TABLE incentives (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  job_id INTEGER REFERENCES jobs(id),
  quote_id INTEGER REFERENCES quotes(id),
  customer_id INTEGER REFERENCES customers(id),
  incentive_type TEXT,
  program_name TEXT,
  provider TEXT,
  estimated_amount DECIMAL(12,2),
  approved_amount DECIMAL(12,2),
  received_amount DECIMAL(12,2),
  application_date DATE,
  approval_date DATE,
  payment_date DATE,
  status TEXT DEFAULT 'Pending',
  reference_number TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_incentives_company ON incentives(company_id);
CREATE INDEX idx_incentives_job ON incentives(job_id);

-- =====================================================
-- FLEET MANAGEMENT
-- =====================================================

-- Fleet (Vehicles/Equipment)
CREATE TABLE fleet (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  vehicle_id TEXT,
  name TEXT NOT NULL,
  vehicle_type TEXT,
  make TEXT,
  model TEXT,
  year INTEGER,
  vin TEXT,
  license_plate TEXT,
  license_state TEXT,
  color TEXT,
  purchase_date DATE,
  purchase_price DECIMAL(12,2),
  current_value DECIMAL(12,2),
  odometer INTEGER,
  fuel_type TEXT,
  mpg_city DECIMAL(5,2),
  mpg_highway DECIMAL(5,2),
  tank_size DECIMAL(5,2),
  assigned_to INTEGER REFERENCES employees(id),
  department TEXT,
  insurance_policy TEXT,
  insurance_expires DATE,
  registration_expires DATE,
  inspection_expires DATE,
  status TEXT DEFAULT 'Active',
  gps_device_id TEXT,
  notes TEXT,
  photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_fleet_company ON fleet(company_id);
CREATE INDEX idx_fleet_status ON fleet(company_id, status);
CREATE INDEX idx_fleet_assigned ON fleet(assigned_to);

-- Fleet Maintenance
CREATE TABLE fleet_maintenance (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  fleet_id INTEGER REFERENCES fleet(id) ON DELETE CASCADE NOT NULL,
  maintenance_type TEXT NOT NULL,
  description TEXT,
  service_date DATE NOT NULL,
  odometer INTEGER,
  vendor TEXT,
  technician TEXT,
  cost DECIMAL(12,2),
  parts_cost DECIMAL(12,2),
  labor_cost DECIMAL(12,2),
  invoice_number TEXT,
  next_service_date DATE,
  next_service_miles INTEGER,
  status TEXT DEFAULT 'Completed',
  warranty_claim BOOLEAN DEFAULT false,
  notes TEXT,
  receipt_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_fleet_maintenance_fleet ON fleet_maintenance(fleet_id);
CREATE INDEX idx_fleet_maintenance_company ON fleet_maintenance(company_id);
CREATE INDEX idx_fleet_maintenance_date ON fleet_maintenance(service_date);

-- Fleet Rentals
CREATE TABLE fleet_rentals (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  fleet_id INTEGER REFERENCES fleet(id),
  job_id INTEGER REFERENCES jobs(id),
  employee_id INTEGER REFERENCES employees(id),
  rental_type TEXT,
  vendor TEXT,
  rental_start DATE NOT NULL,
  rental_end DATE,
  daily_rate DECIMAL(10,2),
  total_cost DECIMAL(12,2),
  odometer_start INTEGER,
  odometer_end INTEGER,
  fuel_start DECIMAL(5,2),
  fuel_end DECIMAL(5,2),
  status TEXT DEFAULT 'Active',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_fleet_rentals_company ON fleet_rentals(company_id);
CREATE INDEX idx_fleet_rentals_fleet ON fleet_rentals(fleet_id);
CREATE INDEX idx_fleet_rentals_job ON fleet_rentals(job_id);

-- =====================================================
-- INVENTORY
-- =====================================================

CREATE TABLE inventory (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  product_id INTEGER REFERENCES products_services(id),
  warehouse_location TEXT,
  bin_location TEXT,
  quantity_on_hand INTEGER DEFAULT 0,
  quantity_reserved INTEGER DEFAULT 0,
  quantity_available INTEGER DEFAULT 0,
  quantity_on_order INTEGER DEFAULT 0,
  reorder_level INTEGER,
  reorder_quantity INTEGER,
  unit_cost DECIMAL(12,2),
  total_value DECIMAL(12,2),
  last_count_date DATE,
  last_count_quantity INTEGER,
  last_received_date DATE,
  last_issued_date DATE,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_inventory_company ON inventory(company_id);
CREATE INDEX idx_inventory_product ON inventory(product_id);
CREATE INDEX idx_inventory_location ON inventory(company_id, warehouse_location);

-- Inventory Transactions
CREATE TABLE inventory_transactions (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  inventory_id INTEGER REFERENCES inventory(id) ON DELETE CASCADE NOT NULL,
  product_id INTEGER REFERENCES products_services(id),
  job_id INTEGER REFERENCES jobs(id),
  transaction_type TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_cost DECIMAL(12,2),
  total_cost DECIMAL(12,2),
  transaction_date TIMESTAMPTZ DEFAULT NOW(),
  reference_number TEXT,
  performed_by INTEGER REFERENCES employees(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_inv_trans_company ON inventory_transactions(company_id);
CREATE INDEX idx_inv_trans_inventory ON inventory_transactions(inventory_id);
CREATE INDEX idx_inv_trans_date ON inventory_transactions(transaction_date);

-- =====================================================
-- LIGHTING AUDITS
-- =====================================================

-- Lighting Audits
CREATE TABLE lighting_audits (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  audit_id TEXT,
  customer_id INTEGER REFERENCES customers(id),
  lead_id INTEGER REFERENCES leads(id),
  quote_id INTEGER REFERENCES quotes(id),
  job_id INTEGER REFERENCES jobs(id),
  auditor_id INTEGER REFERENCES employees(id),
  audit_date DATE,
  facility_name TEXT,
  facility_type TEXT,
  facility_address TEXT,
  facility_city TEXT,
  facility_state TEXT,
  facility_zip TEXT,
  square_footage INTEGER,
  operating_hours_day DECIMAL(5,2),
  operating_days_year INTEGER,
  utility_provider_id INTEGER,
  utility_rate DECIMAL(10,4),
  current_kwh_usage DECIMAL(12,2),
  proposed_kwh_usage DECIMAL(12,2),
  annual_kwh_savings DECIMAL(12,2),
  annual_cost_savings DECIMAL(12,2),
  total_fixtures_current INTEGER,
  total_fixtures_proposed INTEGER,
  total_watts_current INTEGER,
  total_watts_proposed INTEGER,
  watts_reduction INTEGER,
  estimated_rebate DECIMAL(12,2),
  approved_rebate DECIMAL(12,2),
  project_cost DECIMAL(12,2),
  payback_years DECIMAL(5,2),
  roi_percent DECIMAL(5,2),
  status TEXT DEFAULT 'Draft',
  notes TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_lighting_audits_company ON lighting_audits(company_id);
CREATE INDEX idx_lighting_audits_customer ON lighting_audits(customer_id);
CREATE INDEX idx_lighting_audits_status ON lighting_audits(company_id, status);

-- Audit Areas (rooms/zones within a lighting audit)
CREATE TABLE audit_areas (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  audit_id INTEGER REFERENCES lighting_audits(id) ON DELETE CASCADE NOT NULL,
  area_name TEXT NOT NULL,
  area_type TEXT,
  square_footage INTEGER,
  ceiling_height DECIMAL(5,2),
  notes TEXT,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_audit_areas_audit ON audit_areas(audit_id);

-- Audit Area Fixtures (fixtures in each area)
CREATE TABLE audit_area_fixtures (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  audit_area_id INTEGER REFERENCES audit_areas(id) ON DELETE CASCADE NOT NULL,
  fixture_type_id INTEGER,
  fixture_description TEXT,
  current_wattage INTEGER,
  proposed_wattage INTEGER,
  quantity INTEGER DEFAULT 1,
  hours_per_day DECIMAL(5,2),
  days_per_year INTEGER,
  current_kwh DECIMAL(12,2),
  proposed_kwh DECIMAL(12,2),
  kwh_savings DECIMAL(12,2),
  rebate_per_fixture DECIMAL(10,2),
  total_rebate DECIMAL(12,2),
  fixture_cost DECIMAL(10,2),
  labor_cost DECIMAL(10,2),
  total_cost DECIMAL(12,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_area_fixtures_area ON audit_area_fixtures(audit_area_id);

-- Fixture Types (reference table)
CREATE TABLE fixture_types (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  code TEXT,
  name TEXT NOT NULL,
  category TEXT,
  technology TEXT,
  wattage INTEGER,
  lumens INTEGER,
  color_temp INTEGER,
  cri INTEGER,
  lifespan_hours INTEGER,
  dimmable BOOLEAN DEFAULT false,
  ul_listed BOOLEAN DEFAULT true,
  dlc_listed BOOLEAN DEFAULT false,
  energy_star BOOLEAN DEFAULT false,
  unit_cost DECIMAL(10,2),
  labor_cost DECIMAL(10,2),
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_fixture_types_company ON fixture_types(company_id);
CREATE INDEX idx_fixture_types_category ON fixture_types(company_id, category);

-- Rebate Rates
CREATE TABLE rebate_rates (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  utility_provider_id INTEGER,
  program_id INTEGER,
  fixture_category TEXT,
  fixture_type TEXT,
  watts_range_min INTEGER,
  watts_range_max INTEGER,
  rebate_per_fixture DECIMAL(10,2),
  rebate_per_watt DECIMAL(10,4),
  max_rebate DECIMAL(10,2),
  min_hours_operation INTEGER,
  effective_date DATE,
  expiration_date DATE,
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_rebate_rates_company ON rebate_rates(company_id);
CREATE INDEX idx_rebate_rates_provider ON rebate_rates(utility_provider_id);

-- Rebate Update Log
CREATE TABLE rebate_update_log (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  rebate_rate_id INTEGER REFERENCES rebate_rates(id),
  utility_provider_id INTEGER,
  program_id INTEGER,
  change_type TEXT,
  old_value TEXT,
  new_value TEXT,
  changed_by INTEGER REFERENCES employees(id),
  change_date TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_rebate_log_company ON rebate_update_log(company_id);
CREATE INDEX idx_rebate_log_rate ON rebate_update_log(rebate_rate_id);

-- Utility Programs
CREATE TABLE utility_programs (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  utility_provider_id INTEGER,
  program_name TEXT NOT NULL,
  program_code TEXT,
  program_type TEXT,
  description TEXT,
  eligibility TEXT,
  application_process TEXT,
  documentation_required TEXT,
  contact_name TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  website_url TEXT,
  start_date DATE,
  end_date DATE,
  budget_total DECIMAL(14,2),
  budget_remaining DECIMAL(14,2),
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_utility_programs_company ON utility_programs(company_id);
CREATE INDEX idx_utility_programs_provider ON utility_programs(utility_provider_id);

-- Utility Providers
CREATE TABLE utility_providers (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  provider_name TEXT NOT NULL,
  provider_code TEXT,
  provider_type TEXT,
  service_area TEXT,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  phone TEXT,
  email TEXT,
  website TEXT,
  portal_url TEXT,
  account_rep_name TEXT,
  account_rep_email TEXT,
  account_rep_phone TEXT,
  rate_schedule_url TEXT,
  average_rate DECIMAL(10,4),
  active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_utility_providers_company ON utility_providers(company_id);
CREATE INDEX idx_utility_providers_state ON utility_providers(state);

-- =====================================================
-- OTHER TABLES
-- =====================================================

-- Communications Log
CREATE TABLE communications_log (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  lead_id INTEGER REFERENCES leads(id),
  customer_id INTEGER REFERENCES customers(id),
  job_id INTEGER REFERENCES jobs(id),
  employee_id INTEGER REFERENCES employees(id),
  communication_type TEXT NOT NULL,
  direction TEXT,
  subject TEXT,
  body TEXT,
  phone_number TEXT,
  email_address TEXT,
  duration_minutes INTEGER,
  outcome TEXT,
  follow_up_required BOOLEAN DEFAULT false,
  follow_up_date TIMESTAMPTZ,
  communication_date TIMESTAMPTZ DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_comms_log_company ON communications_log(company_id);
CREATE INDEX idx_comms_log_lead ON communications_log(lead_id);
CREATE INDEX idx_comms_log_customer ON communications_log(customer_id);
CREATE INDEX idx_comms_log_job ON communications_log(job_id);
CREATE INDEX idx_comms_log_date ON communications_log(communication_date);

-- Routes
CREATE TABLE routes (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  route_name TEXT NOT NULL,
  route_date DATE NOT NULL,
  assigned_to INTEGER REFERENCES employees(id),
  fleet_id INTEGER REFERENCES fleet(id),
  status TEXT DEFAULT 'Planned',
  start_location TEXT,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  total_stops INTEGER,
  total_miles DECIMAL(10,2),
  estimated_duration_minutes INTEGER,
  actual_duration_minutes INTEGER,
  fuel_cost DECIMAL(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_routes_company ON routes(company_id);
CREATE INDEX idx_routes_date ON routes(route_date);
CREATE INDEX idx_routes_employee ON routes(assigned_to);

-- Route Stops
CREATE TABLE route_stops (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  route_id INTEGER REFERENCES routes(id) ON DELETE CASCADE NOT NULL,
  job_id INTEGER REFERENCES jobs(id),
  customer_id INTEGER REFERENCES customers(id),
  stop_order INTEGER NOT NULL,
  address TEXT,
  city TEXT,
  state TEXT,
  zip TEXT,
  arrival_time TIMESTAMPTZ,
  departure_time TIMESTAMPTZ,
  estimated_duration_minutes INTEGER,
  actual_duration_minutes INTEGER,
  status TEXT DEFAULT 'Pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_route_stops_route ON route_stops(route_id);
CREATE INDEX idx_route_stops_job ON route_stops(job_id);

-- Settings (company-specific settings)
CREATE TABLE settings (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  setting_key TEXT NOT NULL,
  setting_value TEXT,
  setting_type TEXT,
  category TEXT,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ,
  UNIQUE(company_id, setting_key)
);

CREATE INDEX idx_settings_company ON settings(company_id);
CREATE INDEX idx_settings_key ON settings(company_id, setting_key);

-- Search Index (for global search functionality)
CREATE TABLE search_index (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  search_text TEXT NOT NULL,
  title TEXT,
  subtitle TEXT,
  url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ
);

CREATE INDEX idx_search_company ON search_index(company_id);
CREATE INDEX idx_search_text ON search_index USING gin(to_tsvector('english', search_text));

-- Tags (for tagging any entity)
CREATE TABLE tags (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  tag_name TEXT NOT NULL,
  tag_color TEXT,
  entity_type TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, tag_name)
);

CREATE INDEX idx_tags_company ON tags(company_id);

-- Entity Tags (junction table for tagging)
CREATE TABLE entity_tags (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  tag_id INTEGER REFERENCES tags(id) ON DELETE CASCADE NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tag_id, entity_type, entity_id)
);

CREATE INDEX idx_entity_tags_entity ON entity_tags(entity_type, entity_id);

-- File Attachments
CREATE TABLE file_attachments (
  id SERIAL PRIMARY KEY,
  company_id INTEGER REFERENCES companies(id) ON DELETE CASCADE NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  file_url TEXT NOT NULL,
  uploaded_by INTEGER REFERENCES employees(id),
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_attachments_entity ON file_attachments(entity_type, entity_id);
CREATE INDEX idx_attachments_company ON file_attachments(company_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales_pipeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE products_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE custom_forms ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE incentives ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_maintenance ENABLE ROW LEVEL SECURITY;
ALTER TABLE fleet_rentals ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lighting_audits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_area_fixtures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fixture_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE rebate_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE rebate_update_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_programs ENABLE ROW LEVEL SECURITY;
ALTER TABLE utility_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE communications_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE entity_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_attachments ENABLE ROW LEVEL SECURITY;

-- Create policies for companies table
CREATE POLICY "Users can view their own companies"
  ON companies FOR SELECT
  USING (owner_email = auth.jwt() ->> 'email');

CREATE POLICY "Users can update their own companies"
  ON companies FOR UPDATE
  USING (owner_email = auth.jwt() ->> 'email');

CREATE POLICY "Users can insert companies"
  ON companies FOR INSERT
  WITH CHECK (owner_email = auth.jwt() ->> 'email');

-- Helper function to get user's company_id
CREATE OR REPLACE FUNCTION get_user_company_id()
RETURNS INTEGER AS $$
  SELECT id FROM companies WHERE owner_email = auth.jwt() ->> 'email' LIMIT 1;
$$ LANGUAGE sql SECURITY DEFINER;

-- Generic policy template for company-scoped tables
-- Apply to each table that has company_id

CREATE POLICY "Company isolation" ON employees
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON customers
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON leads
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON sales_pipeline
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON appointments
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON lead_payments
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON products_services
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON quotes
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON quote_lines
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON jobs
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON job_lines
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON custom_forms
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON time_log
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON expenses
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON invoices
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON invoice_lines
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON payments
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON utility_invoices
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON incentives
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON fleet
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON fleet_maintenance
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON fleet_rentals
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON inventory
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON inventory_transactions
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON lighting_audits
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON audit_areas
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON audit_area_fixtures
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON fixture_types
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON rebate_rates
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON rebate_update_log
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON utility_programs
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON utility_providers
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON communications_log
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON routes
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON route_stops
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON settings
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON search_index
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON tags
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON entity_tags
  FOR ALL USING (company_id = get_user_company_id());

CREATE POLICY "Company isolation" ON file_attachments
  FOR ALL USING (company_id = get_user_company_id());

-- =====================================================
-- END OF SCHEMA
-- =====================================================

/**
 * Job Scout Database Schema Reference
 * Generated from Supabase schema - January 24, 2026
 *
 * All tables include:
 * - company_id (multi-tenant isolation)
 * - created_at (auto timestamp)
 * - updated_at (manual timestamp)
 */

// Table name constants for consistent reference
export const TABLES = {
  // Core
  companies: 'companies',
  employees: 'employees',
  customers: 'customers',
  leads: 'leads',
  sales_pipeline: 'sales_pipeline',
  lead_payments: 'lead_payments',
  appointments: 'appointments',

  // Products & Quotes
  products_services: 'products_services',
  quotes: 'quotes',
  quote_lines: 'quote_lines',

  // Jobs & Work
  jobs: 'jobs',
  job_lines: 'job_lines',
  custom_forms: 'custom_forms',
  time_log: 'time_log',
  expenses: 'expenses',

  // Invoicing
  invoices: 'invoices',
  invoice_lines: 'invoice_lines',
  payments: 'payments',
  utility_invoices: 'utility_invoices',
  incentives: 'incentives',

  // Fleet
  fleet: 'fleet',
  fleet_maintenance: 'fleet_maintenance',
  fleet_rentals: 'fleet_rentals',

  // Inventory
  inventory: 'inventory',
  inventory_transactions: 'inventory_transactions',

  // Lighting Audits
  lighting_audits: 'lighting_audits',
  audit_areas: 'audit_areas',
  audit_area_fixtures: 'audit_area_fixtures',
  fixture_types: 'fixture_types',
  rebate_rates: 'rebate_rates',
  rebate_update_log: 'rebate_update_log',
  utility_programs: 'utility_programs',
  utility_providers: 'utility_providers',

  // Other
  communications_log: 'communications_log',
  routes: 'routes',
  route_stops: 'route_stops',
  settings: 'settings',
  search_index: 'search_index',
  tags: 'tags',
  entity_tags: 'entity_tags',
  file_attachments: 'file_attachments',
  reports: 'reports',

  // Bookings & Scheduling
  bookings: 'bookings',

  // AI/Webhooks
  ai_sessions: 'ai_sessions',
  ai_modules: 'ai_modules',
  ai_messages: 'ai_messages',
  webhook_form: 'webhook_form',
  sync_log: 'sync_log',
  helpers: 'helpers',

  // Agents (Base Camp)
  agents: 'agents',
  company_agents: 'company_agents'
};

// Status enums for consistent UI
export const STATUS = {
  lead: ['New', 'Qualified', 'Appointment Scheduled', 'Waiting', 'Not Qualified', 'Converted'],
  pipeline: ['New Lead', 'Contacted', 'Qualified', 'Proposal Sent', 'Negotiation', 'Won', 'Lost'],
  quote: ['Draft', 'Sent', 'Approved', 'Rejected', 'Expired'],
  job: ['Scheduled', 'In Progress', 'Completed', 'On Hold', 'Cancelled'],
  invoice: ['Draft', 'Sent', 'Paid', 'Partial', 'Overdue', 'Void'],
  appointment: ['Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No Show'],
  customer: ['Active', 'Inactive', 'Prospect'],
  employee: ['Active', 'Inactive'],
  fleet: ['Active', 'In Service', 'Out of Service', 'Retired'],
  audit: ['Draft', 'In Progress', 'Completed', 'Submitted', 'Approved']
};

// Payment methods
export const PAYMENT_METHODS = [
  'Cash',
  'Check',
  'Credit Card',
  'Debit Card',
  'ACH',
  'Wire Transfer',
  'PayPal',
  'Venmo',
  'Zelle',
  'Financing',
  'Other'
];

// Job priorities
export const JOB_PRIORITIES = ['Low', 'Normal', 'High', 'Urgent'];

// Expense categories
export const EXPENSE_CATEGORIES = [
  'Materials',
  'Labor',
  'Equipment Rental',
  'Permits',
  'Travel',
  'Fuel',
  'Meals',
  'Subcontractor',
  'Office Supplies',
  'Marketing',
  'Insurance',
  'Utilities',
  'Other'
];

// Booking statuses
export const BOOKING_STATUS = ['Pending', 'Confirmed', 'Scheduled', 'Cancelled'];

// Appointment statuses
export const APPOINTMENT_STATUS = ['Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No Show'];

// Route statuses
export const ROUTE_STATUS = ['Planned', 'In Progress', 'Completed', 'Cancelled'];

// Common select queries with joins
export const QUERIES = {
  employees: '*, department, role',
  customers: '*, salesperson:employees(id, name)',
  leads: '*, salesperson:employees(id, name), lead_owner:employees!lead_owner_id(id, name), setter_owner:employees!setter_owner_id(id, name)',
  salesPipeline: '*, lead:leads!lead_id(id, customer_name, phone, email), customer:customers!customer_id(id, name), salesperson:employees!salesperson_id(id, name)',
  appointments: '*, lead:leads!lead_id(id, customer_name, phone, address, service_type), customer:customers!customer_id(id, name), employee:employees!employee_id(id, name), setter:employees!setter_id(id, name), salesperson:employees!salesperson_id(id, name), lead_owner:employees!lead_owner_id(id, name)',
  quotes: '*, lead:leads!lead_id(id, customer_name), customer:customers!customer_id(id, name, email, phone, address), salesperson:employees!salesperson_id(id, name)',
  quoteLines: '*, item:products_services(id, name, description)',
  jobs: '*, customer:customers!customer_id(id, name, email, phone, address), salesperson:employees!salesperson_id(id, name), quote:quotes!quote_id(id, quote_id)',
  jobLines: '*, item:products_services(id, name, description)',
  invoices: '*',
  invoiceLines: '*, item:products_services(id, name)',
  payments: '*',
  timeLogs: '*',
  expenses: '*',
  fleet: '*',
  fleetMaintenance: '*, fleet:fleet!fleet_id(id, name, vehicle_id)',
  lightingAudits: '*',
  auditAreas: '*, audit:lighting_audits!audit_id(id, audit_id)',
  routes: '*',
  communications: '*',
  bookings: '*',
  leadPayments: '*',
  utilityInvoices: '*',
  utilityPrograms: '*',
  incentives: '*'
};

export default TABLES;

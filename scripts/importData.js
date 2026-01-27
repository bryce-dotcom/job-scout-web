/**
 * Job Scout Data Import Script
 *
 * Reads the Excel file and imports data into Supabase
 *
 * Usage: node scripts/importData.js
 *
 * Prerequisites:
 *   npm install xlsx dotenv @supabase/supabase-js
 */

import XLSX from 'xlsx';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Supabase client
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing Supabase credentials. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Company ID for HHH Services
const COMPANY_ID = 3; // Replace with actual UUID if needed

// Column name mapping: Excel header -> Supabase column
// Note: Keys are trimmed before lookup, so "Business Name " will match "Business Name"
const COLUMN_MAPPINGS = {
  // Common patterns
  'ID': 'id',
  'Created At': 'created_at',
  'Updated At': 'updated_at',

  // Bookings
  'Booking ID': 'booking_id',
  'Business Unit': 'business_unit',
  'Customer Name': 'customer_name',
  'Email': 'email',
  'Phone': 'phone',
  'Address': 'address',
  'Service Type': 'service_type',
  'Preferred Date': 'preferred_date',
  'Status': 'status',
  'Suggested Slots': 'suggested_slots',

  // Communications Log
  'Communication ID': 'communication_id',
  'Type': 'type',
  'Trigger': 'trigger',
  'Customer ID': 'customer_id',
  'Recipient': 'recipient',
  'Sent Date': 'sent_date',
  'Response': 'response',
  'Employee ID': 'employee_id',

  // Custom Forms
  'Form ID': 'form_id',
  'Job ID': 'job_id',
  'Field Name': 'field_name',
  'Field Value': 'field_value',

  // Customers
  'Name': 'name',
  'Salesperson': 'salesperson_id',
  'Preferred Contact': 'preferred_contact',
  'Tags': 'tags',
  'Notes': 'notes',
  'Secondary Contact Name': 'secondary_contact_name',
  'Secondary Contact Email': 'secondary_contact_email',
  'Secondary Contact Phone': 'secondary_contact_phone',
  'Secondary Contact Role': 'secondary_contact_role',
  'Marketing Opt-In': 'marketing_opt_in',
  'Business Name': 'business_name',

  // Employees
  'Role': 'role',
  'Headshot': 'headshot',
  'Gusto UUID': 'gusto_uuid',
  'GPS Opt-In': 'gps_opt_in',

  // Expenses
  'Expense ID': 'expense_id',
  'Amount': 'amount',
  'Description': 'description',
  'Date': 'date',
  'Category': 'category',

  // Fleet
  'Asset ID': 'asset_id',
  'Last PM Date': 'last_pm_date',
  'Next PM Due': 'next_pm_due',
  'Mileage/Hours': 'mileage_hours',
  'Repair ID': 'repair_id',
  'Repair Date': 'repair_date',
  'Repair Description': 'repair_description',
  'Repair Cost': 'repair_cost',
  'Rental ID': 'rental_id',
  'Rental Start Date': 'rental_start_date',
  'Rental End Date': 'rental_end_date',
  'Rental Customer': 'rental_customer',
  'Rental Rate': 'rental_rate',

  // Fleet Maintenance
  'Maintenance ID': 'maintenance_id',
  'Cost': 'cost',
  'Asset ID': 'fleet_id',

  // Helpers
  'List Name': 'list_name',
  'Dynamic List': 'dynamic_list',

  // Inventory
  'Item ID': 'item_id',
  'Quantity': 'quantity',
  'Min Quantity': 'min_quantity',
  'Available': 'available',
  'Location': 'location',
  'Last Updated': 'last_updated',
  'Ordering Trigger': 'ordering_trigger',

  // Incentives
  'Incentive ID': 'incentive_id',
  'Incentive Amount': 'incentive_amount',
  'Utility Name': 'utility_name',

  // Invoices
  'Invoice ID': 'invoice_id',
  'Payment Method': 'payment_method',
  'Payment Status': 'payment_status',
  'Discount Applied': 'discount_applied',
  'Credit Card Fee': 'credit_card_fee',

  // Jobs
  'Allotted Time (Hours)': 'allotted_time_hours',
  'Assigned Team': 'assigned_team',
  'Start Date': 'start_date',
  'End Date': 'end_date',
  'Details': 'details',
  'Invoice Status': 'invoice_status',
  'Time Tracked': 'time_tracked',
  'Recurrence': 'recurrence',
  'Expense Amount': 'expense_amount',
  'Job Address': 'job_address',
  'GPS Location': 'gps_location',
  'Profit Margin': 'profit_margin',
  'Incentive Status': 'incentive_status',
  'Quote ID': 'quote_id',
  'Job Title': 'job_title',
  'Utility Incentive': 'utility_incentive',
  'Discount': 'discount',
  'Discount Description': 'discount_description',
  'Work Order PDF': 'work_order_pdf',
  'Generate Work Order': 'generate_work_order',

  // Job Lines
  'Job Line ID': 'job_line_id',
  'Price': 'price',
  'Total': 'total',

  // Leads
  'Lead ID': 'lead_id',
  'Lead Source': 'lead_source',
  'Quote Generated': 'quote_generated',
  'Created Date': 'created_at',

  // Lead Payments
  'Payment ID': 'payment_id',
  'Date Created': 'date_created',
  'Setter Pay/Appointment': 'setter_pay_per_appointment',
  'Marketer Pay/Appointment': 'marketer_pay_per_appointment',

  // Appointments
  'Meeting ID': 'meeting_id',
  'Title': 'title',
  'Start Time': 'start_time',
  'End Time': 'end_time',
  'Calendar ID': 'calendar_id',
  'Event ID': 'event_id',
  'Edit Link': 'edit_link',

  // Payments
  'Method': 'method',

  // Products and Services
  'Unit Price': 'unit_price',
  'Markup %': 'markup_percent',
  'Taxable': 'taxable',
  'Image': 'image_url',
  'Active': 'active',

  // Quotes
  'Quote Amount': 'quote_amount',
  'Contract Required': 'contract_required',
  'Contract Signed': 'contract_signed',
  'Follow-Up 1': 'follow_up_1',
  'Follow-Up 2': 'follow_up_2',
  'TempCustomerID': 'temp_customer_id',
  'TempJobID': 'temp_job_id',

  // Quote Lines
  'Line ID': 'line_id',

  // Reports
  'Metric': 'metric',
  'Value': 'value',
  'Profit': 'profit',

  // Routes
  'Route ID': 'route_id',
  'Team': 'team',
  'Job IDs': 'job_ids',
  'Route Order': 'route_order',
  'Total Distance': 'total_distance',
  'Total Time': 'total_time',

  // Sales Pipeline
  'Stage': 'stage',
  'Date Created': 'created_at',
  'Quote Sent Date': 'quote_sent_date',
  'Quote Status': 'quote_status',

  // Time Log
  'Time Log ID': 'time_log_id',
  'Hours': 'hours',
  'Employee Email': 'employee_email',
  'Gusto Synced': 'gusto_synced',
  'Clock In Time': 'clock_in',
  'Clock Out Time': 'clock_out',
  'Is Clocked In': 'is_clocked_in',

  // Utility Invoices
  'Utility Invoice ID': 'utility_invoice_id',

  // Lighting Audits
  'Audit_ID': 'audit_id',
  'Customer_ID': 'customer_id',
  'Created_By': 'created_by',
  'Created_Date': 'created_at',
  'Job_ID': 'job_id',
  'City': 'city',
  'State': 'state',
  'Zip': 'zip',
  'Utility_Provider': 'utility_provider_id',
  'Electric_Rate': 'electric_rate',
  'Operating_Hours': 'operating_hours',
  'Operating_Days': 'operating_days',
  'Total_Proposed_Watts': 'total_proposed_watts',
  'Total_Fixtures': 'total_fixtures',
  'Annual_Savings_kWh': 'annual_savings_kwh',
  'Annual_Savings_Dollars': 'annual_savings_dollars',
  'Estimated_Rebate': 'estimated_rebate',
  'Est_Project_Cost': 'est_project_cost',
  'Net_Cost': 'net_cost',
  'Payback_Months': 'payback_months',
  'Proposal_PDF': 'proposal_pdf',

  // Audit Areas
  'Area_ID': 'area_id',
  'Audit_ID': 'audit_id',
  'Area_Name': 'area_name',
  'Photos': 'photos',
  'Ceiling_Height': 'ceiling_height',
  'AI_Analysis_JSON': 'ai_analysis_json',
  'Fixture_Type_Detected': 'fixture_type_detected',
  'Fixture_Category': 'fixture_category',
  'Fixture_Count': 'fixture_count',
  'Existing_Wattage': 'existing_wattage',
  'Total_Existing_Watts': 'total_existing_watts',
  'LED_Replacement': 'led_replacement',
  'LED_Wattage': 'led_wattage',
  'Total_LED_Watts': 'total_led_watts',
  'Confirmed': 'confirmed',
  'Override_Notes': 'override_notes',

  // Fixture Types
  'Fixture_ID': 'fixture_id',
  'Fixture_Name': 'fixture_name',
  'Lamp_Type': 'lamp_type',
  'Lamp_Count': 'lamp_count',
  'System_Wattage': 'system_wattage',
  'Visual_Characteristics': 'visual_characteristics',
  'LED_Replacement_Watts': 'led_replacement_watts',

  // Utility Providers
  'Provider_ID': 'provider_id',
  'Provider_Name': 'provider_name',
  'Service_Territory': 'service_territory',
  'Has_Rebate_Program': 'has_rebate_program',
  'Rebate_Program_URL': 'rebate_program_url',
  'Contact_Phone': 'contact_phone',

  // Utility Programs
  'Program_ID': 'program_id',
  'Program_Name': 'program_name',
  'Program_Type': 'program_type',
  'Effective_Date': 'effective_date',
  'Expiration_Date': 'expiration_date',
  'Max_Cap_Percent': 'max_cap_percent',
  'Annual_Cap_Dollars': 'annual_cap_dollars',
  'Business_Size': 'business_size',
  'DLC_Required': 'dlc_required',
  'Pre_Approval_Required': 'pre_approval_required',
  'Program_URL': 'program_url',
  'PDF_URL': 'pdf_url',
  'Last_Verified': 'last_verified',
  'AI_Can_Update': 'ai_can_update',

  // Rebate Rates
  'Rate_ID': 'rate_id',
  'Program_ID': 'program_id',
  'Location_Type': 'location_type',
  'Control_Level': 'control_level',
  'Calc_Method': 'calc_method',
  'Rate': 'rate',
  'Rate_Unit': 'rate_unit',
  'Min_Watts': 'min_watts',
  'Max_Watts': 'max_watts',

  // AI Modules
  'Module_ID': 'module_id',
  'Module_Name': 'module_name',
  'Trigger_Keywords': 'trigger_keywords',
  'Tables_Used': 'tables_used',
  'System_Prompt': 'system_prompt',
  'Icon': 'icon'
};

// Sheet name to table name mapping
const SHEET_TO_TABLE = {
  'BOOKINGS': 'bookings',
  'COMMUNICATIONS LOG': 'communications_log',
  'CUSTOM FORMS': 'custom_forms',
  'CUSTOMERS': 'customers',
  'EMPLOYEES': 'employees',
  'EXPENSES': 'expenses',
  'FLEET': 'fleet',
  'FLEET MAINTENANCE': 'fleet_maintenance',
  'FLEET RENTALS': 'fleet_rentals',
  'HELPERS': 'helpers',
  'INVENTORY': 'inventory',
  'INCENTIVES': 'incentives',
  'INVOICES': 'invoices',
  'JOBS': 'jobs',
  'JOB LINES': 'job_lines',
  'LEADS': 'leads',
  'LEAD PAYMENTS': 'lead_payments',
  'APPOINTMENTS': 'appointments',
  'PAYMENTS': 'payments',
  'PRODUCTS AND SERVICES': 'products_services',
  'QUOTES LOG': 'quotes',
  'QUOTE LINES': 'quote_lines',
  'REPORTS': 'reports',
  'ROUTES': 'routes',
  'SALES PIPELINE': 'sales_pipeline',
  'SEARCH INDEX': 'search_index',
  'SETTINGS': 'settings',
  'TIME LOG': 'time_log',
  'UTILITY INVOICES': 'utility_invoices',
  'AI_SESSIONS': 'ai_sessions',
  'AI_MESSAGES': 'ai_messages',
  'AI_MODULES': 'ai_modules',
  'LIGHTING_AUDITS': 'lighting_audits',
  'AUDIT_AREAS': 'audit_areas',
  'FIXTURE_TYPES': 'fixture_types',
  'UTILITY_PROVIDERS': 'utility_providers',
  'UTILITY_PROGRAMS': 'utility_programs',
  'REBATE_RATES': 'rebate_rates',
  'REBATE_UPDATE_LOG': 'rebate_update_log',
  'SYNCLOG': 'sync_log',
  'WEBHOOK FORM': 'webhook_form'
};

// Convert Excel column name to Supabase column name
function mapColumnName(excelColumn) {
  // Trim whitespace first (handles "Business Name " -> "Business Name")
  const trimmed = excelColumn.trim();

  // Check exact mapping first (after trimming)
  if (COLUMN_MAPPINGS[trimmed]) {
    return COLUMN_MAPPINGS[trimmed];
  }

  // Convert to snake_case properly:
  // 1. Handle "Column_Name" format (underscore between words) - just lowercase it
  // 2. Handle "Column Name" format (space between words) - replace space with underscore
  // 3. Handle "ColumnName" format (camelCase) - insert underscore before caps

  let result = trimmed;

  // If it already has underscores, just lowercase it
  if (result.includes('_')) {
    result = result.toLowerCase();
  } else {
    // Convert camelCase/PascalCase to snake_case
    result = result
      .replace(/([a-z])([A-Z])/g, '$1_$2')  // Insert _ between lower and upper
      .replace(/\s+/g, '_')                  // Replace spaces with _
      .toLowerCase();
  }

  // Clean up: remove non-alphanumeric except underscore, collapse multiple underscores, remove leading/trailing underscores
  result = result
    .replace(/[^a-z0-9_]/g, '')
    .replace(/_+/g, '_')
    .replace(/^_/, '')
    .replace(/_$/, '');

  return result;
}

// Parse value for Supabase
function parseValue(value, columnName) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  // Handle boolean fields
  const booleanFields = ['active', 'taxable', 'marketing_opt_in', 'gps_opt_in',
    'quote_generated', 'contract_required', 'contract_signed', 'gusto_synced',
    'is_clocked_in', 'has_rebate_program', 'dlc_required', 'pre_approval_required',
    'ai_can_update', 'confirmed', 'generate_work_order'];

  if (booleanFields.includes(columnName)) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'yes';
    }
    return Boolean(value);
  }

  // Handle date fields
  const dateFields = ['preferred_date', 'start_date', 'end_date', 'date',
    'last_pm_date', 'next_pm_due', 'repair_date', 'rental_start_date', 'rental_end_date',
    'last_updated', 'sent_date', 'follow_up_1', 'follow_up_2', 'route_date',
    'effective_date', 'expiration_date', 'last_verified', 'invoice_date',
    'payment_date', 'date_created'];

  if (dateFields.includes(columnName)) {
    if (value instanceof Date) {
      return value.toISOString().split('T')[0];
    }
    // Excel date serial number
    if (typeof value === 'number') {
      const date = new Date((value - 25569) * 86400 * 1000);
      return date.toISOString().split('T')[0];
    }
    return value;
  }

  // Handle timestamp fields
  const timestampFields = ['start_time', 'end_time', 'clock_in', 'clock_out',
    'created_at', 'updated_at', 'timestamp', 'started', 'last_activity', 'appointment_time'];

  if (timestampFields.includes(columnName)) {
    if (value instanceof Date) {
      return value.toISOString();
    }
    // Excel date serial number
    if (typeof value === 'number') {
      const date = new Date((value - 25569) * 86400 * 1000);
      return date.toISOString();
    }
    return value;
  }

  // Handle numeric fields
  const numericFields = ['amount', 'quantity', 'min_quantity', 'available', 'cost',
    'unit_price', 'markup_percent', 'price', 'total', 'quote_amount', 'discount',
    'discount_applied', 'credit_card_fee', 'hours', 'allotted_time_hours', 'time_tracked',
    'expense_amount', 'profit_margin', 'incentive_amount', 'utility_incentive',
    'mileage_hours', 'repair_cost', 'rental_rate', 'rate', 'min_watts', 'max_watts',
    'electric_rate', 'operating_hours', 'operating_days', 'total_proposed_watts',
    'total_fixtures', 'annual_savings_kwh', 'annual_savings_dollars', 'estimated_rebate',
    'est_project_cost', 'net_cost', 'payback_months', 'ceiling_height', 'fixture_count',
    'existing_wattage', 'total_existing_watts', 'led_wattage', 'total_led_watts',
    'lamp_count', 'system_wattage', 'led_replacement_watts', 'max_cap_percent',
    'annual_cap_dollars', 'total_distance', 'total_time', 'setter_pay_per_appointment',
    'marketer_pay_per_appointment', 'value', 'profit'];

  if (numericFields.includes(columnName)) {
    const num = parseFloat(value);
    return isNaN(num) ? null : num;
  }

  // Handle array fields
  const arrayFields = ['tags', 'assigned_team', 'job_ids', 'route_order', 'photos',
    'dynamic_list', 'trigger_keywords', 'tables_used', 'actions_taken'];

  if (arrayFields.includes(columnName)) {
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      return value.split(',').map(s => s.trim()).filter(s => s);
    }
    return null;
  }

  // Handle JSON fields
  const jsonFields = ['context_json', 'ai_analysis_json', 'entities_json', 'pending_data'];

  if (jsonFields.includes(columnName)) {
    if (typeof value === 'object') return value;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  return value;
}

// Columns that are TEXT IDs from AppSheet (not UUID foreign keys)
// These store the AppSheet ID strings like "J001", "C001", etc.
const TEXT_ID_COLUMNS = [
  'job_id', 'customer_id', 'lead_id', 'quote_id', 'invoice_id', 'employee_id',
  'booking_id', 'expense_id', 'asset_id', 'item_id', 'incentive_id', 'payment_id',
  'route_id', 'audit_id', 'area_id', 'fixture_id', 'provider_id', 'program_id',
  'rate_id', 'maintenance_id', 'rental_id', 'form_id', 'communication_id',
  'time_log_id', 'utility_invoice_id', 'job_line_id', 'line_id', 'meeting_id',
  'module_id', 'session_id', 'message_id', 'log_id', 'event_id', 'calendar_id'
];

// Columns that should be skipped entirely
const SKIP_COLUMNS = ['id', '_empty', 'salesperson_id', 'empty', 'fleet_id'];

// Table-specific columns to skip (UUID FK columns that conflict with TEXT IDs from Excel)
// These tables have UUID FK columns that can't accept TEXT values like "C001", "J001"
const TABLE_SKIP_COLUMNS = {
  'jobs': ['customer_id', 'quote_id'],  // UUID FKs
  'quotes': ['lead_id', 'customer_id'],  // UUID FKs
  'quote_lines': ['quote_id', 'item_id'],  // UUID FKs
  'invoices': ['customer_id', 'job_id'],  // UUID FKs
  'job_lines': ['job_id', 'item_id'],  // UUID FKs
  'expenses': ['job_id', 'employee_id'],  // UUID FKs
  'incentives': ['job_id', 'program_id'],  // UUID FKs
  'payments': ['invoice_id'],  // UUID FK
  'lead_payments': ['lead_id'],  // UUID FK
  'appointments': ['lead_id', 'customer_id', 'employee_id'],  // UUID FKs
  'sales_pipeline': ['lead_id', 'customer_id'],  // UUID FKs
  'utility_invoices': ['customer_id', 'job_id', 'utility_provider_id'],  // UUID FKs
  'custom_forms': ['job_id'],  // UUID FK
  'fleet_rentals': ['asset_id'],  // UUID FK (maps to fleet.id)
  'fleet_maintenance': ['asset_id'],  // UUID FK (maps to fleet.id)
  'lighting_audits': ['customer_id', 'job_id', 'utility_provider_id'],  // UUID FKs
  'audit_areas': ['audit_id', 'led_replacement'],  // UUID FKs
  'rebate_rates': ['program_id'],  // UUID FK
  'time_log': ['job_id', 'employee_id']  // UUID FKs
};

// Import a single sheet
async function importSheet(sheetName, data, tableName) {
  if (!data || data.length === 0) {
    console.log(`  Skipping ${sheetName}: No data`);
    return { inserted: 0, errors: 0 };
  }

  console.log(`  Importing ${sheetName} -> ${tableName} (${data.length} rows)`);

  let inserted = 0;
  let errors = 0;

  for (const row of data) {
    try {
      // Map columns
      const record = { company_id: COMPANY_ID };

      for (const [excelCol, value] of Object.entries(row)) {
        const dbCol = mapColumnName(excelCol);

        // Skip certain columns globally
        if (!dbCol || SKIP_COLUMNS.includes(dbCol)) continue;

        // Skip table-specific UUID FK columns
        const tableSkips = TABLE_SKIP_COLUMNS[tableName] || [];
        if (tableSkips.includes(dbCol)) continue;

        // For TEXT ID columns, keep the value as-is (string)
        if (TEXT_ID_COLUMNS.includes(dbCol)) {
          record[dbCol] = value ? String(value) : null;
        } else {
          record[dbCol] = parseValue(value, dbCol);
        }
      }

      // Skip empty records
      if (Object.keys(record).length <= 1) continue;

      // Insert record
      const { error } = await supabase.from(tableName).insert(record);

      if (error) {
        console.error(`    Error inserting into ${tableName}:`, error.message);
        errors++;
      } else {
        inserted++;
      }
    } catch (err) {
      console.error(`    Exception:`, err.message);
      errors++;
    }
  }

  return { inserted, errors };
}

// Main import function
async function importData() {
  console.log('='.repeat(60));
  console.log('Job Scout Data Import');
  console.log('='.repeat(60));

  // Read Excel file
  const excelPath = join(__dirname, '..', 'data', 'Job_Scout_Database.xlsx');
  console.log(`\nReading: ${excelPath}`);

  let workbook;
  try {
    workbook = XLSX.readFile(excelPath);
  } catch (err) {
    console.error('Failed to read Excel file:', err.message);
    process.exit(1);
  }

  console.log(`Found ${workbook.SheetNames.length} sheets\n`);

  const results = {
    total_inserted: 0,
    total_errors: 0,
    sheets_processed: 0
  };

  // Process each sheet
  for (const sheetName of workbook.SheetNames) {
    const tableName = SHEET_TO_TABLE[sheetName.toUpperCase()];

    if (!tableName) {
      console.log(`Skipping unknown sheet: ${sheetName}`);
      continue;
    }

    // Parse sheet data
    const sheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet);

    const { inserted, errors } = await importSheet(sheetName, data, tableName);

    results.total_inserted += inserted;
    results.total_errors += errors;
    results.sheets_processed++;

    console.log(`    -> Inserted: ${inserted}, Errors: ${errors}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('Import Complete');
  console.log('='.repeat(60));
  console.log(`Sheets Processed: ${results.sheets_processed}`);
  console.log(`Total Inserted: ${results.total_inserted}`);
  console.log(`Total Errors: ${results.total_errors}`);
}

// Run import
importData().catch(console.error);

// Field definitions for AI-powered import/export across all major data pages.
// Each array defines the importable/exportable fields for a Supabase table.
// Human-readable reference IDs (job_id, quote_id, invoice_id) are included for multi-sheet XLSX linking.

export const leadsFields = [
  { field: 'lead_id', label: 'Lead ID', type: 'text', desc: 'Unique lead identifier' },
  { field: 'customer_name', label: 'Customer Name', type: 'text', required: true, desc: 'Full name of the lead / contact' },
  { field: 'business_name', label: 'Business Name', type: 'text', desc: 'Company or business name' },
  { field: 'job_title', label: 'Job Title', type: 'text', desc: 'Contact job title or role' },
  { field: 'email', label: 'Email', type: 'text', desc: 'Email address' },
  { field: 'phone', label: 'Phone', type: 'text', desc: 'Phone number' },
  { field: 'mobile_phone', label: 'Mobile Phone', type: 'text', desc: 'Mobile phone number' },
  { field: 'address', label: 'Address', type: 'text', desc: 'Street address' },
  { field: 'city', label: 'City', type: 'text', desc: 'City' },
  { field: 'state', label: 'State', type: 'text', desc: 'State or province' },
  { field: 'zip', label: 'ZIP Code', type: 'text', desc: 'ZIP or postal code' },
  { field: 'service_type', label: 'Service Type', type: 'text', desc: 'Type of service requested' },
  { field: 'lead_source', label: 'Lead Source', type: 'text', desc: 'How the lead was acquired (e.g. website, referral, purchased list)' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Lead status (New, Contacted, Qualified, Won, Lost, etc.)' },
  { field: 'priority', label: 'Priority', type: 'text', desc: 'Lead priority (Low, Normal, High, Urgent)' },
  { field: 'estimated_value', label: 'Estimated Value', type: 'number', desc: 'Estimated deal value in dollars' },
  { field: 'probability', label: 'Probability', type: 'number', desc: 'Win probability percentage (0-100)' },
  { field: 'follow_up_date', label: 'Follow-Up Date', type: 'date', desc: 'Next follow-up date' },
  { field: 'last_contact', label: 'Last Contact', type: 'date', desc: 'Date of last contact' },
  { field: 'appointment_time', label: 'Appointment Time', type: 'date', desc: 'Scheduled appointment date/time' },
  { field: 'appointment_notes', label: 'Appointment Notes', type: 'text', desc: 'Appointment notes' },
  { field: 'property_type', label: 'Property Type', type: 'text', desc: 'Property type (Residential, Commercial, Industrial)' },
  { field: 'property_size', label: 'Property Size', type: 'text', desc: 'Property size or square footage' },
  { field: 'utility_provider', label: 'Utility Provider', type: 'text', desc: 'Utility provider name' },
  { field: 'current_fixtures', label: 'Current Fixtures', type: 'text', desc: 'Current fixture information' },
  { field: 'business_unit', label: 'Business Unit', type: 'text', desc: 'Business unit or division' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Additional notes or comments' },
]

export const customersFields = [
  { field: 'name', label: 'Name', type: 'text', required: true, desc: 'Customer full name' },
  { field: 'business_name', label: 'Business Name', type: 'text', desc: 'Company or business name' },
  { field: 'email', label: 'Email', type: 'text', desc: 'Email address' },
  { field: 'phone', label: 'Phone', type: 'text', desc: 'Phone number' },
  { field: 'address', label: 'Address', type: 'text', desc: 'Full address (street, city, state, zip)' },
  { field: 'job_title', label: 'Job Title', type: 'text', desc: 'Job title of primary contact' },
  { field: 'preferred_contact', label: 'Preferred Contact', type: 'text', desc: 'Preferred contact method (Phone, Email, Text)' },
  { field: 'marketing_opt_in', label: 'Marketing Opt-In', type: 'boolean', desc: 'Whether customer has opted in to marketing' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Customer status (Active, Inactive, Prospect)' },
  { field: 'secondary_contact_name', label: 'Secondary Contact Name', type: 'text', desc: 'Name of secondary contact person' },
  { field: 'secondary_contact_email', label: 'Secondary Contact Email', type: 'text', desc: 'Email of secondary contact' },
  { field: 'secondary_contact_phone', label: 'Secondary Contact Phone', type: 'text', desc: 'Phone number of secondary contact' },
  { field: 'secondary_contact_role', label: 'Secondary Contact Role', type: 'text', desc: 'Role of secondary contact' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Additional notes' },
]

export const jobsFields = [
  { field: 'job_id', label: 'Job ID', type: 'text', desc: 'Unique job identifier (e.g. JOB-ABC123). Auto-generated if blank.' },
  { field: 'customer_name', label: 'Customer Name', type: 'text', virtual: true, desc: 'Customer or client name (matched to customer_id on import)' },
  { field: 'job_title', label: 'Job Title', type: 'text', required: true, desc: 'Title or name of the job' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Job status (Scheduled, In Progress, Completed, Cancelled)' },
  { field: 'business_unit', label: 'Business Unit', type: 'text', desc: 'Business unit or division' },
  // Location
  { field: 'job_address', label: 'Job Address', type: 'text', desc: 'Full address (auto-parsed into city/state/zip)' },
  // Scheduling
  { field: 'start_date', label: 'Start Date', type: 'date', desc: 'Job start date' },
  { field: 'end_date', label: 'End Date', type: 'date', desc: 'Job end date' },
  // Crew
  { field: 'assigned_team', label: 'Team', type: 'text', desc: 'Assigned team name' },
  // Hours & time
  { field: 'allotted_time_hours', label: 'Allotted Hours', type: 'number', desc: 'Estimated hours for the job' },
  { field: 'time_tracked', label: 'Time Tracked', type: 'number', desc: 'Tracked time in hours' },
  // Financials
  { field: 'utility_incentive', label: 'Utility Incentive', type: 'number', desc: 'Utility rebate / incentive amount' },
  { field: 'discount', label: 'Discount', type: 'number', desc: 'Discount amount' },
  { field: 'discount_description', label: 'Discount Description', type: 'text', desc: 'Description of the discount' },
  { field: 'expense_amount', label: 'Expense Amount', type: 'number', desc: 'Additional expense amount' },
  { field: 'profit_margin', label: 'Profit Margin', type: 'number', desc: 'Profit margin percentage' },
  { field: 'invoice_status', label: 'Invoice Status', type: 'text', desc: 'Invoice status (Not Invoiced, Invoiced, Paid)' },
  { field: 'recurrence', label: 'Recurrence', type: 'text', desc: 'Recurrence pattern (None, Weekly, Monthly, etc.)' },
  // Description & notes
  { field: 'details', label: 'Details', type: 'text', desc: 'Job details' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Additional notes' },
  { field: 'gps_location', label: 'GPS Location', type: 'text', desc: 'GPS coordinates' },
]

// Verified against production DB: quotes has quote_id, business_unit, customer_id, salesperson_id,
// quote_amount, sent_date, status, contract_required, contract_signed, follow_up_1, follow_up_2,
// job_title, utility_incentive, discount, discount_description, service_type, notes,
// estimate_name, summary, expiration_date, service_date, estimate_message,
// deposit_amount, deposit_method, deposit_date, deposit_notes, job_id, pdf_url
export const quotesFields = [
  { field: 'quote_id', label: 'Quote ID', type: 'text', desc: 'Unique quote identifier (e.g. QUO-ABC123). Auto-generated if blank.' },
  { field: 'customer_name', label: 'Customer Name', type: 'text', virtual: true, desc: 'Customer or client name (matched to customer_id on import)' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Quote status (Draft, Sent, Approved, Rejected)' },
  { field: 'sent_date', label: 'Sent Date', type: 'date', desc: 'Date the quote was sent' },
  { field: 'job_title', label: 'Job Title', type: 'text', desc: 'Job title for the quote' },
  { field: 'business_unit', label: 'Business Unit', type: 'text', desc: 'Business unit or division' },
  { field: 'quote_amount', label: 'Quote Amount', type: 'number', desc: 'Total quote amount' },
  { field: 'utility_incentive', label: 'Utility Incentive', type: 'number', desc: 'Utility rebate / incentive amount' },
  { field: 'discount', label: 'Discount', type: 'number', desc: 'Discount amount' },
  { field: 'discount_description', label: 'Discount Description', type: 'text', desc: 'Description of the discount' },
  { field: 'contract_required', label: 'Contract Required', type: 'boolean', desc: 'Whether a contract is required' },
  { field: 'contract_signed', label: 'Contract Signed', type: 'boolean', desc: 'Whether the contract has been signed' },
  { field: 'service_type', label: 'Service Type', type: 'text', desc: 'Type of service' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Quote notes or description' },
]

// Same table as quotes — uses estimate-specific columns
export const estimatesFields = [
  { field: 'quote_id', label: 'Estimate ID', type: 'text', desc: 'Unique estimate identifier (e.g. EST-ABC123). Auto-generated if blank.' },
  { field: 'customer_name', label: 'Customer Name', type: 'text', virtual: true, desc: 'Customer or client name (matched to customer_id on import)' },
  { field: 'estimate_name', label: 'Estimate Name', type: 'text', desc: 'Display name for the estimate' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Estimate status (Draft, Sent, Approved, Rejected, Expired)' },
  { field: 'summary', label: 'Summary', type: 'text', desc: 'Estimate summary or scope description' },
  { field: 'expiration_date', label: 'Expiration Date', type: 'date', desc: 'When the estimate expires' },
  { field: 'service_date', label: 'Service Date', type: 'date', desc: 'Planned service date' },
  { field: 'sent_date', label: 'Sent Date', type: 'date', desc: 'Date the estimate was sent' },
  { field: 'estimate_message', label: 'Message', type: 'text', desc: 'Message to customer' },
  { field: 'job_title', label: 'Job Title', type: 'text', desc: 'Job title for the estimate' },
  { field: 'business_unit', label: 'Business Unit', type: 'text', desc: 'Business unit or division' },
  { field: 'quote_amount', label: 'Estimate Amount', type: 'number', desc: 'Total estimate amount' },
  { field: 'utility_incentive', label: 'Utility Incentive', type: 'number', desc: 'Utility rebate / incentive amount' },
  { field: 'discount', label: 'Discount', type: 'number', desc: 'Discount amount' },
  { field: 'discount_description', label: 'Discount Description', type: 'text', desc: 'Description of the discount' },
  { field: 'deposit_amount', label: 'Deposit Amount', type: 'number', desc: 'Deposit amount collected' },
  { field: 'deposit_method', label: 'Deposit Method', type: 'text', desc: 'Deposit payment method' },
  { field: 'deposit_date', label: 'Deposit Date', type: 'date', desc: 'Date deposit was received' },
  { field: 'deposit_notes', label: 'Deposit Notes', type: 'text', desc: 'Notes about the deposit' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Estimate notes or description' },
]

// Verified against production DB: invoices table has invoice_id, business_unit, customer_id, job_id,
// amount, payment_method, payment_status, discount_applied, credit_card_fee, job_description, is_locked
export const invoicesFields = [
  { field: 'invoice_id', label: 'Invoice ID', type: 'text', desc: 'Unique invoice identifier (e.g. INV-ABC123). Auto-generated if blank.' },
  { field: 'customer_name', label: 'Customer Name', type: 'text', virtual: true, desc: 'Customer or client name (matched to customer_id on import)' },
  { field: 'business_unit', label: 'Business Unit', type: 'text', desc: 'Business unit or division' },
  { field: 'payment_status', label: 'Status', type: 'text', desc: 'Payment status (Pending, Paid, Overdue, Cancelled)' },
  { field: 'amount', label: 'Amount', type: 'number', desc: 'Invoice amount / total' },
  { field: 'payment_method', label: 'Payment Method', type: 'text', desc: 'Payment method (Cash, Check, Credit Card, ACH)' },
  { field: 'discount_applied', label: 'Discount Applied', type: 'number', desc: 'Discount amount applied' },
  { field: 'credit_card_fee', label: 'CC Fee', type: 'number', desc: 'Credit card processing fee' },
  { field: 'job_description', label: 'Description', type: 'text', desc: 'Invoice / job description' },
]

export const employeesFields = [
  { field: 'name', label: 'Name', type: 'text', required: true, desc: 'Employee full name' },
  { field: 'email', label: 'Email', type: 'text', desc: 'Email address' },
  { field: 'phone', label: 'Phone', type: 'text', desc: 'Phone number' },
  { field: 'role', label: 'Role', type: 'text', desc: 'Job role (e.g. Field Tech, Sales, Manager, Admin)' },
  { field: 'business_unit', label: 'Business Unit', type: 'text', desc: 'Business unit or division' },
  { field: 'employee_id', label: 'Employee ID', type: 'text', desc: 'Internal employee identifier' },
  { field: 'tax_classification', label: 'Tax Class', type: 'text', desc: 'Tax classification (W2 or 1099)' },
  { field: 'hourly_rate', label: 'Hourly Rate', type: 'number', desc: 'Hourly pay rate in dollars' },
  { field: 'annual_salary', label: 'Annual Salary', type: 'number', desc: 'Annual salary in dollars' },
]

export const productsServicesFields = [
  { field: 'name', label: 'Product Name', type: 'text', required: true, desc: 'Product or service name' },
  { field: 'description', label: 'Description', type: 'text', desc: 'Product description' },
  { field: 'type', label: 'Service Type', type: 'text', desc: 'Service type or category' },
  { field: 'unit_price', label: 'Unit Price', type: 'number', desc: 'Selling price per unit in dollars' },
  { field: 'cost', label: 'Cost', type: 'number', desc: 'Cost / wholesale price in dollars' },
  { field: 'markup_percent', label: 'Markup %', type: 'number', desc: 'Markup percentage (0-100+)' },
  { field: 'taxable', label: 'Taxable', type: 'boolean', desc: 'Whether the product is taxable' },
  { field: 'active', label: 'Active', type: 'boolean', desc: 'Whether the product is active/available' },
  { field: 'allotted_time_hours', label: 'Labor Hours', type: 'number', desc: 'Estimated labor hours for this product/service' },
]

export const inventoryFields = [
  { field: 'name', label: 'Item Name', type: 'text', required: true, desc: 'Inventory item name' },
  { field: 'inventory_type', label: 'Type', type: 'text', desc: 'Inventory type (Material, Tool, Consumable)' },
  { field: 'quantity', label: 'Quantity', type: 'number', desc: 'Current quantity on hand' },
  { field: 'min_quantity', label: 'Min Quantity', type: 'number', desc: 'Minimum quantity threshold for reorder alerts' },
  { field: 'location', label: 'Location', type: 'text', desc: 'Storage location' },
  { field: 'condition', label: 'Condition', type: 'text', desc: 'Item condition (Good, Fair, Poor, Out of Service)' },
  { field: 'serial_number', label: 'Serial Number', type: 'text', desc: 'Serial number' },
  { field: 'barcode', label: 'Barcode', type: 'text', desc: 'Barcode value' },
]

export const appointmentsFields = [
  { field: 'title', label: 'Title', type: 'text', required: true, desc: 'Appointment title or subject' },
  { field: 'start_time', label: 'Start Time', type: 'date', desc: 'Start date and time' },
  { field: 'end_time', label: 'End Time', type: 'date', desc: 'End date and time' },
  { field: 'location', label: 'Location', type: 'text', desc: 'Appointment location or address' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Appointment status (Scheduled, Completed, Cancelled, No Show)' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Additional notes' },
]

export const fleetFields = [
  { field: 'name', label: 'Name', type: 'text', required: true, desc: 'Vehicle or asset name' },
  { field: 'asset_id', label: 'Asset ID', type: 'text', desc: 'Unique asset identifier or VIN' },
  { field: 'type', label: 'Type', type: 'text', desc: 'Asset type (Vehicle, Trailer, Equipment, Tool)' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Current status (Available, In Use, Maintenance, Out of Service)' },
  { field: 'mileage_hours', label: 'Mileage/Hours', type: 'number', desc: 'Current mileage or operating hours' },
]

// --- Related / child table field definitions (for multi-sheet XLSX export/import) ---

// Verified against production DB: job_lines has job_line_id, job_id, item_id, quantity, price, total, description, notes
export const jobLinesFields = [
  { field: 'item_name', label: 'Product/Service', type: 'text', virtual: true, desc: 'Product or service name (matched to item_id on import)' },
  { field: 'description', label: 'Description', type: 'text', desc: 'Line item description' },
  { field: 'quantity', label: 'Quantity', type: 'number', required: true, desc: 'Quantity' },
  { field: 'price', label: 'Unit Price', type: 'number', required: true, desc: 'Price per unit' },
  { field: 'total', label: 'Line Total', type: 'number', desc: 'Line total' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Line item notes' },
]

export const jobSectionsFields = [
  { field: 'name', label: 'Section Name', type: 'text', required: true, desc: 'Section name' },
  { field: 'description', label: 'Description', type: 'text', desc: 'Section description' },
  { field: 'sort_order', label: 'Sort Order', type: 'number', desc: 'Display order' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Status (Not Started, In Progress, Complete, Verified)' },
  { field: 'percent_of_job', label: '% of Job', type: 'number', desc: 'Percentage of total job' },
  { field: 'scheduled_date', label: 'Scheduled Date', type: 'date', desc: 'Scheduled date' },
  { field: 'start_time', label: 'Start Time', type: 'date', desc: 'Section start time' },
  { field: 'end_time', label: 'End Time', type: 'date', desc: 'Section end time' },
  { field: 'estimated_hours', label: 'Est. Hours', type: 'number', desc: 'Estimated hours' },
  { field: 'actual_hours', label: 'Actual Hours', type: 'number', desc: 'Actual hours worked' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Section notes' },
]

// Verified against production DB: quote_lines has line_id, quote_id, item_id, item_name, quantity, price, line_total, total, description, sort_order, image_url
export const quoteLinesFields = [
  { field: 'item_name', label: 'Product/Service', type: 'text', desc: 'Product or service name' },
  { field: 'description', label: 'Description', type: 'text', desc: 'Line item description' },
  { field: 'quantity', label: 'Quantity', type: 'number', required: true, desc: 'Quantity' },
  { field: 'price', label: 'Unit Price', type: 'number', required: true, desc: 'Price per unit' },
  { field: 'line_total', label: 'Line Total', type: 'number', desc: 'Line total' },
  { field: 'sort_order', label: 'Sort Order', type: 'number', desc: 'Display order' },
]

// NOTE: invoice_lines table does NOT exist in production DB. Invoices have no line items table.

// Verified against production DB: payments has payment_id, invoice_id, amount, date, method, status, notes
export const paymentsFields = [
  { field: 'payment_id', label: 'Payment ID', type: 'text', desc: 'Payment reference ID' },
  { field: 'amount', label: 'Amount', type: 'number', required: true, desc: 'Payment amount' },
  { field: 'date', label: 'Payment Date', type: 'date', required: true, desc: 'Date of payment' },
  { field: 'method', label: 'Payment Method', type: 'text', desc: 'Payment method (Cash, Check, Credit Card, ACH)' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Payment status (Pending, Paid, Completed)' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Payment notes' },
]

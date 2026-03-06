// Field definitions for AI-powered import/export across all major data pages.
// Each array defines the importable/exportable fields for a Supabase table.
// Human-readable reference IDs (job_id, quote_id, invoice_id) are included for multi-sheet XLSX linking.

export const leadsFields = [
  { field: 'customer_name', label: 'Customer Name', type: 'text', required: true, desc: 'Full name of the lead / contact' },
  { field: 'business_name', label: 'Business Name', type: 'text', desc: 'Company or business name' },
  { field: 'email', label: 'Email', type: 'text', desc: 'Email address' },
  { field: 'phone', label: 'Phone', type: 'text', desc: 'Phone number' },
  { field: 'address', label: 'Address', type: 'text', desc: 'Street address' },
  { field: 'service_type', label: 'Service Type', type: 'text', desc: 'Type of service requested' },
  { field: 'lead_source', label: 'Lead Source', type: 'text', desc: 'How the lead was acquired (e.g. website, referral, purchased list)' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Lead status (New, Contacted, Qualified, Won, Lost, etc.)' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Additional notes or comments' },
  { field: 'job_title', label: 'Job Title', type: 'text', desc: 'Contact job title or role' },
]

export const customersFields = [
  { field: 'name', label: 'Name', type: 'text', required: true, desc: 'Customer full name' },
  { field: 'business_name', label: 'Business Name', type: 'text', desc: 'Company or business name' },
  { field: 'email', label: 'Email', type: 'text', desc: 'Email address' },
  { field: 'phone', label: 'Phone', type: 'text', desc: 'Phone number' },
  { field: 'address', label: 'Address', type: 'text', desc: 'Street address' },
  { field: 'city', label: 'City', type: 'text', desc: 'City' },
  { field: 'state', label: 'State', type: 'text', desc: 'State or province' },
  { field: 'zip', label: 'ZIP Code', type: 'text', desc: 'ZIP or postal code' },
  { field: 'preferred_contact', label: 'Preferred Contact', type: 'text', desc: 'Preferred contact method (Phone, Email, Text)' },
  { field: 'secondary_contact_name', label: 'Secondary Contact Name', type: 'text', desc: 'Name of secondary contact person' },
  { field: 'secondary_contact_email', label: 'Secondary Contact Email', type: 'text', desc: 'Email of secondary contact' },
  { field: 'secondary_contact_phone', label: 'Secondary Contact Phone', type: 'text', desc: 'Phone number of secondary contact' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Additional notes' },
]

export const jobsFields = [
  { field: 'job_id', label: 'Job ID', type: 'text', desc: 'Unique job identifier (e.g. JOB-ABC123). Auto-generated if blank.' },
  { field: 'job_title', label: 'Job Title', type: 'text', required: true, desc: 'Title or name of the job' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Job status (Scheduled, In Progress, Completed, Cancelled)' },
  { field: 'priority', label: 'Priority', type: 'text', desc: 'Priority level (Low, Normal, High, Urgent)' },
  { field: 'job_type', label: 'Job Type', type: 'text', desc: 'Type of job' },
  { field: 'job_category', label: 'Category', type: 'text', desc: 'Job category' },
  { field: 'business_unit', label: 'Business Unit', type: 'text', desc: 'Business unit or division' },
  // Location
  { field: 'job_address', label: 'Job Address', type: 'text', desc: 'Street address where the job takes place' },
  { field: 'job_city', label: 'City', type: 'text', desc: 'Job city' },
  { field: 'job_state', label: 'State', type: 'text', desc: 'Job state' },
  { field: 'job_zip', label: 'ZIP', type: 'text', desc: 'Job ZIP code' },
  { field: 'job_location', label: 'Location', type: 'text', desc: 'Location name or description' },
  // Scheduling
  { field: 'start_date', label: 'Start Date', type: 'date', desc: 'Job start date' },
  { field: 'end_date', label: 'End Date', type: 'date', desc: 'Job end date' },
  { field: 'scheduled_start', label: 'Scheduled Start', type: 'date', desc: 'Scheduled start date/time' },
  { field: 'scheduled_end', label: 'Scheduled End', type: 'date', desc: 'Scheduled end date/time' },
  // Crew
  { field: 'assigned_team', label: 'Team', type: 'text', desc: 'Assigned team name' },
  { field: 'assigned_crew', label: 'Crew', type: 'text', desc: 'Assigned crew' },
  { field: 'crew_size', label: 'Crew Size', type: 'number', desc: 'Number of crew members' },
  // Hours & time
  { field: 'allotted_time_hours', label: 'Allotted Hours', type: 'number', desc: 'Estimated hours for the job' },
  { field: 'estimated_hours', label: 'Estimated Hours', type: 'number', desc: 'Estimated total hours' },
  { field: 'actual_hours', label: 'Actual Hours', type: 'number', desc: 'Actual hours worked' },
  // Financials
  { field: 'contract_amount', label: 'Contract Amount', type: 'number', desc: 'Contract / quoted amount in dollars' },
  { field: 'labor_cost', label: 'Labor Cost', type: 'number', desc: 'Total labor cost' },
  { field: 'material_cost', label: 'Material Cost', type: 'number', desc: 'Total material cost' },
  { field: 'other_cost', label: 'Other Cost', type: 'number', desc: 'Other costs' },
  { field: 'total_cost', label: 'Total Cost', type: 'number', desc: 'Total job cost' },
  { field: 'billing_type', label: 'Billing Type', type: 'text', desc: 'Billing type (Fixed, Hourly, T&M)' },
  { field: 'hourly_rate', label: 'Hourly Rate', type: 'number', desc: 'Hourly billing rate' },
  { field: 'invoice_status', label: 'Invoice Status', type: 'text', desc: 'Invoice status (Not Invoiced, Invoiced, Paid)' },
  { field: 'po_number', label: 'PO Number', type: 'text', desc: 'Purchase order number' },
  // Permits & inspection
  { field: 'permit_required', label: 'Permit Required', type: 'boolean', desc: 'Whether a permit is required' },
  { field: 'permit_number', label: 'Permit Number', type: 'text', desc: 'Permit number' },
  { field: 'permit_status', label: 'Permit Status', type: 'text', desc: 'Permit status' },
  { field: 'inspection_required', label: 'Inspection Required', type: 'boolean', desc: 'Whether inspection is required' },
  { field: 'inspection_date', label: 'Inspection Date', type: 'date', desc: 'Inspection date' },
  { field: 'inspection_status', label: 'Inspection Status', type: 'text', desc: 'Inspection status' },
  // Warranty
  { field: 'warranty_start', label: 'Warranty Start', type: 'date', desc: 'Warranty start date' },
  { field: 'warranty_end', label: 'Warranty End', type: 'date', desc: 'Warranty end date' },
  { field: 'warranty_terms', label: 'Warranty Terms', type: 'text', desc: 'Warranty terms' },
  // Description & notes
  { field: 'details', label: 'Details', type: 'text', desc: 'Job details' },
  { field: 'scope_of_work', label: 'Scope of Work', type: 'text', desc: 'Scope of work description' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Additional notes' },
  { field: 'internal_notes', label: 'Internal Notes', type: 'text', desc: 'Internal-only notes' },
  { field: 'completion_notes', label: 'Completion Notes', type: 'text', desc: 'Notes from job completion' },
]

export const quotesFields = [
  { field: 'quote_id', label: 'Quote ID', type: 'text', desc: 'Unique quote identifier (e.g. QUO-ABC123). Auto-generated if blank.' },
  { field: 'service_type', label: 'Service Type', type: 'text', desc: 'Type of service being quoted' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Quote status (Draft, Sent, Approved, Rejected)' },
  { field: 'quote_date', label: 'Quote Date', type: 'date', desc: 'Date the quote was created' },
  { field: 'expiration_date', label: 'Expiration Date', type: 'date', desc: 'When the quote expires' },
  // Address
  { field: 'job_address', label: 'Job Address', type: 'text', desc: 'Job site address' },
  { field: 'job_city', label: 'City', type: 'text', desc: 'Job city' },
  { field: 'job_state', label: 'State', type: 'text', desc: 'Job state' },
  { field: 'job_zip', label: 'ZIP', type: 'text', desc: 'Job ZIP code' },
  // Financials
  { field: 'quote_amount', label: 'Quote Amount', type: 'number', desc: 'Total quote amount' },
  { field: 'subtotal', label: 'Subtotal', type: 'number', desc: 'Subtotal before tax/discount' },
  { field: 'discount', label: 'Discount', type: 'number', desc: 'Discount amount' },
  { field: 'discount_percent', label: 'Discount %', type: 'number', desc: 'Discount percentage' },
  { field: 'tax_rate', label: 'Tax Rate', type: 'number', desc: 'Tax rate percentage' },
  { field: 'tax_amount', label: 'Tax Amount', type: 'number', desc: 'Tax amount' },
  { field: 'total', label: 'Total', type: 'number', desc: 'Total with tax' },
  { field: 'utility_incentive', label: 'Utility Incentive', type: 'number', desc: 'Utility rebate / incentive amount' },
  { field: 'out_of_pocket', label: 'Out of Pocket', type: 'number', desc: 'Customer out-of-pocket cost' },
  { field: 'deposit_required', label: 'Deposit Required', type: 'number', desc: 'Required deposit amount' },
  { field: 'payment_terms', label: 'Payment Terms', type: 'text', desc: 'Payment terms' },
  { field: 'warranty_terms', label: 'Warranty Terms', type: 'text', desc: 'Warranty terms' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Quote notes or description' },
  { field: 'internal_notes', label: 'Internal Notes', type: 'text', desc: 'Internal-only notes' },
]

export const estimatesFields = [
  { field: 'quote_id', label: 'Estimate ID', type: 'text', desc: 'Unique estimate identifier (e.g. EST-ABC123). Auto-generated if blank.' },
  { field: 'estimate_name', label: 'Estimate Name', type: 'text', desc: 'Display name for the estimate' },
  { field: 'service_type', label: 'Service Type', type: 'text', desc: 'Type of service being estimated' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Estimate status (Draft, Sent, Approved, Rejected, Expired)' },
  { field: 'summary', label: 'Summary', type: 'text', desc: 'Estimate summary or scope description' },
  { field: 'expiration_date', label: 'Expiration Date', type: 'date', desc: 'When the estimate expires' },
  { field: 'service_date', label: 'Service Date', type: 'date', desc: 'Planned service date' },
  { field: 'estimate_message', label: 'Message', type: 'text', desc: 'Message to customer' },
  // Address
  { field: 'job_address', label: 'Job Address', type: 'text', desc: 'Job site address' },
  { field: 'job_city', label: 'City', type: 'text', desc: 'Job city' },
  { field: 'job_state', label: 'State', type: 'text', desc: 'Job state' },
  { field: 'job_zip', label: 'ZIP', type: 'text', desc: 'Job ZIP code' },
  // Financials
  { field: 'quote_amount', label: 'Estimate Amount', type: 'number', desc: 'Total estimate amount' },
  { field: 'subtotal', label: 'Subtotal', type: 'number', desc: 'Subtotal before tax/discount' },
  { field: 'discount', label: 'Discount', type: 'number', desc: 'Discount amount' },
  { field: 'discount_percent', label: 'Discount %', type: 'number', desc: 'Discount percentage' },
  { field: 'tax_rate', label: 'Tax Rate', type: 'number', desc: 'Tax rate percentage' },
  { field: 'tax_amount', label: 'Tax Amount', type: 'number', desc: 'Tax amount' },
  { field: 'total', label: 'Total', type: 'number', desc: 'Total with tax' },
  { field: 'utility_incentive', label: 'Utility Incentive', type: 'number', desc: 'Utility rebate / incentive amount' },
  { field: 'out_of_pocket', label: 'Out of Pocket', type: 'number', desc: 'Customer out-of-pocket cost' },
  { field: 'deposit_required', label: 'Deposit Required', type: 'number', desc: 'Required deposit amount' },
  { field: 'deposit_amount', label: 'Deposit Amount', type: 'number', desc: 'Deposit amount collected' },
  { field: 'deposit_method', label: 'Deposit Method', type: 'text', desc: 'Deposit payment method' },
  { field: 'deposit_date', label: 'Deposit Date', type: 'date', desc: 'Date deposit was received' },
  { field: 'payment_terms', label: 'Payment Terms', type: 'text', desc: 'Payment terms' },
  { field: 'warranty_terms', label: 'Warranty Terms', type: 'text', desc: 'Warranty terms' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Estimate notes or description' },
  { field: 'internal_notes', label: 'Internal Notes', type: 'text', desc: 'Internal-only notes' },
]

export const invoicesFields = [
  { field: 'invoice_id', label: 'Invoice ID', type: 'text', desc: 'Unique invoice identifier (e.g. INV-ABC123). Auto-generated if blank.' },
  { field: 'invoice_number', label: 'Invoice Number', type: 'text', desc: 'Invoice number' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Payment status (Draft, Pending, Paid, Overdue, Cancelled)' },
  { field: 'invoice_date', label: 'Invoice Date', type: 'date', desc: 'Date the invoice was issued' },
  { field: 'due_date', label: 'Due Date', type: 'date', desc: 'Payment due date' },
  { field: 'paid_date', label: 'Paid Date', type: 'date', desc: 'Date payment was received' },
  // Address
  { field: 'billing_address', label: 'Billing Address', type: 'text', desc: 'Billing street address' },
  { field: 'billing_city', label: 'Billing City', type: 'text', desc: 'Billing city' },
  { field: 'billing_state', label: 'Billing State', type: 'text', desc: 'Billing state' },
  { field: 'billing_zip', label: 'Billing ZIP', type: 'text', desc: 'Billing ZIP code' },
  // Financials
  { field: 'subtotal', label: 'Subtotal', type: 'number', desc: 'Subtotal before tax/discount' },
  { field: 'discount', label: 'Discount', type: 'number', desc: 'Discount amount' },
  { field: 'discount_percent', label: 'Discount %', type: 'number', desc: 'Discount percentage' },
  { field: 'tax_rate', label: 'Tax Rate', type: 'number', desc: 'Tax rate percentage' },
  { field: 'tax_amount', label: 'Tax Amount', type: 'number', desc: 'Tax amount' },
  { field: 'shipping', label: 'Shipping', type: 'number', desc: 'Shipping cost' },
  { field: 'total', label: 'Total', type: 'number', desc: 'Invoice total' },
  { field: 'amount_paid', label: 'Amount Paid', type: 'number', desc: 'Total amount paid so far' },
  { field: 'balance_due', label: 'Balance Due', type: 'number', desc: 'Remaining balance' },
  { field: 'deposit_applied', label: 'Deposit Applied', type: 'number', desc: 'Deposit amount applied' },
  { field: 'payment_terms', label: 'Payment Terms', type: 'text', desc: 'Payment terms' },
  { field: 'payment_method', label: 'Payment Method', type: 'text', desc: 'Payment method (Cash, Check, Credit Card, etc.)' },
  { field: 'po_number', label: 'PO Number', type: 'text', desc: 'Purchase order number' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Invoice notes' },
  { field: 'internal_notes', label: 'Internal Notes', type: 'text', desc: 'Internal-only notes' },
  { field: 'footer_text', label: 'Footer Text', type: 'text', desc: 'Invoice footer text' },
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

export const jobLinesFields = [
  { field: 'item_name', label: 'Product/Service', type: 'text', desc: 'Product or service name' },
  { field: 'description', label: 'Description', type: 'text', desc: 'Line item description' },
  { field: 'quantity', label: 'Quantity', type: 'number', required: true, desc: 'Quantity' },
  { field: 'unit_price', label: 'Unit Price', type: 'number', required: true, desc: 'Price per unit' },
  { field: 'cost', label: 'Cost', type: 'number', desc: 'Cost per unit' },
  { field: 'discount', label: 'Discount', type: 'number', desc: 'Discount amount' },
  { field: 'line_total', label: 'Line Total', type: 'number', desc: 'Line total' },
  { field: 'completed', label: 'Completed', type: 'boolean', desc: 'Whether line item is completed' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Line item notes' },
  { field: 'sort_order', label: 'Sort Order', type: 'number', desc: 'Display order' },
]

export const jobSectionsFields = [
  { field: 'name', label: 'Section Name', type: 'text', required: true, desc: 'Section name' },
  { field: 'description', label: 'Description', type: 'text', desc: 'Section description' },
  { field: 'sort_order', label: 'Sort Order', type: 'number', desc: 'Display order' },
  { field: 'status', label: 'Status', type: 'text', desc: 'Status (Not Started, In Progress, Complete, Verified)' },
  { field: 'percent_of_job', label: '% of Job', type: 'number', desc: 'Percentage of total job' },
  { field: 'scheduled_date', label: 'Scheduled Date', type: 'date', desc: 'Scheduled date' },
  { field: 'estimated_hours', label: 'Est. Hours', type: 'number', desc: 'Estimated hours' },
  { field: 'actual_hours', label: 'Actual Hours', type: 'number', desc: 'Actual hours worked' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Section notes' },
]

export const quoteLinesFields = [
  { field: 'item_name', label: 'Product/Service', type: 'text', desc: 'Product or service name' },
  { field: 'description', label: 'Description', type: 'text', desc: 'Line item description' },
  { field: 'quantity', label: 'Quantity', type: 'number', required: true, desc: 'Quantity' },
  { field: 'unit_price', label: 'Unit Price', type: 'number', required: true, desc: 'Price per unit' },
  { field: 'discount', label: 'Discount', type: 'number', desc: 'Discount amount' },
  { field: 'discount_percent', label: 'Discount %', type: 'number', desc: 'Discount percentage' },
  { field: 'line_total', label: 'Line Total', type: 'number', desc: 'Line total' },
  { field: 'taxable', label: 'Taxable', type: 'boolean', desc: 'Whether line item is taxable' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Line item notes' },
  { field: 'sort_order', label: 'Sort Order', type: 'number', desc: 'Display order' },
]

export const invoiceLinesFields = [
  { field: 'item_name', label: 'Product/Service', type: 'text', desc: 'Product or service name' },
  { field: 'description', label: 'Description', type: 'text', desc: 'Line item description' },
  { field: 'quantity', label: 'Quantity', type: 'number', required: true, desc: 'Quantity' },
  { field: 'unit_price', label: 'Unit Price', type: 'number', required: true, desc: 'Price per unit' },
  { field: 'discount', label: 'Discount', type: 'number', desc: 'Discount amount' },
  { field: 'line_total', label: 'Line Total', type: 'number', desc: 'Line total' },
  { field: 'taxable', label: 'Taxable', type: 'boolean', desc: 'Whether line item is taxable' },
  { field: 'sort_order', label: 'Sort Order', type: 'number', desc: 'Display order' },
]

export const paymentsFields = [
  { field: 'payment_date', label: 'Payment Date', type: 'date', required: true, desc: 'Date of payment' },
  { field: 'amount', label: 'Amount', type: 'number', required: true, desc: 'Payment amount' },
  { field: 'payment_method', label: 'Payment Method', type: 'text', desc: 'Payment method (Cash, Check, Credit Card, ACH)' },
  { field: 'payment_type', label: 'Payment Type', type: 'text', desc: 'Payment type (Payment, Deposit, Refund)' },
  { field: 'reference_number', label: 'Reference #', type: 'text', desc: 'Payment reference number' },
  { field: 'check_number', label: 'Check #', type: 'text', desc: 'Check number' },
  { field: 'transaction_id', label: 'Transaction ID', type: 'text', desc: 'Processor transaction ID' },
  { field: 'processor', label: 'Processor', type: 'text', desc: 'Payment processor name' },
  { field: 'processor_fee', label: 'Processor Fee', type: 'number', desc: 'Processing fee' },
  { field: 'net_amount', label: 'Net Amount', type: 'number', desc: 'Net amount after fees' },
  { field: 'notes', label: 'Notes', type: 'text', desc: 'Payment notes' },
]

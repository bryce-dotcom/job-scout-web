// Field definitions for AI-powered import/export across all major data pages.
// Each array defines the importable/exportable fields for a Supabase table.
// Human-readable reference IDs (job_id, quote_id, invoice_id) are included for multi-sheet XLSX linking.

export const leadsFields = [
  { field: 'customer_name', label: 'Customer Name', type: 'text', required: true, desc: 'Full name of the lead / contact' },
  { field: 'business_name', label: 'Business Name', type: 'text', required: false, desc: 'Company or business name' },
  { field: 'email', label: 'Email', type: 'text', required: false, desc: 'Email address' },
  { field: 'phone', label: 'Phone', type: 'text', required: false, desc: 'Phone number' },
  { field: 'address', label: 'Address', type: 'text', required: false, desc: 'Street address' },
  { field: 'service_type', label: 'Service Type', type: 'text', required: false, desc: 'Type of service requested' },
  { field: 'lead_source', label: 'Lead Source', type: 'text', required: false, desc: 'How the lead was acquired (e.g. website, referral, purchased list)' },
  { field: 'status', label: 'Status', type: 'text', required: false, desc: 'Lead status (New, Contacted, Qualified, Won, Lost, etc.)' },
  { field: 'notes', label: 'Notes', type: 'text', required: false, desc: 'Additional notes or comments' },
  { field: 'job_title', label: 'Job Title', type: 'text', required: false, desc: 'Contact job title or role' },
]

export const customersFields = [
  { field: 'name', label: 'Name', type: 'text', required: true, desc: 'Customer full name' },
  { field: 'business_name', label: 'Business Name', type: 'text', required: false, desc: 'Company or business name' },
  { field: 'email', label: 'Email', type: 'text', required: false, desc: 'Email address' },
  { field: 'phone', label: 'Phone', type: 'text', required: false, desc: 'Phone number' },
  { field: 'address', label: 'Address', type: 'text', required: false, desc: 'Street address' },
  { field: 'city', label: 'City', type: 'text', required: false, desc: 'City' },
  { field: 'state', label: 'State', type: 'text', required: false, desc: 'State or province' },
  { field: 'zip', label: 'ZIP Code', type: 'text', required: false, desc: 'ZIP or postal code' },
  { field: 'preferred_contact', label: 'Preferred Contact', type: 'text', required: false, desc: 'Preferred contact method (Phone, Email, Text)' },
  { field: 'secondary_contact_name', label: 'Secondary Contact Name', type: 'text', required: false, desc: 'Name of secondary contact person' },
  { field: 'secondary_contact_email', label: 'Secondary Contact Email', type: 'text', required: false, desc: 'Email of secondary contact' },
  { field: 'secondary_contact_phone', label: 'Secondary Contact Phone', type: 'text', required: false, desc: 'Phone number of secondary contact' },
  { field: 'notes', label: 'Notes', type: 'text', required: false, desc: 'Additional notes' },
]

export const jobsFields = [
  { field: 'job_id', label: 'Job ID', type: 'text', required: false, desc: 'Unique job identifier (e.g. JOB-ABC123). Auto-generated if blank.' },
  { field: 'job_title', label: 'Job Title', type: 'text', required: true, desc: 'Title or name of the job' },
  { field: 'job_address', label: 'Job Address', type: 'text', required: false, desc: 'Address where the job takes place' },
  { field: 'status', label: 'Status', type: 'text', required: false, desc: 'Job status (Scheduled, In Progress, Completed, Cancelled)' },
  { field: 'business_unit', label: 'Business Unit', type: 'text', required: false, desc: 'Business unit or division' },
  { field: 'start_date', label: 'Start Date', type: 'date', required: false, desc: 'Job start date' },
  { field: 'end_date', label: 'End Date', type: 'date', required: false, desc: 'Job end date' },
  { field: 'allotted_time_hours', label: 'Allotted Hours', type: 'number', required: false, desc: 'Estimated hours for the job' },
  { field: 'details', label: 'Details', type: 'text', required: false, desc: 'Job details or scope of work' },
  { field: 'notes', label: 'Notes', type: 'text', required: false, desc: 'Additional notes' },
]

export const quotesFields = [
  { field: 'quote_id', label: 'Quote ID', type: 'text', required: false, desc: 'Unique quote identifier (e.g. QUO-ABC123). Auto-generated if blank.' },
  { field: 'service_type', label: 'Service Type', type: 'text', required: false, desc: 'Type of service being quoted' },
  { field: 'status', label: 'Status', type: 'text', required: false, desc: 'Quote status (Draft, Sent, Approved, Rejected)' },
  { field: 'notes', label: 'Notes', type: 'text', required: false, desc: 'Quote notes or description' },
]

export const estimatesFields = [
  { field: 'quote_id', label: 'Estimate ID', type: 'text', required: false, desc: 'Unique estimate identifier (e.g. EST-ABC123). Auto-generated if blank.' },
  { field: 'estimate_name', label: 'Estimate Name', type: 'text', required: false, desc: 'Display name for the estimate' },
  { field: 'service_type', label: 'Service Type', type: 'text', required: false, desc: 'Type of service being estimated' },
  { field: 'status', label: 'Status', type: 'text', required: false, desc: 'Estimate status (Draft, Sent, Approved, Rejected, Expired)' },
  { field: 'summary', label: 'Summary', type: 'text', required: false, desc: 'Estimate summary or scope description' },
  { field: 'expiration_date', label: 'Expiration Date', type: 'date', required: false, desc: 'When the estimate expires' },
  { field: 'service_date', label: 'Service Date', type: 'date', required: false, desc: 'Planned service date' },
  { field: 'notes', label: 'Notes', type: 'text', required: false, desc: 'Estimate notes or description' },
]

export const invoicesFields = [
  { field: 'invoice_id', label: 'Invoice ID', type: 'text', required: false, desc: 'Unique invoice identifier (e.g. INV-ABC123). Auto-generated if blank.' },
  { field: 'amount', label: 'Amount', type: 'number', required: true, desc: 'Invoice amount in dollars' },
  { field: 'status', label: 'Status', type: 'text', required: false, desc: 'Payment status (Pending, Paid, Overdue, Cancelled)' },
  { field: 'discount_applied', label: 'Discount', type: 'number', required: false, desc: 'Discount amount applied' },
  { field: 'payment_method', label: 'Payment Method', type: 'text', required: false, desc: 'Payment method (Cash, Check, Credit Card, etc.)' },
  { field: 'notes', label: 'Notes', type: 'text', required: false, desc: 'Invoice notes' },
  { field: 'job_description', label: 'Job Description', type: 'text', required: false, desc: 'Description of work performed' },
]

export const employeesFields = [
  { field: 'name', label: 'Name', type: 'text', required: true, desc: 'Employee full name' },
  { field: 'email', label: 'Email', type: 'text', required: false, desc: 'Email address' },
  { field: 'phone', label: 'Phone', type: 'text', required: false, desc: 'Phone number' },
  { field: 'role', label: 'Role', type: 'text', required: false, desc: 'Job role (e.g. Field Tech, Sales, Manager, Admin)' },
  { field: 'business_unit', label: 'Business Unit', type: 'text', required: false, desc: 'Business unit or division' },
  { field: 'employee_id', label: 'Employee ID', type: 'text', required: false, desc: 'Internal employee identifier' },
  { field: 'tax_classification', label: 'Tax Class', type: 'text', required: false, desc: 'Tax classification (W2 or 1099)' },
  { field: 'hourly_rate', label: 'Hourly Rate', type: 'number', required: false, desc: 'Hourly pay rate in dollars' },
  { field: 'annual_salary', label: 'Annual Salary', type: 'number', required: false, desc: 'Annual salary in dollars' },
]

export const productsServicesFields = [
  { field: 'name', label: 'Product Name', type: 'text', required: true, desc: 'Product or service name' },
  { field: 'description', label: 'Description', type: 'text', required: false, desc: 'Product description' },
  { field: 'type', label: 'Service Type', type: 'text', required: false, desc: 'Service type or category' },
  { field: 'unit_price', label: 'Unit Price', type: 'number', required: false, desc: 'Selling price per unit in dollars' },
  { field: 'cost', label: 'Cost', type: 'number', required: false, desc: 'Cost / wholesale price in dollars' },
  { field: 'markup_percent', label: 'Markup %', type: 'number', required: false, desc: 'Markup percentage (0-100+)' },
  { field: 'taxable', label: 'Taxable', type: 'boolean', required: false, desc: 'Whether the product is taxable' },
  { field: 'active', label: 'Active', type: 'boolean', required: false, desc: 'Whether the product is active/available' },
  { field: 'allotted_time_hours', label: 'Labor Hours', type: 'number', required: false, desc: 'Estimated labor hours for this product/service' },
]

export const inventoryFields = [
  { field: 'name', label: 'Item Name', type: 'text', required: true, desc: 'Inventory item name' },
  { field: 'inventory_type', label: 'Type', type: 'text', required: false, desc: 'Inventory type (Material, Tool, Consumable)' },
  { field: 'quantity', label: 'Quantity', type: 'number', required: false, desc: 'Current quantity on hand' },
  { field: 'min_quantity', label: 'Min Quantity', type: 'number', required: false, desc: 'Minimum quantity threshold for reorder alerts' },
  { field: 'location', label: 'Location', type: 'text', required: false, desc: 'Storage location' },
  { field: 'condition', label: 'Condition', type: 'text', required: false, desc: 'Item condition (Good, Fair, Poor, Out of Service)' },
  { field: 'serial_number', label: 'Serial Number', type: 'text', required: false, desc: 'Serial number' },
  { field: 'barcode', label: 'Barcode', type: 'text', required: false, desc: 'Barcode value' },
]

export const appointmentsFields = [
  { field: 'title', label: 'Title', type: 'text', required: true, desc: 'Appointment title or subject' },
  { field: 'start_time', label: 'Start Time', type: 'date', required: false, desc: 'Start date and time' },
  { field: 'end_time', label: 'End Time', type: 'date', required: false, desc: 'End date and time' },
  { field: 'location', label: 'Location', type: 'text', required: false, desc: 'Appointment location or address' },
  { field: 'status', label: 'Status', type: 'text', required: false, desc: 'Appointment status (Scheduled, Completed, Cancelled, No Show)' },
  { field: 'notes', label: 'Notes', type: 'text', required: false, desc: 'Additional notes' },
]

export const fleetFields = [
  { field: 'name', label: 'Name', type: 'text', required: true, desc: 'Vehicle or asset name' },
  { field: 'asset_id', label: 'Asset ID', type: 'text', required: false, desc: 'Unique asset identifier or VIN' },
  { field: 'type', label: 'Type', type: 'text', required: false, desc: 'Asset type (Vehicle, Trailer, Equipment, Tool)' },
  { field: 'status', label: 'Status', type: 'text', required: false, desc: 'Current status (Available, In Use, Maintenance, Out of Service)' },
  { field: 'mileage_hours', label: 'Mileage/Hours', type: 'number', required: false, desc: 'Current mileage or operating hours' },
]

// --- Related / child table field definitions (for multi-sheet XLSX export/import) ---

export const jobLinesFields = [
  { field: 'item_name', label: 'Product/Service', type: 'text', desc: 'Product or service name' },
  { field: 'quantity', label: 'Quantity', type: 'number', required: true },
  { field: 'price', label: 'Unit Price', type: 'number', required: true },
  { field: 'total', label: 'Total', type: 'number' },
]

export const jobSectionsFields = [
  { field: 'name', label: 'Section Name', type: 'text', required: true },
  { field: 'description', label: 'Description', type: 'text' },
  { field: 'sort_order', label: 'Sort Order', type: 'number' },
  { field: 'status', label: 'Status', type: 'text' },
  { field: 'percent_of_job', label: '% of Job', type: 'number' },
  { field: 'estimated_hours', label: 'Est. Hours', type: 'number' },
  { field: 'notes', label: 'Notes', type: 'text' },
]

export const quoteLinesFields = [
  { field: 'item_name', label: 'Product/Service', type: 'text' },
  { field: 'quantity', label: 'Quantity', type: 'number', required: true },
  { field: 'price', label: 'Unit Price', type: 'number', required: true },
  { field: 'line_total', label: 'Total', type: 'number' },
]

export const invoiceLinesFields = [
  { field: 'item_name', label: 'Product/Service', type: 'text' },
  { field: 'quantity', label: 'Quantity', type: 'number', required: true },
  { field: 'price', label: 'Unit Price', type: 'number', required: true },
  { field: 'line_total', label: 'Total', type: 'number' },
]

export const paymentsFields = [
  { field: 'date', label: 'Payment Date', type: 'date', required: true },
  { field: 'amount', label: 'Amount', type: 'number', required: true },
  { field: 'method', label: 'Payment Method', type: 'text' },
  { field: 'status', label: 'Status', type: 'text' },
  { field: 'notes', label: 'Notes', type: 'text' },
]

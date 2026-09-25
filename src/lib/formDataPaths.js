// The data paths a utility form field can be mapped to — the one list shared
// by Data Console > Utilities (the mapping UI), scripts/prepare-utility-forms.mjs
// (bulk AI mapping of seeded forms) and lib/dataPathResolver.js (filling).
// A path not in this list is not a mapping, whatever the AI suggested.
export const DATA_PATHS = [
  { value: '', label: '— None —' },
  // Customer / Participant
  { value: 'customer.name', label: 'Customer / Business Name' },
  { value: 'customer.email', label: 'Customer Email' },
  { value: 'customer.phone', label: 'Customer Phone' },
  { value: 'customer.address', label: 'Customer Street Address' },
  { value: 'customer.city', label: 'Customer City' },
  { value: 'customer.state', label: 'Customer State' },
  { value: 'customer.zip', label: 'Customer Zip' },
  { value: 'customer.contact_name', label: 'Contact Name' },
  { value: 'customer.business_type', label: 'Business / Building Type' },
  { value: 'customer.participant_is', label: 'Participant Is (Owner/Tenant)' },
  { value: 'customer.rate_schedule', label: 'Rate Schedule' },
  { value: 'customer.account_number', label: 'Account Number' },
  // Audit / Project
  { value: 'audit.address', label: 'Project Address' },
  { value: 'audit.city', label: 'Project City' },
  { value: 'audit.state', label: 'Project State' },
  { value: 'audit.zip', label: 'Project Zip' },
  { value: 'audit.operating_hours', label: 'Operating Hours/Day' },
  { value: 'audit.days_per_year', label: 'Operating Days/Year' },
  { value: 'audit.energy_rate', label: 'Energy Rate ($/kWh)' },
  { value: 'audit.estimated_rebate', label: 'Estimated Rebate' },
  { value: 'audit.project_cost', label: 'Total Project Cost' },
  { value: 'audit.total_fixtures', label: 'Total Fixtures' },
  { value: 'audit.total_existing_watts', label: 'Total Existing Watts' },
  { value: 'audit.total_proposed_watts', label: 'Total Proposed Watts' },
  { value: 'audit.annual_savings_kwh', label: 'Annual kWh Savings' },
  { value: 'audit.annual_savings_dollars', label: 'Annual $ Savings' },
  { value: 'audit.material_cost', label: 'Material Cost' },
  { value: 'audit.labor_cost', label: 'Labor Cost' },
  { value: 'audit.other_cost', label: 'Other Cost' },
  // Provider
  { value: 'provider.provider_name', label: 'Utility Name' },
  { value: 'provider.contact_phone', label: 'Utility Phone' },
  // Salesperson / Rep
  { value: 'salesperson.name', label: 'Salesperson Name' },
  { value: 'salesperson.phone', label: 'Salesperson Phone' },
  { value: 'salesperson.email', label: 'Salesperson Email' },
  // Vendor / Contractor
  { value: 'vendor.name', label: 'Vendor / Contractor Name' },
  { value: 'vendor.address', label: 'Vendor Address' },
  { value: 'vendor.contact', label: 'Vendor Contact Name' },
  { value: 'vendor.phone', label: 'Vendor Phone' },
  // Payee
  { value: 'payee.name', label: 'Payee Name' },
  { value: 'payee.address', label: 'Payee Address' },
  { value: 'payee.city', label: 'Payee City' },
  { value: 'payee.state', label: 'Payee State' },
  { value: 'payee.zip', label: 'Payee Zip' },
  // W-9 Fields
  { value: 'w9.name', label: 'W-9 Name (Line 1)' },
  { value: 'w9.business_name', label: 'W-9 Business Name (Line 2)' },
  { value: 'w9.tax_class', label: 'W-9 Tax Classification' },
  { value: 'w9.llc_class', label: 'W-9 LLC Classification' },
  { value: 'w9.other_class', label: 'W-9 Other Classification' },
  { value: 'w9.exempt_payee', label: 'W-9 Exempt Payee Code' },
  { value: 'w9.exempt_fatca', label: 'W-9 FATCA Exemption Code' },
  { value: 'w9.address', label: 'W-9 Address' },
  { value: 'w9.city_state_zip', label: 'W-9 City, State, ZIP' },
  { value: 'w9.account_numbers', label: 'W-9 Account Numbers' },
  { value: 'w9.requester_name', label: 'W-9 Requester Name' },
  { value: 'w9.ssn', label: 'W-9 SSN' },
  { value: 'w9.ssn_1', label: 'W-9 SSN Part 1 (3 digits)' },
  { value: 'w9.ssn_2', label: 'W-9 SSN Part 2 (2 digits)' },
  { value: 'w9.ssn_3', label: 'W-9 SSN Part 3 (4 digits)' },
  { value: 'w9.ein', label: 'W-9 EIN' },
  { value: 'w9.ein_1', label: 'W-9 EIN Part 1 (2 digits)' },
  { value: 'w9.ein_2', label: 'W-9 EIN Part 2 (7 digits)' },
  { value: 'w9.signature_date', label: 'W-9 Signature Date' },
  // Quote
  { value: 'quote.quote_amount', label: 'Estimate Amount' },
  { value: 'quote.utility_incentive', label: 'Incentive Amount' },
  { value: 'quote.discount', label: 'Discount' },
  // Aggregations
  { value: 'audit_areas.fixture_count.sum', label: 'Sum: Fixture Count' },
  { value: 'audit_areas.area_watts_reduced.sum', label: 'Sum: Watts Reduced' },
  { value: 'lines.quantity.sum', label: 'Sum: Line Quantities' },
  { value: 'lines.line_total.sum', label: 'Sum: Line Totals' },
  { value: 'lines.exist_watts.sum', label: 'Sum: Existing Watts' },
  { value: 'lines.new_watts.sum', label: 'Sum: New Watts' },
  { value: 'lines.watts_reduced.sum', label: 'Sum: Watts Reduced' },
  { value: 'lines.incentive.sum', label: 'Sum: Incentives' },
  // Line Items (indexed rows 1-20)
  ...Array.from({ length: 20 }, (_, i) => [
    { value: `lines.${i}.item_name`, label: `Row ${i + 1}: Name/Location` },
    { value: `lines.${i}.quantity`, label: `Row ${i + 1}: Qty` },
    { value: `lines.${i}.exist_watts`, label: `Row ${i + 1}: Existing Watts` },
    { value: `lines.${i}.new_watts`, label: `Row ${i + 1}: New Watts` },
    { value: `lines.${i}.watts_reduced`, label: `Row ${i + 1}: Watts Reduced` },
    { value: `lines.${i}.incentive`, label: `Row ${i + 1}: Incentive` },
  ]).flat(),
  // Signature
  { value: 'signature.customer', label: 'Customer Signature (Image)' },
  { value: 'signature.customer_date', label: 'Signature Date' },
  // Computed
  { value: 'today', label: "Today's Date" },
]

const VALID = new Set(DATA_PATHS.map(dp => dp.value).filter(Boolean))
// Indexed line-item paths (lines.0.item_name) are valid too.
const LINE_ITEM = /^lines.d+.w+$/
export function isValidDataPath(path) {
  return typeof path === 'string' && (VALID.has(path) || LINE_ITEM.test(path))
}

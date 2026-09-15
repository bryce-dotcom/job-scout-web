// Single source of truth for the Tax Category dropdown (IRS Form 1065 lines).
// Used in the transaction edit modal, the inline row picker in Books, and
// Frankie's second-look panel. Keep these values in sync with
// public.expense_categories.default_tax_category so auto-fill from Expense
// Category always lands on a real option.
//
// Lives here rather than in Books.jsx so a component Books renders can use
// the list without importing the page that renders it.
export const TAX_CATEGORIES = [
  { group: 'Cost of Goods Sold', options: [
    { value: 'Line 2 - Cost of goods sold', label: 'Cost of Goods Sold (job materials, resale items)' },
  ]},
  { group: 'Common Deductions', options: [
    { value: 'Line 20 - Advertising', label: 'Advertising & Marketing' },
    { value: 'Line 20 - Office expenses', label: 'Office Expenses & Supplies' },
    { value: 'Line 20 - Auto expenses', label: 'Vehicle & Auto Expenses' },
    { value: 'Line 12 - Repairs and maintenance', label: 'Repairs & Maintenance' },
    { value: 'Line 14 - Rent', label: 'Rent' },
    { value: 'Line 20 - Utilities', label: 'Utilities' },
    { value: 'Line 20 - Insurance', label: 'Insurance' },
    { value: 'Line 15 - Taxes and licenses', label: 'Taxes & Licenses' },
    { value: 'Line 20 - Travel', label: 'Travel' },
    { value: 'Line 20 - Meals', label: 'Meals (50% deductible)' },
  ]},
  { group: 'Payroll & Contractors', options: [
    { value: 'Line 10 - Guaranteed payments', label: 'Guaranteed Payments (partners)' },
    { value: 'Line 9 - Salaries and wages', label: 'Salaries & Wages' },
    { value: 'Line 20 - Contract labor', label: 'Contract Labor / Subcontractors' },
    { value: 'Line 18 - Retirement plans', label: 'Retirement Plan Contributions' },
    { value: 'Line 19 - Employee benefit programs', label: 'Employee Benefits' },
  ]},
  { group: 'Assets & Depreciation', options: [
    { value: 'Line 16a - Depreciation', label: 'Depreciation (equipment, vehicles)' },
    { value: 'Line 20 - Equipment rental', label: 'Equipment Rental' },
  ]},
  { group: 'Other', options: [
    { value: 'Line 20 - Other deductions', label: 'Other Deductions' },
    { value: 'Line 13 - Bad debts', label: 'Bad Debts' },
    { value: 'Not deductible', label: 'Not Deductible (personal, distributions)' },
    { value: 'Income', label: 'Income (not a deduction)' },
  ]},
]

// Flat list for reverse lookup (value -> label).
export const TAX_CATEGORY_OPTIONS = TAX_CATEGORIES.flatMap(g => g.options)

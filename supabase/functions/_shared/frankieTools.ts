// Frankie's tools — what the AI CFO can look up for himself.
//
// Until now Frankie was handed one snapshot of totals on every message and
// nothing else, so "show me those checks" or "what did we pay Lowe's in
// March" got a shrug. Worse, because he rode Arnie's edge function, he was
// being OFFERED Arnie's whole toolset — including the ones that propose
// record changes — with Arnie's descriptions. These are his own: every one
// read-only, every one scoped to the caller's company by the JWT, and gated
// the way his persona already promises (full money access for admin and
// above, job costs for managers, nothing itemised below that).
//
// Results are compact JSON with a `scope` line the model can repeat, and a
// WARNING when a limit truncated the read so a total is a floor, not a fact.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'

// Frankie's answers carry money decisions and he is low volume; Arnie stays
// on Sonnet. Opus 5 thinks by default — the non-streaming loop passes its
// thinking blocks back untouched between tool rounds, which is required.
export const FRANKIE_MODEL = 'claude-opus-5'
export const FRANKIE_MAX_TOKENS = 8192

const num = (v: unknown) => Number(v) || 0
const money = (n: number) => Math.round(n * 100) / 100
const clean = (s: unknown) => String(s ?? '').replace(/[*,()"\\]/g, '').trim()
const clamp = (v: unknown, dflt: number, max: number) => Math.min(Math.max(Number(v) || dflt, 1), max)

/** GET every page of a PostgREST path (Supabase caps a request at 1000 rows). */
// HHH alone has 6,564 invoices and 6,018 payments; at 5,000 the ledger tools
// told the owner their totals were "a floor" and argued with his dashboard.
const READ_CAP = 25000
async function readAll(r: Rest, path: string, cap = READ_CAP): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < cap; from += 1000) {
    const res = await fetch(`${r.url}/rest/v1/${path}`, {
      headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, Range: `${from}-${from + 999}` },
    })
    if (!res.ok) break
    const page = await res.json().catch(() => [])
    if (!Array.isArray(page)) break
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

// ── the same bookkeeping the app applies ─────────────────────────────
// Mirrors src/pages/agents/frankie/frankieTaxContext.js: the tax line is the
// person's own choice, else the AI's Form 1065 line, else its category; a
// "Not deductible" line is money out that is not an expense.
function taxLineOf(t: any): string {
  const line = t?.user_tax_category || t?.ai_form_1065_line || t?.ai_tax_category || null
  if (line) return line
  if (/TRANSFER_OUT|LOAN_PAYMENTS/.test(String(t?.plaid_personal_finance_category || ''))) return 'Not deductible (transfer or loan payment, not yet reviewed)'
  return 'Uncategorized'
}
const isNonDeductible = (line: string) => /^not deductible/i.test(line) || /^income$/i.test(line)

// ── access ───────────────────────────────────────────────────────────
interface Access { full: boolean; jobs: boolean }
function accessFor(caller: Caller): Access {
  const role = String(caller.role || '').toLowerCase()
  const full = ['admin', 'super_admin', 'developer', 'owner'].includes(role)
  return { full, jobs: full || role === 'manager' }
}
const RESTRICTED = { restricted: "That's above the clearance for this role. An admin or the owner can pull it up." }

// ── definitions ──────────────────────────────────────────────────────
const DATE_PROPS = {
  start_date: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
  end_date: { type: 'string', description: 'YYYY-MM-DD, inclusive' },
}

export const FRANKIE_TOOLS: any[] = [
  {
    name: 'query_bank_transactions',
    description:
      'Search the bank feed — individual debits and deposits with date, description, amount, account and tax line, plus totals by tax line and by merchant. ' +
      'Use for "what did we pay X", "show me those checks", "how much at Home Depot this year", "the deposits over $10k", "what is tagged as wages". ' +
      'Totals cover every matching row; the list is the largest rows. Positive amounts are money out, negative are money in.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Matches the merchant or description, case-insensitive, e.g. "lowe" or "check #"' },
        ...DATE_PROPS,
        tax_line: { type: 'string', description: 'Filter by tax line, e.g. "Salaries and wages", "Meals", "Not deductible"' },
        direction: { type: 'string', enum: ['out', 'in', 'both'], description: 'Money out (debits), money in (deposits), or both. Default out.' },
        min_amount: { type: 'number', description: 'Only rows at or above this absolute amount' },
        account: { type: 'string', description: 'Filter by account name, e.g. "checking", "visa", "cole"' },
        limit: { type: 'integer', description: 'Rows to list (default 25, max 100)' },
      },
    },
  },
  {
    name: 'query_pnl',
    description:
      'Profit and loss for any date range: revenue collected, deductible expenses by tax line, money out that is NOT an expense (owner draws, card payments, loan principal, transfers), and net profit. ' +
      'Use for any period the snapshot does not already show — a quarter, last year, a custom range, month by month.',
    input_schema: {
      type: 'object',
      properties: {
        ...DATE_PROPS,
        by_month: { type: 'boolean', description: 'Also break the range down month by month' },
      },
      required: ['start_date', 'end_date'],
    },
  },
  {
    name: 'query_invoices',
    description:
      'Invoices with balance owed, days overdue and customer. Use for "who owes us", "everything past 60 days", "what has X been billed", "paid invoices last month".',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'overdue', 'paid', 'all'], description: 'Default open' },
        customer_name: { type: 'string' },
        min_days_overdue: { type: 'integer' },
        ...DATE_PROPS,
        limit: { type: 'integer', description: 'Rows to list (default 25, max 100)' },
      },
    },
  },
  {
    name: 'query_payments',
    description:
      'Customer payments received — date, amount, method, customer, invoice — with totals by method. Use for "what came in this week", "how has X paid us", "card vs check".',
    input_schema: {
      type: 'object',
      properties: {
        ...DATE_PROPS,
        customer_name: { type: 'string' },
        method: { type: 'string', description: 'e.g. card, check, ach, cash, stripe' },
        limit: { type: 'integer', description: 'Rows to list (default 25, max 100)' },
      },
    },
  },
  {
    name: 'query_job_profitability',
    description:
      'Actual profit per job — the same calculation as the Job Costing report and the profitability view on each job: revenue from payments tagged to the job (plus any prepaid plan allocation), ' +
      'material and labor cost from the job lines (walking bundle components), and bank debits or expenses tagged to the job. ' +
      'Use for "which jobs made money", "margin on the X job", "best and worst jobs", "how is crew Y doing". Jobs with no cost captured say so rather than showing $0.',
    input_schema: {
      type: 'object',
      properties: {
        job_name: { type: 'string', description: 'Part of the job title, job id or customer name' },
        team: { type: 'string', description: 'Filter by assigned crew / team name' },
        status: { type: 'string', description: 'e.g. Completed, In Progress; default all' },
        ...DATE_PROPS,
        sort: { type: 'string', enum: ['profit', 'margin', 'revenue', 'worst'], description: 'Default profit (highest first); worst = lowest margin first' },
        limit: { type: 'integer', description: 'Rows to list (default 20, max 100)' },
      },
    },
  },
  {
    name: 'query_payroll_runs',
    description:
      'Completed payroll runs — pay date, period, gross wages, headcount — with totals. Use for "what did payroll cost in Q2", "how many people were on the last run". Admin and above.',
    input_schema: {
      type: 'object',
      properties: { ...DATE_PROPS, limit: { type: 'integer', description: 'Runs to list (default 12, max 60)' } },
    },
  },
  {
    name: 'query_bank_balances',
    description: 'Current balance on every connected bank account and card, as of the last sync. Use when the question is about cash on hand right now.',
    input_schema: { type: 'object', properties: {} },
  },
  {
    name: 'query_sales',
    description:
      'Sales Won — what the Dashboard tiles and the Sales Performance page show: the contract value of jobs CREATED in a date range, cancelled and archived excluded, unpriced jobs counted at $0. ' +
      'This is booked work, not cash; use query_payments or query_pnl for cash. Use for "how much have we sold this year", "what did we book in Q2", "the dashboard says $2.2M", sales by month, the biggest jobs sold.',
    input_schema: {
      type: 'object',
      properties: {
        ...DATE_PROPS,
        by_month: { type: 'boolean', description: 'Also break the total down by the month the job was created' },
        limit: { type: 'integer', description: 'Largest jobs to list (default 15, max 100)' },
      },
    },
  },
  {
    name: 'query_estimates',
    description: 'Estimates (quotes) with status, amount, customer, dates. Totals by status. Use for "what is out for approval", "estimates older than two weeks", "what did we quote X", win rate for a period.',
    input_schema: { type: 'object', properties: { ...DATE_PROPS, status: { type: 'string', description: 'Draft, Sent, Negotiation, Approved, Rejected, or all (default all)' }, customer_name: { type: 'string' }, min_amount: { type: 'number' }, limit: { type: 'integer', description: 'Rows to list (default 25, max 100)' } } },
  },
  {
    name: 'query_leads',
    description: 'Leads with status, source, business unit, dates, and counts by status and by source. Use for "how many leads this month", "where are leads coming from", "leads stuck in New".',
    input_schema: { type: 'object', properties: { ...DATE_PROPS, status: { type: 'string' }, source: { type: 'string' }, limit: { type: 'integer', description: 'Rows to list (default 25, max 100)' } } },
  },
  {
    name: 'query_utility_incentives',
    description: 'Utility incentive (rebate) invoices: utility, job, incentive amount, status, paid date. Totals filed, paid, outstanding. Use for "what does RMP owe us", "rebates still out", "incentives paid this year".',
    input_schema: { type: 'object', properties: { ...DATE_PROPS, status: { type: 'string', description: 'open (default), paid, or all' }, utility: { type: 'string' }, limit: { type: 'integer' } } },
  },
  {
    name: 'query_bills_and_pos',
    description: 'Accounts payable: vendor bills (amount, balance due, due date, status) and purchase orders (vendor, job, total, status). Use for "what do we owe vendors", "bills due this week", "open POs", "what is on order for job X".',
    input_schema: { type: 'object', properties: { ...DATE_PROPS, status: { type: 'string', description: 'open (default) or all' }, vendor_name: { type: 'string' }, limit: { type: 'integer' } } },
  },
  {
    name: 'query_liabilities',
    description: 'Loans and other debt (balance, payment, rate, lender, next due), the payments made on them, and fixed assets (purchase price, current value). Use for "how much debt", "what are the loan payments", "what do we own", "the truck loan".',
    input_schema: { type: 'object', properties: { ...DATE_PROPS, limit: { type: 'integer' } } },
  },
  {
    name: 'query_fleet',
    description: 'Fleet units (name, type, status, mileage, maintenance due, purchase price), maintenance records with cost, and rentals. Use for "what did the trucks cost us", "which units are overdue for service", "rental income".',
    input_schema: { type: 'object', properties: { ...DATE_PROPS, limit: { type: 'integer' } } },
  },
  {
    name: 'query_inventory',
    description: 'Inventory on hand: item, quantity, minimum, location, value at product cost. Low-stock list. Use for "what is in stock", "what are we low on", "inventory value".',
    input_schema: { type: 'object', properties: { search: { type: 'string' }, low_stock_only: { type: 'boolean' }, limit: { type: 'integer' } } },
  },
  {
    name: 'query_time_clock',
    description: 'Crew hours from the time clock: hours by employee and by job for a date range, with labor cost at hourly rates. Use for "how many hours on the Anderson job", "who worked the most last week", "labor cost this month".',
    input_schema: { type: 'object', properties: { ...DATE_PROPS, employee_name: { type: 'string' }, job: { type: 'string', description: 'Job title or number' }, limit: { type: 'integer' } } },
  },
  {
    name: 'query_bonuses',
    description: 'Crew efficiency bonuses by job and employee: accrued, paid, hours saved. Use for "what bonuses are owed", "what did we pay in bonuses".',
    input_schema: { type: 'object', properties: { ...DATE_PROPS, status: { type: 'string', description: 'accrued, paid, or all (default all)' }, limit: { type: 'integer' } } },
  },
  {
    name: 'query_backlog',
    description: 'Every job in a range walked from sold to collected: status, sold value, invoiced, collected, still owed. Use for "which delivered jobs were never invoiced", "what is in progress", "jobs we finished but have not been paid for", the backlog by status.',
    input_schema: { type: 'object', properties: { ...DATE_PROPS, status: { type: 'string', description: 'A job status, or "delivered", "in_progress", "not_started", "delivered_not_invoiced", "owed" (default all)' }, limit: { type: 'integer', description: 'Jobs to list (default 25, max 100)' } } },
  },
  {
    name: 'query_table',
    description: 'Read any other ledger in the app when none of the lookups above fits: rows with filters, a sort, totals of numeric columns. Tables: ' + Object.keys(TABLE_ALLOWLIST).join(', ') + '. Use it rather than saying a question cannot be answered.',
    input_schema: {
      type: 'object',
      properties: {
        table: { type: 'string', description: 'One of the tables listed' },
        columns: { type: 'array', items: { type: 'string' }, description: 'Columns to return (default all allowed)' },
        filters: { type: 'array', items: { type: 'object', properties: { column: { type: 'string' }, op: { type: 'string', enum: ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'ilike', 'is', 'in'] }, value: { type: 'string' } }, required: ['column', 'op', 'value'] } },
        order_by: { type: 'string' }, descending: { type: 'boolean' },
        sum: { type: 'array', items: { type: 'string' }, description: 'Numeric columns to total across every matching row' },
        limit: { type: 'integer', description: 'Rows to list (default 25, max 200)' },
      },
      required: ['table'],
    },
  },
]

// What query_table may read: table → columns. Money and names, never
// credentials, tokens or anything private to a person. Every read is
// scoped to the caller's company.
const TABLE_ALLOWLIST: Record<string, string[]> = {
  customers: ['id', 'name', 'business_name', 'email', 'phone', 'city', 'state', 'status', 'created_at'],
  jobs: ['id', 'job_id', 'job_title', 'status', 'job_total', 'customer_id', 'business_unit', 'start_date', 'end_date', 'created_at', 'expense_amount', 'incentive_amount', 'incentive_status', 'invoice_status'],
  invoices: ['id', 'invoice_id', 'amount', 'discount_applied', 'credit_card_fee', 'payment_status', 'payment_method', 'business_unit', 'due_date', 'invoice_date', 'created_at', 'customer_id', 'job_id', 'utility_owes', 'utility_paid_at'],
  payments: ['id', 'amount', 'date', 'method', 'status', 'invoice_id', 'job_id', 'customer_id', 'is_deposit', 'refunded_amount', 'paid_by'],
  quotes: ['id', 'quote_id', 'estimate_name', 'status', 'quote_amount', 'calculated_quote_amount', 'customer_id', 'job_id', 'business_unit', 'created_at', 'approved_date', 'expiration_date', 'deposit_amount'],
  leads: ['id', 'customer_name', 'business_name', 'status', 'computed_status', 'lead_source', 'business_unit', 'created_at', 'converted_at', 'salesperson_id', 'setter_id'],
  lead_payments: ['id', 'amount', 'payment_method', 'payment_status', 'date_created', 'lead_id', 'job_id', 'invoice_id', 'description'],
  utility_invoices: ['id', 'utility_invoice_id', 'utility_name', 'customer_name', 'job_id', 'invoice_id', 'project_cost', 'incentive_amount', 'amount', 'payment_status', 'paid_at', 'created_at'],
  expenses: ['id', 'date', 'amount', 'category', 'tax_category', 'merchant', 'vendor', 'description', 'job_id', 'status', 'source', 'plaid_transaction_id'],
  manual_expenses: ['id', 'expense_date', 'amount', 'vendor', 'description', 'category_id', 'job_id', 'paid_from'],
  bills: ['id', 'bill_number', 'amount', 'balance_due', 'bill_date', 'due_date', 'status', 'vendor_id'],
  bill_payments: ['id', 'bill_id', 'amount', 'paid_at'],
  purchase_orders: ['id', 'po_number', 'vendor_id', 'job_id', 'status', 'subtotal', 'tax', 'shipping', 'total', 'expected_delivery_date', 'sent_at', 'received_at', 'created_at'],
  purchase_order_lines: ['id', 'po_id', 'product_id', 'description', 'quantity_ordered', 'quantity_received', 'unit_cost', 'line_total'],
  vendors: ['id', 'name', 'business_name', 'default_payment_terms', 'is_1099', 'active'],
  liabilities: ['id', 'name', 'lender', 'liability_type', 'current_balance', 'monthly_payment', 'interest_rate', 'next_payment_due', 'next_payment_amount', 'original_principal', 'origination_date', 'term_months', 'status'],
  loan_payments: ['id', 'liability_id', 'date', 'amount', 'principal', 'interest', 'source'],
  assets: ['id', 'name', 'asset_type', 'purchase_price', 'current_value', 'purchase_date', 'in_service_date', 'useful_life_years', 'salvage_value', 'depreciation_method', 'status'],
  fleet: ['id', 'name', 'type', 'make', 'model', 'model_year', 'status', 'mileage_hours', 'last_pm_date', 'next_pm_due', 'purchase_price', 'purchase_date', 'repair_cost', 'assigned_to', 'business_unit'],
  fleet_maintenance: ['id', 'asset_id', 'type', 'date', 'mileage_hours', 'description', 'cost'],
  fleet_rentals: ['id', 'asset_id', 'rental_customer', 'start_date', 'end_date', 'rental_rate', 'status'],
  inventory: ['id', 'name', 'quantity', 'min_quantity', 'available', 'allocated_qty', 'location', 'condition', 'product_id', 'inventory_type'],
  products_services: ['id', 'name', 'type', 'category', 'price', 'cost', 'sku', 'manufacturer', 'active'],
  job_lines: ['id', 'job_id', 'item_id', 'item_name', 'quantity', 'price', 'total', 'labor_cost'],
  time_clock: ['id', 'employee_id', 'job_id', 'clock_in', 'clock_out', 'total_hours', 'flagged_for_review'],
  employees: ['id', 'name', 'role', 'business_unit', 'hourly_rate', 'status', 'hire_date', 'crew'],
  payroll_runs: ['id', 'period_start', 'period_end', 'pay_date', 'status', 'total_gross', 'employee_count'],
  payroll_tax_liabilities: ['id', 'jurisdiction', 'agency', 'kind', 'period_start', 'period_end', 'amount_employee', 'amount_employer', 'amount_total', 'due_date', 'paid_at'],
  job_bonuses: ['id', 'job_id', 'employee_id', 'amount', 'status', 'allotted_hours', 'actual_hours', 'saved_hours', 'accrued_at', 'paid_at'],
  customer_memberships: ['id', 'customer_id', 'plan_name', 'status', 'price_cents', 'billing_interval', 'started_at', 'canceled_at', 'current_period_end'],
  payment_plans: ['id', 'status', 'frequency', 'installment_amount', 'total_installments', 'installments_completed', 'next_charge_date'],
  appointments: ['id', 'lead_id', 'customer_id', 'employee_id', 'status', 'scheduled_at', 'created_at'],
}
const PRIVATE_TABLES = new Set(['employees', 'payroll_runs', 'payroll_tax_liabilities', 'time_clock', 'job_bonuses', 'liabilities', 'loan_payments', 'bills', 'bill_payments'])


export function frankieToolsFor(caller: Caller): any[] {
  const a = accessFor(caller)
  if (a.full) return FRANKIE_TOOLS
  if (a.jobs) return FRANKIE_TOOLS.filter(t => t.name === 'query_job_profitability' || t.name === 'query_invoices')
  return []
}

// ── executors ────────────────────────────────────────────────────────
export async function execFrankieTool(name: string, input: any, caller: Caller, r: Rest): Promise<any> {
  const companyId = caller.companyId
  if (companyId == null) return { restricted: 'No company on this login.' }
  const a = accessFor(caller)
  const co = `company_id=eq.${companyId}`
  try {
    switch (name) {
      case 'query_bank_transactions': return a.full ? await bankTransactions(r, co, input) : RESTRICTED
      case 'query_pnl': return a.full ? await pnl(r, co, input) : RESTRICTED
      case 'query_invoices': return a.jobs ? await invoices(r, co, input) : RESTRICTED
      case 'query_payments': return a.full ? await payments(r, co, input) : RESTRICTED
      case 'query_job_profitability': return a.jobs ? await jobProfitability(r, co, input) : RESTRICTED
      case 'query_payroll_runs': return a.full ? await payrollRuns(r, co, input) : RESTRICTED
      case 'query_bank_balances': return a.full ? await bankBalances(r, co) : RESTRICTED
      case 'query_sales': return a.jobs ? await sales(r, co, input) : RESTRICTED
      case 'query_estimates': return a.jobs ? await estimates(r, co, input) : RESTRICTED
      case 'query_leads': return a.jobs ? await leads(r, co, input) : RESTRICTED
      case 'query_utility_incentives': return a.jobs ? await utilityIncentives(r, co, input) : RESTRICTED
      case 'query_bills_and_pos': return a.full ? await billsAndPos(r, co, input) : RESTRICTED
      case 'query_liabilities': return a.full ? await liabilitiesAndAssets(r, co, input) : RESTRICTED
      case 'query_fleet': return a.jobs ? await fleetTool(r, co, input) : RESTRICTED
      case 'query_inventory': return a.jobs ? await inventoryTool(r, co, input) : RESTRICTED
      case 'query_time_clock': return a.full ? await timeClock(r, co, input) : RESTRICTED
      case 'query_bonuses': return a.full ? await bonuses(r, co, input) : RESTRICTED
      case 'query_backlog': return a.jobs ? await backlog(r, co, input) : RESTRICTED
      case 'query_table': return (PRIVATE_TABLES.has(String(input?.table)) ? a.full : a.jobs) ? await queryTable(r, co, input) : RESTRICTED
      default: return { error: `Unknown tool: ${name}` }
    }
  } catch (e: any) {
    console.error('[frankie tool]', name, e)
    return { error: `Lookup failed: ${e?.message || e}` }
  }
}

const PLAID_SELECT = 'id,date,amount,name,merchant_name,is_transfer,connected_account_id,user_tax_category,ai_form_1065_line,ai_tax_category,plaid_personal_finance_category,job_id,ai_job_id'

async function accountNames(r: Rest, co: string): Promise<Record<number, string>> {
  const names: Record<number, string> = {}
  for (const a of await readAll(r, `connected_accounts?${co}&select=id,account_name,mask`, 100)) names[a.id] = `${a.account_name}${a.mask ? ` …${a.mask}` : ''}`
  return names
}

async function bankTransactions(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: PLAID_SELECT, order: 'date.desc' })
  const dir = input?.direction || 'out'
  if (dir === 'out') p.append('amount', 'gt.0')
  if (dir === 'in') p.append('amount', 'lt.0')
  if (input?.start_date) p.append('date', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('date', `lte.${clean(input.end_date)}`)
  if (input?.search) { const s = clean(input.search); p.append('or', `(name.ilike.*${s}*,merchant_name.ilike.*${s}*)`) }
  const names = await accountNames(r, co)
  let rows = await readAll(r, `plaid_transactions?${co}&${p}`)
  rows = rows.filter((t: any) => !t.is_transfer)
  if (input?.tax_line) { const t = clean(input.tax_line).toLowerCase(); rows = rows.filter((x: any) => taxLineOf(x).toLowerCase().includes(t)) }
  if (input?.account) { const t = clean(input.account).toLowerCase(); rows = rows.filter((x: any) => (names[x.connected_account_id] || '').toLowerCase().includes(t)) }
  if (input?.min_amount) rows = rows.filter((x: any) => Math.abs(num(x.amount)) >= num(input.min_amount))
  const total = money(rows.reduce((s: number, x: any) => s + num(x.amount), 0))
  const byLine: Record<string, number> = {}
  const byMerchant: Record<string, number> = {}
  for (const x of rows) {
    byLine[taxLineOf(x)] = money((byLine[taxLineOf(x)] || 0) + num(x.amount))
    const m = x.merchant_name || x.name || '(no description)'
    byMerchant[m] = money((byMerchant[m] || 0) + num(x.amount))
  }
  const top = (o: Record<string, number>) => Object.entries(o).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1])).slice(0, 15)
  const limit = clamp(input?.limit, 25, 100)
  return {
    count: rows.length,
    total,
    by_tax_line: Object.fromEntries(top(byLine)),
    by_merchant: Object.fromEntries(top(byMerchant)),
    rows: [...rows].sort((a: any, b: any) => Math.abs(num(b.amount)) - Math.abs(num(a.amount))).slice(0, limit).map((x: any) => ({
      date: x.date, amount: num(x.amount), description: x.merchant_name || x.name, account: names[x.connected_account_id] || null,
      tax_line: taxLineOf(x), reviewed: !!x.user_tax_category, job_id: x.job_id || x.ai_job_id || null,
    })),
    scope: `${rows.length} bank rows matched${dir === 'out' ? ' (money out)' : dir === 'in' ? ' (money in)' : ''}; the list is the ${Math.min(limit, rows.length)} largest. Positive = paid out, negative = received. "reviewed" false means the tax line is the categoriser's guess.`,
    ...(rows.length >= READ_CAP ? { WARNING: `Read the first ${READ_CAP} rows only — totals are a floor.` } : {}),
  }
}

async function pnl(r: Rest, co: string, input: any) {
  const start = clean(input?.start_date), end = clean(input?.end_date)
  const [pays, plaid, manual] = await Promise.all([
    readAll(r, `payments?${co}&select=amount,date&date=gte.${start}&date=lte.${end}`),
    readAll(r, `plaid_transactions?${co}&select=${PLAID_SELECT}&amount=gt.0&is_transfer=eq.false&date=gte.${start}&date=lte.${end}`),
    readAll(r, `expenses?${co}&select=amount,date,tax_category&date=gte.${start}&date=lte.${end}`, 2000),
  ])
  const month = (d: string) => String(d).slice(0, 7)
  const acc = () => ({ revenue: 0, deductible: 0, non_deductible: 0, by_line: {} as Record<string, number> })
  const total = acc()
  const months: Record<string, ReturnType<typeof acc>> = {}
  const bucket = (d: string) => input?.by_month ? (months[month(d)] ||= acc()) : null
  for (const p of pays) { const v = num(p.amount); total.revenue += v; const b = bucket(p.date); if (b) b.revenue += v }
  const addOut = (line: string, v: number, d: string) => {
    const targets = [total, bucket(d)].filter(Boolean) as ReturnType<typeof acc>[]
    for (const t of targets) {
      if (isNonDeductible(line)) t.non_deductible += v
      else { t.deductible += v; t.by_line[line] = money((t.by_line[line] || 0) + v) }
    }
  }
  for (const t of plaid) addOut(taxLineOf(t), num(t.amount), t.date)
  for (const e of manual) { const v = num(e.amount); if (v > 0) addOut(e.tax_category || 'Manual expense', v, e.date) }
  const fmt = (b: ReturnType<typeof acc>) => ({
    revenue: money(b.revenue), deductible_expenses: money(b.deductible), net_profit: money(b.revenue - b.deductible),
    non_deductible_money_out: money(b.non_deductible),
    by_tax_line: Object.fromEntries(Object.entries(b.by_line).sort((x, y) => y[1] - x[1]).slice(0, 20)),
  })
  return {
    period: `${start} to ${end}`,
    ...fmt(total),
    ...(input?.by_month ? { months: Object.fromEntries(Object.entries(months).sort().map(([k, v]) => [k, fmt(v)])) } : {}),
    scope: 'Cash basis: revenue = payments received, expenses = bank debits and logged expenses by tax line. Non-deductible money out is owner draws, card payments, loan principal and unreviewed transfers — not an expense, does not reduce profit.',
  }
}

async function invoices(r: Rest, co: string, input: any) {
  const status = input?.status || 'open'
  const p = new URLSearchParams({ select: 'id,invoice_id,amount,discount_applied,tax_amount,credit_card_fee,payment_status,due_date,invoice_date,created_at,customer_id,job_id', order: 'created_at.desc' })
  if (status === 'paid') p.append('payment_status', 'eq.Paid')
  else if (status !== 'all') p.append('payment_status', 'not.in.(Paid,Void,Cancelled)')
  if (input?.start_date) p.append('created_at', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('created_at', `lte.${clean(input.end_date)}T23:59:59`)
  let custIds: number[] | null = null
  if (input?.customer_name) {
    const t = clean(input.customer_name)
    const cs = await readAll(r, `customers?${co}&select=id&or=(name.ilike.*${t}*,business_name.ilike.*${t}*)`, 200)
    if (!cs.length) return { count: 0, note: `No customer matching "${input.customer_name}".` }
    custIds = cs.map((c: any) => c.id)
    p.append('customer_id', `in.(${custIds.join(',')})`)
  }
  const rows = await readAll(r, `invoices?${co}&${p}`)
  const ids = rows.map((i: any) => i.id)
  const paid: Record<number, number> = {}
  for (let i = 0; i < ids.length; i += 300) {
    for (const pm of await readAll(r, `payments?${co}&select=invoice_id,amount,status&invoice_id=in.(${ids.slice(i, i + 300).join(',')})`)) {
      if (['Paid', 'Completed', null, undefined].includes(pm.status)) paid[pm.invoice_id] = (paid[pm.invoice_id] || 0) + num(pm.amount)
    }
  }
  const names: Record<number, string> = {}
  const cids = [...new Set(rows.map((i: any) => i.customer_id).filter(Boolean))]
  for (let i = 0; i < cids.length; i += 300) for (const c of await readAll(r, `customers?${co}&select=id,name,business_name&id=in.(${cids.slice(i, i + 300).join(',')})`)) names[c.id] = c.business_name || c.name
  const now = Date.now()
  let out = rows.map((i: any) => {
    // Same rule as lib/arHelpers invoiceCustomerTotal: an old invoice whose
    // discount is larger than its amount already stores the net, so the
    // amount IS the total. Without this the tool zeroed three of HHH's open
    // invoices and told the owner $78k was overdue while Invoices showed $90k.
    const gross = num(i.amount), disc = num(i.discount_applied)
    const total = (disc > 0 && disc > gross ? gross : Math.max(0, gross - disc)) + num(i.tax_amount)
    const settled = i.payment_status === 'Paid' || i.payment_status === 'Void' || i.payment_status === 'Cancelled'
    const balance = settled ? 0 : Math.max(0, money(total - (paid[i.id] || 0)))
    const due = i.due_date ? new Date(i.due_date) : new Date(new Date(i.created_at).getTime() + 30 * 86400000)
    const days = Math.max(0, Math.floor((now - due.getTime()) / 86400000))
    return { invoice: i.invoice_id || `#${i.id}`, customer: names[i.customer_id] || null, status: i.payment_status || 'Pending', total: money(total), balance, days_overdue: days, invoice_date: i.invoice_date || String(i.created_at).slice(0, 10), due_date: due.toISOString().slice(0, 10), job_id: i.job_id }
  })
  if (status === 'open' || status === 'overdue') out = out.filter(x => x.balance > 0)
  if (status === 'overdue') out = out.filter(x => x.days_overdue > 0)
  if (input?.min_days_overdue) out = out.filter(x => x.days_overdue >= num(input.min_days_overdue))
  out.sort((a, b) => b.balance - a.balance)
  const limit = clamp(input?.limit, 25, 100)
  return {
    count: out.length,
    total_balance: money(out.reduce((s, x) => s + x.balance, 0)),
    total_billed: money(out.reduce((s, x) => s + x.total, 0)),
    invoices: out.slice(0, limit),
    scope: `${out.length} ${status} invoice(s); list is the largest ${Math.min(limit, out.length)} by balance. Balance = invoice total after discounts minus payments applied; overdue = past due_date (or 30 days from creation when no due date).`,
  }
}

// Mirrors src/lib/soldTotals.js — the one "sold" rule in the app. Change
// both or neither.
const NOT_SOLD = new Set(['Archived', 'Cancelled', 'Canceled', 'Void', 'Voided'])
async function sales(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'id,job_id,job_title,status,job_total,created_at,customer_id', order: 'created_at.desc' })
  if (input?.start_date) p.append('created_at', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('created_at', `lt.${clean(input.end_date)}T23:59:59.999`)
  const rows = (await readAll(r, `jobs?${co}&${p}`)).filter((j: any) => j.created_at && !NOT_SOLD.has(j.status))
  const val = (j: any) => { const n = Number(j.job_total); return Number.isFinite(n) && n > 0 ? n : 0 }
  const total = money(rows.reduce((s: number, j: any) => s + val(j), 0))
  const unpriced = rows.filter((j: any) => val(j) === 0).length
  const names: Record<number, string> = {}
  const cids = [...new Set(rows.map((j: any) => j.customer_id).filter(Boolean))].slice(0, 300)
  if (cids.length) for (const c of await readAll(r, `customers?${co}&select=id,name,business_name&id=in.(${cids.join(',')})`)) names[c.id] = c.business_name || c.name
  const byStatus: Record<string, number> = {}
  for (const j of rows) byStatus[j.status || 'no status'] = money((byStatus[j.status || 'no status'] || 0) + val(j))
  const out: any = {
    sold: total, jobs: rows.length, unpriced_jobs: unpriced, by_status: byStatus,
    largest: [...rows].sort((a: any, b: any) => val(b) - val(a)).slice(0, clamp(input?.limit, 15, 100)).map((j: any) => ({
      job: j.job_id || `#${j.id}`, title: j.job_title, customer: names[j.customer_id] || null, sold: val(j), created: String(j.created_at).slice(0, 10), status: j.status,
    })),
    scope: `Sold = contract value (job_total) of ${rows.length} job(s) created in the range, cancelled/archived excluded, ${unpriced} unpriced counted at $0. Same rule as the Dashboard's Sales Won tiles and the Sales Performance page. This is booked work, not cash collected.`,
  }
  if (input?.by_month) {
    const bm: Record<string, { sold: number; jobs: number }> = {}
    for (const j of rows) { const k = String(j.created_at).slice(0, 7); bm[k] = bm[k] || { sold: 0, jobs: 0 }; bm[k].sold = money(bm[k].sold + val(j)); bm[k].jobs++ }
    out.by_month = Object.fromEntries(Object.entries(bm).sort(([a], [b]) => a.localeCompare(b)))
  }
  return out
}

const DELIVERED = new Set(['Completed', 'Job Complete', 'Verified Complete', 'Post Inspection (Req)', 'Invoiced', 'Paid', 'Closed', 'Done'])
const IN_PROGRESS = /in progress|post inspection|chillin|on hold|waiting|need to order|pre inspection/i

async function customerNames(r: Rest, co: string, ids: any[]): Promise<Record<number, string>> {
  const names: Record<number, string> = {}
  const cids = [...new Set(ids.filter(Boolean))].slice(0, 300)
  if (cids.length) for (const c of await readAll(r, `customers?${co}&select=id,name,business_name&id=in.(${cids.join(',')})`)) names[c.id] = c.business_name || c.name
  return names
}

async function estimates(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'id,quote_id,estimate_name,status,quote_amount,calculated_quote_amount,customer_id,job_id,created_at,approved_date,expiration_date', order: 'created_at.desc' })
  if (input?.status && input.status !== 'all') p.append('status', `ilike.${clean(input.status)}`)
  if (input?.start_date) p.append('created_at', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('created_at', `lte.${clean(input.end_date)}T23:59:59`)
  if (input?.customer_name) {
    const cs = await readAll(r, `customers?${co}&select=id&or=(name.ilike.*${clean(input.customer_name)}*,business_name.ilike.*${clean(input.customer_name)}*)`, 200)
    if (!cs.length) return { count: 0, note: `No customer matching "${input.customer_name}".` }
    p.append('customer_id', `in.(${cs.map((c: any) => c.id).join(',')})`)
  }
  const amt = (q: any) => num(q.quote_amount) || num(q.calculated_quote_amount)
  let rows = await readAll(r, `quotes?${co}&${p}`)
  if (input?.min_amount) rows = rows.filter((q: any) => amt(q) >= num(input.min_amount))
  const names = await customerNames(r, co, rows.map((q: any) => q.customer_id))
  const byStatus: Record<string, { count: number; total: number }> = {}
  for (const q of rows) { const k = q.status || 'no status'; byStatus[k] = byStatus[k] || { count: 0, total: 0 }; byStatus[k].count++; byStatus[k].total = money(byStatus[k].total + amt(q)) }
  const approved = byStatus.Approved?.count || 0, rejected = byStatus.Rejected?.count || 0
  const limit = clamp(input?.limit, 25, 100)
  return {
    count: rows.length, total: money(rows.reduce((s: number, q: any) => s + amt(q), 0)), by_status: byStatus,
    win_rate_of_decided: approved + rejected ? Math.round(approved / (approved + rejected) * 100) : null,
    estimates: [...rows].sort((a: any, b: any) => amt(b) - amt(a)).slice(0, limit).map((q: any) => ({ estimate: q.quote_id || q.estimate_name || `#${q.id}`, customer: names[q.customer_id] || null, status: q.status, amount: amt(q), created: String(q.created_at).slice(0, 10), approved: q.approved_date ? String(q.approved_date).slice(0, 10) : null, job_id: q.job_id })),
    scope: `${rows.length} estimate(s); list is the largest ${Math.min(limit, rows.length)}. Amount = quote_amount, else the calculated amount. An estimate is an offer, not a sale — sold is query_sales.`,
  }
}

async function leads(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'id,customer_name,business_name,status,computed_status,lead_source,business_unit,created_at,converted_at', order: 'created_at.desc' })
  if (input?.status) p.append('status', `ilike.${clean(input.status)}`)
  if (input?.source) p.append('lead_source', `ilike.*${clean(input.source)}*`)
  if (input?.start_date) p.append('created_at', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('created_at', `lte.${clean(input.end_date)}T23:59:59`)
  const rows = await readAll(r, `leads?${co}&${p}`)
  const count = (k: string) => { const m: Record<string, number> = {}; for (const l of rows) m[l[k] || 'none'] = (m[l[k] || 'none'] || 0) + 1; return Object.fromEntries(Object.entries(m).sort((a, b) => b[1] - a[1])) }
  const limit = clamp(input?.limit, 25, 100)
  return {
    count: rows.length, by_status: count('status'), by_source: count('lead_source'), converted: rows.filter((l: any) => l.converted_at).length,
    leads: rows.slice(0, limit).map((l: any) => ({ name: l.business_name || l.customer_name, status: l.status, source: l.lead_source, created: String(l.created_at).slice(0, 10), converted: l.converted_at ? String(l.converted_at).slice(0, 10) : null })),
    scope: `${rows.length} lead(s); list is the most recent ${Math.min(limit, rows.length)}.`,
  }
}

async function utilityIncentives(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'id,utility_invoice_id,utility_name,customer_name,job_id,invoice_id,project_cost,incentive_amount,amount,payment_status,paid_at,created_at', order: 'created_at.desc' })
  const status = input?.status || 'open'
  if (status === 'paid') p.append('payment_status', 'eq.Paid')
  else if (status !== 'all') p.append('payment_status', 'not.in.(Paid,Void)')
  if (input?.utility) p.append('utility_name', `ilike.*${clean(input.utility)}*`)
  if (input?.start_date) p.append('created_at', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('created_at', `lte.${clean(input.end_date)}T23:59:59`)
  const rows = await readAll(r, `utility_invoices?${co}&${p}`)
  const inc = (u: any) => num(u.amount) || num(u.incentive_amount)
  const byUtility: Record<string, number> = {}
  for (const u of rows) byUtility[u.utility_name || 'unknown'] = money((byUtility[u.utility_name || 'unknown'] || 0) + inc(u))
  const limit = clamp(input?.limit, 25, 100)
  return {
    count: rows.length, total: money(rows.reduce((s: number, u: any) => s + inc(u), 0)), by_utility: byUtility,
    incentives: rows.slice(0, limit).map((u: any) => ({ id: u.utility_invoice_id || `#${u.id}`, utility: u.utility_name, customer: u.customer_name, job_id: u.job_id, project_cost: num(u.project_cost), incentive: inc(u), status: u.payment_status, paid: u.paid_at ? String(u.paid_at).slice(0, 10) : null, filed: String(u.created_at).slice(0, 10) })),
    scope: `${rows.length} ${status} utility incentive(s). "open" = filed with the utility and not yet paid; that money is receivable from the utility, not the customer.`,
  }
}

async function billsAndPos(r: Rest, co: string, input: any) {
  const status = input?.status || 'open'
  const vendors: Record<number, string> = {}
  for (const v of await readAll(r, `vendors?${co}&select=id,name,business_name`, 2000)) vendors[v.id] = v.business_name || v.name
  let vids: number[] | null = null
  if (input?.vendor_name) { const t = clean(input.vendor_name).toLowerCase(); vids = Object.entries(vendors).filter(([, n]) => String(n).toLowerCase().includes(t)).map(([id]) => Number(id)); if (!vids.length) return { note: `No vendor matching "${input.vendor_name}".` } }
  const bp = new URLSearchParams({ select: 'id,bill_number,amount,balance_due,bill_date,due_date,status,vendor_id', order: 'due_date.asc' })
  const pp = new URLSearchParams({ select: 'id,po_number,vendor_id,job_id,status,total,expected_delivery_date,created_at', order: 'created_at.desc' })
  if (status !== 'all') { bp.append('status', 'not.in.(Paid,Void,Cancelled)'); pp.append('status', 'not.in.(Closed,Received,Cancelled,Void)') }
  if (vids) { bp.append('vendor_id', `in.(${vids.join(',')})`); pp.append('vendor_id', `in.(${vids.join(',')})`) }
  if (input?.start_date) { bp.append('bill_date', `gte.${clean(input.start_date)}`); pp.append('created_at', `gte.${clean(input.start_date)}`) }
  if (input?.end_date) { bp.append('bill_date', `lte.${clean(input.end_date)}`); pp.append('created_at', `lte.${clean(input.end_date)}T23:59:59`) }
  const [bills, pos] = await Promise.all([readAll(r, `bills?${co}&${bp}`), readAll(r, `purchase_orders?${co}&${pp}`)])
  const today = new Date().toISOString().slice(0, 10)
  const due = (b: any) => num(b.balance_due ?? b.amount)
  const limit = clamp(input?.limit, 25, 100)
  return {
    bills: { count: bills.length, balance_due: money(bills.reduce((s: number, b: any) => s + due(b), 0)), past_due: money(bills.filter((b: any) => b.due_date && b.due_date < today).reduce((s: number, b: any) => s + due(b), 0)),
      rows: bills.slice(0, limit).map((b: any) => ({ bill: b.bill_number || `#${b.id}`, vendor: vendors[b.vendor_id] || null, amount: num(b.amount), balance_due: due(b), due: b.due_date, status: b.status })) },
    purchase_orders: { count: pos.length, total: money(pos.reduce((s: number, x: any) => s + num(x.total), 0)),
      rows: pos.slice(0, limit).map((x: any) => ({ po: x.po_number || `#${x.id}`, vendor: vendors[x.vendor_id] || null, job_id: x.job_id, total: num(x.total), status: x.status, expected: x.expected_delivery_date, created: String(x.created_at).slice(0, 10) })) },
    scope: `${status === 'all' ? 'All' : 'Open'} vendor bills and purchase orders. A PO is a commitment, not yet a bill; a bill's balance_due is what is owed now.`,
  }
}

async function liabilitiesAndAssets(r: Rest, co: string, input: any) {
  const [liabs, assets] = await Promise.all([
    readAll(r, `liabilities?${co}&select=id,name,lender,liability_type,current_balance,monthly_payment,interest_rate,next_payment_due,next_payment_amount,original_principal,origination_date,term_months,status&order=current_balance.desc`, 500),
    readAll(r, `assets?${co}&select=id,name,asset_type,purchase_price,current_value,purchase_date,in_service_date,useful_life_years,status&order=current_value.desc`, 500),
  ])
  const lp = new URLSearchParams({ select: 'id,liability_id,date,amount,principal,interest', order: 'date.desc' })
  lp.append('date', `gte.${clean(input?.start_date) || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)}`)
  if (input?.end_date) lp.append('date', `lte.${clean(input.end_date)}`)
  const pays = await readAll(r, `loan_payments?${co}&${lp}`)
  const byLiab: Record<number, { paid: number; principal: number; interest: number; n: number }> = {}
  for (const x of pays) { const k = x.liability_id; byLiab[k] = byLiab[k] || { paid: 0, principal: 0, interest: 0, n: 0 }; byLiab[k].paid = money(byLiab[k].paid + num(x.amount)); byLiab[k].principal = money(byLiab[k].principal + num(x.principal)); byLiab[k].interest = money(byLiab[k].interest + num(x.interest)); byLiab[k].n++ }
  const open = liabs.filter((l: any) => l.status !== 'paid_off' && l.status !== 'closed')
  return {
    debt_total: money(open.reduce((s: number, l: any) => s + num(l.current_balance), 0)), monthly_debt_service: money(open.reduce((s: number, l: any) => s + num(l.monthly_payment), 0)),
    liabilities: liabs.map((l: any) => ({ ...l, current_balance: num(l.current_balance), monthly_payment: num(l.monthly_payment), payments_in_range: byLiab[l.id] || null })),
    loan_payments_in_range: { count: pays.length, total: money(pays.reduce((s: number, x: any) => s + num(x.amount), 0)), interest: money(pays.reduce((s: number, x: any) => s + num(x.interest), 0)) },
    assets_total_current_value: money(assets.reduce((s: number, a: any) => s + (num(a.current_value) || num(a.purchase_price)), 0)),
    assets: assets.map((a: any) => ({ ...a, purchase_price: num(a.purchase_price), current_value: num(a.current_value) })),
    scope: 'Liabilities and assets as recorded in Books. Loan payments default to the last 12 months. Principal is not deductible; interest is.',
  }
}

async function fleetTool(r: Rest, co: string, input: any) {
  const since = clean(input?.start_date) || new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10)
  const mp = new URLSearchParams({ select: 'id,asset_id,type,date,mileage_hours,description,cost', order: 'date.desc' })
  mp.append('date', `gte.${since}`); if (input?.end_date) mp.append('date', `lte.${clean(input.end_date)}`)
  const [units, maint, rentals] = await Promise.all([
    readAll(r, `fleet?${co}&select=id,name,type,make,model,model_year,status,mileage_hours,last_pm_date,next_pm_due,purchase_price,purchase_date,repair_cost,assigned_to,business_unit`, 500),
    readAll(r, `fleet_maintenance?${co}&${mp}`, 2000),
    readAll(r, `fleet_rentals?${co}&select=id,asset_id,rental_customer,start_date,end_date,rental_rate,status`, 500),
  ])
  const today = new Date().toISOString().slice(0, 10)
  const byUnit: Record<string, number> = {}
  for (const m of maint) byUnit[m.asset_id] = money((byUnit[m.asset_id] || 0) + num(m.cost))
  const limit = clamp(input?.limit, 25, 100)
  return {
    units: units.length, overdue_for_service: units.filter((u: any) => u.next_pm_due && u.next_pm_due < today).map((u: any) => u.name),
    maintenance_cost_in_range: money(maint.reduce((s: number, m: any) => s + num(m.cost), 0)), maintenance_records: maint.length,
    fleet: units.slice(0, limit).map((u: any) => ({ ...u, purchase_price: num(u.purchase_price), repair_cost: num(u.repair_cost), maintenance_in_range: byUnit[u.id] || 0 })),
    recent_maintenance: maint.slice(0, limit), rentals,
    scope: `Fleet units with maintenance since ${since}. Fuel is on the bank feed (query_bank_transactions, tax line Auto expenses), not here.`,
  }
}

async function inventoryTool(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'id,name,quantity,min_quantity,available,allocated_qty,location,condition,product_id,inventory_type', order: 'name.asc' })
  if (input?.search) p.append('name', `ilike.*${clean(input.search)}*`)
  const rows = await readAll(r, `inventory?${co}&${p}`, 5000)
  const pids = [...new Set(rows.map((i: any) => i.product_id).filter(Boolean))]
  const cost: Record<number, number> = {}
  for (let i = 0; i < pids.length; i += 300) for (const pr of await readAll(r, `products_services?${co}&select=id,cost&id=in.(${pids.slice(i, i + 300).join(',')})`)) cost[pr.id] = num(pr.cost)
  const low = rows.filter((i: any) => num(i.min_quantity) > 0 && num(i.quantity) < num(i.min_quantity))
  const list = input?.low_stock_only ? low : rows
  const limit = clamp(input?.limit, 25, 100)
  return {
    items: rows.length, stocked: rows.filter((i: any) => num(i.quantity) > 0).length, low_stock: low.length,
    value_at_cost: money(rows.reduce((s: number, i: any) => s + num(i.quantity) * (cost[i.product_id] || 0), 0)),
    inventory: list.slice(0, limit).map((i: any) => ({ name: i.name, quantity: num(i.quantity), min: num(i.min_quantity), location: i.location, value: money(num(i.quantity) * (cost[i.product_id] || 0)) })),
    scope: `${rows.length} item(s)${input?.low_stock_only ? ', low-stock only' : ''}; value uses the product's cost, $0 when none is on file.`,
  }
}

async function timeClock(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'id,employee_id,job_id,clock_in,clock_out,total_hours', order: 'clock_in.desc' })
  p.append('clock_in', `gte.${clean(input?.start_date) || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}`)
  if (input?.end_date) p.append('clock_in', `lte.${clean(input.end_date)}T23:59:59`)
  const emps = await readAll(r, `employees?${co}&select=id,name,hourly_rate`, 1000)
  const emp: Record<number, any> = {}; for (const e of emps) emp[e.id] = e
  if (input?.employee_name) { const t = clean(input.employee_name).toLowerCase(); const ids = emps.filter((e: any) => String(e.name || '').toLowerCase().includes(t)).map((e: any) => e.id); if (!ids.length) return { note: `No employee matching "${input.employee_name}".` }; p.append('employee_id', `in.(${ids.join(',')})`) }
  if (input?.job) { const t = clean(input.job); const js = await readAll(r, `jobs?${co}&select=id&or=(job_title.ilike.*${t}*,job_id.ilike.*${t}*)`, 200); if (!js.length) return { note: `No job matching "${input.job}".` }; p.append('job_id', `in.(${js.map((j: any) => j.id).join(',')})`) }
  const rows = await readAll(r, `time_clock?${co}&${p}`)
  const jids = [...new Set(rows.map((x: any) => x.job_id).filter(Boolean))].slice(0, 300)
  const jobs: Record<number, string> = {}
  if (jids.length) for (const j of await readAll(r, `jobs?${co}&select=id,job_id,job_title&id=in.(${jids.join(',')})`)) jobs[j.id] = j.job_title || j.job_id
  const byEmp: Record<string, { hours: number; cost: number }> = {}, byJob: Record<string, number> = {}
  let hours = 0, cost = 0
  for (const x of rows) {
    const h = num(x.total_hours), rate = num(emp[x.employee_id]?.hourly_rate), c = h * rate
    hours += h; cost += c
    const en = emp[x.employee_id]?.name || `#${x.employee_id}`; byEmp[en] = byEmp[en] || { hours: 0, cost: 0 }; byEmp[en].hours = Math.round((byEmp[en].hours + h) * 100) / 100; byEmp[en].cost = money(byEmp[en].cost + c)
    const jn = x.job_id ? (jobs[x.job_id] || `#${x.job_id}`) : 'no job'; byJob[jn] = Math.round(((byJob[jn] || 0) + h) * 100) / 100
  }
  return { punches: rows.length, hours: Math.round(hours * 100) / 100, labor_cost_at_hourly_rates: money(cost), hours_on_a_job: Math.round(rows.filter((x: any) => x.job_id).reduce((s: number, x: any) => s + num(x.total_hours), 0) * 100) / 100, by_employee: byEmp, by_job: byJob, scope: 'Time clock punches in the range (default last 30 days). Labor cost = hours × the employee\'s hourly rate on file; no rate, no cost.' }
}

async function bonuses(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'id,job_id,employee_id,amount,status,allotted_hours,actual_hours,saved_hours,accrued_at,paid_at', order: 'accrued_at.desc' })
  if (input?.status && input.status !== 'all') p.append('status', `eq.${clean(input.status)}`)
  if (input?.start_date) p.append('accrued_at', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('accrued_at', `lte.${clean(input.end_date)}T23:59:59`)
  const rows = await readAll(r, `job_bonuses?${co}&${p}`, 5000)
  const emps: Record<number, string> = {}; for (const e of await readAll(r, `employees?${co}&select=id,name`, 1000)) emps[e.id] = e.name
  const byStatus: Record<string, number> = {}; for (const b of rows) byStatus[b.status || 'none'] = money((byStatus[b.status || 'none'] || 0) + num(b.amount))
  const limit = clamp(input?.limit, 25, 100)
  return { count: rows.length, by_status: byStatus, bonuses: rows.slice(0, limit).map((b: any) => ({ ...b, employee: emps[b.employee_id] || null, amount: num(b.amount) })), scope: 'Crew efficiency bonuses. "accrued" is earned and not yet paid; it is owed.' }
}

async function backlog(r: Rest, co: string, input: any) {
  const jp = new URLSearchParams({ select: 'id,job_id,job_title,status,job_total,customer_id,created_at', order: 'created_at.desc' })
  if (input?.start_date) jp.append('created_at', `gte.${clean(input.start_date)}`)
  if (input?.end_date) jp.append('created_at', `lte.${clean(input.end_date)}T23:59:59`)
  const jobs = (await readAll(r, `jobs?${co}&${jp}`)).filter((j: any) => !NOT_SOLD.has(j.status))
  const ids = jobs.map((j: any) => j.id)
  const invs: any[] = [], pays: any[] = []
  for (let i = 0; i < ids.length; i += 300) {
    const chunk = ids.slice(i, i + 300).join(',')
    invs.push(...await readAll(r, `invoices?${co}&select=id,job_id,amount,discount_applied,payment_status&job_id=in.(${chunk})&payment_status=not.in.(Void,Cancelled)`))
    pays.push(...await readAll(r, `payments?${co}&select=id,invoice_id,job_id,amount,status&or=(job_id.in.(${chunk}))`))
  }
  const invIds = invs.map((i: any) => i.id)
  for (let i = 0; i < invIds.length; i += 300) pays.push(...await readAll(r, `payments?${co}&select=id,invoice_id,job_id,amount,status&invoice_id=in.(${invIds.slice(i, i + 300).join(',')})`))
  const seen = new Set<number>()
  const paidByInv: Record<number, number> = {}, paidByJob: Record<number, number> = {}
  for (const pm of pays) {
    if (seen.has(pm.id) || ['Paid', 'Completed', null, undefined].includes(pm.status) === false) continue
    seen.add(pm.id)
    if (pm.invoice_id) paidByInv[pm.invoice_id] = (paidByInv[pm.invoice_id] || 0) + num(pm.amount)
    else if (pm.job_id) paidByJob[pm.job_id] = (paidByJob[pm.job_id] || 0) + num(pm.amount)
  }
  const invByJob: Record<number, any[]> = {}; for (const i of invs) (invByJob[i.job_id] = invByJob[i.job_id] || []).push(i)
  const total = (i: any) => { const g = num(i.amount), d = num(i.discount_applied); return d > 0 && d > g ? g : Math.max(0, g - d) }
  const val = (j: any) => { const n = Number(j.job_total); return Number.isFinite(n) && n > 0 ? n : 0 }
  const stage = (j: any) => DELIVERED.has(j.status) ? 'delivered' : IN_PROGRESS.test(j.status || '') ? 'in_progress' : 'not_started'
  const rows = jobs.map((j: any) => {
    const inv = invByJob[j.id] || []
    const invoiced = money(inv.reduce((s: number, i: any) => s + total(i), 0))
    const collected = money(inv.reduce((s: number, i: any) => s + (i.payment_status === 'Paid' ? total(i) : Math.min(total(i), paidByInv[i.id] || 0)), 0) + (paidByJob[j.id] || 0))
    const owed = money(inv.filter((i: any) => i.payment_status !== 'Paid').reduce((s: number, i: any) => s + Math.max(0, total(i) - (paidByInv[i.id] || 0)), 0))
    return { job: j.job_id || `#${j.id}`, title: j.job_title, customer_id: j.customer_id, status: j.status, stage: stage(j), sold: val(j), invoiced, collected, owed, created: String(j.created_at).slice(0, 10) }
  })
  const want = input?.status
  let list = rows
  if (want === 'delivered' || want === 'in_progress' || want === 'not_started') list = rows.filter(x => x.stage === want)
  else if (want === 'delivered_not_invoiced') list = rows.filter(x => x.stage === 'delivered' && x.invoiced === 0 && x.sold > 0)
  else if (want === 'owed') list = rows.filter(x => x.owed > 0)
  else if (want && want !== 'all') list = rows.filter(x => String(x.status || '').toLowerCase() === String(want).toLowerCase())
  const names = await customerNames(r, co, list.map(x => x.customer_id))
  const sumOf = (k: string, arr = rows) => money(arr.reduce((s: number, x: any) => s + num(x[k]), 0))
  const limit = clamp(input?.limit, 25, 100)
  return {
    jobs: rows.length, sold: sumOf('sold'), delivered: sumOf('sold', rows.filter(x => x.stage === 'delivered')), in_progress: sumOf('sold', rows.filter(x => x.stage === 'in_progress')), not_started: sumOf('sold', rows.filter(x => x.stage === 'not_started')),
    invoiced: sumOf('invoiced'), collected: sumOf('collected'), owed: sumOf('owed'),
    delivered_not_invoiced: { jobs: rows.filter(x => x.stage === 'delivered' && x.invoiced === 0 && x.sold > 0).length, sold: sumOf('sold', rows.filter(x => x.stage === 'delivered' && x.invoiced === 0 && x.sold > 0)) },
    listed: list.length, rows: [...list].sort((a, b) => b.sold - a.sold).slice(0, limit).map(x => ({ ...x, customer: names[x.customer_id] || null, customer_id: undefined })),
    scope: 'Each job: sold = job_total; invoiced = invoices on the job after discounts; collected = payments on those invoices (a Paid invoice counts in full) plus payments tagged straight to the job; owed = open invoice balances. Cancelled and archived jobs excluded.',
  }
}

async function queryTable(r: Rest, co: string, input: any) {
  const table = String(input?.table || '')
  const allowed = TABLE_ALLOWLIST[table]
  if (!allowed) return { error: `Not a readable table: "${table}". Readable: ${Object.keys(TABLE_ALLOWLIST).join(', ')}.` }
  const cols = (Array.isArray(input?.columns) && input.columns.length ? input.columns.map(String).filter((c: string) => allowed.includes(c)) : allowed)
  if (!cols.length) return { error: 'None of those columns are readable on that table.', readable_columns: allowed }
  const p = new URLSearchParams({ select: cols.join(',') })
  for (const f of Array.isArray(input?.filters) ? input.filters.slice(0, 8) : []) {
    const c = String(f?.column || ''); if (!allowed.includes(c)) return { error: `Cannot filter on "${c}".`, readable_columns: allowed }
    const op = String(f?.op || 'eq'); const v = clean(f?.value)
    if (op === 'in') p.append(c, `in.(${v.split(/\s+/).join(',')})`)
    else if (op === 'is') p.append(c, `is.${v === 'null' ? 'null' : v === 'true' ? 'true' : 'false'}`)
    else if (op === 'ilike') p.append(c, `ilike.*${v}*`)
    else if (['eq', 'neq', 'gt', 'gte', 'lt', 'lte'].includes(op)) p.append(c, `${op}.${v}`)
  }
  const ob = String(input?.order_by || ''); if (ob && allowed.includes(ob)) p.set('order', `${ob}.${input?.descending === false ? 'asc' : 'desc'}`)
  const rows = await readAll(r, `${table}?${co}&${p}`)
  const sums: Record<string, number> = {}
  for (const c of Array.isArray(input?.sum) ? input.sum.map(String).filter((c: string) => allowed.includes(c)) : []) sums[c] = money(rows.reduce((s: number, x: any) => s + num(x[c]), 0))
  const limit = clamp(input?.limit, 25, 200)
  return { table, count: rows.length, totals: sums, rows: rows.slice(0, limit), scope: `${rows.length} row(s) matched; the list is the first ${Math.min(limit, rows.length)}. Totals cover every matching row.`, ...(rows.length >= READ_CAP ? { WARNING: `Read the first ${READ_CAP} rows only.` } : {}) }
}

async function payments(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'id,amount,date,method,status,invoice_id,customer_id,job_id,is_deposit,refunded_amount', order: 'date.desc' })
  if (input?.start_date) p.append('date', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('date', `lte.${clean(input.end_date)}`)
  if (input?.method) p.append('method', `ilike.*${clean(input.method)}*`)
  if (input?.customer_name) {
    const t = clean(input.customer_name)
    const cs = await readAll(r, `customers?${co}&select=id&or=(name.ilike.*${t}*,business_name.ilike.*${t}*)`, 200)
    if (!cs.length) return { count: 0, total: 0, note: `No customer matching "${input.customer_name}".` }
    p.append('customer_id', `in.(${cs.map((c: any) => c.id).join(',')})`)
  }
  const rows = (await readAll(r, `payments?${co}&${p}`)).filter((x: any) => String(x.status || '').toLowerCase() !== 'failed')
  const names: Record<number, string> = {}
  const cids = [...new Set(rows.map((x: any) => x.customer_id).filter(Boolean))].slice(0, 300)
  if (cids.length) for (const c of await readAll(r, `customers?${co}&select=id,name,business_name&id=in.(${cids.join(',')})`)) names[c.id] = c.business_name || c.name
  const byMethod: Record<string, number> = {}
  for (const x of rows) byMethod[x.method || 'unknown'] = money((byMethod[x.method || 'unknown'] || 0) + num(x.amount))
  const total = money(rows.reduce((s: number, x: any) => s + num(x.amount), 0))
  const refunded = money(rows.reduce((s: number, x: any) => s + num(x.refunded_amount), 0))
  const limit = clamp(input?.limit, 25, 100)
  return {
    count: rows.length, total, refunded, net: money(total - refunded), by_method: byMethod,
    payments: rows.slice(0, limit).map((x: any) => ({ date: x.date, amount: num(x.amount), method: x.method, customer: names[x.customer_id] || null, invoice_id: x.invoice_id, deposit: x.is_deposit === true })),
    scope: `${rows.length} payment(s); the list is the most recent ${Math.min(limit, rows.length)}. Totals cover every matching payment.`,
    ...(rows.length >= READ_CAP ? { WARNING: `Read the first ${READ_CAP} payments only — totals are a floor.` } : {}),
  }
}

// Port of src/lib/reports.js jobCosting — the Job Costing report and the
// profitability view on each job. Revenue = payments tagged to the job plus
// prepaid_revenue; cost = job lines walked through bundle components into
// material/labor, plus labor_cost on the line, plus bank debits and logged
// expenses tagged to the job. No cost captured reads as null, not $0.
async function jobProfitability(r: Rest, co: string, input: any) {
  const jp = new URLSearchParams({ select: 'id,job_id,job_title,status,assigned_team,job_total,prepaid_revenue,parent_job_id,start_date,end_date,completed_at,customer_id', order: 'created_at.desc' })
  if (input?.status) jp.append('status', `ilike.${clean(input.status)}`)
  if (input?.team) jp.append('assigned_team', `ilike.*${clean(input.team)}*`)
  if (input?.start_date) jp.append('created_at', `gte.${clean(input.start_date)}`)
  if (input?.end_date) jp.append('created_at', `lte.${clean(input.end_date)}T23:59:59`)
  let jobs = await readAll(r, `jobs?${co}&${jp}`, 3000)
  const custNames: Record<number, string> = {}
  const cids = [...new Set(jobs.map((j: any) => j.customer_id).filter(Boolean))]
  for (let i = 0; i < cids.length; i += 300) for (const c of await readAll(r, `customers?${co}&select=id,name,business_name&id=in.(${cids.slice(i, i + 300).join(',')})`)) custNames[c.id] = c.business_name || c.name
  if (input?.job_name) {
    const t = clean(input.job_name).toLowerCase()
    jobs = jobs.filter((j: any) => [j.job_title, j.job_id, custNames[j.customer_id]].some(v => String(v || '').toLowerCase().includes(t)))
    if (!jobs.length) return { count: 0, note: `No job matching "${input.job_name}".` }
  }
  const jobIds = jobs.map((j: any) => j.id)
  const idList = (ids: number[]) => `in.(${ids.join(',')})`
  const lines: any[] = [], pays: any[] = [], plaid: any[] = [], manual: any[] = []
  const seenPayment = new Set<number>()
  for (let i = 0; i < jobIds.length; i += 200) {
    const chunk = jobIds.slice(i, i + 200)
    // A payment recorded on an invoice usually carries no job_id of its own;
    // the invoice knows the job. Same rule as lib/reports.js jobCosting.
    const invs = await readAll(r, `invoices?${co}&select=id,job_id&job_id=${idList(chunk)}`)
    const invoiceJob = new Map<number, number>(invs.map((x: any) => [x.id, x.job_id]))
    const [l, pDirect, pViaInvoice, t, m] = await Promise.all([
      readAll(r, `job_lines?${co}&select=job_id,item_id,quantity,labor_cost&job_id=${idList(chunk)}`),
      readAll(r, `payments?${co}&select=id,job_id,invoice_id,amount&job_id=${idList(chunk)}`),
      invs.length ? readAll(r, `payments?${co}&select=id,job_id,invoice_id,amount&invoice_id=${idList([...invoiceJob.keys()])}`) : Promise.resolve([]),
      readAll(r, `plaid_transactions?${co}&select=job_id,ai_job_id,amount,is_transfer&or=(job_id.${idList(chunk)},ai_job_id.${idList(chunk)})`),
      readAll(r, `expenses?${co}&select=job_id,amount&job_id=${idList(chunk)}`),
    ])
    for (const p of [...pDirect, ...pViaInvoice]) {
      if (seenPayment.has(p.id)) continue
      seenPayment.add(p.id)
      pays.push({ ...p, job_id: p.job_id || invoiceJob.get(p.invoice_id) || null })
    }
    lines.push(...l); plaid.push(...t); manual.push(...m)
  }
  const [products, components] = await Promise.all([
    readAll(r, `products_services?${co}&select=id,cost,material_or_labor`, 10000),
    readAll(r, `product_components?${co}&select=parent_product_id,component_product_id,quantity`, 10000),
  ])
  const productMap = new Map(products.map((p: any) => [p.id, p]))
  const kids = new Map<number, any[]>()
  for (const c of components) { const arr = kids.get(c.parent_product_id) || []; arr.push(c); kids.set(c.parent_product_id, arr) }
  const classify = (pid: number, depth = 0): { material: number; labor: number } => {
    const res = { material: 0, labor: 0 }
    if (!pid || depth > 3) return res
    const product: any = productMap.get(pid)
    const children = kids.get(pid) || []
    if (!children.length) {
      if (!product) return res
      const cost = num(product.cost)
      if (product.material_or_labor === 'labor') res.labor = cost; else res.material = cost
      return res
    }
    for (const c of children) {
      const sub: any = productMap.get(c.component_product_id)
      const q = num(c.quantity) || 1
      if (!sub) continue
      const cost = num(sub.cost) * q
      if (sub.material_or_labor === 'material') res.material += cost
      else if (sub.material_or_labor === 'labor') res.labor += cost
      else { const s2 = classify(c.component_product_id, depth + 1); res.material += s2.material * q; res.labor += s2.labor * q }
    }
    return res
  }
  const revenueBy = new Map<number, number>(), expBy = new Map<number, number>(), linesBy = new Map<number, any[]>()
  for (const p of pays) if (p.job_id) revenueBy.set(p.job_id, (revenueBy.get(p.job_id) || 0) + num(p.amount))
  for (const t of plaid) { const v = num(t.amount); if (v <= 0 || t.is_transfer) continue; const jid = t.job_id || t.ai_job_id; if (jid) expBy.set(jid, (expBy.get(jid) || 0) + v) }
  for (const e of manual) if (e.job_id) expBy.set(e.job_id, (expBy.get(e.job_id) || 0) + num(e.amount))
  for (const l of lines) { const arr = linesBy.get(l.job_id) || []; arr.push(l); linesBy.set(l.job_id, arr) }

  const rows = jobs.map((j: any) => {
    let material = 0, labor = 0
    for (const l of linesBy.get(j.id) || []) { const q = num(l.quantity) || 1; const s = classify(l.item_id); material += s.material * q; labor += s.labor * q; labor += num(l.labor_cost) }
    const tagged = expBy.get(j.id) || 0
    const hasCost = material > 0 || labor > 0 || tagged > 0
    const revenue = (revenueBy.get(j.id) || 0) + num(j.prepaid_revenue)
    const cost = material + labor + tagged
    return {
      job: j.job_id || `#${j.id}`, title: j.job_title || '', customer: custNames[j.customer_id] || null, status: j.status, team: j.assigned_team || null,
      contract: num(j.job_total), revenue: money(revenue),
      material: hasCost ? money(material) : null, labor: hasCost ? money(labor) : null, tagged_expenses: hasCost ? money(tagged) : null,
      total_cost: hasCost ? money(cost) : null, profit: hasCost ? money(revenue - cost) : null,
      margin_pct: hasCost && revenue > 0 ? Math.round((revenue - cost) / revenue * 1000) / 10 : null,
      completed: j.completed_at ? String(j.completed_at).slice(0, 10) : null,
    }
  }).filter(x => x.revenue > 0 || x.total_cost != null || input?.job_name)
  const sort = input?.sort || 'profit'
  const key = (x: any) => sort === 'revenue' ? x.revenue : sort === 'margin' ? (x.margin_pct ?? -Infinity) : sort === 'worst' ? -(x.margin_pct ?? Infinity) : (x.profit ?? -Infinity)
  rows.sort((a, b) => key(b) - key(a))
  const withCost = rows.filter(x => x.total_cost != null)
  const limit = clamp(input?.limit, 20, 100)
  const teams: Record<string, { jobs: number; revenue: number; cost: number }> = {}
  for (const x of withCost) { const k = x.team || 'Unassigned'; teams[k] ||= { jobs: 0, revenue: 0, cost: 0 }; teams[k].jobs++; teams[k].revenue += x.revenue; teams[k].cost += x.total_cost || 0 }
  return {
    count: rows.length,
    jobs_with_cost_data: withCost.length,
    totals: { revenue: money(rows.reduce((s, x) => s + x.revenue, 0)), cost: money(withCost.reduce((s, x) => s + (x.total_cost || 0), 0)), profit: money(withCost.reduce((s, x) => s + (x.profit || 0), 0)) },
    by_team: Object.fromEntries(Object.entries(teams).map(([k, v]) => [k, { jobs: v.jobs, revenue: money(v.revenue), cost: money(v.cost), profit: money(v.revenue - v.cost), margin_pct: v.revenue > 0 ? Math.round((v.revenue - v.cost) / v.revenue * 1000) / 10 : null }])),
    jobs: rows.slice(0, limit),
    scope: `${rows.length} job(s), ${withCost.length} with cost captured. The same math as the Job Costing report: revenue is payments tagged to the job or to one of its invoices, cost is job lines (bundle components walked) plus expenses tagged to the job. null cost = nothing captured, not zero. Totals for profit cover only jobs with cost data.`,
  }
}

async function payrollRuns(r: Rest, co: string, input: any) {
  const p = new URLSearchParams({ select: 'pay_date,period_start,period_end,status,total_gross,employee_count', order: 'pay_date.desc' })
  if (input?.start_date) p.append('pay_date', `gte.${clean(input.start_date)}`)
  if (input?.end_date) p.append('pay_date', `lte.${clean(input.end_date)}`)
  const rows = (await readAll(r, `payroll_runs?${co}&${p}`, 500)).filter((x: any) => !x.status || x.status === 'completed' || x.status === 'paid')
  const limit = clamp(input?.limit, 12, 60)
  return {
    runs: rows.length,
    gross_total: money(rows.reduce((s: number, x: any) => s + num(x.total_gross), 0)),
    avg_headcount: rows.length ? Math.round(rows.reduce((s: number, x: any) => s + num(x.employee_count), 0) / rows.length) : 0,
    list: rows.slice(0, limit).map((x: any) => ({ pay_date: x.pay_date, period: `${x.period_start} to ${x.period_end}`, gross: num(x.total_gross), people: num(x.employee_count) })),
    scope: 'Completed payroll runs only. Gross wages; employer payroll taxes (about 7.65% FICA plus FUTA/SUI) come on top. No pay rates are included.',
  }
}

async function bankBalances(r: Rest, co: string) {
  const accts = (await readAll(r, `connected_accounts?${co}&select=account_name,mask,account_type,account_subtype,current_balance,available_balance,status,last_synced`, 100))
    .filter((a: any) => a.status !== 'inactive' && a.status !== 'disconnected')
  let cash = 0, owed = 0
  const list = accts.map((a: any) => {
    const cur = num(a.current_balance), avail = a.available_balance == null ? null : num(a.available_balance)
    if (a.account_type === 'credit') owed += cur; else cash += avail ?? cur
    return { account: `${a.account_name}${a.mask ? ` …${a.mask}` : ''}`, type: a.account_type === 'credit' ? 'credit card' : (a.account_subtype || a.account_type), current: money(cur), available: avail == null ? null : money(avail), last_synced: a.last_synced }
  })
  return { accounts: list, total_cash_available: money(cash), total_card_balances_owed: money(owed), scope: accts.length ? 'As of the last bank sync; pending transactions may not be reflected.' : 'No bank account is connected.' }
}

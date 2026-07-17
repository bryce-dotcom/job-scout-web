// Standard reports library — single source of truth for the canned
// financial reports surfaced in Books → Reports and Frankie → Reports.
// Every report is a pure function that takes raw data + a date range
// and returns a structured result (rows + totals) the UI can render
// as a table or download as CSV. No DB calls, no React imports — so
// the same module works in a Vercel function later if needed.
//
// Each report shape:
//   {
//     id, name, description,
//     columns: [{ key, label, align?: 'right' | 'left', format?: 'currency' | 'percent' | 'date' | 'number' }],
//     rows: [{ ...keyedByColumn }],
//     totals?: { ...keyedByColumn },     // optional footer row
//     summary?: { ...arbitrary numbers }, // optional headline figures for cards
//     period: { from, to },
//   }

// ─────────────────────── helpers (mirror frankieFields) ───────────────────────

// invoiceCustomerTotal used to be re-implemented here. It drifted: this copy
// still used the `disc >= gross` legacy-net test after arHelpers was corrected
// to `>`, so a fully-covered invoice reported its whole gross as owed. Import
// the one definition instead of keeping a private twin.
import { invoiceCustomerTotal } from './arHelpers'

function paymentsByInvoiceIndex(payments) {
  const map = new Map()
  for (const p of payments || []) {
    if (!p.invoice_id) continue
    map.set(p.invoice_id, (map.get(p.invoice_id) || 0) + (Number(p.amount) || 0))
  }
  return map
}

function invoiceBalance(inv, paymentsByInv) {
  const customer = invoiceCustomerTotal(inv)
  const paid = paymentsByInv.get(inv.id) || 0
  return Math.max(0, customer - paid)
}

function isInvoiceOpen(inv) {
  const s = inv?.payment_status || 'Pending'
  return s !== 'Paid' && s !== 'Void' && s !== 'Cancelled'
}

function daysOverdue(inv, now) {
  const due = inv?.due_date ? new Date(inv.due_date) : null
  if (due) return Math.max(0, Math.floor((now - due) / 86400000))
  const created = inv?.created_at ? new Date(inv.created_at) : null
  if (!created) return 0
  const d30 = new Date(created); d30.setDate(d30.getDate() + 30)
  return Math.max(0, Math.floor((now - d30) / 86400000))
}

function inRange(dateStr, from, to) {
  if (!dateStr) return false
  const t = new Date(dateStr)
  return t >= from && t <= to
}

// Unified expense list — combines manual_expenses + plaid_transactions
// debits (amount > 0 = money out). This is what every "expense" report
// should read; reading manual_expenses alone misses 95% of real spend
// for any tenant who connected a bank account.
export function unifiedExpenses(manualExpenses = [], plaidTransactions = []) {
  const out = []
  for (const e of manualExpenses) {
    out.push({
      source: 'manual',
      id: 'manual-' + e.id,
      date: e.expense_date || e.date || e.created_at,
      amount: Number(e.amount) || 0,
      vendor: e.vendor || e.payee || '',
      category: e.category?.name || 'Uncategorized',
      description: e.description || '',
    })
  }
  for (const t of plaidTransactions) {
    // Plaid convention: positive amount = debit (money out). Skip transfers
    // (they're not real expenses, just moving money between own accounts).
    if (!(Number(t.amount) > 0)) continue
    if (t.is_transfer) continue
    out.push({
      source: 'bank',
      id: 'plaid-' + t.id,
      date: t.date,
      amount: Number(t.amount) || 0,
      vendor: t.merchant_name || t.name || '',
      category: t.user_category || t.ai_category || 'Uncategorized',
      description: t.merchant_name || t.name || '',
    })
  }
  return out
}

// ───────────────────────── reports ─────────────────────────

// 1. Profit & Loss (summary). Revenue minus expenses for the window.
export function profitAndLoss({ invoices = [], payments = [], manualExpenses = [], plaidTransactions = [], from, to } = {}) {
  const fromD = from instanceof Date ? from : new Date(from)
  const toD = to instanceof Date ? to : new Date(to)
  const expenses = unifiedExpenses(manualExpenses, plaidTransactions).filter(e => inRange(e.date, fromD, toD))
  // Revenue = payments received in window. (Cash basis.)
  const revenue = (payments || [])
    .filter(p => inRange(p.date, fromD, toD))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)
  const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0)
  // Expense breakdown by category for the body of the report.
  const byCat = new Map()
  for (const e of expenses) {
    byCat.set(e.category, (byCat.get(e.category) || 0) + e.amount)
  }
  const expenseRows = [...byCat.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([category, amount]) => ({ category, amount }))
  return {
    id: 'pl',
    name: 'Profit & Loss',
    description: 'Cash-basis revenue and expenses for the period.',
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'amount', label: 'Amount', align: 'right', format: 'currency' },
    ],
    rows: expenseRows,
    totals: { category: 'Total Expenses', amount: totalExpenses },
    summary: {
      revenue,
      expenses: totalExpenses,
      netIncome: revenue - totalExpenses,
      expenseCount: expenses.length,
    },
    period: { from: fromD, to: toD },
  }
}

// 2. AR Aging — open invoices grouped by overdue bucket.
export function arAging({ invoices = [], payments = [], now = new Date() } = {}) {
  const paymentsByInv = paymentsByInvoiceIndex(payments)
  const open = (invoices || [])
    .filter(isInvoiceOpen)
    .filter(inv => invoiceBalance(inv, paymentsByInv) > 0)
  const rows = open.map(inv => {
    const days = daysOverdue(inv, now)
    let bucket = 'Current'
    if (days > 90) bucket = '90+'
    else if (days > 60) bucket = '61-90'
    else if (days > 30) bucket = '31-60'
    else if (days > 0) bucket = '1-30'
    return {
      invoice: inv.invoice_id || ('#' + inv.id),
      customer: inv.customer?.name || inv.customer_name || '',
      due_date: inv.due_date || (inv.created_at && new Date(new Date(inv.created_at).getTime() + 30 * 86400000).toISOString().slice(0, 10)),
      bucket,
      days_overdue: days,
      balance: invoiceBalance(inv, paymentsByInv),
    }
  }).sort((a, b) => b.days_overdue - a.days_overdue)
  const buckets = { Current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 }
  for (const r of rows) buckets[r.bucket] += r.balance
  const total = rows.reduce((s, r) => s + r.balance, 0)
  return {
    id: 'ar-aging',
    name: 'Accounts Receivable Aging',
    description: 'Open invoices grouped by how far past due they are.',
    columns: [
      { key: 'invoice', label: 'Invoice' },
      { key: 'customer', label: 'Customer' },
      { key: 'due_date', label: 'Due', format: 'date' },
      { key: 'bucket', label: 'Bucket' },
      { key: 'days_overdue', label: 'Days', align: 'right', format: 'number' },
      { key: 'balance', label: 'Balance', align: 'right', format: 'currency' },
    ],
    rows,
    totals: { invoice: 'Total', balance: total },
    summary: { ...buckets, total },
    period: { from: null, to: now },
  }
}

// 3. Sales by Customer — paid revenue per customer in the window.
export function salesByCustomer({ payments = [], customers = [], from, to } = {}) {
  const fromD = from instanceof Date ? from : new Date(from)
  const toD = to instanceof Date ? to : new Date(to)
  const custName = new Map((customers || []).map(c => [c.id, c.name]))
  const totals = new Map()
  const counts = new Map()
  for (const p of payments || []) {
    if (!inRange(p.date, fromD, toD)) continue
    const id = p.customer_id || '(unknown)'
    totals.set(id, (totals.get(id) || 0) + (Number(p.amount) || 0))
    counts.set(id, (counts.get(id) || 0) + 1)
  }
  const rows = [...totals.entries()]
    .map(([customer_id, amount]) => ({
      customer: custName.get(customer_id) || (customer_id === '(unknown)' ? '(no customer linked)' : 'Customer #' + customer_id),
      payments: counts.get(customer_id),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)
  return {
    id: 'sales-by-customer',
    name: 'Sales by Customer',
    description: 'Revenue received per customer for the period (cash basis).',
    columns: [
      { key: 'customer', label: 'Customer' },
      { key: 'payments', label: 'Payments', align: 'right', format: 'number' },
      { key: 'amount', label: 'Revenue', align: 'right', format: 'currency' },
    ],
    rows,
    totals: { customer: 'Total', amount: rows.reduce((s, r) => s + r.amount, 0) },
    summary: { customerCount: rows.length, total: rows.reduce((s, r) => s + r.amount, 0) },
    period: { from: fromD, to: toD },
  }
}

// 4. Sales by Salesperson — revenue attributed to each rep via the job link.
export function salesBySalesperson({ payments = [], jobs = [], employees = [], from, to } = {}) {
  const fromD = from instanceof Date ? from : new Date(from)
  const toD = to instanceof Date ? to : new Date(to)
  const jobToSales = new Map((jobs || []).map(j => [j.id, j.salesperson_id || j.salesperson]))
  const empName = new Map((employees || []).map(e => [e.id, e.name]))
  const totals = new Map()
  const counts = new Map()
  for (const p of payments || []) {
    if (!inRange(p.date, fromD, toD)) continue
    const salesId = jobToSales.get(p.job_id)
    const key = salesId || '(unassigned)'
    totals.set(key, (totals.get(key) || 0) + (Number(p.amount) || 0))
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  const rows = [...totals.entries()]
    .map(([id, amount]) => ({
      salesperson: empName.get(id) || (id === '(unassigned)' ? '(no salesperson)' : 'Employee #' + id),
      payments: counts.get(id),
      amount,
    }))
    .sort((a, b) => b.amount - a.amount)
  return {
    id: 'sales-by-salesperson',
    name: 'Sales by Salesperson',
    description: 'Revenue attributed to each salesperson via the job they sold.',
    columns: [
      { key: 'salesperson', label: 'Salesperson' },
      { key: 'payments', label: 'Payments', align: 'right', format: 'number' },
      { key: 'amount', label: 'Revenue', align: 'right', format: 'currency' },
    ],
    rows,
    totals: { salesperson: 'Total', amount: rows.reduce((s, r) => s + r.amount, 0) },
    summary: { repCount: rows.length, total: rows.reduce((s, r) => s + r.amount, 0) },
    period: { from: fromD, to: toD },
  }
}

// 5. Expense by Category — across both manual + bank.
export function expenseByCategory({ manualExpenses = [], plaidTransactions = [], from, to } = {}) {
  const fromD = from instanceof Date ? from : new Date(from)
  const toD = to instanceof Date ? to : new Date(to)
  const expenses = unifiedExpenses(manualExpenses, plaidTransactions).filter(e => inRange(e.date, fromD, toD))
  const byCat = new Map()
  for (const e of expenses) {
    const entry = byCat.get(e.category) || { count: 0, amount: 0 }
    entry.count++
    entry.amount += e.amount
    byCat.set(e.category, entry)
  }
  const rows = [...byCat.entries()]
    .map(([category, d]) => ({ category, count: d.count, amount: d.amount }))
    .sort((a, b) => b.amount - a.amount)
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return {
    id: 'expense-by-category',
    name: 'Expenses by Category',
    description: 'Spend per category for the period, combining bank debits and manually entered expenses.',
    columns: [
      { key: 'category', label: 'Category' },
      { key: 'count', label: 'Count', align: 'right', format: 'number' },
      { key: 'amount', label: 'Amount', align: 'right', format: 'currency' },
    ],
    rows,
    totals: { category: 'Total', amount: total },
    summary: { categoryCount: rows.length, total },
    period: { from: fromD, to: toD },
  }
}

// 6. Expense by Vendor — top vendors by spend.
export function expenseByVendor({ manualExpenses = [], plaidTransactions = [], from, to, limit = 50 } = {}) {
  const fromD = from instanceof Date ? from : new Date(from)
  const toD = to instanceof Date ? to : new Date(to)
  const expenses = unifiedExpenses(manualExpenses, plaidTransactions).filter(e => inRange(e.date, fromD, toD))
  const byVendor = new Map()
  for (const e of expenses) {
    const vendor = e.vendor || '(unspecified)'
    const entry = byVendor.get(vendor) || { count: 0, amount: 0 }
    entry.count++
    entry.amount += e.amount
    byVendor.set(vendor, entry)
  }
  const rows = [...byVendor.entries()]
    .map(([vendor, d]) => ({ vendor, count: d.count, amount: d.amount }))
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit)
  const total = rows.reduce((s, r) => s + r.amount, 0)
  return {
    id: 'expense-by-vendor',
    name: 'Expenses by Vendor',
    description: 'Top vendors by total spend in the period.',
    columns: [
      { key: 'vendor', label: 'Vendor' },
      { key: 'count', label: 'Transactions', align: 'right', format: 'number' },
      { key: 'amount', label: 'Total', align: 'right', format: 'currency' },
    ],
    rows,
    totals: { vendor: 'Top ' + rows.length, amount: total },
    summary: { total },
    period: { from: fromD, to: toD },
  }
}

// 7. Job costing — actual profit per job. Revenue from payments tagged to
// the job, cost from job_lines (materials + labor) plus expenses tagged
// to the job (bank debits with job_id or manual_expenses with job_id).
// Jobs without cost data show "—" in the cost columns instead of $0 so
// the user can tell "no data captured" from "actually $0."
//
// Cost walking: most JobScout lines reference BUNDLE products
// (type "Electrical Services (Bundles)") whose own `cost` field is $0
// because the real cost lives in their components — the fixture
// (material) + lift / control accessories (labor). We walk
// product_components to sum the classified component costs and split
// into material vs labor using each component's material_or_labor flag.
// Lines whose product is a leaf (no components) fall back to
// products_services.cost × quantity directly. labor_cost on the line
// row is added on top if recorded.
export function jobCosting({
  jobs = [], jobLines = [], payments = [],
  products = [], productComponents = [],
  plaidTransactions = [], manualExpenses = [],
  from, to,
} = {}) {
  const fromD = from instanceof Date ? from : new Date(from)
  const toD = to instanceof Date ? to : new Date(to)

  // Index payments by job_id (job → total paid for the period).
  const paymentsByJob = new Map()
  for (const p of payments || []) {
    if (!p.job_id) continue
    if (from && !inRange(p.date, fromD, toD)) continue
    paymentsByJob.set(p.job_id, (paymentsByJob.get(p.job_id) || 0) + (Number(p.amount) || 0))
  }

  // Index lines by job_id.
  const linesByJob = new Map()
  for (const l of jobLines || []) {
    if (!l.job_id) continue
    const arr = linesByJob.get(l.job_id) || []
    arr.push(l)
    linesByJob.set(l.job_id, arr)
  }

  // Build product index + component-walker for bundle cost resolution.
  const productMap = new Map((products || []).map(p => [p.id, p]))
  const componentsByParent = new Map()
  for (const c of productComponents || []) {
    const arr = componentsByParent.get(c.parent_product_id) || []
    arr.push(c)
    componentsByParent.set(c.parent_product_id, arr)
  }

  // Recursively classify a product into { materialCost, laborCost }.
  // Mirrors the logic in src/lib/materialLaborSplit.js but returns the
  // raw material + labor cost split so we can credit each to the right
  // column in the job costing report. Leaf product → its own cost goes
  // to material or labor based on material_or_labor flag. Bundle → walk
  // children and sum.
  const classifyProduct = (productId) => {
    const result = { materialCost: 0, laborCost: 0, unclassified: false }
    if (!productId) { result.unclassified = true; return result }
    const product = productMap.get(productId)
    const children = componentsByParent.get(productId) || []
    if (children.length === 0) {
      if (!product) { result.unclassified = true; return result }
      const cost = Number(product.cost) || 0
      if (product.material_or_labor === 'material') result.materialCost = cost
      else if (product.material_or_labor === 'labor') result.laborCost = cost
      else {
        // No classification → treat as material (most fixtures default
        // here when not yet flagged). The number is still right; only
        // the material/labor column attribution is "best guess."
        result.materialCost = cost
      }
      return result
    }
    for (const c of children) {
      const subId = c.component_product_id
      const sub = productMap.get(subId)
      const subQty = Number(c.quantity) || 1
      if (!sub) { result.unclassified = true; continue }
      const subCost = (Number(sub.cost) || 0) * subQty
      if (sub.material_or_labor === 'material') {
        result.materialCost += subCost
      } else if (sub.material_or_labor === 'labor') {
        result.laborCost += subCost
      } else {
        // Recurse one level — sub-bundle.
        const sub2 = classifyProduct(subId)
        result.materialCost += sub2.materialCost * subQty
        result.laborCost += sub2.laborCost * subQty
      }
    }
    return result
  }

  // Tagged expenses — Plaid debits + manual entries with job_id.
  const expensesByJob = new Map()
  for (const t of plaidTransactions || []) {
    const amt = Number(t.amount) || 0
    if (amt <= 0) continue
    if (t.is_transfer) continue
    const jid = t.job_id || t.ai_job_id
    if (!jid) continue
    if (from && !inRange(t.date, fromD, toD)) continue
    expensesByJob.set(jid, (expensesByJob.get(jid) || 0) + amt)
  }
  for (const e of manualExpenses || []) {
    if (!e.job_id) continue
    if (from && !inRange(e.expense_date, fromD, toD)) continue
    expensesByJob.set(e.job_id, (expensesByJob.get(e.job_id) || 0) + (Number(e.amount) || 0))
  }

  const rows = []
  for (const j of jobs || []) {
    // Optional filter: only include jobs whose start_date overlaps the window
    // if a date range is set. Without start_date, include the job (we'll show
    // whatever payments + expenses fall in the window).
    if (from && j.start_date) {
      const s = new Date(j.start_date)
      if (s > toD) continue
      if (j.end_date) {
        const e = new Date(j.end_date)
        if (e < fromD) continue
      }
    }

    const revenue = paymentsByJob.get(j.id) || 0
    const lines = linesByJob.get(j.id) || []
    let materialCost = 0
    let laborCost = 0
    for (const l of lines) {
      const qty = Number(l.quantity) || 1
      // Walk the line's product (including bundle components) to get a
      // real material + labor split. This is what makes job costing
      // work on bundle-heavy projects like Energy Scout — the parent
      // bundle's own `cost` field is $0 but the components carry the
      // real numbers.
      const split = classifyProduct(l.item_id)
      materialCost += split.materialCost * qty
      laborCost += split.laborCost * qty
      // Add any labor_cost explicitly recorded on the line on top —
      // those represent supplemental labor (e.g., per-line overtime
      // adjustments) that aren't already accounted for in components.
      laborCost += Number(l.labor_cost) || 0
    }
    const taggedExpense = expensesByJob.get(j.id) || 0
    const hasCostData = materialCost > 0 || laborCost > 0 || taggedExpense > 0
    const totalCost = materialCost + laborCost + taggedExpense
    const profit = revenue - totalCost
    const margin = revenue > 0 ? profit / revenue : 0
    // Skip jobs with no revenue AND no cost — uninteresting empty rows.
    if (revenue === 0 && !hasCostData) continue

    // Prepaid revenue (annual checkup paid upfront on the parent's
    // invoice) counts as revenue for this job's costing without a
    // separate payment record. Recurring services that bill per-visit
    // leave prepaid_revenue null and rely on the payments tag.
    const effectiveRevenue = revenue + (Number(j.prepaid_revenue) || 0)

    rows.push({
      job: j.job_id || ('#' + j.id),
      title: j.job_title || j.customer_name || '',
      status: j.status || '',
      service_kind: j.service_kind || (j.parent_job_id ? 'service' : null),
      parent_job_id: j.parent_job_id || null,
      _jobDbId: j.id,
      revenue: effectiveRevenue,
      material: hasCostData ? materialCost : null,
      labor: hasCostData ? laborCost : null,
      tagged_expense: hasCostData ? taggedExpense : null,
      total_cost: hasCostData ? totalCost : null,
      profit: hasCostData ? effectiveRevenue - totalCost : null,
      margin: hasCostData && effectiveRevenue > 0 ? (effectiveRevenue - totalCost) / effectiveRevenue : null,
    })
  }

  // Roll up children under their parents — service visits show indented
  // under the original install so users see the full lifecycle of the
  // customer relationship at a glance. Standalone jobs (no parent) stay
  // sorted by profit. Each parent's profit is the sum of its own row +
  // any children's profits, exposed as parent_with_children_profit so
  // the totals row reflects rollup totals.
  const rowsByDbId = new Map(rows.map(r => [r._jobDbId, r]))
  const orphanRoots = rows.filter(r => !r.parent_job_id || !rowsByDbId.has(r.parent_job_id))
  const childrenByParent = new Map()
  for (const r of rows) {
    if (r.parent_job_id && rowsByDbId.has(r.parent_job_id)) {
      const arr = childrenByParent.get(r.parent_job_id) || []
      arr.push(r)
      childrenByParent.set(r.parent_job_id, arr)
    }
  }
  const ordered = []
  for (const root of orphanRoots.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity))) {
    ordered.push(root)
    const kids = childrenByParent.get(root._jobDbId) || []
    for (const kid of kids.sort((a, b) => (b.profit ?? -Infinity) - (a.profit ?? -Infinity))) {
      // Visual indent on the job + title so it reads as "under" the parent.
      ordered.push({ ...kid, job: '  └ ' + kid.job })
    }
  }
  // Strip internal helper fields before returning rows for display.
  const cleanRows = ordered.map(({ _jobDbId, parent_job_id, ...rest }) => rest) // eslint-disable-line no-unused-vars
  rows.length = 0
  rows.push(...cleanRows)

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0)
  const totalCost = rows.reduce((s, r) => s + (r.total_cost || 0), 0)
  const totalProfit = totalRevenue - totalCost
  const jobsWithCostData = rows.filter(r => r.total_cost != null).length

  return {
    id: 'job-costing',
    name: 'Job Costing — Actual Profit per Job',
    description: 'Revenue (payments + prepaid plan allocation), material + labor cost (from job lines), and any bank debits tagged to the job. Service visits (warranty, annual, repair, etc.) roll up under their parent install with an indent. Margin shown only when cost data exists.',
    columns: [
      { key: 'job', label: 'Job' },
      { key: 'title', label: 'Title' },
      { key: 'service_kind', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'revenue', label: 'Revenue', align: 'right', format: 'currency' },
      { key: 'material', label: 'Material', align: 'right', format: 'currency' },
      { key: 'labor', label: 'Labor', align: 'right', format: 'currency' },
      { key: 'tagged_expense', label: 'Other Exp.', align: 'right', format: 'currency' },
      { key: 'total_cost', label: 'Total Cost', align: 'right', format: 'currency' },
      { key: 'profit', label: 'Profit', align: 'right', format: 'currency' },
      { key: 'margin', label: 'Margin', align: 'right', format: 'percent' },
    ],
    rows,
    totals: {
      job: 'Total',
      revenue: totalRevenue,
      material: rows.reduce((s, r) => s + (r.material || 0), 0),
      labor: rows.reduce((s, r) => s + (r.labor || 0), 0),
      tagged_expense: rows.reduce((s, r) => s + (r.tagged_expense || 0), 0),
      total_cost: totalCost,
      profit: totalProfit,
      margin: totalRevenue > 0 ? totalProfit / totalRevenue : 0,
    },
    summary: {
      jobs: rows.length,
      jobsWithCostData,
      totalRevenue,
      totalProfit,
    },
    period: { from: fromD, to: toD },
  }
}

// 8. Monthly trend — revenue, expenses, net month-over-month.
export function monthlyTrend({ payments = [], manualExpenses = [], plaidTransactions = [], from, to } = {}) {
  const fromD = from instanceof Date ? from : new Date(from)
  const toD = to instanceof Date ? to : new Date(to)
  const monthKey = (d) => {
    const x = new Date(d)
    return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`
  }
  const byMonth = new Map()
  const ensure = (k) => {
    if (!byMonth.has(k)) byMonth.set(k, { month: k, revenue: 0, expenses: 0 })
    return byMonth.get(k)
  }
  for (const p of payments || []) {
    if (!inRange(p.date, fromD, toD)) continue
    ensure(monthKey(p.date)).revenue += Number(p.amount) || 0
  }
  for (const e of unifiedExpenses(manualExpenses, plaidTransactions)) {
    if (!inRange(e.date, fromD, toD)) continue
    ensure(monthKey(e.date)).expenses += e.amount
  }
  const rows = [...byMonth.values()]
    .map(r => ({ ...r, net: r.revenue - r.expenses }))
    .sort((a, b) => a.month.localeCompare(b.month))
  return {
    id: 'monthly-trend',
    name: 'Monthly Trend',
    description: 'Revenue, expenses, and net income broken down by month.',
    columns: [
      { key: 'month', label: 'Month' },
      { key: 'revenue', label: 'Revenue', align: 'right', format: 'currency' },
      { key: 'expenses', label: 'Expenses', align: 'right', format: 'currency' },
      { key: 'net', label: 'Net', align: 'right', format: 'currency' },
    ],
    rows,
    totals: {
      month: 'Total',
      revenue: rows.reduce((s, r) => s + r.revenue, 0),
      expenses: rows.reduce((s, r) => s + r.expenses, 0),
      net: rows.reduce((s, r) => s + r.net, 0),
    },
    summary: {
      months: rows.length,
      avgMonthlyRevenue: rows.length ? rows.reduce((s, r) => s + r.revenue, 0) / rows.length : 0,
      avgMonthlyExpenses: rows.length ? rows.reduce((s, r) => s + r.expenses, 0) / rows.length : 0,
    },
    period: { from: fromD, to: toD },
  }
}

// ─────────────────── helpers used by Books/Frankie ───────────────────

// Catalogue with metadata for rendering buttons / tabs in the UI.
export const STANDARD_REPORTS = [
  { id: 'pl', name: 'Profit & Loss', description: 'Revenue minus expenses for the period.', icon: 'DollarSign', run: profitAndLoss },
  { id: 'job-costing', name: 'Job Costing', description: 'Actual profit per job (revenue − material − labor − tagged expenses).', icon: 'Briefcase', run: jobCosting },
  { id: 'ar-aging', name: 'AR Aging', description: 'Open invoices grouped by how overdue they are.', icon: 'Clock', run: arAging },
  { id: 'sales-by-customer', name: 'Sales by Customer', description: 'Revenue per customer.', icon: 'Users', run: salesByCustomer },
  { id: 'sales-by-salesperson', name: 'Sales by Salesperson', description: 'Revenue attributed to each rep.', icon: 'User', run: salesBySalesperson },
  { id: 'expense-by-category', name: 'Expenses by Category', description: 'Spend per category.', icon: 'PieChart', run: expenseByCategory },
  { id: 'expense-by-vendor', name: 'Expenses by Vendor', description: 'Top vendors by spend.', icon: 'Building', run: expenseByVendor },
  { id: 'monthly-trend', name: 'Monthly Trend', description: 'Revenue, expenses, net by month.', icon: 'TrendingUp', run: monthlyTrend },
]

// Format a single cell value for display.
export function formatReportCell(value, format) {
  if (value == null || value === '') return ''
  if (format === 'currency') {
    const n = Number(value) || 0
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
  }
  if (format === 'percent') {
    const n = Number(value) || 0
    return (n * 100).toFixed(1) + '%'
  }
  if (format === 'date') {
    if (!value) return ''
    try { return new Date(value).toLocaleDateString() } catch { return String(value) }
  }
  if (format === 'number') {
    return new Intl.NumberFormat('en-US').format(Number(value) || 0)
  }
  return String(value)
}

// Convert a report to a CSV string (header row + data rows + totals row).
export function reportToCsv(report) {
  if (!report) return ''
  const cols = report.columns || []
  const headers = cols.map(c => c.label)
  const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const lines = [headers.map(cell).join(',')]
  for (const row of report.rows || []) {
    lines.push(cols.map(c => cell(row[c.key])).join(','))
  }
  if (report.totals) {
    lines.push(cols.map(c => cell(report.totals[c.key] ?? '')).join(','))
  }
  return lines.join('\n')
}

// Trigger a CSV download in the browser.
export function downloadReportCsv(report) {
  const csv = reportToCsv(report)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${report.id}-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

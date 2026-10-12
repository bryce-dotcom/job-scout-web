// The big picture Frankie never had.
//
// Bryce, 2026-10-11: "why is he not reading ALL of energy scout all the data
// so he can see the big picture and give REAL CFO information?" His snapshot
// was built around the twenty questions the team had asked — cash, tax,
// bookkeeping — so he had a P&L and AR and nothing else: no balance sheet,
// no backlog, no pipeline, no payables, no debt, no fleet, no inventory.
//
// These sections are pure and Node-importable (explicit .js imports) like
// the rest of his context, and they use the app's own arithmetic: AR from
// lib/arHelpers, sold from lib/soldTotals, delivered from lib/jobMetrics.
// Same numbers as the pages, so the owner and Frankie read the same book.
import { totalCustomerAR, totalUtilityAR, invoiceCustomerTotal, invoiceBalance, isInvoiceOpen, paymentsByInvoiceIndex } from '../../../lib/arHelpers.js'
import { soldJobsInRange, soldValue, NOT_SOLD_STATUSES } from '../../../lib/soldTotals.js'
import { getDeliveredStatusIds } from '../../../lib/jobMetrics.js'

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0 }
const money = (n) => `$${(Math.round(num(n) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const day = (d) => (d ? String(d).slice(0, 10) : '')
const sum = (rows, f) => (rows || []).reduce((s, r) => s + num(f(r)), 0)
const daysBetween = (a, b) => Math.floor((a - b) / 86400000)

// Statuses are stored however the page that wrote them spelled them (HHH's
// POs are lowercase 'draft'/'sent'); compare case-insensitively.
const lower = (v) => String(v || '').toLowerCase()
const CLOSED_PO = new Set(['closed', 'received', 'cancelled', 'canceled', 'void'])
const OPEN_PO_STATUS = (st) => !CLOSED_PO.has(lower(st))
const OPEN_BILL = (b) => !['paid', 'void', 'cancelled', 'canceled'].includes(lower(b?.status)) && num(b?.balance_due ?? b?.amount) > 0

/**
 * Assets and obligations as of now. Cash and cards from the bank feed, AR
 * from the invoice ledger, incentives from the utility ledger, debt from
 * Liabilities, payables from Bills and open POs, payroll tax not yet
 * remitted, crew bonuses accrued, fixed assets at current value.
 */
export function balanceSheetSection({
  connectedAccounts = [], invoices = [], payments = [], utilityInvoices = [],
  liabilities = [], bills = [], purchaseOrders = [], payrollTaxLiabilities = [], jobBonuses = [],
  assets = [], fleet = [], inventory = [], products = [], now = new Date(),
} = {}) {
  const accts = (connectedAccounts || []).filter(a => a && a.status !== 'disconnected')
  const depository = accts.filter(a => (a.account_type || a.type || '').toLowerCase() !== 'credit')
  const cards = accts.filter(a => (a.account_type || a.type || '').toLowerCase() === 'credit')
  const cash = sum(depository, a => a.available_balance ?? a.current_balance)
  const cardOwed = sum(cards, a => a.current_balance)
  const idx = paymentsByInvoiceIndex(payments || [])
  const ar = totalCustomerAR(invoices, idx)
  const utilityAR = totalUtilityAR(utilityInvoices, invoices)
  const costById = new Map((products || []).map(p => [p.id, num(p.cost)]))
  const inventoryItems = (inventory || []).filter(i => num(i.quantity) > 0)
  const inventoryValue = sum(inventoryItems, i => num(i.quantity) * (costById.get(i.product_id) || 0))
  const fixedAssets = sum((assets || []).filter(a => a.status !== 'disposed' && a.status !== 'sold'), a => a.current_value ?? a.purchase_price)
  const fleetNoAsset = (fleet || []).filter(f => !f.asset_id && f.status !== 'disposed' && f.status !== 'sold')
  const fleetValue = sum(fleetNoAsset, f => f.purchase_price)

  const debts = (liabilities || []).filter(l => l && !['paid_off', 'closed', 'paid off'].includes(lower(l.status)))
  const debt = sum(debts, l => l.current_balance)
  const debtService = sum(debts, l => l.monthly_payment)
  const openBills = (bills || []).filter(OPEN_BILL)
  const ap = sum(openBills, b => b.balance_due ?? b.amount)
  const apOverdue = sum(openBills.filter(b => b.due_date && new Date(b.due_date) < now), b => b.balance_due ?? b.amount)
  const openPOs = (purchaseOrders || []).filter(p => OPEN_PO_STATUS(p.status))
  const poCommitted = sum(openPOs, p => p.total)
  const taxDue = (payrollTaxLiabilities || []).filter(t => !t.paid_at)
  const taxOwed = sum(taxDue, t => t.amount_total)
  const nextTax = taxDue.filter(t => t.due_date).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))[0]
  const bonusesAccrued = sum((jobBonuses || []).filter(b => b.status === 'accrued'), b => b.amount)

  const currentAssets = cash + ar + utilityAR + inventoryValue
  const obligations = cardOwed + debt + ap + poCommitted + taxOwed + bonusesAccrued

  let s = `### Balance Sheet (as of ${day(now.toISOString())}; the app's own ledgers, not a bank statement)\n`
  s += `Assets:\n`
  s += `- Cash in bank: ${money(cash)}${depository.length ? ` across ${depository.length} account${depository.length === 1 ? '' : 's'}` : ' (no bank connected)'}\n`
  s += `- Customer receivables (open invoices): ${money(ar)}\n`
  s += `- Utility incentives receivable (filed, not yet paid by the utility): ${money(utilityAR)}\n`
  s += `- Inventory on hand at cost: ${money(inventoryValue)} (${inventoryItems.length} stocked item${inventoryItems.length === 1 ? '' : 's'}${inventoryValue === 0 && inventoryItems.length ? '; no cost on the products, so valued at $0' : ''})\n`
  s += `- Fixed assets at current value: ${money(fixedAssets + fleetValue)} (${(assets || []).length} asset record${(assets || []).length === 1 ? '' : 's'}${fleetNoAsset.length ? ` + ${fleetNoAsset.length} fleet unit${fleetNoAsset.length === 1 ? '' : 's'} at purchase price` : ''})\n`
  s += `- Current assets (cash + receivables + inventory): ${money(currentAssets)}\n`
  s += `Obligations:\n`
  s += `- Credit cards owed: ${money(cardOwed)}\n`
  s += `- Loans and other debt: ${money(debt)}${debts.length ? ` on ${debts.length} liabilit${debts.length === 1 ? 'y' : 'ies'}; monthly debt service ${money(debtService)}` : ' (nothing recorded under Liabilities)'}\n`
  for (const l of debts.slice(0, 8)) s += `  - ${l.name || l.lender || l.liability_type}: ${money(l.current_balance)} owed${l.monthly_payment ? `, ${money(l.monthly_payment)}/mo` : ''}${l.interest_rate ? `, ${l.interest_rate}%` : ''}${l.next_payment_due ? `, next ${day(l.next_payment_due)}` : ''}\n`
  s += `- Vendor bills open (accounts payable): ${money(ap)}${openBills.length ? ` on ${openBills.length} bill${openBills.length === 1 ? '' : 's'}, ${money(apOverdue)} past due` : ''}\n`
  s += `- Purchase orders open (committed, not yet billed): ${money(poCommitted)} on ${openPOs.length} PO${openPOs.length === 1 ? '' : 's'}\n`
  s += `- Payroll taxes not yet remitted: ${money(taxOwed)}${nextTax ? ` (next due ${day(nextTax.due_date)}: ${money(nextTax.amount_total)} to ${nextTax.agency || nextTax.jurisdiction})` : ''}\n`
  s += `- Crew bonuses accrued, unpaid: ${money(bonusesAccrued)}\n`
  s += `- Net position (current assets minus every obligation above): ${money(currentAssets - obligations)}\n`
  s += `- Working capital (current assets minus cards, bills and payroll tax): ${money(currentAssets - cardOwed - ap - taxOwed)}\n\n`
  return s
}

/**
 * Sold → delivered → invoiced → collected, for the jobs created this calendar
 * year and all time. The dollars at each step and the two gaps that matter:
 * delivered work never invoiced, and invoiced work not collected.
 */
export function backlogSection({ jobs = [], jobStatuses = [], invoices = [], payments = [], now = new Date() } = {}) {
  if (!jobs.length) return ''
  const delivered = getDeliveredStatusIds(jobStatuses)
  const idx = paymentsByInvoiceIndex(payments || [])
  const invByJob = new Map()
  for (const i of invoices || []) {
    if (!i.job_id || i.payment_status === 'Void' || i.payment_status === 'Cancelled') continue
    invByJob.set(i.job_id, [...(invByJob.get(i.job_id) || []), i])
  }
  const paidByJobDirect = new Map()
  for (const p of payments || []) {
    if (p.invoice_id || !p.job_id) continue
    paidByJobDirect.set(p.job_id, (paidByJobDirect.get(p.job_id) || 0) + num(p.amount))
  }
  const invoicedOn = (j) => sum(invByJob.get(j.id) || [], invoiceCustomerTotal)
  const collectedOn = (j) => sum(invByJob.get(j.id) || [], i => invoiceCustomerTotal(i) - invoiceBalance(i, idx)) + (paidByJobDirect.get(j.id) || 0)
  const owedOn = (j) => sum((invByJob.get(j.id) || []).filter(isInvoiceOpen), i => invoiceBalance(i, idx))

  const stage = (j) => {
    if (NOT_SOLD_STATUSES.has(j.status)) return 'cancelled'
    if (delivered.has(j.status)) return 'delivered'
    if (/in progress|post inspection|chillin|on hold|waiting|need to order|pre inspection/i.test(j.status || '')) return 'in progress'
    return 'not started'
  }

  const window = (label, start) => {
    const rows = soldJobsInRange(jobs, { start, end: null })
    const sold = sum(rows, soldValue)
    const done = rows.filter(j => stage(j) === 'delivered')
    const wip = rows.filter(j => stage(j) === 'in progress')
    const queued = rows.filter(j => stage(j) === 'not started')
    const invoiced = sum(rows, invoicedOn)
    const collected = sum(rows, collectedOn)
    const owed = sum(rows, owedOn)
    const doneNotInvoiced = done.filter(j => invoicedOn(j) === 0 && soldValue(j) > 0)
    let s = `${label}:\n`
    s += `- Sold: ${money(sold)} on ${rows.length} jobs → delivered ${money(sum(done, soldValue))} (${done.length} jobs) → invoiced ${money(invoiced)} → collected ${money(collected)}; still owed on those invoices ${money(owed)}\n`
    s += `- Not started: ${money(sum(queued, soldValue))} (${queued.length} jobs); in progress: ${money(sum(wip, soldValue))} (${wip.length} jobs)\n`
    s += `- Delivered but never invoiced in JobScout: ${money(sum(doneNotInvoiced, soldValue))} on ${doneNotInvoiced.length} job${doneNotInvoiced.length === 1 ? '' : 's'}\n`
    const top = [...doneNotInvoiced].sort((a, b) => soldValue(b) - soldValue(a)).slice(0, 8)
    if (top.length) s += `  - Largest: ${top.map(j => `${j.job_title || j.job_id || '#' + j.id} ${money(soldValue(j))} (${j.status}, ${day(j.created_at)})`).join('; ')}\n`
    const gap = sold - collected
    s += `- Gap between sold and collected: ${money(gap)}${sold > 0 ? ` (${Math.round(collected / sold * 100)}% of sold has been collected)` : ''}\n`
    return s
  }

  let s = `### Backlog — sold to delivered to invoiced to collected (the Dashboard's Sales Won and Delivered tiles, carried through to cash; a job's sold value is its job_total, invoiced is the invoices on the job, collected is the payments on those invoices or the job)\n`
  s += window(`This calendar year (jobs created since ${day(new Date(now.getFullYear(), 0, 1).toISOString())})`, new Date(now.getFullYear(), 0, 1))
  s += window('All time', null)
  s += `- A big "delivered but never invoiced" number means either the invoicing happened outside JobScout or the work was billed under a different job; a big "still owed" number is a collections problem. Say which one you see.\n\n`
  return s
}

/** Estimates by status, win rate, stale estimates, leads, lead deposits. */
export function pipelineSection({ quotes = [], leads = [], leadPayments = [], now = new Date() } = {}) {
  if (!quotes.length && !leads.length) return ''
  const amt = (q) => num(q.quote_amount) || num(q.calculated_quote_amount)
  const y0 = new Date(now.getFullYear(), 0, 1)
  const d30 = new Date(now.getTime() - 30 * 86400000)
  const ytd = (quotes || []).filter(q => q.created_at && new Date(q.created_at) >= y0)
  const byStatus = {}
  for (const q of ytd) { const k = q.status || 'no status'; byStatus[k] = byStatus[k] || { n: 0, v: 0 }; byStatus[k].n++; byStatus[k].v += amt(q) }
  const approved = byStatus.Approved || { n: 0, v: 0 }
  const rejected = byStatus.Rejected || { n: 0, v: 0 }
  const decided = approved.n + rejected.n
  const open = (quotes || []).filter(q => ['Sent', 'Negotiation'].includes(q.status))
  const stale = open.filter(q => amt(q) >= 5000 && q.created_at && daysBetween(now, new Date(q.created_at)) >= 7).sort((a, b) => amt(b) - amt(a))
  const leadsBy = {}
  for (const l of leads || []) { const k = l.status || 'no status'; leadsBy[k] = (leadsBy[k] || 0) + 1 }
  const newLeads30 = (leads || []).filter(l => (l.created_at || l.created_date) && new Date(l.created_at || l.created_date) >= d30).length
  const deposits = (leadPayments || []).filter(p => (p.date_created || p.created_at) && new Date(p.date_created || p.created_at) >= y0)

  let s = `### Pipeline — estimates and leads (the Estimates page and the Dashboard's Win Rate and Stale Estimates)\n`
  s += `- Estimates this calendar year: ${Object.entries(byStatus).sort((a, b) => b[1].v - a[1].v).map(([k, x]) => `${k} ${x.n} (${money(x.v)})`).join(', ') || 'none'}\n`
  s += `- Win rate this year, decided estimates only: ${decided ? `${Math.round(approved.n / decided * 100)}% (${approved.n} approved of ${decided} decided; ${money(approved.v)} approved)` : 'no decided estimates yet'}; ${(byStatus.Sent || { n: 0 }).n} still out unanswered\n`
  s += `- Open estimates (Sent or Negotiation, any date): ${open.length} worth ${money(sum(open, amt))}\n`
  s += `- Stale estimates ($5k+, sent 7+ days ago, no answer): ${stale.length} worth ${money(sum(stale, amt))}${stale.length ? `; largest: ${stale.slice(0, 6).map(q => `${q.quote_id || q.estimate_name || '#' + q.id} ${money(amt(q))} (${daysBetween(now, new Date(q.created_at))} days)`).join('; ')}` : ''}\n`
  s += `- Leads: ${(leads || []).length} total; by status: ${Object.entries(leadsBy).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, n]) => `${k} ${n}`).join(', ')}; ${newLeads30} new in the last 30 days\n`
  s += `- Lead and job deposits this year: ${money(sum(deposits, p => p.amount))} on ${deposits.length} deposit${deposits.length === 1 ? '' : 's'}\n\n`
  return s
}

/** Fleet, inventory, crew hours, bonuses — the operating side of the money. */
export function operationsSection({ fleet = [], fleetMaintenance = [], inventory = [], timeLogs = [], employees = [], jobBonuses = [], now = new Date() } = {}) {
  if (!fleet.length && !inventory.length && !timeLogs.length && !jobBonuses.length) return ''
  const y0 = new Date(now.getFullYear(), 0, 1)
  const d30 = new Date(now.getTime() - 30 * 86400000)
  const d365 = new Date(now.getTime() - 365 * 86400000)
  const active = (fleet || []).filter(f => f.status !== 'disposed' && f.status !== 'sold')
  const pmOverdue = active.filter(f => f.next_pm_due && new Date(f.next_pm_due) < now)
  const maint12 = (fleetMaintenance || []).filter(m => m.date && new Date(m.date) >= d365)
  const repairs = sum(active, f => f.repair_cost)
  const low = (inventory || []).filter(i => num(i.min_quantity) > 0 && num(i.quantity) < num(i.min_quantity))
  const rate = new Map((employees || []).map(e => [e.id, num(e.hourly_rate)]))
  const punches30 = (timeLogs || []).filter(t => (t.clock_in || t.date) && new Date(t.clock_in || t.date) >= d30)
  const hours30 = sum(punches30, t => t.total_hours)
  const hoursOnJobs = sum(punches30.filter(t => t.job_id), t => t.total_hours)
  const labor30 = sum(punches30, t => num(t.total_hours) * (rate.get(t.employee_id) || 0))
  const accrued = (jobBonuses || []).filter(b => b.status === 'accrued')
  const paidYtd = (jobBonuses || []).filter(b => b.status === 'paid' && b.paid_at && new Date(b.paid_at) >= y0)

  let s = `### Operations (fleet, inventory, crew hours, bonuses)\n`
  if (fleet.length) s += `- Fleet: ${active.length} unit${active.length === 1 ? '' : 's'}; ${pmOverdue.length} overdue for maintenance${pmOverdue.length ? ` (${pmOverdue.slice(0, 5).map(f => f.name).join(', ')})` : ''}; maintenance logged last 12 months ${money(sum(maint12, m => m.cost))} on ${maint12.length} job${maint12.length === 1 ? '' : 's'}${repairs ? `; open repair cost on units ${money(repairs)}` : ''}\n`
  if (inventory.length) s += `- Inventory: ${(inventory || []).length} item${inventory.length === 1 ? '' : 's'} tracked, ${low.length} below minimum${low.length ? ` (${low.slice(0, 6).map(i => i.name).join(', ')})` : ''}\n`
  if (timeLogs.length) s += `- Crew hours, last 30 days: ${hours30.toFixed(1)} h punched, ${hoursOnJobs.toFixed(1)} h on a job (${hours30 ? Math.round(hoursOnJobs / hours30 * 100) : 0}%)${labor30 ? `; labor at hourly rates ${money(labor30)}` : ''}\n`
  if (jobBonuses.length) s += `- Crew efficiency bonuses: ${money(sum(accrued, b => b.amount))} accrued on ${accrued.length} job${accrued.length === 1 ? '' : 's'}, ${money(sum(paidYtd, b => b.amount))} paid this year\n`
  s += '\n'
  return s
}

/** All four, in the order a CFO reads them. */
export function bigPictureSections(data = {}, now = new Date()) {
  return balanceSheetSection({ ...data, now })
    + backlogSection({ jobs: data.jobs, jobStatuses: data.jobStatuses, invoices: data.invoices, payments: data.payments, now })
    + pipelineSection({ quotes: data.quotes, leads: data.leads, leadPayments: data.leadPayments, now })
    + operationsSection({ fleet: data.fleet, fleetMaintenance: data.fleetMaintenance, inventory: data.inventory, timeLogs: data.timeLogs, employees: data.employees, jobBonuses: data.jobBonuses, now })
}

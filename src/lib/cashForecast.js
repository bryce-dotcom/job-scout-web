// 90-day cash-flow forecast from things the app already knows:
//   in:  open invoices (by due date), utility incentives owed, membership
//        renewals, payment-plan installments
//   out: vendor bills (by due date), payroll (next pay dates × recent run
//        size), payroll tax deposits (by due date), fleet recurring costs,
//        and a baseline of everyday spend from the trailing bank feed
// Nothing here is a promise; each event carries a confidence so the card
// can say "likely" vs "if they pay on time".
import { invoiceBalance, isInvoiceOpen } from './arHelpers'
import { getCurrentPayPeriod } from './bonusCalc'
import { payDateForPeriod, businessDayOnOrBefore } from './payDate'
import { annualByType } from './fleetRecurringCosts'
import { isPayrollBankRow, paidRuns } from './payrollBooks'

const DAY = 86400000
const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100
const key = (d) => {
  const x = d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const parseLocal = (s) => (s ? new Date(String(s).slice(0, 10) + 'T00:00:00') : null)
const maxDate = (a, b) => (a > b ? a : b)

/**
 * @returns {{ events, series, low, opening, closing, daysBelowFloor, baselineDailyBurn, totals }}
 */
export function buildForecast({
  today = new Date(), days = 90, openingCash = 0, cashFloor = 0,
  invoices = [], payments = [], utilityInvoices = [], bills = [], taxLiabilities = [],
  payrollConfig = null, payrollRuns = [], paystubs = [],
  memberships = [], paymentPlans = [], fleetRecurringCosts = [],
  plaidTransactions = [],
} = {}) {
  const start = new Date(key(today) + 'T00:00:00')
  const end = addDays(start, days)
  const inHorizon = (d) => d && d >= start && d <= end
  const events = []
  const push = (date, amount, label, kind, confidence = 'likely', meta = {}) => {
    if (!inHorizon(date) || !(Math.abs(amount) >= 0.005)) return
    events.push({ date: key(date), amount: r2(amount), label, kind, confidence, ...meta })
  }

  // ── money in ──
  const soon = addDays(start, 3)
  for (const inv of invoices || []) {
    if (!isInvoiceOpen(inv)) continue
    if (inv.invoice_type === 'deposit') continue
    const bal = invoiceBalance(inv, payments)
    if (!(bal > 0)) continue
    const due = parseLocal(inv.due_date) || addDays(parseLocal(inv.created_at || inv.invoice_date) || start, 30)
    const overdue = due < start
    // Overdue money is still coming, just not on its due date: give it two weeks.
    const expected = overdue ? addDays(start, 14) : maxDate(due, soon)
    push(expected, bal, `${inv.invoice_id || `Invoice ${inv.id}`}${inv.customer?.name ? ` — ${inv.customer.name}` : ''}`, 'invoice', overdue ? 'overdue' : 'likely', { ref: inv.id })
  }
  for (const u of utilityInvoices || []) {
    if (u.payment_status === 'Paid') continue
    const amt = num(u.incentive_amount) || num(u.amount)
    if (!(amt > 0)) continue
    // Utilities pay in their own time; six weeks from submission is the working assumption.
    const base = parseLocal(u.submitted_at || u.created_at) || start
    push(maxDate(addDays(base, 45), addDays(start, 7)), amt, `${u.utility_name || 'Utility'} incentive${u.customer_name ? ` — ${u.customer_name}` : ''}`, 'incentive', 'estimate', { ref: u.id })
  }
  for (const m of memberships || []) {
    if (!['active', 'trialing', 'past_due'].includes(m.status)) continue
    const amt = num(m.price_cents) / 100
    if (!(amt > 0)) continue
    const step = m.billing_interval === 'year' ? 365 : m.billing_interval === 'quarter' ? 91 : 30
    let next = parseLocal(m.current_period_end) || addDays(start, step)
    for (let i = 0; i < 12 && next <= end; i++) {
      if (next >= start) push(next, amt, `Membership renewal${m.plan_name ? ` — ${m.plan_name}` : ''}`, 'membership', 'likely', { ref: m.id })
      next = addDays(next, step)
    }
  }
  for (const p of paymentPlans || []) {
    if (p.status !== 'active') continue
    const amt = num(p.installment_amount)
    const left = Math.max(0, (parseInt(p.total_installments, 10) || 0) - (parseInt(p.installments_completed, 10) || 0))
    if (!(amt > 0) || left === 0) continue
    const step = p.frequency === 'weekly' ? 7 : p.frequency === 'biweekly' || p.frequency === 'bi-weekly' ? 14 : 30
    let next = parseLocal(p.next_charge_date) || addDays(start, step)
    for (let i = 0; i < left && next <= end; i++) {
      if (next >= start) push(next, amt, 'Payment plan installment', 'plan', p.auto_charge ? 'likely' : 'estimate', { ref: p.id })
      next = addDays(next, step)
    }
  }

  // ── money out ──
  for (const b of bills || []) {
    if (['paid', 'void'].includes(b.status)) continue
    const bal = num(b.balance_due)
    if (!(bal > 0)) continue
    const due = parseLocal(b.due_date) || addDays(parseLocal(b.bill_date) || start, 30)
    push(maxDate(due, start), -bal, `Bill${b.bill_number ? ` ${b.bill_number}` : ''}${b.vendor?.name ? ` — ${b.vendor.name}` : ''}`, 'bill', due < start ? 'overdue' : 'likely', { ref: b.id })
  }
  for (const l of taxLiabilities || []) {
    if (l.paid_at) continue
    const amt = num(l.amount_total) || num(l.amount_employee) + num(l.amount_employer)
    const due = parseLocal(l.due_date)
    if (!(amt > 0) || !due) continue
    push(maxDate(due, start), -amt, `Payroll tax deposit — ${l.agency || l.kind || 'agency'}`, 'tax', due < start ? 'overdue' : 'likely', { ref: l.id })
  }
  // Payroll. A run that has been made (not void, not pending) is real money:
  // it leaves on its pay_date, which can still be ahead when payroll was run
  // early for a weekend payday. Those go in at their actual cost. Beyond
  // them, each upcoming pay date gets an estimate sized from the last runs
  // (a duplicate run would skew every payday — void it on the Books card).
  const stubsByRun = new Map()
  for (const s of paystubs || []) stubsByRun.set(s.payroll_run_id, [...(stubsByRun.get(s.payroll_run_id) || []), s])
  const runCost = (r) => {
    const st = stubsByRun.get(r.id) || []
    const g = st.length ? st.reduce((s, x) => s + num(x.gross_pay), 0) : num(r.total_gross)
    const e = st.reduce((s, x) => s + num(x.social_security_employer) + num(x.medicare_employer) + num(x.futa) + num(x.sui), 0)
    return g + e
  }
  const madeRuns = paidRuns(payrollRuns)
  const seen = new Set()
  for (const r of madeRuns) {
    const raw = parseLocal(r.pay_date)
    if (!raw) continue
    // Stored pay dates can be the calendar payday (a Sunday); the money
    // leaves on the business day before, which is also the date the estimate
    // loop below would pick for that period — mark both so it is not pushed twice.
    const d = businessDayOnOrBefore(raw)
    seen.add(key(raw)); seen.add(key(d))
    if (d < start) continue
    push(d, -runCost(r), `Payroll ${String(r.period_start || '').slice(0, 10)} – ${String(r.period_end || '').slice(0, 10)} (run #${r.id})`, 'payroll', 'likely', { ref: r.id })
  }
  const recentRuns = [...madeRuns].sort((a, b) => String(b.pay_date).localeCompare(String(a.pay_date))).slice(0, 3)
  if (payrollConfig && recentRuns.length > 0) {
    const avgCost = recentRuns.reduce((s, r) => s + runCost(r), 0) / recentRuns.length
    for (let k = 0; k < 8; k++) {
      const period = getCurrentPayPeriod(payrollConfig, k)
      const pay = payDateForPeriod(period.periodEnd, payrollConfig)
      if (!pay || seen.has(pay)) continue
      seen.add(pay)
      const d = parseLocal(pay)
      if (d >= start) push(d, -avgCost, `Payroll (est. from last ${recentRuns.length} run${recentRuns.length === 1 ? '' : 's'})`, 'payroll', 'estimate')
    }
  }
  // Fleet recurring costs (insurance, registration, telematics…) spread daily.
  const fleetAnnual = annualByType(fleetRecurringCosts || [], start).total
  const fleetDaily = fleetAnnual > 0 ? fleetAnnual / 365 : 0

  // Everyday spend: trailing 90 days of bank outflows that are not
  // transfers, payroll, tax deposits, or bill-sized vendor payments.
  const trailingStart = addDays(start, -90)
  const billCents = new Set((bills || []).map(b => Math.round(num(b.amount) * 100)))
  let trailing = 0
  for (const t of plaidTransactions || []) {
    const amt = num(t.amount)
    if (!(amt > 0) || t.is_transfer || t.pending) continue
    const d = parseLocal(t.date)
    if (!d || d < trailingStart || d >= start) continue
    if (isPayrollBankRow(t)) continue
    if (billCents.has(Math.round(amt * 100))) continue
    trailing += amt
  }
  const baselineDailyBurn = r2(trailing / 90)

  // ── series ──
  events.sort((a, b) => a.date.localeCompare(b.date))
  const byDay = new Map()
  for (const e of events) byDay.set(e.date, (byDay.get(e.date) || 0) + e.amount)
  const series = []
  let balance = num(openingCash)
  let low = { date: key(start), balance }
  let daysBelowFloor = 0
  let totalIn = 0, totalOut = 0
  for (let i = 0; i <= days; i++) {
    const d = addDays(start, i)
    const k = key(d)
    const scheduled = byDay.get(k) || 0
    const daily = i === 0 ? 0 : baselineDailyBurn + fleetDaily
    const inflow = Math.max(0, scheduled)
    const outflow = Math.max(0, -scheduled) + daily
    balance = r2(balance + inflow - outflow)
    totalIn += inflow; totalOut += outflow
    if (balance < low.balance) low = { date: k, balance }
    if (balance < num(cashFloor)) daysBelowFloor += 1
    series.push({ date: k, balance, in: r2(inflow), out: r2(outflow) })
  }
  return {
    events, series, low, opening: r2(num(openingCash)), closing: balance, daysBelowFloor, baselineDailyBurn, fleetDaily: r2(fleetDaily),
    totals: { in: r2(totalIn), out: r2(totalOut), scheduledOut: r2(events.filter(e => e.amount < 0).reduce((s, e) => s - e.amount, 0)) },
  }
}

/** Weekly buckets for a compact chart. */
export function weeklyBuckets(series, weeks = 13) {
  const out = []
  for (let w = 0; w < weeks; w++) {
    const slice = series.slice(w * 7, w * 7 + 7)
    if (slice.length === 0) break
    out.push({
      from: slice[0].date, to: slice[slice.length - 1].date,
      in: r2(slice.reduce((s, d) => s + d.in, 0)), out: r2(slice.reduce((s, d) => s + d.out, 0)),
      end: slice[slice.length - 1].balance, min: Math.min(...slice.map(d => d.balance)),
    })
  }
  return out
}

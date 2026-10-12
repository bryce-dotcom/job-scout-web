// Closing the month, the way a CPA would check it.
//
// Pure: given the month's rows, produce the checklist — each check with what
// is open, what it is out of, whether it blocks the close, and the detail a
// person needs to act. The MonthCloseCard loads the data and renders this;
// Frankie's verdicts are what clears most of the blockers.

const num = (v) => parseFloat(v) || 0
const day = (s) => String(s || '').slice(0, 10)
const money = (n) => '$' + Math.abs(num(n)).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')

/** 'YYYY-MM' for the month before `today`. */
export function lastMonthKey(today = new Date()) {
  const d = new Date(today.getFullYear(), today.getMonth() - 1, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
export function monthRange(key) {
  const [y, m] = String(key).split('-').map(Number)
  const from = `${y}-${String(m).padStart(2, '0')}-01`
  const last = new Date(y, m, 0).getDate()
  return { from, to: `${y}-${String(m).padStart(2, '0')}-${String(last).padStart(2, '0')}` }
}
const inMonth = (key) => (d) => day(d).startsWith(key)

/**
 * @param {string} monthKey 'YYYY-MM'
 * @param {object} data
 *   bankRows: plaid_transactions dated in the month (all columns used below)
 *   verdicts: books_verdicts for those rows (status, confidence)
 *   invoices: invoices (payment_status, created_at/invoice_date, due_date, customer total fields)
 *   payments: payments (invoice_id, amount, date, status)
 *   payrollRuns: payroll_runs with pay_date in the month (status)
 *   loans: liabilities (active, monthly_payment / next_payment_amount, payment_day)
 *   loanPayments: loan_payments dated in the month
 *   claims: utility_invoices (payment_status, paid_at, source_transaction_id)
 *   closedThrough: 'YYYY-MM' already closed, or null
 * @returns {{ month, checks: Array, blockers: number, ready: boolean, closed: boolean }}
 */
export function monthClose(monthKey, data = {}) {
  const { bankRows = [], verdicts = [], invoices = [], payments = [], payrollRuns = [], loans = [], loanPayments = [], claims = [], closedThrough = null, today = new Date() } = data
  const rows = bankRows.filter(t => inMonth(monthKey)(t.date) && !t.pending)
  const verdictByTxn = new Map(verdicts.map(v => [v.plaid_transaction_id, v]))
  const checks = []
  const push = (id, label, open, total, { blocking = true, detail = '', items = [], action = null } = {}) => checks.push({ id, label, open, total, blocking: blocking && open > 0, detail, items: items.slice(0, 8), action })

  // 1. Every bank row categorised and confirmed.
  const unconfirmed = rows.filter(t => !t.confirmed)
  const withSure = unconfirmed.filter(t => num(verdictByTxn.get(t.id)?.confidence) >= 0.9 && verdictByTxn.get(t.id)?.status === 'proposed')
  push('bank_confirmed', 'Every bank row confirmed', unconfirmed.length, rows.length, {
    detail: unconfirmed.length ? `${money(unconfirmed.reduce((s, t) => s + Math.abs(num(t.amount)), 0))} across ${unconfirmed.length} row${unconfirmed.length === 1 ? '' : 's'} still unconfirmed${withSure.length ? ` — Frankie is sure about ${withSure.length} of them` : ''}` : 'All confirmed',
    items: unconfirmed.sort((a, b) => Math.abs(num(b.amount)) - Math.abs(num(a.amount))).map(t => `${day(t.date)} · ${money(t.amount)} · ${t.merchant_name || t.name || ''}`),
    action: withSure.length ? 'verdicts' : 'transactions',
  })

  // 2. Every deposit tied to an invoice, a claim, a payout, or a transfer.
  const deposits = rows.filter(t => num(t.amount) < 0 && !t.is_transfer)
  const untied = deposits.filter(t => !t.matched_payment_id && !t.matched_utility_invoice_id && !t.matched_invoice_id && !t.stripe_payout_id && !(t.confirmed && t.user_category))
  push('deposits_matched', 'Every deposit tied to what it is', untied.length, deposits.length, {
    detail: untied.length ? `${money(untied.reduce((s, t) => s + Math.abs(num(t.amount)), 0))} came in that is not tied to an invoice, an incentive claim or a payout` : 'All tied',
    items: untied.sort((a, b) => Math.abs(num(b.amount)) - Math.abs(num(a.amount))).map(t => `${day(t.date)} · ${money(t.amount)} · ${t.merchant_name || t.name || ''}`),
    action: 'verdicts',
  })

  // 3. Paid invoices have a payment row behind them (money, not a button).
  //    Dated by the payment when there is one, else by the invoice itself —
  //    never by updated_at (any edit would move money between months).
  const paidBy = new Map()
  const lastPaid = new Map()
  for (const p of payments) {
    if (['Refunded', 'Voided'].includes(String(p.status || ''))) continue
    paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) || 0) + num(p.amount))
    if (!lastPaid.has(p.invoice_id) || day(p.date) > lastPaid.get(p.invoice_id)) lastPaid.set(p.invoice_id, day(p.date))
  }
  const paidThisMonth = invoices.filter(i => String(i.payment_status) === 'Paid' && inMonth(monthKey)(lastPaid.get(i.id) || i.invoice_date || i.created_at))
  const phantom = paidThisMonth.filter(i => !paidBy.has(i.id))
  push('paid_have_payments', 'Paid invoices have a recorded payment', phantom.length, paidThisMonth.length, {
    blocking: false,
    detail: phantom.length ? `${phantom.length} invoice${phantom.length === 1 ? '' : 's'} marked Paid with no payment recorded — the deposit that paid each one is probably sitting in the bank feed` : 'Every Paid invoice has its payment',
    items: phantom.map(i => `${i.invoice_id || '#' + i.id} · ${i.customer_name || ''} · ${money(num(i.amount) - num(i.discount_applied) + num(i.tax_amount))}`),
    action: 'verdicts',
  })

  // 4. Payroll runs in the month have their bank draw.
  const liveRuns = payrollRuns.filter(r => String(r.status || '').toLowerCase() !== 'void' && inMonth(monthKey)(r.pay_date))
  const payrollRows = rows.filter(t => num(t.amount) > 0 && /payroll|gusto|adp\b|paychex|draft withdrawal/i.test(`${t.merchant_name || ''} ${t.name || ''}`))
  const runsWithoutDraw = liveRuns.filter(r => !payrollRows.some(t => Math.abs(new Date(day(t.date)) - new Date(day(r.pay_date))) <= 4 * 86400000))
  push('payroll_tied', 'Payroll runs show in the bank', runsWithoutDraw.length, liveRuns.length, {
    blocking: false,
    detail: liveRuns.length === 0 ? 'No payroll runs this month' : runsWithoutDraw.length ? `${runsWithoutDraw.length} run${runsWithoutDraw.length === 1 ? '' : 's'} with no payroll draw in the feed within four days of the pay date — paid from an unconnected account, or the run is a duplicate` : 'Every run has its draw',
    items: runsWithoutDraw.map(r => `Run #${r.id} · pay date ${day(r.pay_date)} · ${money(r.total_gross)} gross`),
    action: 'payroll',
  })

  // 5. Loan payments booked.
  const activeLoans = loans.filter(l => String(l.status || 'active') === 'active' && (num(l.monthly_payment) > 0 || num(l.next_payment_amount) > 0))
  const loansUnpaid = activeLoans.filter(l => !loanPayments.some(p => p.liability_id === l.id && inMonth(monthKey)(p.date)))
  push('loans_booked', 'Loan payments booked', loansUnpaid.length, activeLoans.length, {
    blocking: false,
    detail: activeLoans.length === 0 ? 'No loans' : loansUnpaid.length ? `${loansUnpaid.length} loan${loansUnpaid.length === 1 ? '' : 's'} with no payment booked this month` : 'Every loan has its payment',
    items: loansUnpaid.map(l => `${l.name} · ${money(num(l.next_payment_amount) || num(l.monthly_payment))}/mo`),
    action: 'loans',
  })

  // 6. Incentive claims paid in the month tied to a deposit.
  const claimsPaid = claims.filter(c => String(c.payment_status) === 'Paid' && inMonth(monthKey)(c.paid_at))
  const claimsUntied = claimsPaid.filter(c => !c.source_transaction_id)
  push('claims_tied', 'Incentive checks tied to their deposit', claimsUntied.length, claimsPaid.length, {
    blocking: false,
    detail: claimsPaid.length === 0 ? 'No incentives collected this month' : claimsUntied.length ? `${claimsUntied.length} claim${claimsUntied.length === 1 ? '' : 's'} marked paid with no bank deposit tied — ${money(claimsUntied.reduce((s, c) => s + num(c.amount ?? c.incentive_amount), 0))}` : 'All tied',
    items: claimsUntied.map(c => `${c.utility_name || 'Utility'} #${c.id} · ${money(c.amount ?? c.incentive_amount)}`),
    action: 'verdicts',
  })

  // 7. Anomalies: the same payee charged the same amount within three days.
  const dupes = []
  const outs = rows.filter(t => num(t.amount) > 0 && !t.is_transfer).sort((a, b) => day(a.date).localeCompare(day(b.date)))
  for (let i = 0; i < outs.length; i++) for (let j = i + 1; j < outs.length; j++) {
    const a = outs[i], b = outs[j]
    if (Math.abs(num(a.amount) - num(b.amount)) > 0.005) continue
    if ((new Date(day(b.date)) - new Date(day(a.date))) > 3 * 86400000) continue
    const na = String(a.merchant_name || a.name || '').toLowerCase().replace(/\d+/g, '').trim(), nb = String(b.merchant_name || b.name || '').toLowerCase().replace(/\d+/g, '').trim()
    if (na && na === nb && !/payroll|transfer/.test(na)) dupes.push(`${day(a.date)} & ${day(b.date)} · ${money(a.amount)} · ${a.merchant_name || a.name}`)
  }
  push('anomalies', 'No double charges', dupes.length, outs.length, { blocking: false, detail: dupes.length ? `${dupes.length} pair${dupes.length === 1 ? '' : 's'} of same-payee, same-amount charges within three days — a legitimate repeat or a double charge to dispute` : 'None found', items: dupes, action: 'transactions' })

  // 8. Receivables aged past 60 days get a look.
  const todayMs = today.getTime()
  const overdue = invoices.filter(i => !['Paid', 'Void', 'Cancelled'].includes(String(i.payment_status)) && i.due_date && (todayMs - new Date(day(i.due_date)).getTime()) > 60 * 86400000)
  push('ar_aged', 'Receivables over 60 days reviewed', overdue.length, invoices.filter(i => !['Paid', 'Void', 'Cancelled'].includes(String(i.payment_status))).length, {
    blocking: false,
    detail: overdue.length ? `${overdue.length} open invoice${overdue.length === 1 ? '' : 's'} more than 60 days past due — collect, write off, or correct` : 'Nothing past 60 days',
    items: overdue.map(i => `${i.invoice_id || '#' + i.id} · ${i.customer_name || ''} · due ${day(i.due_date)}`),
    action: 'invoices',
  })

  const blockers = checks.filter(c => c.blocking).reduce((s, c) => s + c.open, 0)
  const attention = checks.filter(c => !c.blocking && c.open > 0).length
  return { month: monthKey, checks, blockers, attention, ready: blockers === 0, closed: !!closedThrough && closedThrough >= monthKey }
}

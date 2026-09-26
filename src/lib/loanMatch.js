// Loans in Books.
//
// A loan is a `liabilities` row (hand-entered, or created from a Plaid loan
// account). A payment on it is a `loan_payments` row; one linked to a bank
// transaction is VERIFIED — the money really left. This module is the one
// place that decides which bank rows look like a loan payment, how a payment
// splits into principal and interest, and how a payment posts to the journal.

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100
const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parseDay = (s) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''))
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null
}

export const LOAN_TYPES = [
  { value: 'vehicle', label: 'Vehicle loan' },
  { value: 'equipment', label: 'Equipment loan' },
  { value: 'line_of_credit', label: 'Line of credit' },
  { value: 'sba', label: 'SBA / term loan' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'credit_card', label: 'Credit card' },
  { value: 'other', label: 'Other' },
]

export const isActiveLoan = (l) => !!l && String(l.status || 'active').toLowerCase() === 'active'
export const isLoanTxn = (t) => !!t?.loan_payment_id

// What a scheduled payment is for this loan: the lender's next amount when
// Plaid told us, else the monthly payment typed in.
export function scheduledPayment(loan) {
  return num(loan?.next_payment_amount) || num(loan?.monthly_payment)
}

// The next due date, from the lender (next_payment_due) or the payment day.
export function nextDueDate(loan, today = new Date()) {
  const t = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  // The lender's date wins even when it has passed: a passed date with no
  // payment booked since IS the overdue signal. Booking a payment moves it.
  const due = parseDay(loan?.next_payment_due)
  if (due) return dayKey(due)
  const day = parseInt(loan?.payment_day, 10)
  if (day >= 1 && day <= 31) {
    for (let k = 0; k < 3; k++) {
      const y = t.getFullYear(), m = t.getMonth() + k
      const last = new Date(y, m + 1, 0).getDate()
      const d = new Date(y, m, Math.min(day, last))
      if (d >= t) return dayKey(d)
    }
  }
  return null
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

// Words in the bank descriptor that identify the lender: the payee text the
// owner typed, else the lender's name. Short words ("ford") still count when
// they are the whole token.
export function payeeMatches(loan, txn) {
  const needle = norm(loan?.match_payee || loan?.lender)
  if (!needle || needle.length < 3) return false
  const hay = ` ${norm(`${txn?.merchant_name || ''} ${txn?.name || ''}`)} `
  return hay.includes(` ${needle} `) || (needle.length >= 5 && hay.includes(needle))
}

export function amountMatches(loan, txn) {
  const expected = scheduledPayment(loan)
  if (!(expected > 0)) return false
  const tol = Math.max(1, expected * 0.01)
  return Math.abs(num(txn?.amount) - expected) <= tol
}

/**
 * Bank outflows that look like a payment on one of the loans.
 * Only unbooked, non-transfer, positive (money out) rows inside the window.
 * @returns {Array<{ loan, txn, confidence: 'exact'|'amount'|'payee', reason: string }>}
 */
export function matchLoanPayments({ loans = [], plaidTransactions = [], today = new Date(), windowDays = 120 } = {}) {
  const active = (loans || []).filter(isActiveLoan)
  if (active.length === 0) return []
  const since = new Date(today.getFullYear(), today.getMonth(), today.getDate() - windowDays)
  const out = []
  for (const t of plaidTransactions || []) {
    if (!(num(t.amount) > 0) || t.is_transfer || t.loan_payment_id || t.matched_payment_id || t.stripe_payout_id) continue
    const d = parseDay(t.date)
    if (!d || d < since) continue
    for (const loan of active) {
      const amt = amountMatches(loan, t)
      const payee = payeeMatches(loan, t)
      if (!amt && !payee) continue
      const confidence = amt && payee ? 'exact' : amt ? 'amount' : 'payee'
      const reason = amt && payee
        ? `${loan.lender || loan.name} for the scheduled amount`
        : amt ? `same amount as the ${loan.name} payment` : `descriptor names ${loan.match_payee || loan.lender}`
      out.push({ loan, txn: t, confidence, reason })
    }
  }
  const rank = { exact: 0, amount: 1, payee: 2 }
  return out.sort((a, b) => rank[a.confidence] - rank[b.confidence] || String(b.txn.date).localeCompare(String(a.txn.date)))
}

/**
 * Principal / interest split for one payment. With an APR, the interest is
 * one month on the balance before the payment; without one, it is all
 * principal (the owner can correct it). Bounded so a tiny balance never
 * produces negative principal.
 */
export function splitPayment(loan, amount, balanceBefore = num(loan?.current_balance)) {
  const amt = num(amount)
  const rate = num(loan?.interest_rate)
  if (!(amt > 0)) return { principal: 0, interest: 0 }
  if (!(rate > 0) || !(balanceBefore > 0)) return { principal: r2(amt), interest: 0 }
  const interest = Math.min(amt, r2(balanceBefore * (rate / 100) / 12))
  return { principal: r2(amt - interest), interest: r2(interest) }
}

/** Per-loan rollup for the card. */
export function loanSummary(loan, loanPayments = [], today = new Date()) {
  const mine = (loanPayments || []).filter(p => p.liability_id === loan.id)
  const year = String(today.getFullYear())
  const thisYear = mine.filter(p => String(p.date || '').startsWith(year))
  const last = [...mine].sort((a, b) => String(b.date).localeCompare(String(a.date)))[0] || null
  const verified = mine.filter(p => p.plaid_transaction_id).length
  const nextDue = nextDueDate(loan, today)
  const todayKey = dayKey(today)
  return {
    paidThisYear: r2(thisYear.reduce((s, p) => s + num(p.amount), 0)),
    principalThisYear: r2(thisYear.reduce((s, p) => s + num(p.principal), 0)),
    interestThisYear: r2(thisYear.reduce((s, p) => s + num(p.interest), 0)),
    count: mine.length,
    verified,
    lastPayment: last,
    nextDue,
    overdue: !!nextDue && nextDue < todayKey,
    scheduled: scheduledPayment(loan),
  }
}

/** Interest paid in a window — the expense side of loan payments. */
export function loanInterestInRange(loanPayments = [], inRange = () => true) {
  return r2((loanPayments || []).filter(p => inRange(p.date)).reduce((s, p) => s + num(p.interest), 0))
}

/**
 * Journal lines (see journalExport): principal reduces the loan liability,
 * interest is an expense, the whole payment leaves the bank.
 */
export function loanJournalRows(loanPayments = [], loans = [], inRange = () => true) {
  const byId = new Map((loans || []).map(l => [l.id, l]))
  const rows = []
  for (const p of loanPayments || []) {
    if (!inRange(p.date)) continue
    const loan = byId.get(p.liability_id)
    const name = loan?.name || `Loan #${p.liability_id}`
    const amount = r2(num(p.amount))
    if (!(amount > 0)) continue
    const interest = r2(Math.min(amount, Math.max(0, num(p.interest))))
    const principal = r2(amount - interest)
    const d = String(p.date).slice(0, 10)
    const memo = `Loan payment — ${name}${loan?.lender ? ` (${loan.lender})` : ''}${p.plaid_transaction_id ? '' : ' — entered by hand'}`
    if (principal > 0) rows.push({ date: d, account: `Loan payable: ${name}`, debit: principal, credit: 0, memo, source: 'loan', ref: p.id })
    if (interest > 0) rows.push({ date: d, account: 'Interest Expense', debit: interest, credit: 0, memo, source: 'loan', ref: p.id })
    rows.push({ date: d, account: 'Bank: loan payments', debit: 0, credit: amount, memo, source: 'loan', ref: p.id })
  }
  return rows
}

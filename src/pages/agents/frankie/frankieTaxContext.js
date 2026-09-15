// What Frankie knows about the year, the entity, and the tax picture.
//
// Asked "how much tax am I going to owe", Frankie used to answer with a list
// of six things he could not see — entity structure, year-to-date P&L,
// owner draws — and a suggestion to call a CPA. Every one of those was in
// JobScout: the company profile carries the entity type, the fiscal year end
// and the state; the bank feed carries a tax line on nearly every debit; the
// payroll runs carry the wages. He was just never handed them, and the 90-day
// windows he was handed counted owner withdrawals, credit-card payments and
// loan principal as expenses, which is how a profitable year read as a loss.
//
// This module turns those rows into the paragraphs a CFO would actually work
// from: the fiscal year, the entity and its tax form, a P&L that separates
// deductible spend from money that merely left the account, and the inputs
// for an estimated-tax number. Pure functions; the engine assembles and the
// tests pin the arithmetic.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

const money = (n) => `$${(Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
// Local calendar date, not UTC — toISOString() on "30 Nov 23:59 local"
// prints 1 Dec in any timezone west of Greenwich.
export const dateStr = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const inWindow = (raw, start, end) => {
  if (!raw) return false
  const t = new Date(raw)
  return !Number.isNaN(t.getTime()) && t >= start && t <= end
}

// ── Fiscal year ──────────────────────────────────────────────────────

function parseFyeMonth(fiscalYearEnd) {
  if (fiscalYearEnd == null || fiscalYearEnd === '') return 12
  if (typeof fiscalYearEnd === 'number') return fiscalYearEnd >= 1 && fiscalYearEnd <= 12 ? fiscalYearEnd : 12
  const s = String(fiscalYearEnd).trim().toLowerCase()
  const byName = MONTHS.findIndex(m => m.toLowerCase().startsWith(s.slice(0, 3)))
  if (byName >= 0) return byName + 1
  const n = parseInt(s, 10)   // "11", "11-30", "11/30"
  return n >= 1 && n <= 12 ? n : 12
}

/**
 * The fiscal year `now` falls in. Companies set a fiscal year end on their
 * profile (HHH's is November); a company that has not set one — or set
 * December — is on the calendar year.
 */
export function fiscalYearWindow(fiscalYearEnd, now = new Date()) {
  const endMonth = parseFyeMonth(fiscalYearEnd)
  const y = now.getFullYear()
  if (endMonth === 12) {
    return {
      start: new Date(y, 0, 1),
      end: new Date(y, 11, 31, 23, 59, 59, 999),
      label: `${y} calendar year`,
      calendar: true,
    }
  }
  const endThisYear = new Date(y, endMonth, 0, 23, 59, 59, 999)   // last day of endMonth
  const end = now > endThisYear ? new Date(y + 1, endMonth, 0, 23, 59, 59, 999) : endThisYear
  const start = new Date(end.getFullYear() - 1, endMonth, 1)   // first day after last FYE
  return {
    start, end,
    label: `fiscal year ${dateStr(start)} to ${dateStr(end)} (ends ${MONTHS[endMonth - 1]})`,
    calendar: false,
  }
}

/** Whole and fractional months from `start` to `now`, at least a tenth. */
export function monthsElapsed(start, now = new Date()) {
  const ms = Math.max(0, now - start)
  return Math.max(0.1, ms / (365.25 / 12 * 86400000))
}

/**
 * Federal estimated-tax due dates for a fiscal year: the 15th of the 4th,
 * 6th and 9th months of the year, and the 15th of the month after it ends.
 * Returns the next one after `now`.
 */
export function nextEstimatedTaxDate(window, now = new Date()) {
  const { start } = window
  const dates = [3, 5, 8, 12].map(offset => new Date(start.getFullYear(), start.getMonth() + offset, 15))
  return dates.find(d => d > now) || dates[dates.length - 1]
}

// ── Entity ───────────────────────────────────────────────────────────

/**
 * How this company is taxed, from the entity type on its profile.
 * `passThrough` means the profit lands on the owners' personal returns;
 * `seTax` means that share also carries self-employment tax.
 */
export function taxProfile(company = {}) {
  const raw = String(company?.entity_type || company?.business_type || '').trim()
  const key = raw.toLowerCase()
  const state = company?.state || company?.state_of_incorporation || null
  let profile
  if (/s[- ]?corp/.test(key)) {
    profile = {
      kind: 'S corporation', form: 'Form 1120-S, with a K-1 to each shareholder',
      passThrough: true, seTax: false,
      notes: 'No entity-level income tax. Profit passes to the shareholders at their personal rates. Owner-employees must take a reasonable W-2 salary (payroll taxes apply to that); the rest comes out as distributions with no self-employment tax. Distributions are not deductible.',
    }
  } else if (/c[- ]?corp/.test(key)) {
    profile = {
      kind: 'C corporation', form: 'Form 1120',
      passThrough: false, seTax: false,
      notes: 'The company itself pays federal income tax at a flat 21% on taxable profit, plus state corporate tax. Owners are taxed again personally on salary and dividends.',
    }
  } else if (/partner/.test(key)) {
    profile = {
      kind: 'Partnership', form: 'Form 1065, with a K-1 to each partner',
      passThrough: true, seTax: true,
      notes: 'No entity-level income tax. Each partner reports their share of the profit on their personal return: self-employment tax of 15.3% on 92.35% of their share, plus federal and state income tax at their bracket. Owner withdrawals and distributions are not deductible and do not change taxable profit; the tax is owed on the profit whether or not it was taken out.',
    }
  } else if (/sole|single|schedule c|disregard/.test(key)) {
    profile = {
      kind: 'Sole proprietorship / single-member LLC', form: "Schedule C on the owner's Form 1040",
      passThrough: true, seTax: true,
      notes: 'Profit is taxed on the owner\'s personal return: self-employment tax of 15.3% on 92.35% of profit, plus income tax at their bracket. Owner draws are not deductible.',
    }
  } else if (/llc/.test(key)) {
    profile = {
      kind: 'LLC (tax election not recorded)', form: 'Schedule C if one owner, Form 1065 if more than one — unless an S-corp election is in place',
      passThrough: true, seTax: true,
      notes: 'Assume pass-through with self-employment tax (the default for an LLC) and say that is the assumption. If they have made an S election, the self-employment tax largely goes away.',
    }
  } else {
    profile = {
      kind: 'not set on the company profile', form: 'unknown until the entity type is filled in under Settings',
      passThrough: true, seTax: true,
      notes: 'Treat as a pass-through entity with self-employment tax — the usual case for a contractor — and say that is the assumption in one clause. Point them to Settings → Company to record the entity type so this is not a guess next time.',
    }
  }
  return { raw: raw || null, state, ...profile }
}

// ── Spend classification ─────────────────────────────────────────────
//
// Nearly every bank debit already carries a tax line: the person's own choice
// if they reviewed it, otherwise the AI's Form 1065 line, otherwise the AI's
// broader category. What matters for tax is which of those lines are actual
// deductions and which are money that left the account without being an
// expense at all — owner withdrawals, credit-card payments (the purchases on
// the card are imported separately, so counting the payment too doubles
// them), loan principal, transfers to other accounts.

export function taxLineOf(txn) {
  const line = txn?.user_tax_category || txn?.ai_form_1065_line || txn?.ai_tax_category || null
  if (line) return line
  const pc = String(txn?.plaid_personal_finance_category || '')
  if (/TRANSFER_OUT|LOAN_PAYMENTS/.test(pc)) return 'Not deductible (transfer or loan payment, not yet reviewed)'
  return 'Uncategorized'
}

export function isNonDeductibleLine(line) {
  return /^not deductible/i.test(line || '') || /^income$/i.test(line || '')
}

const isMealsLine = (line) => /meal/i.test(line || '')
const looksLikeCheck = (t) => /check\s*#|draft withdrawal|withdrawal by/i.test(`${t?.name || ''} ${t?.merchant_name || ''}`)

/**
 * Money moving between the company's own connected accounts.
 *
 * HHH has nine accounts at one credit union: a main checking, a card, a
 * savings account and six per-employee expense accounts. Topping up an
 * employee's account is a debit on checking, and the AI tags it by what the
 * account is usually spent on — so $45k of "cost of goods sold" was really
 * the same money counted on its way out of checking and again when it was
 * spent. Plaid's is_transfer flag catches some of this; this catches the
 * rest: a debit on one account with a credit of the same amount on another
 * account within a few days. Greedy, one-to-one, oldest first.
 *
 * Returns the ids of both legs.
 */
export function internalTransferIds(plaidTransactions = [], dayTolerance = 3) {
  const day = (d) => Math.round(new Date(d).getTime() / 86400000)
  const rows = (plaidTransactions || []).filter(t => t.connected_account_id != null && !t.is_transfer && t.date)
  const debits = rows.filter(t => Number(t.amount) > 0).sort((a, b) => day(a.date) - day(b.date))
  const credits = rows.filter(t => Number(t.amount) < 0)
  const byAmount = new Map()
  for (const c of credits) {
    const k = (-Number(c.amount)).toFixed(2)
    if (!byAmount.has(k)) byAmount.set(k, [])
    byAmount.get(k).push(c)
  }
  const ids = new Set()
  for (const d of debits) {
    const pool = byAmount.get(Number(d.amount).toFixed(2))
    if (!pool) continue
    const i = pool.findIndex(c => !ids.has(c.id) && c.connected_account_id !== d.connected_account_id && Math.abs(day(c.date) - day(d.date)) <= dayTolerance)
    if (i < 0) continue
    ids.add(d.id)
    ids.add(pool[i].id)
  }
  return ids
}

/**
 * Deductible vs non-deductible spend in a window, by tax line.
 * Plaid: positive amount = money out; flagged transfers are skipped as the
 * rest of the app does, and so are the ids in `exclude` (internal
 * transfers). Manual expenses use their own tax category or the expense
 * category name.
 */
export function taxBreakdown({ plaidTransactions = [], manualExpenses = [], start, end, exclude = new Set() }) {
  const out = {
    deductible: 0, nonDeductible: 0, meals: 0, uncategorized: 0, grossOutflow: 0,
    internalTransfers: 0, internalTransferRows: 0,
    wagesByCheck: 0, wagesByCheckRows: 0,
    byLine: new Map(), byNonDeductible: new Map(),
  }
  const add = (line, amt) => {
    out.grossOutflow += amt
    if (isNonDeductibleLine(line)) {
      out.nonDeductible += amt
      out.byNonDeductible.set(line, (out.byNonDeductible.get(line) || 0) + amt)
      return
    }
    out.deductible += amt
    out.byLine.set(line, (out.byLine.get(line) || 0) + amt)
    if (isMealsLine(line)) out.meals += amt
    if (line === 'Uncategorized') out.uncategorized += amt
  }
  for (const t of plaidTransactions || []) {
    const amt = Number(t.amount) || 0
    if (amt <= 0 || t.is_transfer) continue
    if (!inWindow(t.date, start, end)) continue
    if (exclude.has(t.id)) { out.internalTransfers += amt; out.internalTransferRows += 1; continue }
    const line = taxLineOf(t)
    if (/salaries and wages/i.test(line) && looksLikeCheck(t)) { out.wagesByCheck += amt; out.wagesByCheckRows += 1 }
    add(line, amt)
  }
  for (const e of manualExpenses || []) {
    const amt = Number(e.amount) || 0
    if (amt <= 0) continue
    if (!inWindow(e.expense_date || e.date || e.created_at, start, end)) continue
    add(e.tax_category || e.form_1065_category || `Manual: ${e.category?.name || 'Uncategorized'}`, amt)
  }
  const sorted = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])
  return { ...out, byLine: sorted(out.byLine), byNonDeductible: sorted(out.byNonDeductible) }
}

export function revenueIn(payments = [], start, end) {
  return (payments || [])
    .filter(p => inWindow(p.date || p.created_at, start, end))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0)
}

/**
 * Money that arrived in the bank that was not a transfer between own
 * accounts and has not been marked as a loan or capital (Not deductible).
 */
export function bankInflows(plaidTransactions = [], start, end, exclude = new Set()) {
  return (plaidTransactions || [])
    .filter(t => Number(t.amount) < 0 && !t.is_transfer && !exclude.has(t.id) && inWindow(t.date, start, end))
    .filter(t => !isNonDeductibleLine(t.user_tax_category))
    .reduce((s, t) => s - Number(t.amount), 0)
}

/**
 * The rows a person should look at to make Frankie's tax number solid —
 * what the "Frankie's second look" panel in Books → Tax lists.
 *
 *  - wageChecks: debits the AI tagged as wages that are really checks and
 *    drafts from checking. Pay, subcontractor, owner draw or loan? Only a
 *    person knows. Rows where someone already chose a tax line are done.
 *  - unmatchedDeposits: money in that is not matched to a customer payment
 *    or invoice, not a transfer, and not yet marked. Customer revenue, loan
 *    proceeds, owner capital or a refund? Same story.
 *
 * Both are the current tax year, biggest first, so ten minutes at the top
 * of each list moves the number most.
 */
export function reviewQueue(plaidTransactions = [], { fiscalYearEnd = null, now = new Date(), minDeposit = 500 } = {}) {
  const fy = fiscalYearWindow(fiscalYearEnd, now)
  const internal = internalTransferIds(plaidTransactions)
  const wageChecks = []
  const unmatchedDeposits = []
  for (const t of plaidTransactions || []) {
    if (t.is_transfer || internal.has(t.id) || !inWindow(t.date, fy.start, now)) continue
    const amt = Number(t.amount) || 0
    if (amt > 0) {
      if (t.user_tax_category) continue
      if (/salaries and wages/i.test(taxLineOf(t)) && looksLikeCheck(t)) wageChecks.push(t)
    } else if (amt < 0) {
      if (t.user_tax_category || t.matched_payment_id || t.matched_invoice_id) continue
      if (-amt >= minDeposit) unmatchedDeposits.push(t)
    }
  }
  const byAbs = (a, b) => Math.abs(Number(b.amount)) - Math.abs(Number(a.amount))
  wageChecks.sort(byAbs)
  unmatchedDeposits.sort(byAbs)
  return {
    wageChecks,
    unmatchedDeposits,
    wageChecksTotal: wageChecks.reduce((s, t) => s + Number(t.amount), 0),
    unmatchedDepositsTotal: unmatchedDeposits.reduce((s, t) => s - Number(t.amount), 0),
    window: fy,
  }
}

/**
 * The one or two things about the books that would move the numbers, in
 * plain words, for Frankie to pass on. Empty when there is nothing to say.
 */
export function dataQualityFlags({ breakdown, payroll, revenue, inflows }) {
  const flags = []
  if (breakdown.internalTransfers > 0) {
    flags.push(`${money(breakdown.internalTransfers)} across ${breakdown.internalTransferRows} bank rows was money moving between the company's own accounts (matched to a deposit of the same amount on another account) and has been left OUT of the expense figures above.`)
  }
  const bankWages = (breakdown.byLine.find(([l]) => /salaries and wages/i.test(l)) || [null, 0])[1]
  if (payroll && payroll.gross > 0 && bankWages > payroll.gross * 1.25) {
    const checks = breakdown.wagesByCheckRows > 0
      ? ` ${money(breakdown.wagesByCheck)} of the bank figure is ${breakdown.wagesByCheckRows} checks and drafts from checking that the categoriser guessed were pay. If some of those were owner draws or loan repayments, taxable profit is higher by that amount; if they were subcontractors, they are still deductible (as contract labor).`
      : ' The difference may be payroll taxes and contractor pay, or money the categoriser guessed at.'
    flags.push(`The bank feed has ${money(bankWages)} tagged as salaries and wages, but completed payroll runs total ${money(payroll.gross)} gross.${checks} Those rows are listed under Books → Tax → "Frankie's second look"; working down that list is the single change that would tighten this number most.`)
  }
  if (revenue > 0 && inflows > revenue * 1.15) {
    flags.push(`${money(inflows)} came into the bank this tax year against ${money(revenue)} of recorded customer payments. The extra ${money(inflows - revenue)} is not in revenue here — loan draws, owner capital, refunds or incentive payments. Loans and capital are not taxable income; sales that were never recorded as payments would be. Those deposits are also listed under Books → Tax → "Frankie's second look".`)
  }
  return flags
}

/** Revenue, deductible expenses and net by calendar month, oldest first. */
export function monthlyPnl({ payments = [], plaidTransactions = [], manualExpenses = [], start, end, exclude = new Set() }) {
  const key = (raw) => {
    const d = new Date(raw)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }
  const rows = new Map()
  const row = (k) => {
    if (!rows.has(k)) rows.set(k, { month: k, revenue: 0, deductible: 0, nonDeductible: 0 })
    return rows.get(k)
  }
  for (const p of payments || []) {
    const d = p.date || p.created_at
    if (inWindow(d, start, end)) row(key(d)).revenue += Number(p.amount) || 0
  }
  for (const t of plaidTransactions || []) {
    const amt = Number(t.amount) || 0
    if (amt <= 0 || t.is_transfer || exclude.has(t.id) || !inWindow(t.date, start, end)) continue
    const r = row(key(t.date))
    if (isNonDeductibleLine(taxLineOf(t))) r.nonDeductible += amt
    else r.deductible += amt
  }
  for (const e of manualExpenses || []) {
    const amt = Number(e.amount) || 0
    const d = e.expense_date || e.date || e.created_at
    if (amt <= 0 || !inWindow(d, start, end)) continue
    row(key(d)).deductible += amt
  }
  return [...rows.values()]
    .map(r => ({ ...r, net: r.revenue - r.deductible }))
    .sort((a, b) => a.month.localeCompare(b.month))
}

export function payrollSummary(payrollRuns = [], start, end) {
  const runs = (payrollRuns || []).filter(r =>
    (r.status == null || r.status === 'completed' || r.status === 'paid') && inWindow(r.pay_date || r.period_end, start, end))
  const gross = runs.reduce((s, r) => s + (Number(r.total_gross) || 0), 0)
  const heads = runs.length ? Math.round(runs.reduce((s, r) => s + (Number(r.employee_count) || 0), 0) / runs.length) : 0
  return { runs: runs.length, gross, avgHeadcount: heads }
}

// ── The context itself ───────────────────────────────────────────────

/**
 * Markdown for the model. `payrollRuns` is optional and only passed for
 * roles allowed to see wages.
 */
export function buildTaxContext({ company = {}, payments = [], plaidTransactions = [], manualExpenses = [], payrollRuns = null, now = new Date() }) {
  const profile = taxProfile(company)
  const fy = fiscalYearWindow(company?.fiscal_year_end, now)
  const cal = fiscalYearWindow(null, now)
  const priorFy = { start: new Date(fy.start.getFullYear() - 1, fy.start.getMonth(), 1), end: new Date(fy.start.getTime() - 1) }

  const exclude = internalTransferIds(plaidTransactions)
  const fyRev = revenueIn(payments, fy.start, now)
  const fyTax = taxBreakdown({ plaidTransactions, manualExpenses, start: fy.start, end: now, exclude })
  const fyNet = fyRev - fyTax.deductible
  const elapsed = monthsElapsed(fy.start, now)
  const annualized = fyNet / elapsed * 12
  const payroll = payrollRuns ? payrollSummary(payrollRuns, fy.start, now) : null
  const flags = dataQualityFlags({
    breakdown: fyTax, payroll, revenue: fyRev,
    inflows: bankInflows(plaidTransactions, fy.start, now, exclude),
  })

  const priorRev = revenueIn(payments, priorFy.start, priorFy.end)
  const priorTax = taxBreakdown({ plaidTransactions, manualExpenses, start: priorFy.start, end: priorFy.end, exclude })

  let s = ''
  s += `### Company & Tax Profile\n`
  s += `- Legal name: ${company?.legal_name || company?.company_name || 'Unknown'}\n`
  s += `- Entity type: ${profile.raw || profile.kind}\n`
  s += `- Files: ${profile.form}\n`
  s += `- State: ${profile.state || 'not set on the profile'}\n`
  s += `- Tax year: ${fy.label}${fy.calendar ? '' : ' — use THIS window for "this year", not the calendar year'}\n`
  s += `- How it is taxed: ${profile.notes}\n`
  s += `- Books are cash basis: revenue = payments received, expenses = money paid out. Accrual adjustments are not tracked here.\n\n`

  s += `### Profit & Loss — tax year to date (${dateStr(fy.start)} to ${dateStr(now)}, ${elapsed.toFixed(1)} months)\n`
  s += `- Revenue collected: ${money(fyRev)}\n`
  s += `- Deductible expenses: ${money(fyTax.deductible)}\n`
  s += `- Net profit before tax: ${money(fyNet)}\n`
  s += `- Annualized run-rate profit (net ÷ months elapsed × 12): ${money(annualized)}\n`
  if (fyTax.meals > 0) s += `- Of the deductible total, meals: ${money(fyTax.meals)} — only 50% of this is deductible, so taxable profit is about ${money(fyTax.meals / 2)} higher than the net above\n`
  if (fyTax.uncategorized > 0) s += `- Uncategorized spend counted as deductible: ${money(fyTax.uncategorized)} — the one number worth cleaning up in Books\n`
  s += `- Money out that is NOT an expense (owner withdrawals, credit-card payments, loan principal, transfers): ${money(fyTax.nonDeductible)} — do not subtract this from profit; it does not reduce tax\n`
  s += `- Total cash out including the non-expense items: ${money(fyTax.grossOutflow)} (this is the figure the 30/90-day cash-flow numbers above use)\n\n`

  if (fyTax.byLine.length) {
    s += `### Deductible expenses by tax line (tax year to date)\n`
    for (const [line, amt] of fyTax.byLine.slice(0, 16)) s += `- ${line}: ${money(amt)}\n`
    s += '\n'
  }
  if (fyTax.byNonDeductible.length) {
    s += `### Non-deductible money out (tax year to date)\n`
    for (const [line, amt] of fyTax.byNonDeductible.slice(0, 6)) s += `- ${line}: ${money(amt)}\n`
    s += '\n'
  }

  if (flags.length) {
    s += `### What would move these numbers (say the one that matters, in one line — not a list of caveats)\n`
    for (const f of flags) s += `- ${f}\n`
    s += '\n'
  }

  if (!fy.calendar) {
    const calRev = revenueIn(payments, cal.start, now)
    const calTax = taxBreakdown({ plaidTransactions, manualExpenses, start: cal.start, end: now, exclude })
    s += `### Calendar year to date (${cal.start.getFullYear()}), for reference\n`
    s += `- Revenue ${money(calRev)}, deductible expenses ${money(calTax.deductible)}, net ${money(calRev - calTax.deductible)}\n\n`
  }

  if (priorRev > 0 || priorTax.deductible > 0) {
    s += `### Prior tax year (${dateStr(priorFy.start)} to ${dateStr(priorFy.end)})\n`
    s += `- Revenue ${money(priorRev)}, deductible expenses ${money(priorTax.deductible)}, net ${money(priorRev - priorTax.deductible)}\n`
    s += `- Data may be incomplete for the early part of that year if the bank feed was connected later\n\n`
  }

  const months = monthlyPnl({ payments, plaidTransactions, manualExpenses, start: new Date(now.getFullYear(), now.getMonth() - 11, 1), end: now, exclude })
  if (months.length) {
    s += `### Monthly P&L, last 12 months\n`
    s += `| Month | Revenue | Deductible expenses | Net | Non-deductible out |\n|---|---|---|---|---|\n`
    for (const r of months) s += `| ${r.month} | ${money(r.revenue)} | ${money(r.deductible)} | ${money(r.net)} | ${money(r.nonDeductible)} |\n`
    s += '\n'
  }

  if (payroll) {
    const p = payroll
    s += `### Payroll (tax year to date)\n`
    if (p.runs) {
      s += `- ${p.runs} completed payroll runs, gross wages ${money(p.gross)}, about ${p.avgHeadcount} people per run\n`
      s += `- Wages are already inside "Salaries and wages" above when they cleared the bank; employer payroll taxes on top run roughly 7.65% FICA plus FUTA/SUI (about ${money(p.gross * 0.0765)} FICA)\n\n`
    } else {
      s += `- No completed payroll runs in this tax year\n\n`
    }
  }

  const due = nextEstimatedTaxDate(fy, now)
  s += `### Estimated tax — how to answer\n`
  s += `- Next federal estimated-tax due date: ${dateStr(due)}\n`
  if (profile.passThrough) {
    s += `- Taxable profit flows to the owners. Estimate the total tax bill as: ${profile.seTax ? 'self-employment tax = 15.3% × 92.35% × profit; then ' : ''}federal income tax on the profit${profile.seTax ? ' (less half the SE tax)' : ''} at an assumed marginal bracket of 22–24% unless they tell you otherwise; plus state income tax at ${profile.state ? `${profile.state}'s rate` : 'their state rate'}. State the bracket assumption in one clause. Give the number, then the range.\n`
    s += `- Safe harbor: no underpayment penalty if this year's estimated payments cover 100% of last year's total tax (110% if income was over $150k), or 90% of this year's.\n`
  } else {
    s += `- Estimate federal corporate tax at 21% of taxable profit plus state corporate tax at ${profile.state ? `${profile.state}'s rate` : 'their state rate'}.\n`
  }
  s += `- If they ask about buying something to cut the tax bill: equipment, vehicles over 6,000 lb GVWR, trailers and tools placed in service before year end can usually be expensed in full (Section 179 / bonus depreciation), so the tax saved is roughly the purchase price × their marginal rate. Real estate does NOT work that way: a building is depreciated over 39 years (27.5 residential) and land not at all, so the first-year deduction on a building is a small fraction of the price — buy real estate because the business needs it, not for the write-off. Interest and property tax on it are deductible. Other year-end levers: retirement contributions (SEP-IRA / solo 401(k)), paying bonuses before year end, prepaying next year's insurance or rent under the 12-month rule (cash basis).\n\n`

  return s
}

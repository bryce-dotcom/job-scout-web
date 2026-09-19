// Payroll as Books sees it.
//
// Payroll runs live in payroll_runs (gross only), the per-employee detail
// in paystubs (net, withholding, employer taxes), and what is owed to the
// agencies in payroll_tax_liabilities. Until now none of it reached Books:
// the P&L only ever saw payroll if the money happened to flow through a
// connected bank account and got categorized "Payroll".
//
// Two things a run list can contain that must not be counted as money out:
//   • a run whose pay date has not arrived (entered ahead of payday)
//   • a run voided as a duplicate (status 'void') — HHH had two runs for
//     Jul 16–31 and Books read them as $60k of wages

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100
const dayKey = (d) => {
  const x = d instanceof Date ? d : new Date(d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

export const EMPLOYER_TAX_COLUMNS = ['social_security_employer', 'medicare_employer', 'futa', 'sui']
export const WITHHELD_COLUMNS = ['federal_income_tax', 'state_income_tax', 'social_security_employee', 'medicare_employee', 'additional_medicare']

export function paystubEmployerTax(stub) {
  return EMPLOYER_TAX_COLUMNS.reduce((s, c) => s + num(stub?.[c]), 0)
}
export function paystubWithheld(stub) {
  return WITHHELD_COLUMNS.reduce((s, c) => s + num(stub?.[c]), 0)
}

export const isVoidRun = (r) => String(r?.status || '').toLowerCase() === 'void'
export const liveRuns = (runs) => (runs || []).filter(r => !isVoidRun(r))

function totalsFor(runs, paystubs) {
  const runIds = new Set(runs.map(r => r.id))
  const stubs = (paystubs || []).filter(s => runIds.has(s.payroll_run_id))
  const stubRunIds = new Set(stubs.map(s => s.payroll_run_id))
  const employees = new Set(stubs.map(s => s.employee_id).filter(Boolean))
  // Stubs where they exist; a run with no stubs contributes its total_gross.
  const gross = stubs.reduce((s, x) => s + num(x.gross_pay), 0) + runs.filter(r => !stubRunIds.has(r.id)).reduce((s, r) => s + num(r.total_gross), 0)
  const employerTaxes = stubs.reduce((s, x) => s + paystubEmployerTax(x), 0)
  const withheld = stubs.reduce((s, x) => s + paystubWithheld(x), 0)
  const netPay = stubs.reduce((s, x) => s + num(x.net_pay), 0) + runs.filter(r => !stubRunIds.has(r.id)).reduce((s, r) => s + num(r.total_gross), 0)
  return { runs: runs.length, gross: r2(gross), employerTaxes: r2(employerTaxes), withheld: r2(withheld), netPay: r2(netPay), totalCost: r2(gross + employerTaxes), employees: employees.size }
}

/**
 * Totals for the runs whose pay_date is in range AND has arrived (pay_date
 * ≤ today). Runs in range but still ahead come back under `upcoming`.
 * Void runs are ignored everywhere.
 */
export function summarizePayroll({ payrollRuns = [], paystubs = [] } = {}, inRange = () => true, { today = new Date() } = {}) {
  const todayKey = dayKey(today)
  const inWindow = liveRuns(payrollRuns).filter(r => inRange(r.pay_date))
  const paid = inWindow.filter(r => String(r.pay_date || '').slice(0, 10) <= todayKey)
  const ahead = inWindow.filter(r => String(r.pay_date || '').slice(0, 10) > todayKey).sort((a, b) => String(a.pay_date).localeCompare(String(b.pay_date)))
  const out = totalsFor(paid, paystubs)
  out.upcoming = { ...totalsFor(ahead, paystubs), nextPayDate: ahead[0]?.pay_date || null }
  return out
}

/** Runs that share a pay period — almost always one is a re-run that should be voided. */
export function duplicatePeriods(payrollRuns = []) {
  const groups = new Map()
  for (const r of liveRuns(payrollRuns)) {
    const k = `${String(r.period_start || '').slice(0, 10)}|${String(r.period_end || '').slice(0, 10)}`
    if (!r.period_start || !r.period_end) continue
    groups.set(k, [...(groups.get(k) || []), r])
  }
  return [...groups.entries()]
    .filter(([, rs]) => rs.length > 1)
    .map(([k, rs]) => ({ period_start: k.split('|')[0], period_end: k.split('|')[1], runs: rs.sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || ''))) }))
}

/** Unpaid agency money: what is due, and the soonest date. */
export function taxLiabilitySummary(liabilities = [], today = new Date()) {
  const open = (liabilities || []).filter(l => !l.paid_at)
  const total = r2(open.reduce((s, l) => s + (num(l.amount_total) || num(l.amount_employee) + num(l.amount_employer)), 0))
  const dates = open.map(l => l.due_date).filter(Boolean).sort()
  const todayKey = dayKey(today)
  const overdue = r2(open.filter(l => l.due_date && l.due_date < todayKey).reduce((s, l) => s + (num(l.amount_total) || num(l.amount_employee) + num(l.amount_employer)), 0))
  return { open: open.length, total, nextDue: dates[0] || null, overdue }
}

// Bank rows that ARE payroll (net pay ACH, tax deposits). Used to avoid
// double counting when payroll runs are also on the books.
export function isPayrollBankRow(t) {
  const cat = `${t?.user_category || ''} ${t?.ai_category || ''} ${t?.user_tax_category || ''} ${t?.ai_tax_category || ''}`.toLowerCase()
  const name = `${t?.merchant_name || ''} ${t?.name || ''}`.toLowerCase()
  return /payroll|salaries and wages|guaranteed payments|tax payment|eftps|irs usataxpymt|\bdwq\b|state tax/.test(cat) || /payroll|eftps|usataxpymt|gusto|adp\b|paychex/.test(name)
}

/**
 * Journal lines for the runs paid in range (see journalExport): wages and
 * employer taxes are expenses; net pay leaves the bank; withholding and
 * employer taxes sit as a liability until remitted. Void and future runs
 * are left out.
 */
export function payrollJournalRows({ payrollRuns = [], paystubs = [] } = {}, inRange = () => true, { today = new Date() } = {}) {
  const rows = []
  const todayKey = dayKey(today)
  const byRun = new Map()
  for (const s of paystubs || []) {
    const arr = byRun.get(s.payroll_run_id) || []
    arr.push(s)
    byRun.set(s.payroll_run_id, arr)
  }
  for (const run of liveRuns(payrollRuns)) {
    if (!inRange(run.pay_date) || String(run.pay_date || '').slice(0, 10) > todayKey) continue
    const stubs = byRun.get(run.id) || []
    const gross = stubs.length ? stubs.reduce((s, x) => s + num(x.gross_pay), 0) : num(run.total_gross)
    const employer = stubs.reduce((s, x) => s + paystubEmployerTax(x), 0)
    const withheld = stubs.reduce((s, x) => s + paystubWithheld(x), 0)
    const net = stubs.length ? stubs.reduce((s, x) => s + num(x.net_pay), 0) : gross - withheld
    if (gross <= 0) continue
    const memo = `Payroll ${run.period_start} – ${run.period_end}${run.employee_count ? ` (${run.employee_count} employees)` : ''}`
    const d = String(run.pay_date).slice(0, 10)
    rows.push({ date: d, account: 'Wages & Salaries', debit: r2(gross), credit: 0, memo, source: 'payroll', ref: run.id })
    if (employer > 0) rows.push({ date: d, account: 'Payroll Taxes (employer)', debit: r2(employer), credit: 0, memo, source: 'payroll', ref: run.id })
    rows.push({ date: d, account: 'Bank: payroll', debit: 0, credit: r2(net), memo, source: 'payroll', ref: run.id })
    const liability = r2(withheld + employer)
    if (liability > 0) rows.push({ date: d, account: 'Payroll Tax Liabilities', debit: 0, credit: liability, memo, source: 'payroll', ref: run.id })
    // Rounding on net vs gross-withheld lands in the liability line so the entry balances.
    const diff = r2(gross + employer - net - liability)
    if (Math.abs(diff) >= 0.01) rows.push({ date: d, account: 'Payroll Tax Liabilities', debit: diff < 0 ? -diff : 0, credit: diff > 0 ? diff : 0, memo: `${memo} — rounding`, source: 'payroll', ref: run.id })
  }
  return rows
}

// Payroll as Books sees it.
//
// Payroll runs live in payroll_runs (gross only), the per-employee detail
// in paystubs (net, withholding, employer taxes), and what is owed to the
// agencies in payroll_tax_liabilities. Until now none of it reached Books:
// the P&L only ever saw payroll if the money happened to flow through a
// connected bank account and got categorized "Payroll".

const num = (v) => parseFloat(v) || 0
const r2 = (n) => Math.round(n * 100) / 100

export const EMPLOYER_TAX_COLUMNS = ['social_security_employer', 'medicare_employer', 'futa', 'sui']
export const WITHHELD_COLUMNS = ['federal_income_tax', 'state_income_tax', 'social_security_employee', 'medicare_employee', 'additional_medicare']

export function paystubEmployerTax(stub) {
  return EMPLOYER_TAX_COLUMNS.reduce((s, c) => s + num(stub?.[c]), 0)
}
export function paystubWithheld(stub) {
  return WITHHELD_COLUMNS.reduce((s, c) => s + num(stub?.[c]), 0)
}

/**
 * Totals for the runs whose pay_date is in range.
 * @returns {{ runs, gross, employerTaxes, withheld, netPay, totalCost, employees }}
 */
export function summarizePayroll({ payrollRuns = [], paystubs = [] } = {}, inRange = () => true) {
  const runIds = new Set((payrollRuns || []).filter(r => inRange(r.pay_date)).map(r => r.id))
  const stubs = (paystubs || []).filter(s => runIds.has(s.payroll_run_id))
  const employees = new Set(stubs.map(s => s.employee_id).filter(Boolean))
  const gross = stubs.length
    ? stubs.reduce((s, x) => s + num(x.gross_pay), 0)
    : (payrollRuns || []).filter(r => runIds.has(r.id)).reduce((s, r) => s + num(r.total_gross), 0)
  const employerTaxes = stubs.reduce((s, x) => s + paystubEmployerTax(x), 0)
  const withheld = stubs.reduce((s, x) => s + paystubWithheld(x), 0)
  const netPay = stubs.length ? stubs.reduce((s, x) => s + num(x.net_pay), 0) : gross - withheld
  return {
    runs: runIds.size,
    gross: r2(gross),
    employerTaxes: r2(employerTaxes),
    withheld: r2(withheld),
    netPay: r2(netPay),
    totalCost: r2(gross + employerTaxes),   // what payroll costs the business
    employees: employees.size,
  }
}

/** Unpaid agency money: what is due, and the soonest date. */
export function taxLiabilitySummary(liabilities = [], today = new Date()) {
  const open = (liabilities || []).filter(l => !l.paid_at)
  const total = r2(open.reduce((s, l) => s + (num(l.amount_total) || num(l.amount_employee) + num(l.amount_employer)), 0))
  const dates = open.map(l => l.due_date).filter(Boolean).sort()
  const todayKey = today.toISOString().slice(0, 10)
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
 * Journal lines for the runs in range (see journalExport): wages and
 * employer taxes are expenses; net pay leaves the bank; withholding and
 * employer taxes sit as a liability until remitted.
 */
export function payrollJournalRows({ payrollRuns = [], paystubs = [] } = {}, inRange = () => true) {
  const rows = []
  const byRun = new Map()
  for (const s of paystubs || []) {
    const arr = byRun.get(s.payroll_run_id) || []
    arr.push(s)
    byRun.set(s.payroll_run_id, arr)
  }
  for (const run of payrollRuns || []) {
    if (!inRange(run.pay_date)) continue
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

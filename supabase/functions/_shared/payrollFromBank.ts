// What a payroll really costs, read off the bank — ONE copy for the app
// (src/lib/payrollBooks.js re-exports isPayrollBankRow) and for Frankie's /
// Arnie's query_payroll_runs.
//
// Why (Bryce, 2026-10-28): "payroll is about 30-40k per pay period" and
// "it leaves over several days as checks clear peoples banks". HHH's payroll
// runs in JobScout cover only part of the team, and a payroll's checks clear
// across the days after payday. Jenny took one heavy period ($54k) as "the
// next payroll". The bank, grouped from one pay date to the next, put the
// recent periods at $42k, $41k, $37k, $38k and $55k: a typical payroll is the
// median of those, not the last one.

const num = (v: unknown) => parseFloat(v as string) || 0
const day = (d: unknown) => String(d || '').slice(0, 10)
const money = (n: number) => Math.round(n * 100) / 100

// Bank rows that ARE payroll (net pay ACH, checks tagged as wages, tax
// deposits, the payroll service's debits). Used to avoid double counting when
// payroll runs are also on the books, and to measure payroll from the bank.
export function isPayrollBankRow(t: any): boolean {
  const cat = `${t?.user_category || ''} ${t?.ai_category || ''} ${t?.user_tax_category || ''} ${t?.ai_tax_category || ''}`.toLowerCase()
  const name = `${t?.merchant_name || ''} ${t?.name || ''}`.toLowerCase()
  return /payroll|salaries and wages|guaranteed payments|tax payment|eftps|irs usataxpymt|\bdwq\b|state tax/.test(cat) || /payroll|eftps|usataxpymt|gusto|adp\b|paychex/.test(name)
}

export interface BankPayPeriod { pay_date: string; until: string; cleared: number; lines: number; still_clearing: boolean }

/**
 * One payroll = every payroll bank row that clears from its pay date up to
 * the next pay date. `payDates` are the company's pay dates (the payroll runs
 * hold them even when they cover only part of the team). The newest period is
 * still clearing. `typical` is the median of the last six complete periods.
 */
export function payrollPeriodsFromBank(bankRows: any[] = [], payDates: string[] = [], today = new Date().toISOString().slice(0, 10)) {
  const dates = [...new Set((payDates || []).map(day).filter(Boolean))].filter(d => d <= today).sort()
  const rows = (bankRows || []).filter(t => num(t.amount) > 0 && !t.is_transfer && isPayrollBankRow(t))
  const periods: BankPayPeriod[] = dates.map((d, i) => {
    const next = dates[i + 1] || null
    const inIt = rows.filter(t => day(t.date) >= d && (next ? day(t.date) < next : day(t.date) <= today))
    return { pay_date: d, until: next || today, cleared: money(inIt.reduce((s, t) => s + num(t.amount), 0)), lines: inIt.length, still_clearing: !next }
  }).filter(p => p.lines > 0 || p.still_clearing)
  const complete = periods.filter(p => !p.still_clearing && p.lines > 0).slice(-6).map(p => p.cleared).sort((a, b) => a - b)
  const typical = complete.length ? money(complete.length % 2 ? complete[(complete.length - 1) / 2] : (complete[complete.length / 2 - 1] + complete[complete.length / 2]) / 2) : null
  return { periods: periods.slice(-8), typical, low: complete[0] ?? null, high: complete[complete.length - 1] ?? null }
}

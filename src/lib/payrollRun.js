// The payload for process_payroll_run: one payroll run, written in one
// database transaction (supabase/migrations/20261023200000_process_payroll_run.sql,
// docs/PAYROLL_PLAN.md step 4).
//
// The page computes the pay (lib/payrollEngine) and the liabilities; this
// shapes what it computed into the one call that writes the run, the stubs,
// the PTO banks, the ledger marks and the liabilities together. Pure: a
// test can look at exactly what would be written.

import { localDateStr } from './localDate'
import { ptoAccrualPerPeriod, ptoBankAfterRun } from './ptoThisPeriod'

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/**
 * @param {object} args
 *   companyId
 *   periodStart, periodEnd, payDate: Dates
 *   createdBy: the user id on the run; paidBy: the admin's employee id on the marks
 *   totalGross: the run's gross
 *   employees: the active employees the run pays (every one gets a stub)
 *   payrollConfig: for the PTO accrual per period
 *   stubs: paystub rows as the page builds them (company_id / payroll_run_id are set by the function)
 *   ptoDaysFor(employeeId): PTO days this run pays that person
 *   settle: [{ covered, rep: [ids], lead: [ids] }] greater-of rows weighed, by outcome
 *   liabilities: rows from aggregateTaxLiabilities (payroll_run_id is set by the function)
 */
export function buildRunPayload({
  companyId, periodStart, periodEnd, payDate, createdBy = null, paidBy = null, totalGross = 0,
  employees = [], payrollConfig = {}, stubs = [], ptoDaysFor = () => 0, settle = [], liabilities = [],
}) {
  const ps = localDateStr(periodStart), pe = localDateStr(periodEnd), pd = localDateStr(payDate)
  const strip = (row) => { const { company_id, payroll_run_id, ...rest } = row || {}; return rest }
  // The bank after this run: this period's accrual in, the days paid out.
  const pto_moves = employees.map(emp => {
    const accrue = ptoAccrualPerPeriod(emp, payrollConfig?.pay_frequency)
    const use = ptoDaysFor(emp.id) || 0
    if (!(accrue > 0 || use > 0)) return null
    return { employee_id: emp.id, ...ptoBankAfterRun(emp, { accrue, use }) }
  }).filter(Boolean)
  return {
    company_id: companyId,
    paid_at: new Date(payDate).toISOString(),
    paid_by: paidBy,
    run: { period_start: ps, period_end: pe, pay_date: pd, total_gross: r2(totalGross), employee_count: employees.length, created_by: createdBy },
    stubs: stubs.map(s => ({ ...strip(s), period_start: ps, period_end: pe, pay_date: pd })),
    pto_moves,
    paid_employee_ids: employees.map(e => e.id),
    settle: (settle || []).filter(g => (g.rep?.length || 0) + (g.lead?.length || 0) > 0).map(g => ({ covered: !!g.covered, rep: g.rep || [], lead: g.lead || [] })),
    liabilities: (liabilities || []).map(strip),
  }
}

// Checks on the run itself, before processing. The setup gate asks "is the
// company set up?"; these ask "does THIS payroll look right?".
//
// Both failures that reached HHH's books would have stopped here:
//   - Cameron McDonough, Jun 16-30: an open punch nobody closed became
//     810.94 overtime hours and a $29,212 check.
//   - Jul 16-31 was processed twice, nine days apart, with different totals.
//     Both counted toward the 941 and his W-2.
//
// blocks   stop the run; the modal says why and what to fix.
// warnings are shown and must be read, but a human can still proceed.
//
// Pure. Takes what the Payroll page already has.

export const MAX_PUNCH_HOURS = 16          // longer than this is a missed clock-out, not a shift
export const SS_WAGE_BASE = 184500          // 2026 (payrollTax.js keeps the engine's copy)
export const FUTA_WAGE_BASE = 7000

const hoursOf = (p) => {
  const h = Number(p?.total_hours)
  if (Number.isFinite(h) && h > 0) return h
  if (p?.clock_in && p?.clock_out) return (new Date(p.clock_out) - new Date(p.clock_in)) / 36e5
  return 0
}
const money = (n) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

/**
 * @param {object} args
 *   employees        active employees
 *   employeePayData  per-employee pay as computed for this run
 *   periodPunches    time_clock rows inside the period (closed)
 *   openPunches      time_clock rows with no clock_out
 *   priorRuns        payroll_runs for the company [{ id, period_start, period_end, pay_date, created_at }]
 *   periodStart, periodEnd   YYYY-MM-DD of the run
 *   ytdGrossByEmployee       { [employeeId]: gross paid so far this year, before this run }
 *   priorStubsByEmployee     { [employeeId]: [{ regular_hours, overtime_hours }] } for the "usual hours" check
 *   suiWageBase              the state's SUI wage base (optional)
 */
export function payrollRunGuards({
  employees = [], employeePayData = {}, periodPunches = [], openPunches = [], priorRuns = [],
  periodStart, periodEnd, ytdGrossByEmployee = {}, priorStubsByEmployee = {}, suiWageBase = null,
} = {}) {
  const blocks = [], warnings = []
  const name = (id) => employees.find((e) => e.id === id)?.name || `Employee ${id}`

  // 1. A punch longer than a human shift: the 810-hour check.
  for (const p of periodPunches) {
    const h = hoursOf(p)
    if (h > MAX_PUNCH_HOURS) {
      blocks.push({ key: `punch:${p.id}`, employeeId: p.employee_id, label: `${name(p.employee_id)}: a single punch of ${h.toFixed(1)} hours`, detail: `Longer than ${MAX_PUNCH_HOURS} hours is a missed clock-out, not a shift. Fix the punch on their Time Clock before running.`, fix: 'punch', punchId: p.id })
    }
  }
  // 2. Still on the clock inside the period: those hours are not in the run.
  for (const p of openPunches) {
    const start = String(p?.clock_in || '').slice(0, 10)
    if (periodStart && periodEnd && start >= periodStart && start <= periodEnd) {
      warnings.push({ key: `open:${p.id}`, employeeId: p.employee_id, label: `${name(p.employee_id)}: an open punch from ${start}`, detail: 'No clock-out, so those hours are not in this run. Close it first if it was a real shift.', fix: 'punch', punchId: p.id })
    }
  }
  // 3. This period was already processed.
  const dup = priorRuns.filter((r) => r.period_start === periodStart && r.period_end === periodEnd)
  if (dup.length) {
    const when = dup.map((r) => `run ${r.id} on ${String(r.created_at || r.pay_date || '').slice(0, 10)}`).join(', ')
    blocks.push({ key: 'duplicate_period', label: `${periodStart} to ${periodEnd} has already been run`, detail: `${when}. Running it again counts every wage twice on the 941 and the W-2s. If this is a correction, void the earlier run first; if it is an off-cycle check, change the period.`, fix: 'runs', overridable: true })
  }
  // 4. Pay that would never be right.
  for (const e of employees) {
    const d = employeePayData[e.id]
    if (!d) continue
    const net = d.tax?.netPay ?? d.netPay
    if (Number(net) < 0) blocks.push({ key: `negative:${e.id}`, employeeId: e.id, label: `${e.name}: net pay is ${money(net)}`, detail: 'Deductions exceed pay. Check the adjustments on their card.', fix: 'employee' })
    const hours = (Number(d.regularHours) || 0) + (Number(d.overtimeHours) || 0)
    if (hours > 0 && !(e.is_hourly || e.is_salary) && e.tax_classification !== '1099') {
      warnings.push({ key: `unpaid:${e.id}`, employeeId: e.id, label: `${e.name}: ${hours.toFixed(1)} hours, nothing paid`, detail: 'No pay type on their card, so the hours are counted at $0.', fix: 'employee' })
    }
    // 5. Hours far outside their own usual, only with history to compare to.
    const prior = (priorStubsByEmployee[e.id] || []).map((s) => (Number(s.regular_hours) || 0) + (Number(s.overtime_hours) || 0)).filter((h) => h > 0)
    if (prior.length >= 2 && hours > 0) {
      const avg = prior.reduce((a, b) => a + b, 0) / prior.length
      if (hours > avg * 1.75 && hours - avg > 20) {
        warnings.push({ key: `hours:${e.id}`, employeeId: e.id, label: `${e.name}: ${hours.toFixed(1)} hours, usually about ${avg.toFixed(0)}`, detail: 'Far above their normal period. Worth a look at the punches before paying it.', fix: 'employee' })
      }
    }
    // 6. Crossing a wage cap on this check: a tax that stops mid-check.
    const ytd = Number(ytdGrossByEmployee[e.id]) || 0
    const gross = Number(d.grossPay) || 0
    if (gross > 0 && e.tax_classification !== '1099') {
      if (ytd < SS_WAGE_BASE && ytd + gross > SS_WAGE_BASE) warnings.push({ key: `sscap:${e.id}`, employeeId: e.id, label: `${e.name} crosses the Social Security wage base on this check`, detail: `${money(SS_WAGE_BASE)} for the year. Social Security tax stops at the cap; the stub should show a smaller amount than usual.`, fix: 'info' })
      if (ytd < FUTA_WAGE_BASE && ytd + gross > FUTA_WAGE_BASE) warnings.push({ key: `futacap:${e.id}`, employeeId: e.id, label: `${e.name} crosses the FUTA wage base on this check`, detail: 'FUTA applies to the first $7,000 only; the employer line is smaller from here.', fix: 'info' })
      if (suiWageBase && ytd < suiWageBase && ytd + gross > suiWageBase) warnings.push({ key: `suicap:${e.id}`, employeeId: e.id, label: `${e.name} crosses the state unemployment wage base on this check`, detail: `${money(suiWageBase)} for the year.`, fix: 'info' })
    }
  }
  return { blocks, warnings }
}

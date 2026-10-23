// What an hour of someone's time COSTS the company on a job.
//
// Two things were wrong with reading `employees.hourly_rate` and stopping.
//
// A salaried person has no hourly rate, so their time cost nothing. Christopher
// clocked 21 job hours in one week at $0 — he clocks in to show where his time
// goes, not because that is how he is paid. His salary still has to land on the
// jobs he spent the week on, so it is spread over a standard 2,080-hour year.
// Nobody has to type a second number onto the employee card.
//
// And an employee costs more than their wage. The employer pays Social
// Security and Medicare on top, plus unemployment, plus workers comp. Costing
// jobs at the bare wage reports a margin the company never earned. The rates
// are not invented here: they come from the company's own payroll setup, the
// same ones the Payroll page runs a cheque with.
//
// This is an average, and says so. FUTA and SUI stop at a wage base partway
// through the year, so a flat percentage slightly overstates the burden on a
// high earner late in the year and understates nobody. The alternative is
// year-to-date wage tracking per person inside job costing, which is a lot of
// machinery for a number read on a scorecard.

/** Employer's half of FICA: 6.2% Social Security + 1.45% Medicare. Federal,
 *  not a company setting, and it is the biggest piece of the burden. */
import { calcFICA, calcFUTA, calcSUI } from './payrollTax.ts'

export const FICA_EMPLOYER_PCT = 7.65

/** Hours in a standard working year — the divisor for a salary. 40 x 52. */
export const FULL_TIME_HOURS_PER_YEAR = 2080

/** Workers comp, when the company has rates configured. `workers_comp_class_codes`
 *  is a map of class code to rate per $100 of payroll; we take the highest, so a
 *  mixed crew is not costed at the office rate. Empty map = 0, not a guess. */
export function workersCompPct(company) {
  const codes = company?.workers_comp_class_codes
  if (!codes || typeof codes !== 'object') return 0
  const rates = Object.values(codes)
    .map(v => Number(typeof v === 'object' && v !== null ? v.rate : v))
    .filter(n => Number.isFinite(n) && n > 0)
  return rates.length ? Math.max(...rates) : 0
}

/**
 * Everything the employer pays on top of a wage, as a flat percentage.
 *
 * The simple version, kept for callers with no wage to go on: it charges FUTA
 * and SUI on every dollar, which is only true until those taxes hit their
 * wage bases. Prefer effectiveBurdenPct when the person's annual wage is
 * known — it is the same arithmetic with the caps applied.
 */
export function burdenPct(company) {
  if (!company) return 0
  return FICA_EMPLOYER_PCT
    + (Number(company.futa_rate_pct) || 0)
    + (Number(company.sui_rate_pct) || 0)
    + workersCompPct(company)
}

/**
 * The burden this person actually costs, as a percentage of their wage.
 *
 * FUTA stops at $7,000 of wages and SUI at the state's base ($50,700 in Utah
 * for 2026), so a flat 8.45% overcharges anyone earning more than that. On
 * Christopher's $84,000 the true figure is 7.82%: Social Security and
 * Medicare on all of it, but $42 of FUTA and $101 of SUI, not 0.8% of the lot.
 *
 * The caps are not restated here — calcFICA, calcFUTA and calcSUI are the
 * payroll module's own, the ones a real cheque is run with, so this cannot
 * drift from payroll when a year or a wage base changes.
 *
 * It is a whole-year rate, flat across the year rather than front-loaded the
 * way the taxes really fall. Charging a job in March more than one in
 * November for the same hour would make two identical jobs look different,
 * which is worse for the question job costing is asked.
 */
export function effectiveBurdenPct(annualWage, company, payDate = null) {
  const wage = Number(annualWage) || 0
  if (!(wage > 0)) return burdenPct(company)
  if (!company) return 0
  const fica = calcFICA({ gross: wage, ytdGrossBeforeThis: 0, ytdMedicareBeforeThis: 0, payDate })
  const futa = calcFUTA({ gross: wage, ytdGrossBeforeThis: 0, ratePct: company.futa_rate_pct, payDate })
  const sui = calcSUI({
    gross: wage, ytdGrossBeforeThis: 0,
    ratePct: company.sui_rate_pct, wageBase: company.sui_wage_base,
  })
  const employer = (fica.socialSecurityEmployer || 0) + (fica.medicareEmployer || 0) + futa + sui
  const comp = wage * (workersCompPct(company) / 100)
  return ((employer + comp) / wage) * 100
}

/** What this person is paid in a year, as best the card says. An hourly
 *  person is assumed full time, which is the only basis available; a
 *  part-timer's real wages are lower, so their FUTA and SUI are a larger
 *  share and this understates them slightly. */
export function annualWageOf(employee) {
  const annual = Number(employee?.annual_salary) || Number(employee?.salary) || 0
  if (isSalaried(employee) && annual > 0) return annual
  const hourly = Number(employee?.hourly_rate) || 0
  if (hourly > 0) return hourly * FULL_TIME_HOURS_PER_YEAR
  return annual
}

/** Is this person paid a salary rather than by the hour? */
export function isSalaried(employee) {
  if (!employee) return false
  if (employee.is_salary === true) return true
  const types = employee.pay_type
  if (Array.isArray(types) && types.some(t => String(t).toLowerCase() === 'salary')) return true
  return String(employee.pay_type || '').toLowerCase() === 'salary'
}

/** The wage an hour of this person's time is worth, before burden.
 *  A salary wins over a stray hourly rate: it is how they are actually paid. */
export function baseHourlyRate(employee) {
  const annual = Number(employee?.annual_salary) || Number(employee?.salary) || 0
  const hourly = Number(employee?.hourly_rate) || 0
  if (isSalaried(employee) && annual > 0) return annual / FULL_TIME_HOURS_PER_YEAR
  if (hourly > 0) return hourly
  // Flags can be wrong or unset; a salary on the card still beats nothing.
  if (annual > 0) return annual / FULL_TIME_HOURS_PER_YEAR
  return 0
}

/**
 * What an hour of this person on a job costs the company.
 * Pass the company to include employer burden; without it you get the bare
 * wage, which is what every caller got before this existed.
 */
export function hourlyCostRate(employee, company = null, payDate = null) {
  const base = baseHourlyRate(employee)
  if (!(base > 0)) return 0
  if (!company) return base
  return base * (1 + effectiveBurdenPct(annualWageOf(employee), company, payDate) / 100)
}

/** Per-employee cost rates, ready for job costing. */
export function costRatesByEmployee(employees = [], company = null, payDate = null) {
  const map = new Map()
  for (const e of employees || []) {
    if (!e || e.id == null) continue
    map.set(e.id, hourlyCostRate(e, company, payDate))
  }
  return map
}

// PTO on the Payroll table: what each person has banked, and what they are
// using in the period being paid.
//
// Bryce: "there should be an Accrued PTO column and a Using this pay period
// column." The balance already existed — it was tucked into the expanded
// card as "PTO: 6.0 days" — but nothing said how much of it this paycheck
// consumes. That is the number payroll needs, because a day off is either a
// paid absence or an unexplained gap in the hours.
//
// Days, not hours, because that is the unit the employee card keeps
// (pto_days_per_year, pto_accrued, pto_used). Only approved requests count,
// and only the kind that draws on the PTO bank: sick, personal and unpaid
// leave are their own thing and are not charged against it here.
//
// Pure. The page fetches; this only counts.

const PTO_TYPES = new Set(['pto'])

/** YYYY-MM-DD (or a Date) to a local midnight Date. Null when unreadable. */
function localDay(v) {
  if (!v) return null
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate())
  const [y, m, d] = String(v).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  return new Date(y, m - 1, d)
}

/** Weekdays from start to end inclusive. 0 when the range is empty. */
export function businessDaysBetween(start, end) {
  const a = localDay(start), b = localDay(end)
  if (!a || !b || b < a) return 0
  let n = 0
  for (const cur = new Date(a); cur <= b; cur.setDate(cur.getDate() + 1)) {
    const dow = cur.getDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

/** PTO days one employee is using inside a pay period, from approved requests
 *  clipped to the period — a week off straddling two periods is charged to
 *  each one only for the days that fall inside it. */
export function ptoDaysInPeriod(requests, employeeId, periodStart, periodEnd) {
  const ps = localDay(periodStart), pe = localDay(periodEnd)
  if (!ps || !pe) return 0
  let days = 0
  for (const r of requests || []) {
    if (!r || String(r.employee_id) !== String(employeeId)) continue
    if (r.status !== 'approved') continue
    if (!PTO_TYPES.has(String(r.request_type || 'pto').toLowerCase())) continue
    const s = localDay(r.start_date), e = localDay(r.end_date || r.start_date)
    if (!s || !e) continue
    const from = s > ps ? s : ps
    const to = e < pe ? e : pe
    days += businessDaysBetween(from, to)
  }
  return days
}

/** What the employee card says is in the bank. */
export function ptoBalanceDays(employee) {
  return (Number(employee?.pto_accrued) || 0) - (Number(employee?.pto_used) || 0)
}

// ── Tying it together ──────────────────────────────────────────────────
//
// Bryce: "tie it all together, the employee card should dictate the rate."
// Three things the card already holds decide everything below:
//
//   pto_days_per_year   how much accrues, spread evenly over the year's pay
//                       periods (26 for bi-weekly, and so on)
//   hourly_rate         what a PTO day pays an hourly employee, at eight
//                       hours a day. A salaried employee is paid the same
//                       either way, so PTO costs them nothing extra and is
//                       simply drawn from the bank
//   pto_accrued/used    the bank, moved on every payroll run: plus this
//                       period's accrual, plus the PTO days it paid
//
// Contractors (1099) accrue nothing and are paid for nothing here.

import { PERIODS_PER_YEAR } from './bonusCalc'

export const PTO_HOURS_PER_DAY = 8

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100
const isContractor = (e) => e?.tax_classification === '1099'

/** Days added to the bank by one pay period, from the card's days-per-year. */
export function ptoAccrualPerPeriod(employee, payFrequency) {
  if (!employee || isContractor(employee)) return 0
  const perYear = Number(employee.pto_days_per_year) || 0
  if (perYear <= 0) return 0
  const periods = PERIODS_PER_YEAR[payFrequency] || 26
  return r2(perYear / periods)
}

/** What PTO days in a period pay, and the hours the paystub records. */
export function ptoPayForPeriod(employee, days) {
  const d = Number(days) || 0
  if (!employee || isContractor(employee) || d <= 0) return { hours: 0, pay: 0 }
  const hours = r2(d * PTO_HOURS_PER_DAY)
  // Hourly: paid at the card's rate. Salary: already in the salary.
  const pay = employee.is_hourly ? r2(hours * (Number(employee.hourly_rate) || 0)) : 0
  return { hours, pay }
}

/** The bank after a run that accrued `accrue` days and paid `use` days. */
export function ptoBankAfterRun(employee, { accrue = 0, use = 0 } = {}) {
  return {
    pto_accrued: r2((Number(employee?.pto_accrued) || 0) + (Number(accrue) || 0)),
    pto_used: r2((Number(employee?.pto_used) || 0) + (Number(use) || 0)),
  }
}

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

// The date a person is looking at.
//
// `new Date(...).toISOString().split('T')[0]` is the most common date bug in
// this app and it is invisible until it isn't. toISOString converts to UTC, so
// west of Greenwich any time late in the day rolls forward:
//
//   Aug 31 23:59:59 Mountain  ->  2026-09-01T05:59:59Z  ->  "2026-09-01"
//
// Alayda, 14 Aug: "the pay period is incorrect & off by one day it is supposed
// to be till the end of the month - the last day. The system is reading to the
// first of the month which throws it off." She was reading the symptom of
// exactly this line.
//
// It matters more than a label. That string is compared against stored
// pay_period_end values and written into payroll_runs.period_end, so a period
// ending the 31st is saved as the 1st and then fails to match its own rows.
//
// One definition. Format from LOCAL parts and the date always reads as the day
// the person actually worked.

/**
 * 'YYYY-MM-DD' for a Date, from its local calendar parts.
 * Returns '' for anything that isn't a usable date, so a bad value shows as
 * empty rather than as a confidently wrong day.
 */
export function localDateStr(d) {
  // Reject empties BEFORE coercing: new Date(null) is the epoch and new Date('')
  // is Invalid, so a missing value would otherwise become a confident
  // '1970-01-01' — a date that matches nothing and looks deliberate.
  if (d === null || d === undefined || d === '') return ''
  const date = d instanceof Date ? d : new Date(d)
  if (!(date instanceof Date) || isNaN(date)) return ''
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${m}-${day}`
}

/**
 * The other direction, and the same bug.
 *
 * `new Date('2026-09-01')` is NOT September 1st. A bare 'YYYY-MM-DD' is parsed
 * as UTC midnight per the spec, which west of Greenwich is the evening of the
 * day BEFORE — Aug 31 18:00 in Mountain Time. Compare that against a locally
 * built `new Date(y, m, 1)` and the 1st of every month falls into the previous
 * month.
 *
 * That was live on the dashboard: on 2 Sep 2026 MTD Revenue read $0 while
 * $38,974 had been collected, because all eleven payments were dated
 * '2026-09-01' and every one of them landed in August.
 *
 * Date-only columns (payments.date, expenses.date, plaid_transactions.date,
 * invoices.invoice_date) carry no zone and mean a calendar day in the
 * company's own time. Anything that already carries a time or an offset is
 * left exactly as it is — those are real instants and must not be shifted.
 *
 * @param {string|Date|null} value
 * @returns {Date|null} null when there is no usable date, so callers can tell
 *          "missing" from a confidently wrong day.
 */
export function parseLocalDate(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return isNaN(value) ? null : value
  if (typeof value !== 'string') return null
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  const d = dateOnly
    ? new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]))
    : new Date(value)
  return isNaN(d) ? null : d
}

/**
 * Does `value` fall in [start, end)? Half-open, matching jobMetrics' range
 * functions, so consecutive windows never double-count a boundary day.
 * Either bound may be null for an open end.
 */
export function inLocalRange(value, start, end) {
  const d = parseLocalDate(value)
  if (!d) return false
  if (start && d < start) return false
  if (end && d >= end) return false
  return true
}

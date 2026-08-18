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

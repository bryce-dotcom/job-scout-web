// Payroll quarters and the dates the quarterly taxes are due.
//
// FUTA deposits and state unemployment (Utah DWS Form 33H) are quarterly, due
// the last day of the month AFTER the quarter ends: Apr 30, Jul 31, Oct 31,
// Jan 31. Payroll.jsx had its own copy of this rule with the month index off
// by one (`new Date(y, 4, 31)` is May 31, not April 30, and "Nov 31" rolls to
// Dec 1), so every FUTA row in the ledger said Dec 1 for a Q3 pay date — a
// month late for anyone actually depositing on it. One definition now, and
// the SUI true-up groups the ledger by the same quarters.
//
// All dates are 'YYYY-MM-DD' strings built from local calendar parts (see
// lib/localDate for why toISOString is never used here).

const pad = (n) => String(n).padStart(2, '0')

/** 'YYYY-MM-DD' → { year, month (1-12), day } without timezone math. */
function parts(dateStr) {
  const s = String(dateStr || '').slice(0, 10)
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (m) return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
  const d = dateStr instanceof Date ? dateStr : new Date(dateStr)
  if (isNaN(d)) return null
  return { year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate() }
}

/**
 * The quarter a pay date falls in.
 * @returns {{ year, quarter, start, end, due, label }|null}
 *   start/end bound the quarter; due is the deposit/report due date.
 */
export function quarterOf(dateStr) {
  const p = parts(dateStr)
  if (!p) return null
  const quarter = Math.floor((p.month - 1) / 3) + 1
  const startMonth = (quarter - 1) * 3 + 1
  const endMonth = startMonth + 2
  const endDay = [3, 12].includes(endMonth) ? 31 : 30
  const dueYear = quarter === 4 ? p.year + 1 : p.year
  const dueMonth = quarter === 4 ? 1 : endMonth + 1
  const dueDay = [4, 6, 9, 11].includes(dueMonth) ? 30 : 31
  return {
    year: p.year,
    quarter,
    start: `${p.year}-${pad(startMonth)}-01`,
    end: `${p.year}-${pad(endMonth)}-${endDay}`,
    due: `${dueYear}-${pad(dueMonth)}-${dueDay}`,
    label: `Q${quarter} ${p.year}`,
  }
}

/** Due date for a quarterly tax on wages paid on `payDate` ('YYYY-MM-DD'). */
export function quarterDueDate(payDate) {
  return quarterOf(payDate)?.due || ''
}

/** The four quarters of a calendar year, oldest first. */
export function quartersOfYear(year) {
  return [1, 2, 3, 4].map(q => quarterOf(`${year}-${pad((q - 1) * 3 + 1)}-15`))
}

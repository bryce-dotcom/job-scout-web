// Which payday covers a given pay period.
//
// Alayda flagged a contractor stub reading "Paid May 15, 2026" for a service
// period of May 1–15. Two things were wrong: you don't pay someone on the
// last day of the period they just worked, and a preview hasn't been paid at
// all. The stub was stamping pay_date = period end.
//
// HHH runs semi-monthly with paydays on the 20th and the 5th, so the period
// ending May 15 actually pays on May 20, and the period ending May 31 pays on
// June 5. This resolves the real payday from the configured schedule.
//
// All local-calendar math — never round-trips through UTC (same off-by-one
// class that inflated the EOS scorecard).

const localKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

const toDate = (v) => {
  if (v instanceof Date) return new Date(v.getFullYear(), v.getMonth(), v.getDate())
  const s = String(v || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

// Day-of-month clamped to the month's length (a "31st" payday in Feb -> 28/29).
function dayInMonth(year, monthIndex, day) {
  const last = new Date(year, monthIndex + 1, 0).getDate()
  return new Date(year, monthIndex, Math.min(day, last))
}

/**
 * The first scheduled payday strictly AFTER the period ends.
 * @param {string|Date} periodEnd
 * @param {object} config payroll_config ({ pay_frequency, pay_day_1, pay_day_2 })
 * @returns {string|null} YYYY-MM-DD
 */
export function payDateForPeriod(periodEnd, config = {}) {
  const end = toDate(periodEnd)
  if (!end) return null
  const freq = String(config.pay_frequency || 'semi-monthly').toLowerCase()

  if (freq === 'semi-monthly' || freq === 'monthly') {
    const d1 = parseInt(config.pay_day_1, 10) || 20
    const d2 = freq === 'monthly' ? null : (parseInt(config.pay_day_2, 10) || 5)
    const y = end.getFullYear(), m = end.getMonth()
    const candidates = []
    for (const monthOffset of [0, 1, 2]) {
      const yy = y + Math.floor((m + monthOffset) / 12)
      const mm = (m + monthOffset) % 12
      candidates.push(dayInMonth(yy, mm, d1))
      if (d2) candidates.push(dayInMonth(yy, mm, d2))
    }
    const next = candidates.filter((c) => c > end).sort((a, b) => a - b)[0]
    return next ? localKey(next) : null
  }

  // weekly / bi-weekly and anything else: paid a few days after the period
  // closes so timecards can be reviewed. 5 days is the common Sunday-close ->
  // Friday-pay gap.
  const d = new Date(end)
  d.setDate(d.getDate() + 5)
  return localKey(d)
}

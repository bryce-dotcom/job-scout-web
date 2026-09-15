// State unemployment insurance (SUI) — what the state assigns, where to find
// it, and what JobScout does while a company doesn't have it yet.
//
// No product can look an employer's SUI rate up. The state sets it from that
// employer's own claims history and mails it; Gusto, ADP and QuickBooks all
// ask you to type it in from the notice. So this file does what Gusto does,
// and no more:
//   - says exactly where the number is (notice, portal, previous provider);
//   - offers the state's new-employer rate as a TEMPORARY estimate so payroll
//     can run on day one — flagged everywhere it shows, and Form 33H refuses
//     to file on it;
//   - knows when the rate on file is last year's, so January is not a
//     surprise (the tax tables had exactly this problem, see payrollTax.js).
// The true-up that reconciles an estimate against the real rate lives in
// lib/suiTrueUp.js.
//
// Utah is the only state with verified figures. Anything else gets the
// generic guidance and no range check — a made-up range is worse than none.
// Sources (2026): Utah DWS Employer Advisor (0.1–7.1%, base $50,700, 74% of
// employers at the 0.1% minimum); Gusto's state table (Utah new-employer
// 1.4%; "enter the rate from your Contribution Rate Notice, box J").

export const SUI_STATES = {
  UT: {
    code: 'UT',
    name: 'Utah',
    agency: 'Utah Department of Workforce Services (DWS)',
    agencyShort: 'Utah DWS',
    wageBase: { 2025: 48900, 2026: 50700 },
    newEmployerRatePct: 1.4,
    rateRange: [0.1, 7.1],
    effectiveDay: 'January 1',
    notice: {
      name: 'Contribution Rate Notice',
      field: 'box J, "Assigned Contribution Rate"',
      when: 'mailed each December for the coming year',
    },
    portal: { label: 'jobs.utah.gov → Employer → Unemployment Insurance', url: 'https://jobs.utah.gov/ui/employer/employerhome.html' },
    accountFormat: 'C0123456-7',
    cautions: [
      'Enter the rate exactly as printed. Your assigned rate already includes the 0.3% social cost — do not add it.',
    ],
    facts: '74% of Utah employers pay the 0.1% minimum — $50.70 per employee per year in 2026.',
    dueDates: 'Quarterly, with the wage report: April 30, July 31, October 31 and January 31.',
  },
}

// Where a company that is switching providers will find the same number.
// Gusto's path is verified against its help center (14 Sep 2026); the
// others are described, not scripted, because their menus are not.
export const PROVIDER_PATHS = [
  { id: 'gusto', name: 'Gusto', path: 'Taxes & compliance → Tax setup → your state → Manage taxes → "Unemployment Tax Rate" (also called SUI rate or Experience rate). The account number is on the same screen.' },
  { id: 'quickbooks', name: 'QuickBooks Payroll', path: 'Payroll settings → your state\'s taxes — the field is called "SUI rate" or "State unemployment rate".' },
  { id: 'adp', name: 'ADP', path: 'Company tax settings → your state → "SUI rate" (RUN) — or ask your ADP rep for the "SUI experience rate".' },
]

export const SUI_SOURCES = {
  notice:   { label: 'From my rate notice',          detail: 'The assigned rate on the notice the state mailed.' },
  provider: { label: 'Copied from Gusto / my old payroll provider', detail: 'Same number the previous provider has been filing with.' },
  manual:   { label: 'Entered by hand',               detail: 'Typed in; origin not recorded.' },
  estimate: { label: 'Temporary estimate',            detail: 'The state\'s new-employer rate, until the notice arrives. Flagged everywhere; Form 33H waits for the real rate.' },
}

export function suiStateFor(stateCode) {
  return SUI_STATES[String(stateCode || '').toUpperCase()] || null
}

/** Wage base for a state and year; the latest known year when that year is not listed. */
export function suiWageBaseFor(stateCode, year) {
  const st = suiStateFor(stateCode)
  if (!st) return null
  if (st.wageBase[year] != null) return st.wageBase[year]
  const years = Object.keys(st.wageBase).map(Number).sort((a, b) => a - b)
  return st.wageBase[years[years.length - 1]] ?? null
}

/**
 * Validate a rate the user typed. Returns an error sentence or null.
 * Range-checked only where the state's range is known (Gusto does the same:
 * "we will not let you enter a rate because it's too low or too high").
 */
export function validateSuiRate(stateCode, ratePct) {
  const n = Number(ratePct)
  if (ratePct === '' || ratePct == null || !Number.isFinite(n)) return 'Enter the rate as a percentage, e.g. 0.1 or 1.4.'
  if (n < 0) return 'A rate cannot be negative.'
  if (n > 20) return `${n}% is not a rate any state assigns — a notice that says 0.001 means 0.1%.`
  const st = suiStateFor(stateCode)
  if (st?.rateRange) {
    const [lo, hi] = st.rateRange
    if (n < lo || n > hi) return `${st.name} assigns rates between ${lo}% and ${hi}%. ${n}% is outside that — check the notice (a decimal like 0.001 is 0.1%).`
  }
  return null
}

/**
 * The state of the rate on file, for banners, the Payroll Inbox and the
 * health check. Reads the rate IN FORCE today (history first, then the
 * companies row), so a next-year rate entered in December neither counts
 * yet nor reads as stale in January.
 *
 * @param {object} company  companies row (sui_rate_pct, sui_rate_source,
 *                          sui_rate_effective_date, state_employer_id_state)
 * @param {Date} [now]
 * @param {object[]} [history] company_sui_rates rows
 * @returns {{ level: 'ok'|'missing'|'estimate'|'stale', headline, detail, action, ratePct, source, effectiveDate }}
 */
export function suiRateStatus(company, now = new Date(), history = []) {
  const st = suiStateFor(company?.state_employer_id_state || 'UT')
  const agency = st?.agencyShort || 'your state unemployment agency'
  const noticeName = st?.notice?.name || 'rate notice'
  const year = now.getFullYear()
  const today = `${year}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const inForce = suiRateInForce(history, company, today)
  const rate = inForce.ratePct
  const effYear = inForce.effectiveDate ? Number(inForce.effectiveDate.slice(0, 4)) : null
  const base = { ratePct: rate, source: inForce.source, effectiveDate: inForce.effectiveDate }

  if (rate == null) {
    return {
      ...base,
      level: 'missing',
      headline: 'No state unemployment (SUI) rate on file — employer SUI is calculating at $0.',
      detail: `${agency} assigns your company its own rate and mails it as the ${noticeName}. ` +
        (st ? `If you don't have it yet, run payroll on ${st.name}'s new-employer rate (${st.newEmployerRatePct}%) as a temporary estimate and replace it when the notice arrives.`
            : `If you don't have it yet, enter a temporary estimate and replace it when the notice arrives.`),
      action: 'Enter your SUI rate',
    }
  }
  if (inForce.source === 'estimate') {
    return {
      ...base,
      level: 'estimate',
      headline: `Running on a temporary SUI estimate of ${rate}%${effYear ? ` since Jan 1, ${effYear}` : ''}.`,
      detail: `Enter the assigned rate from your ${noticeName}${st?.notice?.field ? ` (${st.notice.field})` : ''} and JobScout will true-up the quarter — the difference is booked as a liability or a credit, no paystub changes. Form 33H waits for the assigned rate.`,
      action: 'Enter the assigned rate',
    }
  }
  if (effYear && effYear < year) {
    return {
      ...base,
      level: 'stale',
      headline: `Your SUI rate on file (${rate}%) is ${effYear}'s.`,
      detail: `${agency} ${st?.notice?.when ? st.notice.when.replace(/^mailed/, 'mails the ' + noticeName) : `sends a new ${noticeName} each year`}; enter the ${year} rate so this year's quarters are right. Until then payroll keeps using ${effYear}'s.`,
      action: `Enter the ${year} rate`,
    }
  }
  return {
    ...base,
    level: 'ok',
    headline: `SUI rate on file: ${rate}%${effYear ? `, effective Jan 1, ${effYear}` : ''}${inForce.source && SUI_SOURCES[inForce.source] ? ` — ${SUI_SOURCES[inForce.source].label.toLowerCase()}` : ''}.`,
    detail: st?.notice?.when ? `A new ${noticeName} is ${st.notice.when}; enter it when it arrives.` : '',
    action: null,
  }
}

/**
 * The rate in force on a given date, from the history table — so December
 * payroll keeps last year's rate after next year's notice has been entered,
 * and a Q4 Form 33H rendered in February still uses Q4's rate.
 *
 * @param {object[]} history company_sui_rates rows {rate_pct, effective_date, source}
 * @param {object} company   the companies row, the fallback when no history row applies
 * @param {string} dateStr   'YYYY-MM-DD'
 * @returns {{ ratePct: number|null, source: string|null, effectiveDate: string|null }}
 */
export function suiRateInForce(history, company, dateStr) {
  const d = String(dateStr || '').slice(0, 10)
  const applicable = (history || [])
    .filter(r => r && r.rate_pct != null && String(r.effective_date || '').slice(0, 10) <= d)
    .sort((a, b) => String(b.effective_date).localeCompare(String(a.effective_date)) || (Number(b.id) - Number(a.id)))
  if (applicable.length) {
    const r = applicable[0]
    return { ratePct: Number(r.rate_pct), source: r.source || null, effectiveDate: String(r.effective_date).slice(0, 10) }
  }
  if (company?.sui_rate_pct != null && company.sui_rate_pct !== '') {
    return { ratePct: Number(company.sui_rate_pct), source: company.sui_rate_source || null, effectiveDate: company.sui_rate_effective_date ? String(company.sui_rate_effective_date).slice(0, 10) : null }
  }
  return { ratePct: null, source: null, effectiveDate: null }
}

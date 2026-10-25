/**
 * The days this company is closed.
 *
 * Bryce, 2026-10-25: "what about holidays.... where do we set the company
 * holidays should be in the payroll set up... and the company holidays should
 * show on the calendar"
 *
 * WHAT WAS ALREADY TRUE. The eight federal days below have been in effect the
 * whole time — repGoals.offDayReason() has used them since Cole's rep goals
 * shipped, so a routine already skips Thanksgiving and says why. And
 * offDayReason already read a `company_holidays` setting for the company's own
 * days. Nothing ever wrote that setting: a survey of every company on
 * 2026-10-25 found zero rows, because no screen in the app could set one. The
 * reader had been waiting for a writer.
 *
 * WHY THIS FILE EXISTS AT ALL. The rule lived inside repGoals.ts, which pulls
 * in arnieClosed.ts and a REST client — fine for an edge function, not
 * something to drag into the browser bundle so a calendar can colour a day.
 * So the rule moves here, repGoals.ts imports it, and the calendar imports the
 * same copy. One rule, two callers, nothing to drift — the arrangement
 * _shared/jobCostRules.ts already uses for lib/reports.js and frankieTools.ts.
 *
 * THE SETTING'S SHAPE, AND WHY IT DID NOT CHANGE. `company_holidays` is a JSON
 * array. The two entry shapes offDayReason already accepted still mean what
 * they meant:
 *
 *   "2026-12-24"                       a day off, unnamed
 *   {"date": "2026-12-24", "name": ...} a day off, named
 *
 * and one is added:
 *
 *   {"skip": "day_after_thanksgiving"} a federal day this company WORKS
 *
 * A skip entry carries no `date`, so the reader that shipped before this file
 * existed compares undefined against the day, finds nothing, and ignores it.
 * Old readers stay correct on new data, which is why this is one setting and
 * not two.
 *
 * WHY SKIPS EXIST. The eight days were hardcoded, so a company that works the
 * day after Thanksgiving had no way to say so — and plenty do. A list you
 * cannot edit is not your company's holidays. An empty skip list is exactly
 * the behaviour that was live before, so a company that changes nothing sees
 * no change.
 */

const ymd = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const nthWeekday = (y: number, m: number, wd: number, n: number) => {
  const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
  return 1 + ((wd - first + 7) % 7) + (n - 1) * 7
}
const lastWeekday = (y: number, m: number, wd: number) => {
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const last = new Date(Date.UTC(y, m - 1, days)).getUTCDay()
  return days - ((last - wd + 7) % 7)
}
/** A fixed-date holiday moved off a weekend, as offices observe it. */
const observed = (y: number, m: number, d: number) => {
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay()
  const t = Date.UTC(y, m - 1, d) + (wd === 6 ? -86400000 : wd === 0 ? 86400000 : 0)
  return new Date(t).toISOString().slice(0, 10)
}

export type HolidayDay = { key: string; date: string; name: string; custom: boolean }

/**
 * The federal days, in the order they fall, each with a STABLE key.
 *
 * The key is what a company stores when it opts out, so the choice survives
 * into next year — a date could not, since Thanksgiving moves and Christmas is
 * observed on a different weekday every year.
 *
 * `carry` marks the one entry that is not this year's holiday at all: New
 * Year's Day of the year AFTER this one, which lands on 31 December when 1
 * January is a Saturday. It belongs in a date lookup and does not belong in a
 * list of "this year's holidays", so the settings screen filters it out.
 */
export function usHolidayList(y: number): (HolidayDay & { carry?: boolean })[] {
  const thanks = nthWeekday(y, 11, 4, 4)
  return [
    { key: 'new_years', date: observed(y, 1, 1), name: "New Year's Day", custom: false },
    { key: 'memorial', date: ymd(y, 5, lastWeekday(y, 5, 1)), name: 'Memorial Day', custom: false },
    { key: 'independence', date: observed(y, 7, 4), name: 'Independence Day', custom: false },
    { key: 'labor', date: ymd(y, 9, nthWeekday(y, 9, 1, 1)), name: 'Labor Day', custom: false },
    { key: 'thanksgiving', date: ymd(y, 11, thanks), name: 'Thanksgiving', custom: false },
    { key: 'day_after_thanksgiving', date: ymd(y, 11, thanks + 1), name: 'the day after Thanksgiving', custom: false },
    { key: 'christmas', date: observed(y, 12, 25), name: 'Christmas', custom: false },
    { key: 'new_years', date: observed(y + 1, 1, 1), name: "New Year's Day", custom: false, carry: true },
  ]
}

/** The federal keys in calendar order, for a settings screen to list. */
export const US_HOLIDAY_KEYS = [
  'new_years', 'memorial', 'independence', 'labor',
  'thanksgiving', 'day_after_thanksgiving', 'christmas',
] as const

/**
 * US office holidays for a year (observed dates), name by day.
 *
 * Kept exactly as it was when it lived in repGoals.ts — same name, same shape,
 * same last-wins behaviour on a collision — because callers and tests depend
 * on it and this move was not the moment to change what it returns.
 */
export function usHolidays(y: number): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of usHolidayList(y)) out[h.date] = h.name
  return out
}

/**
 * The name as a label.
 *
 * The names are written to sit inside a sentence — a routine reports "Skipped
 * — the day after Thanksgiving." — so a calendar chip and a settings checkbox
 * need the capital that sentence form deliberately leaves off. One helper so
 * both screens spell it the same way.
 */
export const holidayTitle = (name: string): string => {
  const s = String(name || '').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : 'Holiday'
}

export type HolidayPlan = { added: { date: string; name: string }[]; skip: Set<string> }

/** A company that has set nothing: the eight federal days, no additions. */
export const emptyHolidayPlan = (): HolidayPlan => ({ added: [], skip: new Set<string>() })

/**
 * Read the `company_holidays` setting into something to ask questions of.
 *
 * Tolerant on purpose, and silent about it. This runs inside offDayReason,
 * where a malformed setting must not decide that a working Tuesday is a
 * holiday — and must not throw either, because the caller would then skip a
 * routine it should have run. Anything unrecognised is dropped.
 */
export function parseCompanyHolidays(raw: unknown): HolidayPlan {
  const plan = emptyHolidayPlan()
  let list: unknown = raw
  if (typeof raw === 'string') {
    if (!raw.trim()) return plan
    try { list = JSON.parse(raw) } catch { return plan }
  }
  if (!Array.isArray(list)) return plan
  for (const h of list) {
    if (typeof h === 'string') {
      const d = h.slice(0, 10)
      if (/^\d{4}-\d{2}-\d{2}$/.test(d)) plan.added.push({ date: d, name: 'a company holiday' })
      continue
    }
    if (!h || typeof h !== 'object') continue
    const row = h as Record<string, unknown>
    if (typeof row.skip === 'string' && row.skip) { plan.skip.add(row.skip); continue }
    const d = String(row.date || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue
    const name = String(row.name || '').trim()
    plan.added.push({ date: d, name: name || 'a company holiday' })
  }
  return plan
}

/** Turn a plan back into the setting's stored form. */
export function serializeHolidayPlan(plan: HolidayPlan): string {
  const out: unknown[] = []
  for (const key of plan.skip) out.push({ skip: key })
  for (const a of plan.added) out.push({ date: a.date, name: a.name })
  return JSON.stringify(out)
}

/**
 * Is this day a holiday for this company — and what is it called?
 *
 * A federal day the company has opted out of is not a holiday, and a day the
 * company added is, which is the whole point of the setting. Federal days are
 * checked first so a company's own entry cannot quietly rename Christmas.
 */
export function holidayOn(day: string, plan: HolidayPlan | null = null): HolidayDay | null {
  const p = plan || emptyHolidayPlan()
  const d = String(day || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null
  for (const h of usHolidayList(Number(d.slice(0, 4)))) {
    if (h.date === d && !p.skip.has(h.key)) return { key: h.key, date: d, name: h.name, custom: false }
  }
  for (const a of p.added) {
    if (a.date === d) return { key: `custom-${d}`, date: d, name: a.name, custom: true }
  }
  return null
}

/**
 * Every holiday between two day keys, inclusive — what the calendar draws.
 *
 * Years are walked rather than assumed to be one, so a window that straddles
 * 31 December still finds both New Year's entries.
 */
export function holidaysBetween(from: string, through: string, plan: HolidayPlan | null = null): HolidayDay[] {
  const p = plan || emptyHolidayPlan()
  const a = String(from || '').slice(0, 10)
  const b = String(through || '').slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(a) || !/^\d{4}-\d{2}-\d{2}$/.test(b) || b < a) return []

  const seen = new Set<string>()
  const out: HolidayDay[] = []
  for (let y = Number(a.slice(0, 4)); y <= Number(b.slice(0, 4)); y += 1) {
    for (const h of usHolidayList(y)) {
      if (h.date < a || h.date > b || p.skip.has(h.key) || seen.has(h.date)) continue
      seen.add(h.date)
      out.push({ key: h.key, date: h.date, name: h.name, custom: false })
    }
  }
  for (const c of p.added) {
    if (c.date < a || c.date > b || seen.has(c.date)) continue
    seen.add(c.date)
    out.push({ key: `custom-${c.date}`, date: c.date, name: c.name, custom: true })
  }
  return out.sort((x, y) => x.date.localeCompare(y.date))
}

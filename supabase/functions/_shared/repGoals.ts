// A sales lead's daily goals for his reps, and the day's numbers against them.
//
// Cole's morning huddle sets the goals ("or same as yesterday"); his 4pm
// follow-up holds JobScout's numbers up against them. Three numbers, each with
// ONE definition, reused rather than reinvented:
//
//  • estimates created — estimates whose salesperson is the rep, created that
//    day (any status: a draft written today is still today's work).
//  • meetings attended — the rep's SALES meetings on the calendar that day
//    that have started. JobScout records no attendance (every appointment's
//    status still reads Scheduled and outcome is empty on the live tenant), so
//    this says exactly that; one marked cancelled or no-show drops out.
//  • estimates won — the Closed rule (arnieClosed.ts / salesFunnel.js):
//    approved or became a job, dated job → approval → estimate. Dated by the
//    LOCAL day, not the UTC slice, so a 7pm sale is not filed under tomorrow.
//
// Workdays: Mon–Fri, minus US holidays (observed) and any the company adds,
// minus the person's approved time off. Used by the routine runner too.

// deno-lint-ignore-file no-explicit-any
import { closeDateOf } from './arnieClosed.ts'
import { emptyHolidayPlan, holidayOn, parseCompanyHolidays } from './holidays.ts'

// The holiday rule moved to _shared/holidays.ts so the company calendar could
// import the same copy instead of the browser growing a twin of it. Still
// re-exported here because callers and tests have always asked repGoals for
// usHolidays, and a move is not a reason to break them.
export { usHolidays, usHolidayList, holidaysBetween, serializeHolidayPlan, US_HOLIDAY_KEYS } from './holidays.ts'

type R = { url: string; key: string }
const H = (r: R) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })
async function rows(r: R, path: string): Promise<any[]> {
  const res = await fetch(`${r.url}/rest/v1/${path}`, { headers: H(r) })
  if (!res.ok) throw new Error(`${path.split('?')[0]}: ${res.status} ${(await res.text()).slice(0, 160)}`)
  return await res.json()
}

export const GOAL_KEYS = ['estimates_created', 'meetings_attended', 'estimates_won'] as const

// ── days ────────────────────────────────────────────────────────────────
/** The calendar day an instant falls on in a zone, YYYY-MM-DD. */
export function localDay(at: string | Date, tz: string): string {
  const d = typeof at === 'string' ? new Date(at.length === 10 ? `${at}T12:00:00Z` : at) : at
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

/**
 * The calendar day a stored value MEANS. A bare date, or a timestamp at
 * exactly midnight UTC (how a date typed into a form is stored), is the day it
 * names — converting it to Utah time would file it under the evening before,
 * the very slip that misfiled every 1st-of-month row in Books. Anything else
 * is a real instant, read in the zone.
 */
export function calendarDayOf(v: string, tz: string): string {
  const s = String(v)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  if (/^\d{4}-\d{2}-\d{2}[T ]00:00:00(\.0+)?(Z|\+00(:?00)?)$/.test(s)) return s.slice(0, 10)
  return localDay(s, tz)
}

/** The UTC instant at which a local calendar day begins in a zone. */
export function dayStartUtc(day: string, tz: string): Date {
  // Start from UTC midnight and correct by the zone's offset at that moment,
  // twice, so a DST change on the day itself settles.
  let t = Date.parse(`${day}T00:00:00Z`)
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz || 'UTC', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(new Date(t))
    const g = (k: string) => Number(parts.find((p) => p.type === k)?.value)
    const asLocal = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'))
    t += Date.parse(`${day}T00:00:00Z`) - asLocal
  }
  return new Date(t)
}



/**
 * Why this person is not working this day — or null if it is a workday.
 *
 * The company shapes this through the `company_holidays` setting, edited in
 * HR & Payroll Settings: a JSON list of "YYYY-MM-DD" or {"date","name"} for
 * its own days off, plus {"skip":"<key>"} for a federal day it works.
 * _shared/holidays.ts holds the rule and the key names.
 */
export async function offDayReason(r: R, companyId: number, employeeId: number | null, day: string): Promise<string | null> {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay()
  if (wd === 0 || wd === 6) return 'the weekend'
  // The company list is read BEFORE the federal days are judged, because it
  // is what says which federal days this company actually keeps. A failed or
  // malformed read leaves the plan empty, which is exactly the behaviour that
  // was live before the setting could be edited: all eight days observed.
  let plan = emptyHolidayPlan()
  try {
    const s = await rows(r, `settings?select=value&company_id=eq.${companyId}&key=eq.company_holidays&limit=1`)
    plan = parseCompanyHolidays(s[0]?.value)
  } catch { /* a malformed setting is not a reason to skip a workday */ }
  const holiday = holidayOn(day, plan)
  if (holiday) return holiday.name
  if (employeeId != null) {
    try {
      const off = await rows(r, `time_off_requests?select=id&company_id=eq.${companyId}&employee_id=eq.${employeeId}&status=eq.approved&start_date=lte.${day}&end_date=gte.${day}&limit=1`)
      if (off.length) return 'approved time off'
    } catch { /* unknown is not off */ }
  }
  return null
}

// ── who the lead tracks ─────────────────────────────────────────────────
export async function boardFor(r: R, companyId: number, ownerId: number): Promise<{ id: number; name: string }[]> {
  const b = await rows(r, `rep_goal_boards?select=rep_ids&company_id=eq.${companyId}&owner_employee_id=eq.${ownerId}&limit=1`)
  const ids: number[] = (b[0]?.rep_ids || []).map(Number).filter(Number.isFinite)
  if (!ids.length) return []
  const emps = await rows(r, `employees?select=id,name&company_id=eq.${companyId}&id=in.(${ids.join(',')})`)
  // In the order the lead set them.
  return ids.map((id) => emps.find((e: any) => Number(e.id) === id)).filter(Boolean).map((e: any) => ({ id: Number(e.id), name: String(e.name || '').trim() }))
}

/** Which of the board's reps a spoken name means — or why it is not clear. */
export function matchRep(reps: { id: number; name: string }[], said: unknown): { id?: number; name?: string; problem?: string } {
  const s = String(said ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!s) return { problem: 'no name given' }
  if (/^\d+$/.test(s)) { const r = reps.find((x) => x.id === Number(s)); return r ? r : { problem: `no rep with id ${s}` } }
  const norm = (n: string) => n.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()
  const exact = reps.filter((x) => norm(x.name) === s)
  if (exact.length === 1) return exact[0]
  const [first, ...rest] = s.split(' ')
  const lastBit = rest.join(' ')
  const cands = reps.filter((x) => {
    const [f, ...l] = norm(x.name).split(' ')
    const last = l.join(' ')
    // "noah f", "noah free", "doug", "christopher"
    return f === first && (!lastBit || last.startsWith(lastBit))
  })
  if (cands.length === 1) return cands[0]
  if (cands.length > 1) return { problem: `"${said}" could be ${cands.map((c) => c.name).join(' or ')}` }
  return { problem: `"${said}" is not one of ${reps.map((x) => x.name).join(', ')}` }
}

// ── setting goals ───────────────────────────────────────────────────────
const n = (v: unknown) => (v === null || v === undefined || v === '' ? undefined : Math.max(0, Math.round(Number(v))))

export async function setGoals(r: R, companyId: number, setBy: number, day: string, input: { same_as_last?: boolean; all?: any; goals?: any[] }) {
  const reps = await boardFor(r, companyId, setBy)
  if (!reps.length) return { error: 'No reps are set up to track for you yet.' }
  const ids = reps.map((x) => x.id)
  const existing = await rows(r, `rep_daily_goals?select=rep_employee_id,estimates_created,meetings_attended,estimates_won&company_id=eq.${companyId}&goal_date=eq.${day}&rep_employee_id=in.(${ids.join(',')})`)
  const next = new Map<number, any>(reps.map((x) => [x.id, { ...(existing.find((e: any) => Number(e.rep_employee_id) === x.id) || {}) }]))

  let copiedFrom: string | null = null
  if (input.same_as_last) {
    // The last day that HAD goals — Friday's on a Monday, not Sunday's nothing.
    const prev = await rows(r, `rep_daily_goals?select=goal_date&company_id=eq.${companyId}&goal_date=lt.${day}&rep_employee_id=in.(${ids.join(',')})&order=goal_date.desc&limit=1`)
    copiedFrom = prev[0]?.goal_date || null
    if (!copiedFrom) return { error: 'There are no earlier goals to copy — give me the numbers this time.' }
    const from = await rows(r, `rep_daily_goals?select=rep_employee_id,estimates_created,meetings_attended,estimates_won&company_id=eq.${companyId}&goal_date=eq.${copiedFrom}&rep_employee_id=in.(${ids.join(',')})`)
    for (const f of from) {
      const t = next.get(Number(f.rep_employee_id)); if (!t) continue
      for (const k of GOAL_KEYS) if (f[k] != null) t[k] = f[k]
    }
  }
  if (input.all && typeof input.all === 'object') {
    for (const t of next.values()) for (const k of GOAL_KEYS) { const v = n(input.all[k]); if (v !== undefined) t[k] = v }
  }
  const problems: string[] = []
  for (const g of Array.isArray(input.goals) ? input.goals : []) {
    const m = matchRep(reps, g?.rep)
    if (!m.id) { problems.push(m.problem || 'unclear rep'); continue }
    const t = next.get(m.id)!
    for (const k of GOAL_KEYS) { const v = n(g[k]); if (v !== undefined) t[k] = v }
  }
  if (problems.length) return { error: `Nothing saved — ${problems.join('; ')}. Ask which they meant.` }

  const payload = reps.map((x) => {
    const t = next.get(x.id) || {}
    return {
      company_id: companyId, rep_employee_id: x.id, goal_date: day, set_by_employee_id: setBy, updated_at: new Date().toISOString(),
      estimates_created: t.estimates_created ?? null, meetings_attended: t.meetings_attended ?? null, estimates_won: t.estimates_won ?? null,
    }
  }).filter((p) => GOAL_KEYS.some((k) => p[k] != null))
  if (!payload.length) return { error: 'No numbers were given — nothing saved.' }
  const res = await fetch(`${r.url}/rest/v1/rep_daily_goals?on_conflict=company_id,rep_employee_id,goal_date`, {
    method: 'POST', headers: { ...H(r), Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(payload),
  })
  if (!res.ok) return { error: `could not save the goals (${res.status})` }
  return {
    saved: true, day, ...(copiedFrom ? { copied_from: copiedFrom } : {}),
    goals: payload.map((p) => ({ rep: reps.find((x) => x.id === p.rep_employee_id)?.name, estimates_created: p.estimates_created, meetings_attended: p.meetings_attended, estimates_won: p.estimates_won })),
  }
}

// ── the scoreboard ──────────────────────────────────────────────────────
const NOT_SALES = new Set(['job', 'recurring job', 'block'])
const DROPPED = /cancel|no.?show|missed|resched/i

export async function scoreboard(r: R, companyId: number, ownerId: number, day: string, tz: string, now = new Date()) {
  const reps = await boardFor(r, companyId, ownerId)
  if (!reps.length) return { error: 'No reps are set up to track for you yet.' }
  const ids = reps.map((x) => x.id)
  const from = dayStartUtc(day, tz).toISOString()
  const nextDay = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
  const to = dayStartUtc(nextDay, tz).toISOString()
  const until = new Date(Math.min(now.getTime(), Date.parse(to))).toISOString()

  const QF = 'id,salesperson_id,status,approved_date,created_at,job_id'
  const [goals, created, meetings, jobsToday, approvedToday] = await Promise.all([
    rows(r, `rep_daily_goals?select=rep_employee_id,estimates_created,meetings_attended,estimates_won&company_id=eq.${companyId}&goal_date=eq.${day}&rep_employee_id=in.(${ids.join(',')})`),
    rows(r, `quotes?select=${QF}&company_id=eq.${companyId}&salesperson_id=in.(${ids.join(',')})&created_at=gte.${from}&created_at=lt.${to}&limit=5000`),
    rows(r, `appointments?select=id,salesperson_id,salesperson_ids,appointment_type,status,outcome&company_id=eq.${companyId}&start_time=gte.${from}&start_time=lt.${until}&or=(salesperson_id.in.(${ids.join(',')}),salesperson_ids.ov.{${ids.join(',')}})&limit=5000`),
    rows(r, `jobs?select=quote_id&company_id=eq.${companyId}&quote_id=not.is.null&created_at=gte.${from}&created_at=lt.${to}&limit=5000`),
    // A typed approval date is stored as midnight UTC; a stamped one is a real
    // instant. Read both windows; wonOn() decides which day each one is.
    rows(r, `quotes?select=${QF}&company_id=eq.${companyId}&salesperson_id=in.(${ids.join(',')})&or=(and(approved_date.gte.${day}T00:00:00Z,approved_date.lt.${nextDay}T00:00:00Z),and(approved_date.gte.${from},approved_date.lt.${to}))&limit=5000`),
  ])
  // Only estimates that COULD have closed today are read in full — a job made
  // today, approved today, or written today and approved. Reading every won
  // estimate these reps ever had would pass 5,000 rows (Christopher alone owns
  // thousands of jobs) and silently drop some. The Closed rule then decides.
  const viaJob = [...new Set(jobsToday.map((j: any) => j.quote_id))]
  const viaJobQuotes: any[] = []
  for (let i = 0; i < viaJob.length; i += 200) {
    viaJobQuotes.push(...await rows(r, `quotes?select=${QF}&company_id=eq.${companyId}&salesperson_id=in.(${ids.join(',')})&id=in.(${viaJob.slice(i, i + 200).join(',')})`))
  }
  const cand = new Map<string, any>()
  for (const q of [...viaJobQuotes, ...approvedToday, ...created.filter((q: any) => q.status === 'Approved' || q.job_id != null)]) cand.set(String(q.id), q)
  const wonQuotes = [...cand.values()]
  // Won is dated by the job made from it first, exactly as Closed is.
  const jobs: any[] = []
  const qids = wonQuotes.map((q: any) => q.id)
  for (let i = 0; i < qids.length; i += 200) {
    jobs.push(...await rows(r, `jobs?select=quote_id,created_at&company_id=eq.${companyId}&quote_id=in.(${qids.slice(i, i + 200).join(',')})&limit=5000`))
  }
  const jobFor = new Map(jobs.map((j: any) => [String(j.quote_id), j]))
  const wonOn = (q: any) => {
    const job = jobFor.get(String(q.id))
    const when = closeDateOf(q, job)
    if (!when) return null
    return calendarDayOf(String(when), tz)
  }

  const board = reps.map((rep) => {
    const g = goals.find((x: any) => Number(x.rep_employee_id) === rep.id) || {}
    const mine = (a: any) => Number(a.salesperson_id) === rep.id || (Array.isArray(a.salesperson_ids) && a.salesperson_ids.map(Number).includes(rep.id))
    const actual = {
      estimates_created: created.filter((q: any) => Number(q.salesperson_id) === rep.id).length,
      meetings_attended: meetings.filter((a: any) => mine(a)
        && !NOT_SALES.has(String(a.appointment_type || '').toLowerCase())
        && !DROPPED.test(`${a.status || ''} ${a.outcome || ''}`)).length,
      estimates_won: wonQuotes.filter((q: any) => Number(q.salesperson_id) === rep.id && wonOn(q) === day).length,
    }
    const goal = { estimates_created: g.estimates_created ?? null, meetings_attended: g.meetings_attended ?? null, estimates_won: g.estimates_won ?? null }
    return { rep: rep.name, goal, actual, hit: Object.fromEntries(GOAL_KEYS.map((k) => [k, goal[k] == null ? null : actual[k] >= goal[k]])) }
  })
  return {
    day,
    goals_set: goals.length > 0,
    board,
    means: {
      estimates_created: 'estimates with that rep as salesperson, created today (any status)',
      meetings_attended: 'that rep\'s sales meetings on the calendar today that have started — JobScout does not record attendance, so a no-show counts unless it is marked cancelled or no-show',
      estimates_won: 'estimates approved or turned into a job today, credited to the estimate\'s salesperson — the same rule as Closed',
    },
  }
}

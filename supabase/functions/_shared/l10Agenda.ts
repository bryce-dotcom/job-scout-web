// The L10 itinerary — ONE definition, four renderers.
//
// Bryce, 2026-10-05: "I want him to be able to create an itinerary for a
// meeting, be able to print it or send it through email or app."
//
// A Level 10 agenda is not free-form: EOS fixes the sections and their minutes,
// and the whole point is that it is identical every week. So the document is a
// DERIVATION of what is already on the EOS page — the scorecard, this quarter's
// rocks, the open issues, the outstanding to-dos, and who owns each — not
// something anybody types. Which makes it precisely the thing that gets written
// four times and drifts: once for the screen, once for the PDF, once for the
// email, once for Arnie. It lives here, in _shared, because the edge function
// cannot import from src/ but the browser can import from here (the pattern
// auditAreaLine.ts / bidFit.ts already use; src/lib/l10Agenda.js is the shim).
//
// Rendered by:
//   • src/pages/admin/EOS.jsx    — the preview and the Send button
//   • src/lib/l10AgendaPdf.js    — the printed copy
//   • src/lib/l10AgendaEmail.js  — the emailed copy (also the in-app message)
//   • _shared/arnieEos.ts        — Arnie's card, and what he sends
//
// The one thing that differs by surface is the NUMBERS. The scorecard's
// automatic metrics are computed in the browser from the loaded store
// (AUTO_SOURCES in EOS.jsx — 19 of them on HHH, each its own money rule) and an
// edge function cannot run that without a second copy of all twelve, which is
// the duplication this file exists to prevent. So numbers are OPTIONAL: pass
// them when you have them (the page does), leave them out and each row prints a
// blank for the owner to fill in as they read it, which is how a paper L10
// agenda has always worked. `numbers_included` says which document this is, so
// no renderer has to imply a figure it does not have.

// deno-lint-ignore-file no-explicit-any

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

/** The fixed EOS shape. The minutes are the book's, and they add to 90. */
export const L10_SECTIONS = [
  { key: 'segue', title: 'Segue', minutes: 5 },
  { key: 'scorecard', title: 'Scorecard', minutes: 5 },
  { key: 'rocks', title: 'Rock Review', minutes: 5 },
  { key: 'headlines', title: 'Customer & Employee Headlines', minutes: 5 },
  { key: 'todos', title: 'To-Do List', minutes: 5 },
  { key: 'ids', title: 'IDS — Identify, Discuss, Solve', minutes: 60 },
  { key: 'conclude', title: 'Conclude', minutes: 5 },
] as const

export const L10_MINUTES = L10_SECTIONS.reduce((s, x) => s + x.minutes, 0)

/** How many issues one meeting can honestly get through in 60 minutes. */
const IDS_CAP = 10

const str = (v: unknown) => (v == null ? '' : String(v)).trim()

// '' must not become 0. A scorecard goal is stored as text and several HHH
// metrics have never had one typed, so Number('') === 0 printed "New Leads —
// at or over 0", a target every week meets. No goal is no goal.
const num = (v: unknown): number | null => {
  if (v === '' || v == null) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

// Dates here are calendar days, never instants — the rule in
// src/lib/localDate.js, which cannot be imported into the Deno runtime. These
// two mirror localDateStr/parseLocalDate for the cases this file meets (a bare
// 'YYYY-MM-DD', and a day stored as UTC midnight, which is what PostgREST hands
// back for a date column). src/lib/l10Agenda.test.js asserts the two agree; if
// that test fails, localDate is right and this is wrong.
export function dayStr(d: Date): string {
  if (!(d instanceof Date) || isNaN(d.getTime())) return ''
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
export function parseDay(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string') return null
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ]00:00:00(?:\.0+)?(?:Z|\+00(?::?00)?))?$/.exec(value.trim())
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(value)
  return isNaN(d.getTime()) ? null : d
}
export const calDay = (v: unknown) => dayStr(parseDay(v) as Date)

/**
 * The next occurrence of the team's L10, at the time they set it. Today counts:
 * a Monday 08:30 meeting asked about on Monday morning is this morning's
 * meeting, not next week's.
 */
export function nextMeetingDay(meetings: any, now: Date = new Date()): string {
  const want = DAYS.indexOf(str(meetings?.l10_day))
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  if (want < 0) return dayStr(today)
  today.setDate(today.getDate() + ((want - today.getDay() + 7) % 7))
  return dayStr(today)
}

/** "Monday 5 October, 8:30 AM" — an unset time is left off, never invented. */
export function meetingWhenLabel(day: unknown, time: unknown): string {
  const d = parseDay(day)
  const date = d ? `${DAYS[d.getDay()]} ${d.getDate()} ${d.toLocaleString('en-US', { month: 'long' })}` : str(day)
  const t = str(time)
  if (!t) return date
  const [h, m] = t.split(':').map(Number)
  const hour = ((h + 11) % 12) + 1
  return `${date}, ${hour}:${String(m || 0).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}

const quarterOf = (d: Date) => Math.ceil((d.getMonth() + 1) / 3)

export interface AgendaRow { [k: string]: any }
export interface AgendaSection { key: string; title: string; minutes: number; note?: string; rows?: AgendaRow[] }
export interface Agenda {
  title: string
  meeting_on: string
  when_label: string
  minutes: number
  quarter: string
  entity: string | null
  numbers_included: boolean
  attendees: { employee_id: any; name: string; email: string | null; why: string }[]
  sections: AgendaSection[]
  counts: Record<string, number>
  gaps: string[]
}

export function buildL10Agenda(o: {
  eos?: any
  employees?: any[]
  now?: Date
  day?: string | null
  numbers?: Record<string, { thisWeek?: unknown; lastWeek?: unknown; label?: string }> | null
  entity?: string | null
} = {}): Agenda {
  const eos = o.eos || {}
  const employees = o.employees || []
  const now = o.now || new Date()
  const entity = o.entity || null
  const numbers = o.numbers || null

  const meetings = eos.meetings || {}
  const people = new Map(employees.map((e: any) => [String(e.id), e]))
  const nameOf = (id: unknown) => people.get(String(id))?.name || null
  const inEntity = (v: unknown) => !entity || !str(v) || str(v).toLowerCase() === entity.toLowerCase()

  const meetingDay = str(o.day) || nextMeetingDay(meetings, now)
  const asked = parseDay(meetingDay) || now
  const quarter = quarterOf(asked)
  const year = asked.getFullYear()

  // ── Scorecard: every metric with its owner and goal, grouped by owner so one
  //    person reads their whole block at once.
  const metrics = (eos.scorecard || []).filter((m: any) => inEntity(m.entity)).map((m: any) => {
    const n = numbers?.[m.id] || null
    const goal = num(m.goal)
    const value = n ? num(n.thisWeek) : null
    return {
      // The id travels with the row so a caller that HAS numbers can post them
      // back keyed the way the scorecard keys them (the EOS page's Send does).
      id: m.id ?? null,
      metric: str(m.metric) || 'Untitled metric',
      owner: nameOf(m.owner_id),
      goal,
      direction: m.type === 'lte' ? 'at or under' : 'at or over',
      entity: str(m.entity) || null,
      value,
      previous: n ? num(n.lastWeek) : null,
      format: n?.label || null,
      on_goal: value == null || goal == null ? null : (m.type === 'lte' ? value <= goal : value >= goal),
    }
    // Owner first, and a metric with NOBODY on it sorts last rather than
    // first: the scorecard is read person by person, and an unowned row at the
    // top reads like a bug. It is still on the page, and `gaps` counts it.
  }).sort((a: any, b: any) => (a.owner ? str(a.owner) : '￿').localeCompare(b.owner ? str(b.owner) : '￿') || a.metric.localeCompare(b.metric))

  // ── Rocks: this quarter only, off-track first — that is the review order.
  const RANK: Record<string, number> = { 'off-track': 0, 'at-risk': 1, 'on-track': 2, done: 3 }
  const rocks = (eos.rocks || [])
    .filter((r: any) => Number(r.quarter) === quarter && Number(r.year) === year && inEntity(r.business_unit))
    .map((r: any) => ({ title: str(r.title), owner: nameOf(r.owner_id), status: str(r.status) || 'on-track', due: calDay(r.due_date) || null, entity: str(r.business_unit) || null }))
    .sort((a: any, b: any) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || a.title.localeCompare(b.title))

  // ── To-Dos: a to-do is a 7-day promise, so the overdue ones lead.
  const todayStr = dayStr(new Date(now.getFullYear(), now.getMonth(), now.getDate()))
  const todos = (eos.todos || []).filter((t: any) => !t.done).map((t: any) => {
    const due = calDay(t.due_date) || null
    return { text: str(t.text), owner: nameOf(t.owner_id), due, overdue: !!due && due < todayStr, from_issue: !!t.source_issue_id }
  }).sort((a: any, b: any) => (Number(b.overdue) - Number(a.overdue)) || str(a.due).localeCompare(str(b.due)))

  // ── IDS: open issues, worst first. Capped, because an agenda listing 22
  //    issues against a 60-minute slot is a wish, not a plan.
  const PRI: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const openIssues = (eos.issues || []).filter((i: any) => !i.resolved).map((i: any) => ({
    title: str(i.title),
    priority: str(i.priority) || 'medium',
    kind: str(i.type) === 'long' ? 'long term' : 'short term',
    owners: (i.owner_ids || []).map(nameOf).filter(Boolean),
    raised: calDay(i.created_at) || null,
  })).sort((a: any, b: any) => (PRI[a.priority] ?? 9) - (PRI[b.priority] ?? 9) || str(a.raised).localeCompare(str(b.raised)))
  const issues = openIssues.slice(0, IDS_CAP)

  // ── Who should be in the room: everyone this agenda asks something of, plus
  //    the seats on the accountability chart — each with the reason, so nobody
  //    wonders why they were invited.
  const why = new Map<string, { employee_id: any; name: string; email: string | null; why: Set<string> }>()
  const add = (id: unknown, reason: string) => {
    const p = people.get(String(id)); if (!p) return
    const k = String(p.id)
    if (!why.has(k)) why.set(k, { employee_id: p.id, name: p.name, email: str(p.email) || null, why: new Set() })
    why.get(k)!.why.add(reason)
  }
  for (const m of eos.scorecard || []) if (inEntity(m.entity)) add(m.owner_id, 'a scorecard number')
  for (const r of eos.rocks || []) if (Number(r.quarter) === quarter && Number(r.year) === year && inEntity(r.business_unit)) add(r.owner_id, 'a rock')
  for (const t of eos.todos || []) if (!t.done) add(t.owner_id, 'a to-do')
  for (const s of eos.accountability || []) add(s.person_id, `the ${str(s.seat) || 'leadership'} seat`)
  const attendees = [...why.values()].map((a) => ({ ...a, why: [...a.why].join(', ') })).sort((a, b) => str(a.name).localeCompare(str(b.name)))

  const noGoal = metrics.filter((m: any) => m.goal == null).length
  const noOwner = metrics.filter((m: any) => !m.owner).length

  const sections: AgendaSection[] = L10_SECTIONS.map((s) => {
    if (s.key === 'segue') return { ...s, note: 'Good news, personal and professional — one each, everybody.' }
    if (s.key === 'scorecard') return { ...s, note: numbers ? 'Last completed week against goal. An off-goal number becomes an issue; it is not discussed here.' : 'Fill in last week against goal. An off-goal number becomes an issue; it is not discussed here.', rows: metrics }
    if (s.key === 'rocks') return { ...s, note: 'On track or off track only. An off-track rock becomes an issue.', rows: rocks }
    if (s.key === 'headlines') return { ...s, note: 'One line each: a customer worth mentioning, a person worth mentioning. Not stored anywhere — bring them.' }
    if (s.key === 'todos') return { ...s, note: 'Done or not done. Not done twice becomes an issue.', rows: todos }
    if (s.key === 'ids') return { ...s, note: `Pick the top three and solve them.${openIssues.length > issues.length ? ` ${openIssues.length} open, the worst ${issues.length} listed.` : ''}`, rows: issues }
    return { ...s, note: 'Recap the to-dos, agree the cascading message, rate the meeting 1-10.' }
  })

  return {
    title: 'Level 10 Meeting',
    meeting_on: meetingDay,
    when_label: meetingWhenLabel(meetingDay, meetings.l10_time),
    minutes: L10_MINUTES,
    quarter: `Q${quarter} ${year}`,
    entity,
    numbers_included: !!numbers,
    attendees,
    sections,
    counts: {
      metrics: metrics.length,
      metrics_without_goal: noGoal,
      metrics_without_owner: noOwner,
      rocks: rocks.length,
      rocks_off_track: rocks.filter((r: any) => r.status === 'off-track' || r.status === 'at-risk').length,
      issues_open: openIssues.length,
      todos_open: todos.length,
      todos_overdue: todos.filter((t: any) => t.overdue).length,
    },
    // What the team has not set up. An agenda that quietly omits the scorecard
    // because nobody built one is worse than one that says so.
    gaps: [
      !str(meetings.l10_day) && 'no L10 day is set on the EOS page, so this is dated today',
      !metrics.length && 'the scorecard has no metrics',
      !rocks.length && `no rocks are set for Q${quarter}`,
      noGoal > 0 && `${noGoal} scorecard ${noGoal === 1 ? 'metric has' : 'metrics have'} no goal, so ${noGoal === 1 ? 'it cannot' : 'they cannot'} be graded`,
      noOwner > 0 && `${noOwner} scorecard ${noOwner === 1 ? 'metric has' : 'metrics have'} nobody on ${noOwner === 1 ? 'it' : 'them'}`,
      !(eos.accountability || []).length && 'the accountability chart is empty',
    ].filter(Boolean) as string[],
  }
}

/** One line per section, for a card, a chat reply or a subject line. */
export function agendaSummaryLines(agenda: Agenda): string[] {
  return agenda.sections.map((s) => `${s.minutes} min — ${s.title}${s.rows ? ` (${s.rows.length})` : ''}`)
}

/** The EOS settings keys, so every reader asks for the same ones. */
export const EOS_SETTING_KEYS: Record<string, string> = {
  meetings: 'eos_meeting_cadences',
  scorecard: 'eos_scorecard',
  rocks: 'eos_rocks',
  issues: 'eos_issues',
  todos: 'eos_todos',
  accountability: 'eos_accountability_chart',
  core_values: 'eos_core_values',
  core_focus: 'eos_core_focus',
  ten_year: 'eos_ten_year_target',
  one_year: 'eos_one_year_plan',
  three_year: 'eos_three_year_picture',
}

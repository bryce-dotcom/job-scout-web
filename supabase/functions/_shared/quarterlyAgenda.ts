// The Quarterly and Annual sessions — the OTHER two EOS meetings.
//
// Why this exists: on 2026-10-06 Bryce asked Arnie for "an itinerary for our
// fourth-quarter meeting, Saturday and Sunday", pushed back with "follow the
// EOS model" — and got a document with a scorecard on it that did not exist.
// "Weekly revenue, goal $50K, owner London Miller" against a real scorecard of
// 19 metrics, mostly Doug's, of which only five have a goal typed at all.
//
// It invented that because the only rail that existed built the WEEKLY L10, so
// there was nothing to call and the model wrote prose from general EOS
// knowledge. The fix is not a better prompt: it is a second shape, fed by the
// same data as the L10, so there is a rail to take.
//
// The agenda shapes are the book's. What goes IN them is this company's own
// rocks, scorecard, issues, V/TO and seats — and where a thing is not set up,
// the session says so and gives the time to setting it, which is precisely
// what a quarterly is for.

// deno-lint-ignore-file no-explicit-any
import { calDay, dayStr, parseDay } from './l10Agenda.ts'

type Any = any
const str = (v: unknown) => (v == null ? '' : String(v)).trim()
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export type SessionType = 'quarterly' | 'annual'

export interface SessionSection {
  key: string
  title: string
  minutes: number
  note?: string
  rows?: Any[]
  /** Filled in by the scheduler when day windows are given. */
  day?: number
  startMin?: number
  start?: string
  end?: string
}

/**
 * The Quarterly Pulsing Meeting. Eight and a half hours of content; the
 * scheduler lays it across whatever days it is given and puts the breaks in.
 */
export const QUARTERLY_SHAPE = [
  { key: 'segue', title: 'Segue', minutes: 60 },
  { key: 'review_quarter', title: 'Review the Quarter', minutes: 60 },
  { key: 'vto', title: 'Review the V/TO', minutes: 90 },
  { key: 'set_rocks', title: "Set Next Quarter's Rocks", minutes: 120 },
  { key: 'issues', title: 'Tackle Key Issues (IDS)', minutes: 150 },
  { key: 'next_steps', title: 'Next Steps', minutes: 15 },
  { key: 'conclude', title: 'Conclude', minutes: 15 },
] as const

/** The Annual. Two days, and the first one is about the people and the vision. */
export const ANNUAL_SHAPE = [
  { key: 'segue', title: 'Segue', minutes: 60 },
  { key: 'review_year', title: 'Review the Year', minutes: 90 },
  { key: 'team_health', title: 'Team Health', minutes: 120 },
  { key: 'vto', title: 'Review the V/TO — vision half', minutes: 180 },
  { key: 'one_year', title: 'Build the 1-Year Plan', minutes: 150 },
  { key: 'set_rocks', title: "Set Next Quarter's Rocks", minutes: 120 },
  { key: 'issues', title: 'Tackle Key Issues (IDS)', minutes: 120 },
  { key: 'next_steps', title: 'Next Steps', minutes: 15 },
  { key: 'conclude', title: 'Conclude', minutes: 15 },
] as const

export const SHAPES = { quarterly: QUARTERLY_SHAPE, annual: ANNUAL_SHAPE }

const hhmm = (mins: number) => {
  const h = Math.floor(mins / 60) % 24
  const m = mins % 60
  const hour = ((h + 11) % 12) + 1
  return `${hour}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`
}
const toMins = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})/.exec(str(t))
  return m ? Number(m[1]) * 60 + Number(m[2]) : 8 * 60
}

export interface DayWindow { date: string; start?: string; end?: string }

/**
 * Lay the sections across the day windows given, inserting a 15-minute break
 * about every two hours and 45 minutes for lunch when a window spans midday.
 *
 * A section that does not fit in what is left of a day moves whole to the next
 * day rather than being split — half an IDS either side of a night's sleep is
 * not an IDS. If the days genuinely cannot hold the agenda, the sections that
 * did not fit come back in `overflow` so the caller can say so out loud
 * instead of quietly dropping them.
 */
export function schedule(sections: SessionSection[], days: DayWindow[]): { placed: SessionSection[]; overflow: SessionSection[]; breaks: SessionSection[] } {
  if (!days?.length) return { placed: sections, overflow: [], breaks: [] }
  const placed: SessionSection[] = []
  const breaks: SessionSection[] = []
  const queue = [...sections]
  let d = 0
  let clock = toMins(days[0].start || '08:00')
  let sinceBreak = 0
  let lunched = false

  const endOf = (i: number) => (days[i].end ? toMins(days[i].end as string) : 17 * 60)
  const nextDay = () => { d += 1; if (d < days.length) { clock = toMins(days[d].start || '08:00'); sinceBreak = 0; lunched = false } }

  while (queue.length && d < days.length) {
    const end = endOf(d)
    // Lunch, when the day runs through midday and we are at it.
    if (!lunched && clock >= 12 * 60 - 30 && clock < 13 * 60 + 30 && end > 13 * 60) {
      breaks.push({ key: 'lunch', title: 'Lunch', minutes: 45, day: d, startMin: clock, start: hhmm(clock), end: hhmm(clock + 45) })
      clock += 45; sinceBreak = 0; lunched = true
      continue
    }
    if (sinceBreak >= 120 && clock + 15 < end) {
      breaks.push({ key: 'break', title: 'Break', minutes: 15, day: d, startMin: clock, start: hhmm(clock), end: hhmm(clock + 15) })
      clock += 15; sinceBreak = 0
      continue
    }
    const s = queue[0]
    if (clock + s.minutes > end) { nextDay(); continue }
    // startMin travels with the row because "10:00 AM" sorts BEFORE "8:00 AM"
    // as a string — which put the mid-morning break at the top of day one.
    placed.push({ ...s, day: d, startMin: clock, start: hhmm(clock), end: hhmm(clock + s.minutes) })
    clock += s.minutes
    sinceBreak += s.minutes
    queue.shift()
  }
  return { placed, overflow: queue, breaks }
}

const quarterOf = (d: Date) => Math.ceil((d.getMonth() + 1) / 3)

/**
 * Build the quarterly (or annual) session from the company's own EOS page.
 *
 * Every row here is read from `eos`. Nothing is invented: a scorecard metric
 * with no goal says "no goal set — agree one today", an empty V/TO field says
 * it is empty, and an empty quarter says there are no rocks yet. That is the
 * work of the meeting, not a blemish to hide.
 */
export function buildSessionAgenda(o: {
  type?: SessionType
  eos?: Any
  employees?: Any[]
  now?: Date
  days?: DayWindow[]
  entity?: string | null
} = {}) {
  const type: SessionType = o.type || 'quarterly'
  const eos = o.eos || {}
  const employees = o.employees || []
  const now = o.now || new Date()
  const entity = o.entity || null

  const people = new Map(employees.map((e: Any) => [String(e.id), e]))
  const nameOf = (id: unknown) => people.get(String(id))?.name || null
  const inEntity = (v: unknown) => !entity || !str(v) || str(v).toLowerCase() === entity.toLowerCase()

  const first = o.days?.length ? parseDay(o.days[0].date) || now : now
  // The quarter being PLANNED is the one the meeting sits in.
  const quarter = quarterOf(first)
  const year = first.getFullYear()
  const prevQ = quarter === 1 ? 4 : quarter - 1
  const prevY = quarter === 1 ? year - 1 : year

  const rocks = (eos.rocks || []).filter((r: Any) => inEntity(r.business_unit))
  const closing = rocks.filter((r: Any) => Number(r.quarter) === prevQ && Number(r.year) === prevY)
  const thisQ = rocks.filter((r: Any) => Number(r.quarter) === quarter && Number(r.year) === year)
  // A tenant that has never moved its rocks forward has them all parked in some
  // older quarter; show those too rather than claiming there is nothing.
  const stale = rocks.filter((r: Any) => !(Number(r.quarter) === prevQ && Number(r.year) === prevY) && !(Number(r.quarter) === quarter && Number(r.year) === year))

  const rockRow = (r: Any) => ({ title: str(r.title), owner: nameOf(r.owner_id), status: str(r.status) || 'on-track', due: calDay(r.due_date) || null, quarter: `Q${r.quarter} ${r.year}`, entity: str(r.business_unit) || null })

  const metrics = (eos.scorecard || []).filter((m: Any) => inEntity(m.entity)).map((m: Any) => ({
    metric: str(m.metric) || 'Untitled metric',
    owner: nameOf(m.owner_id),
    goal: m.goal === '' || m.goal == null ? null : Number(m.goal),
    direction: m.type === 'lte' ? 'at or under' : 'at or over',
    entity: str(m.entity) || null,
  })).sort((a: Any, b: Any) => (a.owner ? str(a.owner) : '￿').localeCompare(b.owner ? str(b.owner) : '￿') || a.metric.localeCompare(b.metric))

  const PRI: Record<string, number> = { high: 0, medium: 1, low: 2 }
  const issues = (eos.issues || []).filter((i: Any) => !i.resolved).map((i: Any) => ({
    title: str(i.title),
    priority: str(i.priority) || 'medium',
    kind: str(i.type) === 'long' ? 'long term' : 'short term',
    owners: (i.owner_ids || []).map(nameOf).filter(Boolean),
    raised: calDay(i.created_at) || null,
  })).sort((a: Any, b: Any) => (PRI[a.priority] ?? 9) - (PRI[b.priority] ?? 9) || str(a.raised).localeCompare(str(b.raised)))

  const seats = (eos.accountability || []).map((s: Any) => ({ seat: str(s.seat), person: nameOf(s.person_id), roles: (s.roles || []).filter(Boolean) }))

  const vtoRows = [
    { field: 'Core Values', value: (eos.core_values || []).map((v: Any) => str(v?.value) || str(v)).filter(Boolean).join(' · '), set: !!(eos.core_values || []).length },
    { field: 'Core Focus — purpose', value: str(eos.core_focus?.purpose), set: !!str(eos.core_focus?.purpose) },
    { field: 'Core Focus — niche', value: str(eos.core_focus?.niche), set: !!str(eos.core_focus?.niche) },
    { field: '10-Year Target', value: str(eos.ten_year) || str(eos.ten_year?.target), set: !!(str(eos.ten_year) || str(eos.ten_year?.target)) },
    { field: 'Marketing Strategy', value: [str(eos.marketing?.target_market), str(eos.marketing?.guarantee)].filter(Boolean).join(' · '), set: !!(str(eos.marketing?.target_market) || str(eos.marketing?.guarantee)) },
    { field: '3-Year Picture', value: str(eos.three_year?.revenue) ? `revenue ${eos.three_year.revenue}` : '', set: !!str(eos.three_year?.revenue) },
    { field: '1-Year Plan', value: str(eos.one_year?.revenue) ? `revenue ${eos.one_year.revenue}` : '', set: !!str(eos.one_year?.revenue) },
  ]

  const shape = SHAPES[type]
  const sections: SessionSection[] = shape.map((s) => {
    if (s.key === 'segue') return { ...s, note: 'Round the room: best personal and best business news of the last 90 days, and what each person wants out of these two days. No business yet.' }
    if (s.key === 'review_quarter' || s.key === 'review_year') {
      return {
        ...s,
        note: `What was committed last quarter and what actually happened. Done or not done — no "nearly". ${closing.length ? '' : `Nothing was set for Q${prevQ} ${prevY}, so review what is on the board instead and note that the quarter ran without rocks.`}`,
        rows: (closing.length ? closing : stale).map(rockRow),
      }
    }
    if (s.key === 'vto') {
      return { ...s, note: 'Read it aloud, line by line. Agree it or change it. The empty ones are the work.', rows: vtoRows }
    }
    if (s.key === 'one_year') return { ...s, note: 'Revenue, profit, and three to seven measurable goals for the year. Everything else ladders up to this.', rows: vtoRows.filter((v) => /1-Year|3-Year/.test(v.field)) }
    if (s.key === 'team_health') return { ...s, note: 'Right people, right seats. Walk the accountability chart, then the People Analyzer on anyone you are unsure of.', rows: seats }
    if (s.key === 'set_rocks') {
      return {
        ...s,
        note: `Three to seven for the company, then one to three each. One owner per rock, a date, and a yes/no finish line. ${thisQ.length ? `${thisQ.length} already set for Q${quarter}.` : `Nothing is set for Q${quarter} ${year} yet — this is the main job of the session.`}`,
        rows: thisQ.map(rockRow),
      }
    }
    if (s.key === 'issues') {
      return { ...s, note: 'The whole list, worst first. Pick, discuss, solve — each one ends as a rock, a to-do, or a decision that it does not matter.', rows: issues }
    }
    if (s.key === 'next_steps') return { ...s, note: 'Who tells whom what, by when. Write the cascading message down in one sentence.' }
    return { ...s, note: 'Expectations met? Rate the session 1-10 and say why if it is under 8.' }
  })

  const { placed, overflow, breaks } = schedule(sections, o.days || [])
  const dayLabels = (o.days || []).map((d) => {
    const dt = parseDay(d.date)
    return dt ? `${DAYS[dt.getDay()]} ${dt.getDate()} ${dt.toLocaleString('en-US', { month: 'long' })}` : str(d.date)
  })

  const minutes = sections.reduce((s, x) => s + x.minutes, 0)
  return {
    type,
    title: type === 'annual' ? 'Annual Planning Session' : `Q${quarter} ${year} Quarterly Session`,
    quarter: `Q${quarter} ${year}`,
    reviewing: `Q${prevQ} ${prevY}`,
    days: (o.days || []).map((d, i) => ({ ...d, label: dayLabels[i], date: calDay(d.date) || d.date })),
    minutes,
    hours: Math.round((minutes / 60) * 10) / 10,
    entity,
    // Overflow stays IN the document, without clock times. Dropping it was
    // the worse bug of the two: a two-day annual squeezed into a short
    // weekend silently rendered four of its nine sections.
    sections: (o.days?.length ? [...placed, ...overflow] : sections),
    breaks,
    overflow,
    counts: {
      rocks_closing: closing.length,
      rocks_set_for_this_quarter: thisQ.length,
      rocks_parked_elsewhere: stale.length,
      metrics: metrics.length,
      metrics_without_goal: metrics.filter((m: Any) => m.goal == null).length,
      issues_open: issues.length,
      seats: seats.length,
      vto_blank: vtoRows.filter((v) => !v.set).length,
    },
    scorecard: metrics,
    gaps: [
      !thisQ.length && `no rocks are set for Q${quarter} ${year} — setting them is the main job of this session`,
      !closing.length && `nothing was set for Q${prevQ} ${prevY}, so there is no quarter to grade${stale.length ? `; the ${stale.length} rocks on the board belong to older quarters` : ''}`,
      metrics.filter((m: Any) => m.goal == null).length > 0 && `${metrics.filter((m: Any) => m.goal == null).length} of ${metrics.length} scorecard metrics have no goal, so they cannot be graded — agree them in the review`,
      vtoRows.filter((v) => !v.set).length > 0 && `${vtoRows.filter((v) => !v.set).length} V/TO sections are empty: ${vtoRows.filter((v) => !v.set).map((v) => v.field).join(', ')}`,
      !seats.length && 'the accountability chart is empty',
      overflow.length > 0 && `the days are too short for the full agenda — ${overflow.map((s) => s.title).join(', ')} did not fit`,
    ].filter(Boolean) as string[],
  }
}

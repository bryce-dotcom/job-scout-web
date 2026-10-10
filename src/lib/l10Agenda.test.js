// The itinerary is a derivation, so these tests are about ORDER, OMISSION and
// honesty: the right things in the right order, nothing invented, and the
// document saying which kind of document it is.
import { describe, it, expect } from 'vitest'
import { buildL10Agenda, agendaSummaryLines, nextMeetingDay, meetingWhenLabel, dayStr, parseDay, calDay, L10_MINUTES } from './l10Agenda.js'
import { calendarDay, localDateStr, parseLocalDate } from './localDate.js'

const NOW = new Date(2026, 9, 5, 9, 0) // Monday 5 October 2026, 9am local

const employees = [
  { id: 14, name: 'Doug Webb', email: 'doug@hhh.services' },
  { id: 15, name: 'Cole Westcott', email: 'cole@hhh.services' },
  { id: 3, name: 'Bryce Westcott', email: 'bryce@hhh.services' },
  { id: 99, name: 'No Email', email: '' },
]

const eos = {
  meetings: { l10_day: 'Monday', l10_time: '08:30' },
  scorecard: [
    { id: 'm1', metric: 'Job Revenue', owner_id: 14, goal: '80000', type: 'gte', entity: 'Energy Scout' },
    { id: 'm2', metric: 'Callbacks', owner_id: 14, goal: '2', type: 'lte' },
    { id: 'm3', metric: 'New Leads', owner_id: 15, goal: '', type: 'gte' },
    { id: 'm4', metric: 'Orphan metric', owner_id: 777, goal: '5', type: 'gte' },
  ],
  rocks: [
    { id: 'r1', title: 'Hire a route tech', owner_id: 14, quarter: 4, year: 2026, status: 'on-track', due_date: '2026-12-01' },
    { id: 'r2', title: 'Fix the job board', owner_id: 15, quarter: 4, year: 2026, status: 'off-track', due_date: '2026-11-15' },
    { id: 'r3', title: 'At risk thing', owner_id: 15, quarter: 4, year: 2026, status: 'at-risk' },
    { id: 'r4', title: 'Last quarter rock', owner_id: 14, quarter: 2, year: 2026, status: 'done' },
  ],
  issues: [
    { id: 'i1', title: 'Hiring', priority: 'medium', type: 'short', resolved: false, created_at: '2026-08-10T00:00:00Z' },
    { id: 'i2', title: 'Time off policy', priority: 'high', type: 'long', resolved: false, created_at: '2026-09-10T00:00:00Z', owner_ids: [14] },
    { id: 'i3', title: 'Already solved', priority: 'high', resolved: true, created_at: '2026-07-01T00:00:00Z' },
  ],
  todos: [
    { id: 't1', text: 'Put Maverick products in the system', owner_id: 15, due_date: '2026-10-09', done: false },
    { id: 't2', text: 'Job board', owner_id: 14, due_date: '2026-05-18', done: false, source_issue_id: 'i1' },
    { id: 't3', text: 'Done already', owner_id: 14, due_date: '2026-09-01', done: true },
  ],
  accountability: [{ id: 's1', seat: 'Visionary', person_id: 3 }],
}

const build = (over = {}) => buildL10Agenda({ eos, employees, now: NOW, ...over })
const section = (a, key) => a.sections.find((s) => s.key === key)

describe('the shape of a Level 10 is not ours to change', () => {
  const a = build()
  it('is the seven sections, in order, adding to 90 minutes', () => {
    expect(a.sections.map((s) => s.key)).toEqual(['segue', 'scorecard', 'rocks', 'headlines', 'todos', 'ids', 'conclude'])
    expect(a.minutes).toBe(90)
    expect(L10_MINUTES).toBe(90)
    expect(section(a, 'ids').minutes).toBe(60)
  })

  it('summarises as one line per section with its count', () => {
    expect(agendaSummaryLines(a)).toContain('5 min — Segue')
    expect(agendaSummaryLines(a).find((l) => l.startsWith('60 min'))).toMatch(/IDS.*\(2\)/)
  })
})

describe('what goes in each section, and in what order', () => {
  const a = build()

  it('rocks are this quarter only, off-track first', () => {
    const rows = section(a, 'rocks').rows
    expect(rows.map((r) => r.title)).toEqual(['Fix the job board', 'At risk thing', 'Hire a route tech'])
    expect(rows.find((r) => r.title === 'Last quarter rock')).toBeUndefined()
  })

  it('issues are open only, worst first, and a resolved one is gone', () => {
    const rows = section(a, 'ids').rows
    expect(rows.map((r) => r.title)).toEqual(['Time off policy', 'Hiring'])
    expect(rows[0].priority).toBe('high')
    expect(rows[0].kind).toBe('long term')
    expect(rows[0].owners).toEqual(['Doug Webb'])
  })

  it('to-dos are the undone ones, overdue first, and the overdue one is flagged', () => {
    const rows = section(a, 'todos').rows
    expect(rows.map((r) => r.text)).toEqual(['Job board', 'Put Maverick products in the system'])
    expect(rows[0].overdue).toBe(true)
    expect(rows[1].overdue).toBe(false)
    expect(rows[0].from_issue).toBe(true)
  })

  it('the scorecard reads by owner so one person reads one block', () => {
    const rows = section(a, 'scorecard').rows
    expect(rows.map((r) => r.owner)).toEqual(['Cole Westcott', 'Doug Webb', 'Doug Webb', null])
    expect(rows.find((r) => r.metric === 'Callbacks').direction).toBe('at or under')
  })

  it('the two sections nobody stores say to bring it, rather than inventing rows', () => {
    expect(section(a, 'segue').rows).toBeUndefined()
    expect(section(a, 'headlines').note).toMatch(/bring them/)
  })
})

describe('a number it does not have is never implied', () => {
  it('without numbers the rows are blank and the document says so', () => {
    const a = build()
    expect(a.numbers_included).toBe(false)
    expect(section(a, 'scorecard').rows.every((r) => r.value === null && r.on_goal === null)).toBe(true)
    expect(section(a, 'scorecard').note).toMatch(/^Fill in last week/)
  })

  it('with numbers it grades them, each against its own direction', () => {
    const a = build({ numbers: { m1: { thisWeek: 90000, lastWeek: 70000 }, m2: { thisWeek: 5, lastWeek: 1 } } })
    expect(a.numbers_included).toBe(true)
    const rows = section(a, 'scorecard').rows
    expect(rows.find((r) => r.metric === 'Job Revenue')).toMatchObject({ value: 90000, previous: 70000, on_goal: true })
    // 5 callbacks against "at or under 2" is a miss, not a win.
    expect(rows.find((r) => r.metric === 'Callbacks')).toMatchObject({ value: 5, on_goal: false })
    expect(section(a, 'scorecard').note).toMatch(/^Last completed week/)
  })

  it("an unset goal is no goal — never 0, which every week would meet", () => {
    const rows = section(build(), 'scorecard').rows
    expect(rows.find((r) => r.metric === 'New Leads').goal).toBeNull()
    expect(rows.find((r) => r.metric === 'Job Revenue').goal).toBe(80000)
  })

  it('a graded metric with no goal stays ungraded rather than passing', () => {
    const a = build({ numbers: { m3: { thisWeek: 12 } } })
    expect(section(a, 'scorecard').rows.find((r) => r.metric === 'New Leads')).toMatchObject({ value: 12, on_goal: null })
  })
})

describe('who is in the room, and why', () => {
  const a = build()
  it('is everyone the agenda asks something of, named with the reason', () => {
    expect(a.attendees.map((x) => x.name)).toEqual(['Bryce Westcott', 'Cole Westcott', 'Doug Webb'])
    expect(a.attendees.find((x) => x.name === 'Doug Webb').why).toMatch(/scorecard number/)
    expect(a.attendees.find((x) => x.name === 'Doug Webb').why).toMatch(/a rock/)
    expect(a.attendees.find((x) => x.name === 'Bryce Westcott').why).toBe('the Visionary seat')
  })

  it('an owner id that matches no employee is not invented as a person', () => {
    expect(a.attendees.find((x) => String(x.employee_id) === '777')).toBeUndefined()
    expect(section(a, 'scorecard').rows.find((r) => r.metric === 'Orphan metric').owner).toBeNull()
  })

  it('carries the email when there is one, and null rather than a blank string', () => {
    const withNoEmail = buildL10Agenda({ eos: { ...eos, todos: [{ id: 'x', text: 'thing', owner_id: 99, done: false }] }, employees, now: NOW })
    expect(withNoEmail.attendees.find((x) => x.name === 'No Email').email).toBeNull()
  })
})

describe('one business unit at a time', () => {
  it('keeps the unit-less rows and drops the other unit', () => {
    const rows = section(build({ entity: 'HHH Building Services' }), 'scorecard').rows
    expect(rows.map((r) => r.metric)).not.toContain('Job Revenue')
    expect(rows.map((r) => r.metric)).toContain('Callbacks')
  })
})

describe('the meeting day', () => {
  it('is today when today IS the L10 day — this morning, not next week', () => {
    expect(nextMeetingDay({ l10_day: 'Monday' }, NOW)).toBe('2026-10-05')
  })

  it('rolls forward to the next one otherwise', () => {
    expect(nextMeetingDay({ l10_day: 'Thursday' }, NOW)).toBe('2026-10-08')
    expect(nextMeetingDay({ l10_day: 'Sunday' }, NOW)).toBe('2026-10-11')
  })

  it('with no day set, is dated today and the agenda says that is why', () => {
    const a = buildL10Agenda({ eos: { ...eos, meetings: {} }, employees, now: NOW })
    expect(a.meeting_on).toBe('2026-10-05')
    expect(a.gaps.join(' ')).toMatch(/no L10 day is set/)
  })

  it('takes a day the caller was told, so Arnie can honour "next Thursday"', () => {
    expect(build({ day: '2026-10-08' }).meeting_on).toBe('2026-10-08')
    // And the quarter follows the meeting, not today.
    expect(buildL10Agenda({ eos, employees, now: NOW, day: '2027-01-04' }).quarter).toBe('Q1 2027')
  })

  it('reads the time back as people say it, and leaves it off when unset', () => {
    expect(meetingWhenLabel('2026-10-05', '08:30')).toBe('Monday 5 October, 8:30 AM')
    expect(meetingWhenLabel('2026-10-05', '13:00')).toBe('Monday 5 October, 1:00 PM')
    expect(meetingWhenLabel('2026-10-05', '')).toBe('Monday 5 October')
  })
})

describe('the gaps are named, not hidden', () => {
  it('says what is not set up', () => {
    const a = buildL10Agenda({ eos: { meetings: { l10_day: 'Monday' } }, employees, now: NOW })
    expect(a.gaps.join(' | ')).toMatch(/scorecard has no metrics/)
    expect(a.gaps.join(' | ')).toMatch(/no rocks are set for Q4/)
    expect(a.gaps.join(' | ')).toMatch(/accountability chart is empty/)
  })

  it('counts the metrics nobody can grade and nobody owns', () => {
    const a = build()
    expect(a.counts.metrics_without_goal).toBe(1)
    expect(a.counts.metrics_without_owner).toBe(1)
    // Singular reads as singular — "1 scorecard metrics have no goal" is the
    // kind of sloppiness a customer notices on a printed agenda.
    expect(a.gaps.join(' | ')).toMatch(/1 scorecard metric has no goal, so it cannot be graded/)
    expect(a.gaps.join(' | ')).toMatch(/1 scorecard metric has nobody on it/)
    const two = buildL10Agenda({ eos: { ...eos, scorecard: [...eos.scorecard, { id: 'm5', metric: 'Another', owner_id: null, goal: '', type: 'gte' }] }, employees, now: NOW })
    expect(two.gaps.join(' | ')).toMatch(/2 scorecard metrics have no goal, so they cannot be graded/)
  })

  it('counts what the meeting is actually facing', () => {
    expect(build().counts).toMatchObject({ metrics: 4, rocks: 3, rocks_off_track: 2, issues_open: 2, todos_open: 2, todos_overdue: 1 })
  })
})

describe('an empty EOS page still produces a usable agenda', () => {
  it('builds the seven sections and refuses to crash', () => {
    const a = buildL10Agenda({})
    expect(a.sections).toHaveLength(7)
    expect(a.attendees).toEqual([])
    expect(a.counts.metrics).toBe(0)
    expect(a.gaps.length).toBeGreaterThan(2)
  })
})

// The shared module cannot import src/lib/localDate.js (it has to run in Deno),
// so it mirrors two of its functions. If this ever fails, localDate is the rule
// and _shared/l10Agenda.ts is the one that must change.
describe('the day helpers agree with the one date rule', () => {
  const cases = ['2026-10-05', '2026-10-05T00:00:00Z', '2026-10-05T00:00:00+00:00', '2026-01-01', '2026-10-05T18:30:00Z', '', null, undefined, 'not a date']
  it('calendarDay and calDay return the same day for every shape we meet', () => {
    for (const c of cases) expect(calDay(c)).toBe(calendarDay(c))
  })
  it('dayStr and localDateStr agree, and parseDay matches parseLocalDate', () => {
    const d = new Date(2026, 0, 1, 23, 59)
    expect(dayStr(d)).toBe(localDateStr(d))
    expect(parseDay('2026-10-05')?.getTime()).toBe(parseLocalDate('2026-10-05')?.getTime())
    expect(parseDay('')).toBe(parseLocalDate(''))
  })
})

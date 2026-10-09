// The quarterly and annual sessions.
//
// These exist because of a real failure: asked for a two-day Q4 itinerary on
// 2026-10-06, Arnie had no rail to take and wrote one himself, complete with a
// scorecard that did not exist — "Weekly revenue, goal $50K, owner London
// Miller" against a real scorecard of 19 metrics, mostly Doug's, of which five
// have a goal. So every test here is about the document being made of the
// company's own rows, and saying so when a row is missing.
import { describe, it, expect } from 'vitest'
import { buildSessionAgenda, schedule, QUARTERLY_SHAPE, ANNUAL_SHAPE } from '../../supabase/functions/_shared/quarterlyAgenda.ts'
import { sessionText } from '../../supabase/functions/_shared/l10AgendaRender.ts'

const employees = [
  { id: 1, name: 'Doug Webb', email: 'doug@hhh.services' },
  { id: 2, name: 'Cole Westcott', email: 'cole@hhh.services' },
  { id: 3, name: 'Bryce Westcott', email: 'bryce@hhh.services' },
]
const eos = {
  scorecard: [
    { id: 'm1', metric: 'Job Revenue', owner_id: 1, goal: '80000', type: 'gte' },
    { id: 'm2', metric: 'New Leads', owner_id: 2, goal: '', type: 'gte' },
    { id: 'm3', metric: 'Callbacks', owner_id: 1, goal: '2', type: 'lte' },
  ],
  rocks: [
    { id: 'r1', title: 'Hire a route tech', owner_id: 1, quarter: 3, year: 2026, status: 'done' },
    { id: 'r2', title: 'Sample kit', owner_id: 2, quarter: 3, year: 2026, status: 'off-track' },
    { id: 'r3', title: 'Already set for Q4', owner_id: 1, quarter: 4, year: 2026, status: 'on-track' },
    { id: 'r4', title: 'Ancient rock', owner_id: 1, quarter: 1, year: 2025, status: 'on-track' },
  ],
  issues: [
    { id: 'i1', title: 'Hiring', priority: 'medium', resolved: false, created_at: '2026-08-10' },
    { id: 'i2', title: 'Time off', priority: 'high', resolved: false, created_at: '2026-09-10' },
    { id: 'i3', title: 'Solved one', priority: 'high', resolved: true, created_at: '2026-07-01' },
  ],
  accountability: [{ id: 's1', seat: 'Visionary', person_id: 3, roles: ['Vision', 'Culture'] }],
  core_values: [{ value: 'Honest' }, { value: 'Humble' }],
  core_focus: { purpose: 'Keep the lights on', niche: 'Commercial lighting' },
  ten_year: '',
  one_year: {},
  three_year: {},
}
const days = [{ date: '2026-10-10', start: '08:00', end: '15:00' }, { date: '2026-10-11', start: '08:00', end: '12:00' }]
const build = (over = {}) => buildSessionAgenda({ type: 'quarterly', eos, employees, days, ...over })
const sec = (a, key) => a.sections.find((s) => s.key === key)

describe('a quarterly is not a longer L10', () => {
  const a = build()
  it('is the quarterly shape, not the weekly one', () => {
    expect(a.sections.map((s) => s.key)).toEqual(QUARTERLY_SHAPE.map((s) => s.key))
    expect(a.sections.map((s) => s.key)).not.toContain('headlines')
    expect(a.hours).toBe(8.5)
  })

  it('knows which quarter it is setting and which it is reviewing', () => {
    expect(a.quarter).toBe('Q4 2026')
    expect(a.reviewing).toBe('Q3 2026')
    expect(a.title).toBe('Q4 2026 Quarterly Session')
  })

  it('the annual is its own shape again, with the people and the year in it', () => {
    const an = buildSessionAgenda({ type: 'annual', eos, employees, days })
    expect(an.sections.map((s) => s.key)).toEqual(ANNUAL_SHAPE.map((s) => s.key))
    expect(an.sections.map((s) => s.key)).toContain('team_health')
    expect(an.sections.map((s) => s.key)).toContain('one_year')
  })
})

describe('every row is the company’s own', () => {
  const a = build()

  it('reviews the rocks that were actually set for last quarter', () => {
    expect(sec(a, 'review_quarter').rows.map((r) => r.title).sort()).toEqual(['Hire a route tech', 'Sample kit'])
    expect(sec(a, 'review_quarter').rows[0].owner).toBeTruthy()
  })

  it('sets the ones already on the board for this quarter, and says so', () => {
    expect(sec(a, 'set_rocks').rows.map((r) => r.title)).toEqual(['Already set for Q4'])
    expect(sec(a, 'set_rocks').note).toMatch(/1 already set for Q4/)
  })

  it('carries the whole open issues list, worst first, and no resolved one', () => {
    expect(sec(a, 'issues').rows.map((r) => r.title)).toEqual(['Time off', 'Hiring'])
    expect(sec(a, 'issues').rows.map((r) => r.title)).not.toContain('Solved one')
  })

  it('shows the V/TO with the empty parts marked empty, not filled in', () => {
    const rows = sec(a, 'vto').rows
    expect(rows.find((r) => r.field === '10-Year Target').set).toBe(false)
    expect(rows.find((r) => r.field === 'Core Values').set).toBe(true)
    expect(rows.find((r) => r.field === '1-Year Plan').set).toBe(false)
  })

  it('carries the scorecard with its real owners, and no goal where there is none', () => {
    expect(a.scorecard.map((m) => m.metric).sort()).toEqual(['Callbacks', 'Job Revenue', 'New Leads'])
    expect(a.scorecard.find((m) => m.metric === 'New Leads').goal).toBeNull()
    expect(a.scorecard.find((m) => m.metric === 'Job Revenue')).toMatchObject({ owner: 'Doug Webb', goal: 80000 })
    expect(a.counts.metrics_without_goal).toBe(1)
  })

  it('never invents a metric, an owner or a goal', () => {
    const txt = sessionText(a, { company_name: 'HHH' })
    // Everything on the page must trace to the fixture.
    for (const m of ['Job Revenue', 'New Leads', 'Callbacks']) expect(txt).toContain(m)
    expect(txt).not.toMatch(/Weekly revenue/)
    expect(txt).toContain('NO GOAL SET')
  })
})

describe('a tenant that never moved its rocks forward', () => {
  it('says the quarter had nothing set, and shows what is on the board instead', () => {
    const a = buildSessionAgenda({ type: 'quarterly', eos: { ...eos, rocks: [eos.rocks[3]] }, employees, days })
    expect(a.counts.rocks_closing).toBe(0)
    expect(a.counts.rocks_parked_elsewhere).toBe(1)
    expect(sec(a, 'review_quarter').note).toMatch(/Nothing was set for Q3 2026/)
    expect(sec(a, 'review_quarter').rows.map((r) => r.title)).toEqual(['Ancient rock'])
    expect(a.gaps.join(' | ')).toMatch(/no rocks are set for Q4 2026/)
    expect(a.gaps.join(' | ')).toMatch(/belong to older quarters/)
  })
})

describe('laying it across the days somebody actually has', () => {
  const a = build()

  it('starts at the start and never runs past the end time given', () => {
    const d0 = a.sections.filter((s) => s.day === 0)
    expect(d0[0].start).toBe('8:00 AM')
    // 3pm finish on day one, noon on day two.
    const all = [...a.sections, ...a.breaks]
    for (const s of all.filter((x) => x.day === 0)) expect(s.startMin + s.minutes).toBeLessThanOrEqual(15 * 60)
    for (const s of all.filter((x) => x.day === 1)) expect(s.startMin + s.minutes).toBeLessThanOrEqual(12 * 60)
  })

  it('puts lunch in the middle of a day that spans it, and breaks every couple of hours', () => {
    expect(a.breaks.some((b) => b.key === 'lunch' && b.day === 0)).toBe(true)
    expect(a.breaks.filter((b) => b.key === 'break').length).toBeGreaterThanOrEqual(2)
  })

  it('moves a section whole to the next day rather than splitting it', () => {
    const ids = a.sections.find((s) => s.key === 'issues')
    expect(ids.minutes).toBe(150)
    expect(a.sections.filter((s) => s.key === 'issues')).toHaveLength(1)
  })

  it('says out loud when the days are too short rather than dropping sections', () => {
    const tiny = buildSessionAgenda({ type: 'quarterly', eos, employees, days: [{ date: '2026-10-10', start: '08:00', end: '10:00' }] })
    expect(tiny.overflow.length).toBeGreaterThan(0)
    expect(tiny.gaps.join(' | ')).toMatch(/days are too short/)
  })

  it('with no days given it is still a usable agenda, just without clock times', () => {
    const plain = buildSessionAgenda({ type: 'quarterly', eos, employees })
    expect(plain.sections).toHaveLength(QUARTERLY_SHAPE.length)
    expect(plain.sections[0].start).toBeUndefined()
    expect(sessionText(plain)).toContain('SEGUE')
  })
})

describe('the clock, not the label', () => {
  it('orders a day by real time — "10:00 AM" sorts before "8:00 AM" as text', () => {
    const a = build()
    const txt = sessionText(a, { company_name: 'HHH' })
    const day1 = txt.slice(txt.indexOf('DAY 1'), txt.indexOf('DAY 2'))
    expect(day1.indexOf('8:00 AM — SEGUE')).toBeLessThan(day1.indexOf('10:15 AM'))
    expect(day1.indexOf('10:15 AM')).toBeLessThan(day1.indexOf('12:30 PM'))
  })

  it('the scheduler is pure and returns what it could not place', () => {
    const { placed, overflow } = schedule([{ key: 'a', title: 'A', minutes: 60 }, { key: 'b', title: 'B', minutes: 600 }], [{ date: '2026-10-10', start: '08:00', end: '10:00' }])
    expect(placed.map((s) => s.key)).toEqual(['a'])
    expect(overflow.map((s) => s.key)).toEqual(['b'])
  })
})

describe('the printed session', () => {
  const txt = sessionText(build(), { company_name: 'HHH Services' })

  it('leads with the company, the quarter and the days', () => {
    expect(txt).toContain('HHH SERVICES — Q4 2026 QUARTERLY SESSION')
    expect(txt).toContain('Saturday 10 October')
    expect(txt).toContain('Sunday 11 October')
    expect(txt).toMatch(/reviewing Q3 2026/)
  })

  it('has a tick box against everything somebody has to decide', () => {
    expect(txt).toMatch(/\[ \] Sample kit/)
    expect(txt).toMatch(/\[ \] Time off/)
    expect(txt).toMatch(/\[x\] Core Values/)
    expect(txt).toMatch(/\[ \] 10-Year Target\s+— EMPTY/)
  })

  it('gives every scorecard metric a line to write the number on', () => {
    expect(txt).toContain('actual: ____________')
    expect(txt).toMatch(/Doug Webb:/)
  })

  it('ends with what the EOS page is missing', () => {
    expect(txt).toContain('BEFORE YOU LEAVE')
    // This fixture DOES have a Q4 rock, so the gaps are the goal and the V/TO.
    expect(txt).toMatch(/scorecard metrics have no goal/)
    expect(txt).toContain('V/TO sections are empty')
  })
})

import { describe, it, expect } from 'vitest'
import { soldTotal, soldByRep, periodBounds } from './soldTotals'

// The number this exists to get right: Cole sold 31 jobs / $305,199.43 in
// 2026, and the Sales Won tile reads $0.00 because none are still sitting in
// the Won stage.

const LEADS = [
  { id: 100, salesperson_id: 16 },                    // Cole via the lead
  { id: 200, salesperson_id: 20 },
  { id: 300, salesperson_ids: [16, 20] },             // shared
]
const job = (over = {}) => ({ id: 1, created_at: '2026-06-01T00:00:00Z', job_total: 1000, ...over })

describe('sold is cumulative — stage is irrelevant', () => {
  it('counts a deal that has moved far past Won', () => {
    const jobs = [
      job({ id: 1, salesperson_id: 16, status: 'Completed' }),
      job({ id: 2, salesperson_id: 16, status: 'Invoiced' }),
      job({ id: 3, salesperson_id: 16, status: 'Paid' }),
    ]
    const r = soldTotal(jobs, LEADS, { ownerId: 16 })
    expect(r.count).toBe(3)
    expect(r.total).toBe(3000)
  })

  it('credits via the LEAD when the job carries no salesperson', () => {
    const r = soldTotal([job({ salesperson_id: null, lead_id: '100' })], LEADS, { ownerId: 16 })
    expect(r.count).toBe(1)
  })

  it('handles the TEXT lead_id against an INT leads.id', () => {
    // The trap that cost $232,049 of attribution.
    expect(soldTotal([job({ lead_id: '100' })], LEADS, { ownerId: '16' }).count).toBe(1)
  })

  it('credits a shared lead to ONE rep, not both', () => {
    // Deliberate trade-off. Crediting every rep on a shared lead makes the
    // per-rep totals overlap, so they no longer add up to the company total
    // and the same dollar appears twice on a leaderboard. The first rep
    // listed takes it. Commission is a separate question and Payroll still
    // pays every listed rep — this is the SALES number, not the pay number.
    const j = [job({ salesperson_id: null, lead_id: '300' })]
    expect(soldTotal(j, LEADS, { ownerId: 16 }).count).toBe(1)
    expect(soldTotal(j, LEADS, { ownerId: 20 }).count).toBe(0)
  })

  it('excludes another rep entirely', () => {
    expect(soldTotal([job({ salesperson_id: 20 })], LEADS, { ownerId: 16 }).count).toBe(0)
  })

  it('counts everyone when not scoped to a rep', () => {
    const jobs = [job({ id: 1, salesperson_id: 16 }), job({ id: 2, salesperson_id: 20 })]
    expect(soldTotal(jobs, LEADS, { ownerId: 'all' }).count).toBe(2)
    expect(soldTotal(jobs, LEADS, {}).count).toBe(2)
  })
})

describe('the window', () => {
  const jobs = [
    job({ id: 1, salesperson_id: 16, created_at: '2025-12-31T23:00:00Z' }),
    job({ id: 2, salesperson_id: 16, created_at: '2026-01-01T00:00:00Z' }),
    job({ id: 3, salesperson_id: 16, created_at: '2026-08-01T00:00:00Z' }),
  ]

  it('includes the start instant and excludes the end', () => {
    const r = soldTotal(jobs, LEADS, { ownerId: 16, start: '2026-01-01T00:00:00Z', end: '2026-08-01T00:00:00Z' })
    expect(r.count).toBe(1)
  })

  it('dates by when the deal was SOLD, not when work is scheduled', () => {
    // A job sold in January but scheduled for August belongs to January.
    const j = [job({ salesperson_id: 16, created_at: '2026-01-15T00:00:00Z', start_date: '2026-08-20T00:00:00Z' })]
    expect(soldTotal(j, LEADS, { ownerId: 16, start: '2026-01-01T00:00:00Z', end: '2026-02-01T00:00:00Z' }).count).toBe(1)
  })

  it('drops a job with no created_at rather than counting it as now', () => {
    expect(soldTotal([job({ salesperson_id: 16, created_at: null })], LEADS, { ownerId: 16 }).count).toBe(0)
  })

  it('unbounded when no window is given', () => {
    expect(soldTotal(jobs, LEADS, { ownerId: 16 }).count).toBe(3)
  })
})

describe('per-owner breakdown', () => {
  it('splits the total by rep', () => {
    const jobs = [
      job({ id: 1, salesperson_id: 16, job_total: 100 }),
      job({ id: 2, salesperson_id: 20, job_total: 250 }),
      job({ id: 3, salesperson_id: null, lead_id: null, job_total: 40 }),
    ]
    const r = soldTotal(jobs, LEADS, {})
    expect(r.perOwner.get('16').total).toBe(100)
    expect(r.perOwner.get('20').total).toBe(250)
    expect(r.perOwner.get('unattributed').total).toBe(40)
  })
})

describe('money is never junk', () => {
  it('rounds to cents', () => {
    const jobs = [job({ salesperson_id: 16, job_total: 0.1 }), job({ id: 2, salesperson_id: 16, job_total: 0.2 })]
    expect(soldTotal(jobs, LEADS, { ownerId: 16 }).total).toBe(0.3)
  })

  it('treats a missing total as zero, not NaN', () => {
    const r = soldTotal([job({ salesperson_id: 16, job_total: null })], LEADS, { ownerId: 16 })
    expect(r.total).toBe(0)
    expect(r.count).toBe(1)
  })

  it('survives junk input', () => {
    expect(soldTotal(null, null, {}).total).toBe(0)
    expect(soldTotal([null], [], {}).count).toBe(0)
    expect(soldTotal([job({ created_at: 'nonsense' })], [], {}).count).toBe(0)
  })
})

describe('period bounds are LOCAL, not UTC', () => {
  const now = new Date(2026, 7, 4, 10, 0)   // 4 Aug 2026, local

  it('month to date starts on the 1st at local midnight', () => {
    const d = new Date(periodBounds('mtd', now).start)
    expect(d.getMonth()).toBe(7)
    expect(d.getDate()).toBe(1)
    expect(d.getHours()).toBe(0)
  })

  it('year to date starts 1 January local', () => {
    const d = new Date(periodBounds('ytd', now).start)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)
  })

  it('all time has no bounds', () => {
    expect(periodBounds('all', now)).toEqual({ start: null, end: null })
  })

  it('an unknown range falls back to year to date', () => {
    expect(periodBounds('nonsense', now).start).toBe(periodBounds('ytd', now).start)
  })
})

describe('per-rep totals PARTITION the company total', () => {
  // The bug the live check caught: scoping by "is this rep anywhere on the
  // deal" counted a job named to Doug whose lead is Cole's for BOTH, so the
  // rep totals overshot the company total.
  const leads = [{ id: 100, salesperson_id: 16 }]
  const jobs = [
    { id: 1, created_at: '2026-03-01T00:00:00Z', job_total: 100, salesperson_id: 20, lead_id: '100' },
    { id: 2, created_at: '2026-03-01T00:00:00Z', job_total: 250, salesperson_id: 16 },
  ]

  it('credits a job to its OWN salesperson, not the lead, when both exist', () => {
    // Job 1 names Doug (20); its lead is Cole's. It is Doug's deal.
    expect(soldTotal(jobs, leads, { ownerId: 20 }).count).toBe(1)
    expect(soldTotal(jobs, leads, { ownerId: 16 }).count).toBe(1)
    expect(soldTotal(jobs, leads, { ownerId: 16 }).total).toBe(250)
  })

  it('every rep total sums to exactly the company total', () => {
    const company = soldTotal(jobs, leads, {})
    const summed = [...company.perOwner.values()].reduce((s, v) => s + v.total, 0)
    expect(summed).toBeCloseTo(company.total, 2)
    const counted = [...company.perOwner.values()].reduce((s, v) => s + v.count, 0)
    expect(counted).toBe(company.count)
  })

  it('the scoped total equals that rep\'s slice of the breakdown', () => {
    const company = soldTotal(jobs, leads, {})
    for (const [rep, slice] of company.perOwner) {
      if (rep === 'unattributed') continue
      expect(soldTotal(jobs, leads, { ownerId: rep }).total).toBeCloseTo(slice.total, 2)
    }
  })
})

describe('cancelled work is not sold work', () => {
  const leads = [{ id: 100, salesperson_id: 16 }]
  it('excludes archived and cancelled jobs', () => {
    const jobs = [
      { id: 1, created_at: '2026-03-01T00:00:00Z', job_total: 500, salesperson_id: 16, status: 'Completed' },
      { id: 2, created_at: '2026-03-01T00:00:00Z', job_total: 999, salesperson_id: 16, status: 'Archived' },
      { id: 3, created_at: '2026-03-01T00:00:00Z', job_total: 999, salesperson_id: 16, status: 'Cancelled' },
      { id: 4, created_at: '2026-03-01T00:00:00Z', job_total: 999, salesperson_id: 16, status: 'Void' },
    ]
    const r = soldTotal(jobs, leads, { ownerId: 16 })
    expect(r.count).toBe(1)
    expect(r.total).toBe(500)
  })

  it('still counts a job with no status at all', () => {
    const jobs = [{ id: 1, created_at: '2026-03-01T00:00:00Z', job_total: 500, salesperson_id: 16 }]
    expect(soldTotal(jobs, leads, { ownerId: 16 }).count).toBe(1)
  })
})

// ── soldByRep: the number a sales manager is looking at ────────────────────
//
// Cole opened Sales Performance to see where his guys were for the month and
// read $174,267 against a real $327,551 — Doug showed $80,162 of the $211,376
// he had sold, and Christopher's 23 jobs showed as nothing at all. The page
// built its rows from the estimate funnel, and 26 of that month's 40 jobs
// never had an estimate. These pin the rule that replaced it.

describe('soldByRep — every rep who sold, and what is behind the number', () => {
  const employees = [{ id: 16, name: 'Cole Westcott' }, { id: 20, name: 'Doug Webb' }]
  const leads = [{ id: 100, salesperson_id: 16 }]
  const jobs = [
    { id: 1, created_at: '2026-09-02T00:00:00Z', job_total: 1000, salesperson_id: 20, quote_id: 7, status: 'Completed' },
    { id: 2, created_at: '2026-09-03T00:00:00Z', job_total: 3000, salesperson_id: 20, status: 'Scheduled' },
    { id: 3, created_at: '2026-09-04T00:00:00Z', job_total: 500, salesperson_id: null, lead_id: '100', status: 'Paid' },
    { id: 4, created_at: '2026-09-05T00:00:00Z', job_total: null, salesperson_id: 16, status: 'Chillin' },
    { id: 5, created_at: '2026-09-06T00:00:00Z', job_total: 9999, salesperson_id: 20, status: 'Cancelled' },
    { id: 6, created_at: '2026-09-07T00:00:00Z', job_total: 250, status: 'Scheduled' },
  ]
  const r = soldByRep(jobs, leads, { employees })

  it('names every rep who sold, with no estimate needed', () => {
    // Job 2 came through no estimate at all and still counts for Doug.
    expect(r.rows.map((x) => x.name)).toEqual(['Doug Webb', 'Cole Westcott', 'Nobody on the deal'])
  })

  it('the rep rows add up to the company total', () => {
    // The whole point: a manager can add the column up and get the headline.
    expect(r.rows.reduce((s, x) => s + x.total, 0)).toBe(r.total)
    expect(r.total).toBe(4750)
    expect(r.count).toBe(5)
  })

  it('credits through the lead when the job carries no rep', () => {
    const cole = r.rows.find((x) => x.name === 'Cole Westcott')
    expect(cole.total).toBe(500)      // job 3, via lead 100
    expect(cole.count).toBe(2)        // plus the unpriced job 4
  })

  it('counts an unpriced job rather than inventing a value for it', () => {
    expect(r.unpriced).toBe(1)
    expect(r.rows.find((x) => x.name === 'Cole Westcott').unpriced).toBe(1)
  })

  it('leaves cancelled work out', () => {
    expect(r.rows.find((x) => x.name === 'Doug Webb').total).toBe(4000)
  })

  it('carries the jobs behind each row, biggest first', () => {
    // So clicking a rep shows the same deals the row was built from, rather
    // than a second query that could scope differently and disagree with it.
    expect(r.rows[0].jobs.map((j) => j.id)).toEqual([2, 1])
  })

  it('separates work nobody is on instead of hiding or blaming it', () => {
    const nobody = r.rows.find((x) => x.ownerId == null)
    expect(nobody.total).toBe(250)
    expect(r.rows[r.rows.length - 1]).toBe(nobody)
  })

  it('reports how much came through an estimate', () => {
    expect(r.rows.find((x) => x.name === 'Doug Webb').viaEstimate).toBe(1)
  })

  it('honours the window', () => {
    const aug = soldByRep(jobs, leads, { employees, start: '2026-08-01T00:00:00Z', end: '2026-09-01T00:00:00Z' })
    expect(aug.rows).toEqual([])
    expect(aug.total).toBe(0)
  })

  it('survives junk without throwing', () => {
    expect(soldByRep(null, null, {}).rows).toEqual([])
    expect(soldByRep([{ created_at: 'nonsense' }], []).count).toBe(0)
  })
})

describe('last month is a closed window', () => {
  it('ends where this month begins, so it stops moving', () => {
    const b = periodBounds('lastmonth', new Date(2026, 8, 28))
    expect(b.start).toBe(new Date(2026, 7, 1).toISOString())
    expect(b.end).toBe(new Date(2026, 8, 1).toISOString())
  })
})

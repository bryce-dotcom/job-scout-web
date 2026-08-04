import { describe, it, expect } from 'vitest'
import { soldTotal, periodBounds } from './soldTotals'

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

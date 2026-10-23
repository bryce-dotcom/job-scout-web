import { describe, it, expect } from 'vitest'
import { isOverheadSpend, overheadRatePerHour } from './overhead'
import { hourlyCostRate } from './laborRate'

describe('what counts as overhead', () => {
  it('counts the costs the company pays whether or not a job exists', () => {
    for (const c of ['Rent', 'Utilities', 'Insurance', 'Fuel', 'Vehicle Maintenance',
      'Equipment', 'Supplies', 'Subscriptions', 'Travel', 'Software', 'Advertising',
      'Equipment Rental', 'Small Tools & Consumables']) {
      expect(isOverheadSpend(c), c).toBe(true)
    }
  })

  it('refuses direct job cost — spreading one job\'s materials over every job is worse than missing it', () => {
    for (const c of ['Cost of Goods Sold', 'Job Materials', 'Subcontractors', 'COGS']) {
      expect(isOverheadSpend(c), c).toBe(false)
    }
  })

  it('refuses payroll, which job costing already charges by the hour', () => {
    for (const c of ['Payroll', 'Wages', 'Salaries']) expect(isOverheadSpend(c), c).toBe(false)
  })

  it('refuses money that is not an operating cost at all', () => {
    for (const c of ['Loan Payment', 'Transfer', 'Owner Distribution', 'Owner Draw', 'Credit Card Payment']) {
      expect(isOverheadSpend(c), c).toBe(false)
    }
  })

  it('leaves uncategorised spend out rather than guessing', () => {
    for (const c of ['', null, undefined, 'Other', 'Miscellaneous']) {
      expect(isOverheadSpend(c), String(c)).toBe(false)
    }
  })
})

describe('the rate per person-hour', () => {
  const now = new Date('2026-10-12T12:00:00Z')
  const base = {
    plaidTransactions: [
      { id: 1, amount: 3000, category: 'Rent', date: '2026-10-01' },
      { id: 2, amount: 1000, category: 'Insurance', date: '2026-09-20' },
      { id: 3, amount: 50000, category: 'Payroll', date: '2026-10-01' },      // never
      { id: 4, amount: 9000, category: 'Cost of Goods Sold', date: '2026-10-01' }, // never
      { id: 5, amount: 2000, category: 'Transfer', date: '2026-10-01', is_transfer: true },
      { id: 6, amount: 500, category: 'Fuel', date: '2026-10-02', job_id: 7 },  // the job pays it
      { id: 7, amount: 800, category: 'Rent', date: '2025-01-01' },             // outside the window
    ],
    timeClock: [
      { job_id: 7, clock_in: '2026-10-02T13:00:00Z', total_hours: 100 },
      { job_id: 8, clock_in: '2026-10-03T13:00:00Z', total_hours: 100 },
      { job_id: null, clock_in: '2026-10-03T13:00:00Z', total_hours: 500 },     // office time
    ],
  }

  it('divides real overhead by the hours worked on jobs', () => {
    const r = overheadRatePerHour({ ...base, now })
    expect(r.pool).toBe(4000)     // rent + insurance only
    expect(r.hours).toBe(200)     // job hours only; office time does not dilute it
    expect(r.perHour).toBe(20)
  })

  it('ignores spend already tagged to a job, and spend outside the window', () => {
    const r = overheadRatePerHour({ ...base, now })
    expect(r.included.map(x => x.category).sort()).toEqual(['Insurance', 'Rent'])
  })

  it('shows what went into the pool, so the number can be argued with', () => {
    const r = overheadRatePerHour({ ...base, now })
    expect(r.included[0]).toEqual({ category: 'Rent', amount: 3000 })
  })

  it('never double counts a receipt already matched to its bank row', () => {
    const r = overheadRatePerHour({
      plaidTransactions: [{ id: 11, amount: 1200, category: 'Insurance', date: '2026-10-01' }],
      expenses: [{ plaid_transaction_id: 11, amount: 1200, category: 'Insurance', date: '2026-10-01' }],
      timeClock: [{ job_id: 1, clock_in: '2026-10-01T13:00:00Z', total_hours: 100 }],
      now,
    })
    expect(r.pool).toBe(1200)
  })

  it('is zero when there is no overhead or no hours — it never invents a cost', () => {
    expect(overheadRatePerHour({ now }).perHour).toBe(0)
    expect(overheadRatePerHour({ ...base, timeClock: [], now }).perHour).toBe(0)
    expect(overheadRatePerHour({ plaidTransactions: [], timeClock: base.timeClock, now }).perHour).toBe(0)
  })

  it('derives hours from the clock pair when total_hours is blank', () => {
    const r = overheadRatePerHour({
      plaidTransactions: [{ id: 1, amount: 100, category: 'Rent', date: '2026-10-01' }],
      timeClock: [{ job_id: 1, clock_in: '2026-10-01T13:00:00Z', clock_out: '2026-10-01T23:00:00Z' }],
      now,
    })
    expect(r.hours).toBe(10)
    expect(r.perHour).toBe(10)
  })
})

// ── The office half of payroll ────────────────────────────────────────────
import { offJobLabourCost, overheadRatePerHour as rate } from './overhead'

const CO = { futa_rate_pct: 0.6, sui_rate_pct: 0.2, workers_comp_class_codes: {} }
const WIN = { from: '2026-07-14', to: '2026-10-12' }   // 91 days

describe('time nobody billed for', () => {
  it('charges a salaried person who never clocks — their pay reached nothing before', () => {
    // Bryce: $96,000, clocks nothing. 91/365 of it, plus burden.
    const r = offJobLabourCost({
      employees: [{ id: 3, name: 'Bryce', is_salary: true, annual_salary: 96000, active: true }],
      timeClock: [], company: CO, ...WIN,
    })
    expect(r.days).toBe(91)
    expect(r.total).toBeGreaterThan(96000 * (91 / 365))      // burden on top
    expect(r.total).toBeLessThan(96000 * (91 / 365) * 1.1)
    expect(r.perEmployee[0].basis).toBe('salary less what reached jobs')
  })

  it('does NOT charge twice for a salaried person whose time went to jobs', () => {
    // The hours already landed on the jobs; only the remainder is overhead.
    const emp = { id: 14, name: 'Christopher', is_salary: true, annual_salary: 84000, active: true }
    const alone = offJobLabourCost({ employees: [emp], timeClock: [], company: CO, ...WIN }).total
    const withJobs = offJobLabourCost({
      employees: [emp], company: CO, ...WIN,
      timeClock: [{ employee_id: 14, job_id: 5, clock_in: '2026-08-01T13:00:00Z', total_hours: 100 }],
    }).total
    expect(withJobs).toBeLessThan(alone)
    expect(alone - withJobs).toBeCloseTo(100 * hourlyCostRate(emp, CO), 2)
  })

  it('never goes negative when someone bills more hours than their salary covers', () => {
    const r = offJobLabourCost({
      employees: [{ id: 1, is_salary: true, annual_salary: 40000, active: true }],
      company: CO, ...WIN,
      timeClock: [{ employee_id: 1, job_id: 5, clock_in: '2026-08-01T13:00:00Z', total_hours: 5000 }],
    })
    expect(r.total).toBe(0)
  })

  it('charges an hourly person only for the hours no job paid for', () => {
    const r = offJobLabourCost({
      employees: [{ id: 18, name: 'Tracy', is_hourly: true, hourly_rate: 23, active: true }],
      company: CO, ...WIN,
      timeClock: [
        { employee_id: 18, job_id: null, clock_in: '2026-08-01T13:00:00Z', total_hours: 100 },
        { employee_id: 18, job_id: 7, clock_in: '2026-08-02T13:00:00Z', total_hours: 10 },
      ],
    })
    expect(r.perEmployee[0].offJobHours).toBe(100)
    expect(r.perEmployee[0].jobHours).toBe(10)
    expect(r.total).toBeCloseTo(100 * hourlyCostRate({ is_hourly: true, hourly_rate: 23 }, CO), 2)
  })

  it('ignores hours outside the window and people who left having clocked nothing', () => {
    const r = offJobLabourCost({
      employees: [{ id: 9, is_hourly: true, hourly_rate: 20, active: false }],
      company: CO, ...WIN,
      timeClock: [{ employee_id: 9, job_id: null, clock_in: '2025-01-01T13:00:00Z', total_hours: 100 }],
    })
    expect(r.total).toBe(0)
  })

  it('lands in the pool, and the rate rises with it', () => {
    const common = {
      plaidTransactions: [{ id: 1, amount: 1000, category: 'Rent', date: '2026-10-01' }],
      timeClock: [{ employee_id: 1, job_id: 7, clock_in: '2026-10-02T13:00:00Z', total_hours: 100 }],
      now: new Date('2026-10-12T12:00:00Z'),
    }
    const without = rate(common)
    const with_ = rate({ ...common, company: CO, employees: [{ id: 2, is_hourly: true, hourly_rate: 25, active: true }], })
    expect(without.perHour).toBe(10)
    expect(without.offJobLabour).toBe(0)
    // Employee 2 clocked nothing at all and is hourly, so still nothing.
    expect(with_.perHour).toBe(10)
    const withOffJob = rate({
      ...common, company: CO,
      employees: [{ id: 2, is_hourly: true, hourly_rate: 25, active: true }],
      timeClock: [...common.timeClock, { employee_id: 2, job_id: null, clock_in: '2026-10-02T13:00:00Z', total_hours: 40 }],
    })
    expect(withOffJob.offJobLabour).toBeGreaterThan(1000)
    expect(withOffJob.perHour).toBeGreaterThan(without.perHour)
    expect(withOffJob.spend).toBe(1000)
  })
})

describe('the revenue basis', () => {
  const now = new Date('2026-10-12T12:00:00Z')
  const jobStatuses = [{ id: 'Completed', category: 'delivered' }]
  const common = {
    plaidTransactions: [{ id: 1, amount: 6000, category: 'Rent', date: '2026-10-01' }],
    timeClock: [{ employee_id: 1, job_id: 7, clock_in: '2026-10-02T13:00:00Z', total_hours: 100 }],
    now,
  }
  const jobs = [
    { id: 7, status: 'Completed', job_total: 40000, completed_at: '2026-10-02T18:00:00Z' },
    { id: 8, status: 'Completed', job_total: 60000, completed_at: '2026-10-03T18:00:00Z' },
  ]

  it('is the pool as a percentage of what the delivered work was worth', () => {
    const r = overheadRatePerHour({ ...common, jobs, jobStatuses })
    expect(r.revenue).toBe(100000)
    expect(r.deliveredJobs).toBe(2)
    expect(r.pctOfRevenue).toBe(6)
  })

  it('still reports the hourly rate beside it, so the two can be compared', () => {
    const r = overheadRatePerHour({ ...common, jobs, jobStatuses })
    expect(r.perHour).toBe(60)      // 6000 over 100 job hours
    expect(r.pctOfRevenue).toBe(6)
  })

  it('is zero when nothing was delivered, rather than dividing by nothing', () => {
    const r = overheadRatePerHour({ ...common, jobs: [], jobStatuses })
    expect(r.pctOfRevenue).toBe(0)
    expect(r.revenue).toBe(0)
  })

  it('ignores work delivered outside the window', () => {
    const old = [{ id: 9, status: 'Completed', job_total: 999999, completed_at: '2024-01-01T18:00:00Z' }]
    expect(overheadRatePerHour({ ...common, jobs: old, jobStatuses }).revenue).toBe(0)
  })
})

// ── The other half of that same HHH row ───────────────────────────────────
// lib/overhead dropped it from the pool "because the job pays for it", on a
// 0.50-confidence guess. Nothing is lost by keeping an unreviewed row here:
// an untagged expense belongs in the pool and gets spread over the hours,
// which is how every other untagged expense is already treated.
describe('an AI job guess does not leave the overhead pool', () => {
  const now = new Date('2026-10-12T12:00:00Z')
  const timeClock = [{ job_id: 1, clock_in: '2026-10-01T13:00:00Z', total_hours: 100 }]
  const pool = (txn) => overheadRatePerHour({ plaidTransactions: [txn], timeClock, now }).pool

  it('excludes a row a person tagged to a job', () => {
    expect(pool({ id: 1, amount: 26.39, category: 'Subscriptions', date: '2026-10-01', job_id: 7 })).toBe(0)
  })

  it('keeps a row the matcher only guessed at', () => {
    expect(pool({ id: 2, amount: 26.39, category: 'Subscriptions', date: '2026-10-01', ai_job_id: 7, ai_job_confidence: 0.5 })).toBe(26.39)
  })

  it('keeps it on a confirmed row whose job a person cleared', () => {
    expect(pool({ id: 3, amount: 26.39, category: 'Subscriptions', date: '2026-10-01', job_id: null, ai_job_id: 7, confirmed: true })).toBe(26.39)
  })
})

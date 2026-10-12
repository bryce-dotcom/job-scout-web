import { describe, it, expect } from 'vitest'
import { isOverheadSpend, overheadRatePerHour } from './overhead'

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

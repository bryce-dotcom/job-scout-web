import { describe, it, expect } from 'vitest'
import { businessDaysBetween, ptoDaysInPeriod, ptoBalanceDays } from './ptoThisPeriod'

// The demo's current period: Sat 12 Sep – Fri 25 Sep 2026.
const P = ['2026-09-12', '2026-09-25']
const approved = (o) => ({ status: 'approved', request_type: 'pto', employee_id: 135, ...o })

describe('business days', () => {
  it('counts weekdays only, inclusive', () => {
    expect(businessDaysBetween('2026-09-14', '2026-09-18')).toBe(5)   // Mon–Fri
    expect(businessDaysBetween('2026-09-12', '2026-09-13')).toBe(0)   // Sat–Sun
    expect(businessDaysBetween('2026-09-14', '2026-09-14')).toBe(1)
  })
  it('is zero for a backwards or unreadable range', () => {
    expect(businessDaysBetween('2026-09-18', '2026-09-14')).toBe(0)
    expect(businessDaysBetween(null, '2026-09-14')).toBe(0)
  })
})

describe('PTO used in the pay period', () => {
  it('two approved days inside the period are two days', () => {
    expect(ptoDaysInPeriod([approved({ start_date: '2026-09-14', end_date: '2026-09-15' })], 135, ...P)).toBe(2)
  })

  it('a week off that straddles the period end is charged only for the days inside it', () => {
    // Wed 23 Sep – Tue 29 Sep: 23, 24, 25 inside; 28, 29 belong to the next period.
    expect(ptoDaysInPeriod([approved({ start_date: '2026-09-23', end_date: '2026-09-29' })], 135, ...P)).toBe(3)
  })

  it('pending and denied requests do not count', () => {
    const rows = [
      approved({ start_date: '2026-09-14', end_date: '2026-09-14', status: 'pending' }),
      approved({ start_date: '2026-09-15', end_date: '2026-09-15', status: 'denied' }),
    ]
    expect(ptoDaysInPeriod(rows, 135, ...P)).toBe(0)
  })

  it('sick, personal and unpaid leave are not charged to the PTO bank', () => {
    const rows = ['sick', 'personal', 'unpaid'].map(t => approved({ start_date: '2026-09-14', end_date: '2026-09-14', request_type: t }))
    expect(ptoDaysInPeriod(rows, 135, ...P)).toBe(0)
  })

  it('only the named employee', () => {
    expect(ptoDaysInPeriod([approved({ start_date: '2026-09-14', end_date: '2026-09-15', employee_id: 136 })], 135, ...P)).toBe(0)
  })

  it('a request entirely outside the period is nothing', () => {
    expect(ptoDaysInPeriod([approved({ start_date: '2026-10-05', end_date: '2026-10-06' })], 135, ...P)).toBe(0)
  })
})

describe('balance', () => {
  it('is accrued minus used, tolerating blanks', () => {
    expect(ptoBalanceDays({ pto_accrued: 6, pto_used: 1.5 })).toBe(4.5)
    expect(ptoBalanceDays({})).toBe(0)
  })
})

import { describe, it, expect } from 'vitest'
import { payDateForPeriod } from './payDate'

// HHH's real schedule: semi-monthly, paydays on the 20th and the 5th.
const HHH = { pay_frequency: 'semi-monthly', pay_day_1: '20', pay_day_2: '5' }

describe('payDateForPeriod — semi-monthly', () => {
  it('pays the period ending mid-month on the 20th (Alayda\'s case)', () => {
    // The stub said "Paid May 15" for a May 1–15 period. It pays May 20.
    expect(payDateForPeriod('2026-05-15', HHH)).toBe('2026-05-20')
  })

  it('pays the period ending month-end on the 5th of the NEXT month', () => {
    expect(payDateForPeriod('2026-05-31', HHH)).toBe('2026-06-05')
  })

  it('never returns a date on or before the period end', () => {
    for (const end of ['2026-01-15', '2026-01-31', '2026-02-28', '2026-05-20', '2026-12-31']) {
      const pay = payDateForPeriod(end, HHH)
      expect(pay > end).toBe(true)
    }
  })

  it('rolls the year over correctly', () => {
    expect(payDateForPeriod('2026-12-31', HHH)).toBe('2027-01-05')
  })

  it('handles a period ending exactly on a payday by moving to the next one', () => {
    expect(payDateForPeriod('2026-05-20', HHH)).toBe('2026-06-05')
  })

  it('clamps a day-of-month that overflows a short month', () => {
    expect(payDateForPeriod('2026-02-26', { pay_frequency: 'semi-monthly', pay_day_1: '31', pay_day_2: '28' }))
      .toBe('2026-02-28')
  })
})

describe('payDateForPeriod — other frequencies', () => {
  it('bi-weekly pays a few days after the period closes', () => {
    expect(payDateForPeriod('2026-05-15', { pay_frequency: 'bi-weekly' })).toBe('2026-05-20')
  })

  it('monthly uses the single configured payday', () => {
    expect(payDateForPeriod('2026-05-31', { pay_frequency: 'monthly', pay_day_1: '10' })).toBe('2026-06-10')
  })
})

describe('payDateForPeriod — bad input', () => {
  it('returns null rather than a wrong date', () => {
    expect(payDateForPeriod(null, HHH)).toBeNull()
    expect(payDateForPeriod('', HHH)).toBeNull()
    expect(payDateForPeriod('not-a-date', HHH)).toBeNull()
  })

  it('accepts a Date object as well as a string', () => {
    expect(payDateForPeriod(new Date(2026, 4, 15), HHH)).toBe('2026-05-20')
  })
})

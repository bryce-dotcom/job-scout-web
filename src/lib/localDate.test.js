import { describe, it, expect } from 'vitest'
import { localDateStr } from './localDate'
import { getCurrentPayPeriod } from './bonusCalc'

// Alayda, 14 Aug: "the pay period is incorrect & off by one day it is supposed
// to be till the end of the month - the last day. The system is reading to the
// first of the month which throws it off."

describe('the last day of the month stays the last day', () => {
  it('does not roll a late-evening local time into tomorrow', () => {
    // 23:59:59 on the 31st — what a period end actually is.
    expect(localDateStr(new Date(2026, 7, 31, 23, 59, 59))).toBe('2026-08-31')
  })

  it('the semi-monthly period end reads as the end of the month', () => {
    const { periodEnd } = getCurrentPayPeriod({ pay_frequency: 'semi-monthly' }, 0)
    const str = localDateStr(periodEnd)
    // Whatever today is, the string must be the same calendar day the Date is.
    expect(str).toBe(`${periodEnd.getFullYear()}-${String(periodEnd.getMonth() + 1).padStart(2, '0')}-${String(periodEnd.getDate()).padStart(2, '0')}`)
    expect(str.endsWith('-01')).toBe(periodEnd.getDate() === 1)
  })

  it('start and end of every frequency round-trip to their own calendar day', () => {
    for (const pay_frequency of ['weekly', 'bi-weekly', 'semi-monthly', 'monthly']) {
      for (const offset of [-1, 0, 1]) {
        const { periodStart, periodEnd } = getCurrentPayPeriod({ pay_frequency }, offset)
        for (const [name, d] of [['start', periodStart], ['end', periodEnd]]) {
          expect(localDateStr(d), `${pay_frequency} ${name} @${offset}`)
            .toBe(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
        }
      }
    }
  })
})

describe('bad input fails visibly, not confidently', () => {
  it('never returns the epoch for a missing value', () => {
    for (const bad of [null, undefined, '']) expect(localDateStr(bad)).toBe('')
  })

  it('returns empty for an unparseable date', () => {
    expect(localDateStr('not a date')).toBe('')
    expect(localDateStr(new Date('nonsense'))).toBe('')
  })

  it('accepts a date string and keeps its day', () => {
    expect(localDateStr('2026-08-31T23:59:59')).toBe('2026-08-31')
  })

  it('zero-pads so the strings compare and sort correctly', () => {
    expect(localDateStr(new Date(2026, 0, 5))).toBe('2026-01-05')
  })
})

import { describe, it, expect } from 'vitest'
import {
  quoteWriteDecision, quoteAmountMismatch,
  WRITE, SKIP_NO_LINES, SKIP_ZERO_OVER_POSITIVE,
} from './quoteTotal'

// The incident: EST-MOUH4ST4 "pioneer metals" stored $732,220.44 against
// $111,405.64 of real line items. The old guard refused any write that more
// than halved the stored value, so the wrong number could never be corrected.

describe('a big drop is data, not a loading artifact', () => {
  it('WRITES the real total even though it is a fraction of what is stored', () => {
    const d = quoteWriteDecision(111405.64, 732220.44, 5)
    expect(d.action).toBe(WRITE)
  })

  it('writes a drop far beyond the old 50% cutoff', () => {
    expect(quoteWriteDecision(100, 100000, 3).action).toBe(WRITE)
  })

  it('writes an increase', () => {
    expect(quoteWriteDecision(500000, 1000, 4).action).toBe(WRITE)
  })

  it('writes when nothing is stored yet', () => {
    expect(quoteWriteDecision(111405.64, 0, 5).action).toBe(WRITE)
  })
})

describe('genuinely ambiguous cases stay blocked', () => {
  it('refuses when no lines are loaded — could be mid-fetch', () => {
    const d = quoteWriteDecision(0, 732220.44, 0)
    expect(d.action).toBe(SKIP_NO_LINES)
  })

  it('refuses to write $0 over a real amount', () => {
    // Lines present but unpriced — not proof the quote is worth nothing.
    expect(quoteWriteDecision(0, 5000, 3).action).toBe(SKIP_ZERO_OVER_POSITIVE)
  })

  it('allows $0 when nothing is stored either', () => {
    expect(quoteWriteDecision(0, 0, 0).action).toBe(WRITE)
  })

  it('every refusal explains itself', () => {
    for (const d of [quoteWriteDecision(0, 100, 0), quoteWriteDecision(0, 100, 2)]) {
      expect(d.reason.length).toBeGreaterThan(0)
    }
  })
})

describe('surfacing a mismatch to the user', () => {
  it('reports the pioneer metals gap', () => {
    const m = quoteAmountMismatch(732220.44, 111405.64, 5)
    expect(m.overstated).toBe(true)
    expect(m.delta).toBeCloseTo(620814.80, 2)
  })

  it('reports an understatement too', () => {
    expect(quoteAmountMismatch(1000, 5000, 3).overstated).toBe(false)
  })

  it('says nothing when they agree', () => {
    expect(quoteAmountMismatch(111405.64, 111405.64, 5)).toBeNull()
  })

  it('ignores rounding noise', () => {
    expect(quoteAmountMismatch(100.00, 100.009, 2)).toBeNull()
  })

  it('says nothing when there are no lines to compare against', () => {
    expect(quoteAmountMismatch(732220.44, 0, 0)).toBeNull()
  })
})

describe('junk input', () => {
  it('does not throw or produce NaN', () => {
    for (const args of [[null, null, null], ['x', 'y', 'z'], [undefined, 5, 1]]) {
      const d = quoteWriteDecision(...args)
      expect(typeof d.action).toBe('string')
    }
  })
})

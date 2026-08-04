import { describe, it, expect } from 'vitest'
import {
  quoteWriteDecision, quoteAmountMismatch,
  WRITE, SKIP_NO_LINES, SKIP_ZERO_OVER_POSITIVE,
  effectiveQuoteAmount, sumQuoteLines, quoteSummary,
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

describe('the line items are the truth, not the cached column', () => {
  // Why EST-MOUH4ST4 needed a manual data repair: the pipeline read
  // quotes.quote_amount ($732,220.44) while the estimate page computed from
  // the lines ($111,405.64). Deriving from the lines means no repair, ever.
  it('prefers the line sum over a stale stored amount', () => {
    expect(effectiveQuoteAmount({ quote_amount: 732220.44 }, 111405.64)).toBe(111405.64)
  })

  it('prefers the line sum when it is LARGER too', () => {
    expect(effectiveQuoteAmount({ quote_amount: 1000 }, 50000)).toBe(50000)
  })

  it('falls back to the stored amount for a lump-sum quote with no lines', () => {
    // No itemisation is not evidence the quote is worth nothing.
    expect(effectiveQuoteAmount({ quote_amount: 25000 }, 0)).toBe(25000)
    expect(effectiveQuoteAmount({ quote_amount: 25000 }, null)).toBe(25000)
  })

  it('returns 0 when there is neither', () => {
    expect(effectiveQuoteAmount({}, 0)).toBe(0)
    expect(effectiveQuoteAmount(null, null)).toBe(0)
  })

  it('sums line_total, the column that is actually populated', () => {
    expect(sumQuoteLines([{ line_total: 26550.72 }, { line_total: 26669.72 }])).toBeCloseTo(53220.44, 2)
  })

  it('accepts rows that use `total` instead', () => {
    expect(sumQuoteLines([{ total: 100 }, { line_total: 50 }])).toBe(150)
  })

  it('does not report a quote as $0 just because `total` is null', () => {
    // The exact mistake my first audit made.
    expect(sumQuoteLines([{ line_total: 26550.72, total: null }])).toBeCloseTo(26550.72, 2)
  })

  it('survives junk rows', () => {
    expect(sumQuoteLines([{ line_total: 'x' }, null, {}])).toBe(0)
    expect(sumQuoteLines(null)).toBe(0)
  })
})

describe('a whole-project discount comes off the total', () => {
  // Bryce: "sometimes there is a discount that isnt the utility incentive so
  // that needs to be included in the totals as well". Mirrors
  // EstimateDetail: total = subtotal - discount.
  it('subtracts the discount from the line sum', () => {
    expect(effectiveQuoteAmount({ quote_amount: 0, discount: 540.40 }, 10481.60)).toBeCloseTo(9941.20, 2)
  })

  it('subtracts it from the stored amount too when there are no lines', () => {
    expect(effectiveQuoteAmount({ quote_amount: 2800, discount: 560 }, 0)).toBeCloseTo(2240, 2)
  })

  it('leaves an undiscounted quote alone', () => {
    // EST-MOUH4ST4 has no discount, so it stays at its line sum.
    expect(effectiveQuoteAmount({ quote_amount: 732220.44, discount: 0 }, 111405.64)).toBeCloseTo(111405.64, 2)
    expect(effectiveQuoteAmount({ quote_amount: 100 }, 500)).toBe(500)
  })

  it('does NOT subtract the utility incentive — that is out-of-pocket, not the contract', () => {
    const r = effectiveQuoteAmount({ quote_amount: 0, discount: 0, utility_incentive: 75600 }, 111405.64)
    expect(r).toBeCloseTo(111405.64, 2)
  })

  it('never goes negative on an over-large discount', () => {
    expect(effectiveQuoteAmount({ quote_amount: 0, discount: 99999 }, 500)).toBe(0)
  })
})

describe('quoteSummary — the Estimate Summary block, one definition', () => {
  // Bryce's screenshot: Subtotal $27,604.86, no discount, incentive 20,516,
  // Total $27,604.86, Out of Pocket $7,088.86.
  const q = { quote_amount: 0, discount: 0, utility_incentive: 20516 }

  it('reproduces the summary block exactly', () => {
    const s = quoteSummary(q, 27604.86)
    expect(s.subtotal).toBeCloseTo(27604.86, 2)
    expect(s.total).toBeCloseTo(27604.86, 2)
    expect(s.outOfPocket).toBeCloseTo(7088.86, 2)
  })

  it('Total ignores the incentive; only Out of Pocket uses it', () => {
    const s = quoteSummary(q, 27604.86)
    expect(s.total).not.toBeCloseTo(s.outOfPocket, 2)
    expect(s.total - s.incentive).toBeCloseTo(s.outOfPocket, 2)
  })

  it('the discount reduces Total, and Out of Pocket follows it down', () => {
    const s = quoteSummary({ ...q, discount: 1000 }, 27604.86)
    expect(s.total).toBeCloseTo(26604.86, 2)
    expect(s.outOfPocket).toBeCloseTo(6088.86, 2)
  })

  it('is the SAME number the board shows', () => {
    // The whole point: one function, so they cannot drift apart again.
    expect(effectiveQuoteAmount(q, 27604.86)).toBeCloseTo(quoteSummary(q, 27604.86).total, 2)
  })

  it('falls back to the stored amount for a lump-sum quote', () => {
    expect(quoteSummary({ quote_amount: 5000 }, 0).total).toBe(5000)
  })
})

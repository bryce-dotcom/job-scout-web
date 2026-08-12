import { describe, it, expect } from 'vitest'
import { bonusRowAmount } from './bonusCalc'


describe('bonusRowAmount — the row shape that crashed FieldScout', () => {
  // Caught in production by the crash log, with breadcrumbs giving the exact
  // repro: click Clock Out -> tap "Bonus Earned This Pay Period" ->
  // "undefined is not an object (evaluating 'ut.bonusAmount.toFixed')".
  // A BLOCKED bonus carries wouldHaveEarned and no bonusAmount at all.
  it('reads a held row from wouldHaveEarned instead of throwing', () => {
    const held = { wouldHaveEarned: 42.5, jobTitle: 'Juan Diego' }
    expect(() => bonusRowAmount(held).amount.toFixed(2)).not.toThrow()
    expect(bonusRowAmount(held)).toEqual({ amount: 42.5, held: true })
  })

  it('shows a held bonus at its REAL value, never zero', () => {
    // Verification is a flag, not a wipe. Showing $0.00 tells a tech the
    // money was taken away when it is only waiting on a photo.
    expect(bonusRowAmount({ wouldHaveEarned: 120 }).amount).toBe(120)
  })

  it('adds the coverage penalty back on a released row', () => {
    expect(bonusRowAmount({ bonusAmount: 30, coveragePenalty: 10 }))
      .toEqual({ amount: 40, held: false })
  })

  it('treats a weighted-out row as held even though it has an amount', () => {
    expect(bonusRowAmount({ bonusAmount: 0, weightedOut: true, wouldHaveEarned: 55 }))
      .toEqual({ amount: 55, held: true })
  })

  it('survives the shapes that would crash a renderer', () => {
    for (const junk of [null, undefined, {}]) {
      const r = bonusRowAmount(junk)
      expect(typeof r.amount).toBe('number')
      expect(() => r.amount.toFixed(2)).not.toThrow()
    }
  })
})

import { describe, it, expect } from 'vitest'
import {
  DEDUCTION_KINDS, DEDUCTION_KIND_KEYS,
  deductionKind, deductionAmount, isAbsorbed, needsClassifying,
  classifyProblem, classifyPatch, describeDeduction, absorbedTotal,
} from './writeOff'

const inv = (over = {}) => ({ id: 1, amount: 300, discount_applied: 300, ...over })

describe('a gift is not a discount', () => {
  it('separates what we gave away from what we simply priced lower', () => {
    // The distinction Tracy asked for. Lumping them together would make the
    // write-off figure useless the week it shipped.
    expect(DEDUCTION_KINDS.goodwill.absorbed).toBe(true)
    expect(DEDUCTION_KINDS.write_off.absorbed).toBe(true)
    expect(DEDUCTION_KINDS.warranty.absorbed).toBe(true)
    expect(DEDUCTION_KINDS.discount.absorbed).toBe(false)
  })

  it('does not count a utility incentive as something we gave away', () => {
    // The customer never owed it — 29 of HHH's 57 deducted invoices.
    expect(DEDUCTION_KINDS.incentive.absorbed).toBe(false)
    expect(isAbsorbed(inv(), { carriesIncentive: true })).toBe(false)
  })
})

describe('what kind a deduction is', () => {
  it('is nothing until somebody says, which is every existing row', () => {
    expect(deductionKind(inv())).toBe(null)
    expect(deductionKind(inv({ deduction_kind: 'nonsense' }))).toBe(null)
  })

  it('is whatever was recorded', () => {
    expect(deductionKind(inv({ deduction_kind: 'goodwill' }))).toBe('goodwill')
  })

  it('is DERIVED for a utility incentive, never read off the row', () => {
    // invoiceSections#invoiceCarriesIncentive is the one that knows, from four
    // places. A typed value must not be able to contradict it.
    expect(deductionKind(inv({ deduction_kind: 'goodwill' }), { carriesIncentive: true })).toBe('incentive')
  })
})

describe('which invoices nobody can explain', () => {
  it('flags a deduction with no kind on it', () => {
    expect(needsClassifying(inv())).toBe(true)
  })

  it('leaves an incentive alone', () => {
    expect(needsClassifying(inv(), { carriesIncentive: true })).toBe(false)
  })

  it('leaves a classified one alone', () => {
    expect(needsClassifying(inv({ deduction_kind: 'write_off' }))).toBe(false)
  })

  it('ignores an invoice with no deduction at all', () => {
    expect(needsClassifying(inv({ discount_applied: 0 }))).toBe(false)
    expect(needsClassifying(inv({ discount_applied: null }))).toBe(false)
    expect(deductionAmount(inv({ discount_applied: 'x' }))).toBe(0)
  })
})

describe('saying why is the whole point', () => {
  it('refuses a gift or a write-off with no reason', () => {
    expect(classifyProblem({ kind: 'goodwill' })).toMatch(/Say why/)
    expect(classifyProblem({ kind: 'write_off', reason: '   ' })).toMatch(/Say why/)
    expect(classifyProblem({ kind: 'warranty', reason: '' })).toMatch(/Say why/)
  })

  it('allows a plain discount without one', () => {
    expect(classifyProblem({ kind: 'discount' })).toBe(null)
  })

  it('accepts a gift once there is a reason', () => {
    expect(classifyProblem({ kind: 'goodwill', reason: 'Bereavement — funeral' })).toBe(null)
  })

  it('refuses an incentive typed by hand', () => {
    expect(classifyProblem({ kind: 'incentive', reason: 'x' })).toMatch(/worked out from the job/)
  })

  it('refuses nothing at all', () => {
    expect(classifyProblem({})).toMatch(/Pick what kind/)
  })
})

describe('what gets written', () => {
  it('stores the kind and a trimmed reason', () => {
    expect(classifyPatch({ kind: 'goodwill', reason: '  Bereavement  ' }))
      .toEqual({ deduction_kind: 'goodwill', deduction_reason: 'Bereavement' })
  })

  it('stores a blank reason as null, not an empty string', () => {
    expect(classifyPatch({ kind: 'discount', reason: '  ' }).deduction_reason).toBe(null)
  })

  it('never touches the amount', () => {
    // discount_applied is the total deduction and lib/invoiceMoney owns it.
    // This feature records meaning, never money.
    expect(Object.keys(classifyPatch({ kind: 'write_off', reason: 'x' })))
      .toEqual(['deduction_kind', 'deduction_reason'])
  })
})

describe('reading it back', () => {
  it('describes an unexplained deduction as exactly that', () => {
    expect(describeDeduction(inv())).toMatchObject({ amount: 300, kind: null, label: 'Unexplained', absorbed: false })
  })

  it('describes a gift with its reason', () => {
    const d = describeDeduction(inv({ deduction_kind: 'goodwill', deduction_reason: 'Bereavement' }))
    expect(d).toMatchObject({ amount: 300, label: 'Goodwill / gift', absorbed: true, reason: 'Bereavement' })
  })

  it('says nothing when there is no deduction', () => {
    expect(describeDeduction(inv({ discount_applied: 0 }))).toBe(null)
  })

  it('totals only what the company absorbed', () => {
    const rows = [
      inv({ discount_applied: 300, deduction_kind: 'goodwill' }),
      inv({ discount_applied: 500, deduction_kind: 'discount' }),
      inv({ discount_applied: 120.5, deduction_kind: 'warranty' }),
      inv({ discount_applied: 8472.98 }), // unclassified — not counted
    ]
    expect(absorbedTotal(rows)).toBe(420.5)
  })

  it('excludes incentives from the total even when told per-invoice', () => {
    const rows = [inv({ discount_applied: 300, deduction_kind: 'goodwill' }), inv({ discount_applied: 9000 })]
    expect(absorbedTotal(rows, (i) => ({ carriesIncentive: i.discount_applied === 9000 }))).toBe(300)
  })
})

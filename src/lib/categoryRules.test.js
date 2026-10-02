import { describe, it, expect } from 'vitest'
import { ruleDecision, RULE_EVIDENCE_THRESHOLD } from '../../supabase/functions/_shared/categoryRules.ts'

// Rule learning is automatic — confirming a transaction teaches a rule for that
// merchant, and the rule then categorises every future transaction there. It has
// caused real damage twice from a SINGLE observation:
//
//   "draft -> Subscriptions"       107 check drafts, $173,740.92
//   "the home depot -> Transfer"   38 purchases relabelled as transfers, and
//                                  $5,715 of expense that would have left the
//                                  books once the flag followed the label
//
// isUnsafePattern was the answer to the first, and it is necessary but not
// sufficient: "the home depot" is a perfectly specific pattern. The hole was the
// evidence — one person, once, deciding one receipt was unusual.

describe('a rule needs evidence, not one receipt', () => {
  const base = { merchantLabel: 'The Home Depot', category: 'Job Materials', existingCategory: null }

  it('does not learn from a single confirmation', () => {
    const d = ruleDecision({ ...base, agreeingCount: 1 })
    expect(d.action).toBe('skip')
    expect(d.message).toBe(null)          // nothing to announce, because nothing happened
    expect(d.reason).toMatch(/1 of 3/)
  })

  it('still does not learn one short of the threshold', () => {
    expect(ruleDecision({ ...base, agreeingCount: RULE_EVIDENCE_THRESHOLD - 1 }).action).toBe('skip')
  })

  it('learns once enough confirmations agree, and says so', () => {
    const d = ruleDecision({ ...base, agreeingCount: RULE_EVIDENCE_THRESHOLD })
    expect(d.action).toBe('create')
    expect(d.message).toContain('The Home Depot')
    expect(d.message).toContain('Job Materials')
    expect(d.message).toMatch(/Rules/)    // tells them where to change it
  })

  it('the Home Depot case: one Transfer receipt earns nothing', () => {
    // The confirmation that caused the incident. Even without the separate
    // never-learn-Transfer guard, the evidence rule alone stops it.
    const d = ruleDecision({ merchantLabel: 'The Home Depot', category: 'Transfer', existingCategory: null, agreeingCount: 1 })
    expect(d.action).toBe('skip')
  })
})

describe('a rule you contradict is dropped, not replaced', () => {
  it('drops the old rule and explains why', () => {
    const d = ruleDecision({
      merchantLabel: 'The Home Depot', category: 'Job Materials',
      existingCategory: 'Transfer', agreeingCount: 1,
    })
    expect(d.action).toBe('drop')
    expect(d.message).toContain('Transfer')
    expect(d.message).toContain('Job Materials')
  })

  it('does not replace it with another single observation', () => {
    // Replacing one unearned rule with another is how a bad rule survives as a
    // different bad rule. It is dropped, and re-learned only on evidence.
    const d = ruleDecision({
      merchantLabel: 'X', category: 'Fuel', existingCategory: 'Meals', agreeingCount: 1,
    })
    expect(d.action).not.toBe('create')
    expect(d.action).not.toBe('update')
  })

  it('a bad rule dies on the FIRST disagreement, so it is self-healing', () => {
    // Nobody should have to find the rules screen to undo a wrong rule.
    expect(ruleDecision({ merchantLabel: 'X', category: 'Fuel', existingCategory: 'Transfer', agreeingCount: 0 }).action).toBe('drop')
  })

  it('says nothing when the rule already agrees', () => {
    const d = ruleDecision({ merchantLabel: 'X', category: 'Fuel', existingCategory: 'Fuel', agreeingCount: 9 })
    expect(d.action).toBe('skip')
    expect(d.message).toBe(null)
  })

  it('ignores case and padding when comparing categories', () => {
    expect(ruleDecision({ merchantLabel: 'X', category: 'fuel', existingCategory: ' Fuel ', agreeingCount: 9 }).action).toBe('skip')
  })
})

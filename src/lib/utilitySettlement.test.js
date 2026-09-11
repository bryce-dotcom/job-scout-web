import { describe, it, expect } from 'vitest'
import { buildUtilityPaymentPatch, expectedUtilityAmount, noonUtc } from './utilitySettlement.js'

// These pin the rules the utility record page has applied for months, now
// that the invoice page applies them too. Any drift between the two pages
// would be a drift from this file first.

const row = { id: 96, incentive_amount: '10231.50', amount: '10231.50', project_cost: '23181.90', net_cost: '12950.40', notes: 'sent 2 Sep' }

describe('expectedUtilityAmount', () => {
  it('prefers incentive_amount, falls back to amount', () => {
    expect(expectedUtilityAmount({ incentive_amount: '5', amount: '9' })).toBe(5)
    expect(expectedUtilityAmount({ incentive_amount: null, amount: '9' })).toBe(9)
    expect(expectedUtilityAmount({})).toBe(0)
  })
})

describe('buildUtilityPaymentPatch — paid in full', () => {
  const { patch, shortBy, error } = buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '10231.50', note: 'ACH 88214' })

  it('marks the row Paid at noon UTC on the chosen day', () => {
    expect(error).toBeUndefined()
    expect(patch.payment_status).toBe('Paid')
    expect(patch.paid_at).toBe('2026-07-17T12:00:00.000Z')
    expect(noonUtc('2026-01-01')).toBe('2026-01-01T12:00:00.000Z')
  })

  it('appends the stamp to the existing notes, keeping them', () => {
    expect(patch.notes).toBe('sent 2 Sep\n\nPaid 2026-07-17 — ACH 88214')
  })

  it('does NOT touch the amounts when the payment matches', () => {
    expect(shortBy).toBe(0)
    expect(patch).not.toHaveProperty('incentive_amount')
    expect(patch).not.toHaveProperty('amount')
    expect(patch).not.toHaveProperty('net_cost')
  })

  it('a blank amount means "what was expected"', () => {
    const b = buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '' })
    expect(b.paidNum).toBe(10231.5)
    expect(b.patch).not.toHaveProperty('amount')
  })
})

describe('buildUtilityPaymentPatch — short-pay and over-pay', () => {
  it('records what was received and recomputes the customer share from project_cost', () => {
    const { patch, shortBy } = buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '9000' })
    expect(shortBy).toBe(1231.5)
    expect(patch.incentive_amount).toBe(9000)
    expect(patch.amount).toBe(9000)
    expect(patch.net_cost).toBe(14181.9)
    expect(patch.notes).toContain('short $1,231.50 (expected $10,231.50, received $9,000.00)')
  })

  it('says "over" when the utility paid more', () => {
    const { patch, shortBy } = buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '10500' })
    expect(shortBy).toBe(-268.5)
    expect(patch.amount).toBe(10500)
    expect(patch.notes).toContain('over $268.50')
  })

  it('leaves net_cost alone when there is no project_cost to derive it from', () => {
    const { patch } = buildUtilityPaymentPatch({ ...row, project_cost: null }, { paidOn: '2026-07-17', amount: '9000' })
    expect(patch.amount).toBe(9000)
    expect(patch).not.toHaveProperty('net_cost')
  })

  it('treats a sub-cent difference as paid in full', () => {
    const { patch } = buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '10231.504' })
    expect(patch).not.toHaveProperty('amount')
  })
})

describe('buildUtilityPaymentPatch — refuses bad input', () => {
  it('needs a date', () => {
    expect(buildUtilityPaymentPatch(row, { amount: '1' }).error).toBe('Pick a payment date')
  })
  it('needs a non-negative number', () => {
    expect(buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: 'abc' }).error).toBe('Enter a valid amount')
    expect(buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '-5' }).error).toBe('Enter a valid amount')
  })
})

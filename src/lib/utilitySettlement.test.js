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
  const { rowPatch, shortBy, error } = buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '10231.50', note: 'ACH 88214' })

  it('marks the row Paid at noon UTC on the chosen day', () => {
    expect(error).toBeUndefined()
    expect(rowPatch.payment_status).toBe('Paid')
    expect(rowPatch.paid_at).toBe('2026-07-17T12:00:00.000Z')
    expect(noonUtc('2026-01-01')).toBe('2026-01-01T12:00:00.000Z')
  })

  it('appends the stamp to the existing notes, keeping them', () => {
    expect(rowPatch.notes).toBe('sent 2 Sep\n\nPaid 2026-07-17 — ACH 88214')
  })

  it('does NOT touch the amounts when the payment matches', () => {
    expect(shortBy).toBe(0)
    expect(rowPatch).not.toHaveProperty('incentive_amount')
    expect(rowPatch).not.toHaveProperty('amount')
    expect(rowPatch).not.toHaveProperty('net_cost')
  })

  it('a blank amount means "what was expected"', () => {
    const b = buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '' })
    expect(b.paidNum).toBe(10231.5)
    expect(b.rowPatch).not.toHaveProperty('amount')
  })
})

describe('buildUtilityPaymentPatch — short-pay and over-pay', () => {
  it('records what was received and recomputes the customer share from project_cost', () => {
    const { rowPatch, shortBy } = buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '9000' })
    expect(shortBy).toBe(1231.5)
    expect(rowPatch.incentive_amount).toBe(9000)
    expect(rowPatch.amount).toBe(9000)
    expect(rowPatch.net_cost).toBe(14181.9)
    expect(rowPatch.notes).toContain('short $1,231.50 (expected $10,231.50, received $9,000.00)')
  })

  it('says "over" when the utility paid more', () => {
    const { rowPatch, shortBy } = buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '10500' })
    expect(shortBy).toBe(-268.5)
    expect(rowPatch.amount).toBe(10500)
    expect(rowPatch.notes).toContain('over $268.50')
  })

  it('leaves net_cost alone when there is no project_cost to derive it from', () => {
    const { rowPatch } = buildUtilityPaymentPatch({ ...row, project_cost: null }, { paidOn: '2026-07-17', amount: '9000' })
    expect(rowPatch.amount).toBe(9000)
    expect(rowPatch).not.toHaveProperty('net_cost')
  })

  it('treats a sub-cent difference as paid in full', () => {
    const { rowPatch } = buildUtilityPaymentPatch(row, { paidOn: '2026-07-17', amount: '10231.504' })
    expect(rowPatch).not.toHaveProperty('amount')
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

// ── shortfall routing ─────────────────────────────────────────────────────
import { buildReopenPatch, BORNE_BY_CUSTOMER, BORNE_BY_COMPANY } from './utilitySettlement.js'

const linked = { id: 32767, discount_applied: 8000, utility_billed: null, utility_shortfall: null, shortfall_borne_by: null }
const rowB = { id: 128, incentive_amount: '8000', amount: '8000', project_cost: '22800', net_cost: '14800', notes: null }
const pay = (amount, borneBy, inv = linked, row = rowB) => buildUtilityPaymentPatch(row, { paidOn: '2026-07-04', amount, borneBy }, inv)

describe('short-pay on a linked invoice — someone covers the difference', () => {
  it('refuses to record a shortfall without a decision', () => {
    expect(pay('7500').error).toBe('Choose who covers the shortfall')
    expect(pay('7500', 'nonsense').error).toBe('Choose who covers the shortfall')
  })

  it('does not ask when the utility paid in full or over', () => {
    expect(pay('8000').error).toBeUndefined()
    expect(pay('8500').error).toBeUndefined()
  })

  it('an unlinked utility record needs no decision — nothing to route to', () => {
    const b = buildUtilityPaymentPatch(rowB, { paidOn: '2026-07-04', amount: '7500' }, null)
    expect(b.error).toBeUndefined()
    expect(b.invoicePatch).toBeNull()
    expect(b.rowPatch.amount).toBe(7500)
  })

  it('customer covers it: the credit drops by the shortfall, the claim is kept', () => {
    const { invoicePatch, rowPatch, shortBy } = pay('7500', BORNE_BY_CUSTOMER)
    expect(shortBy).toBe(500)
    expect(invoicePatch).toEqual({ utility_billed: 8000, utility_shortfall: 500, shortfall_borne_by: 'customer', discount_applied: 7500 })
    expect(rowPatch.amount).toBe(7500)
    expect(rowPatch.notes).toContain('short $500.00')
    expect(rowPatch.notes).toContain('billed to customer')
  })

  it('company covers it: the credit stays, the gap is recorded so it can be labelled', () => {
    const { invoicePatch, rowPatch } = pay('7500', BORNE_BY_COMPANY)
    expect(invoicePatch).toEqual({ utility_billed: 8000, utility_shortfall: 500, shortfall_borne_by: 'company', discount_applied: 8000 })
    expect(rowPatch.amount).toBe(7500)
    expect(rowPatch.notes).toContain('absorbed')
  })

  it('measures the shortfall against the CLAIM, not the row it already overwrote', () => {
    // After a first short-pay the row says 7500; the invoice remembers 8000.
    const inv = { ...linked, utility_billed: 8000 }
    const row = { ...rowB, incentive_amount: '7500', amount: '7500' }
    const b = pay('7500', BORNE_BY_CUSTOMER, inv, row)
    expect(b.expected).toBe(8000)
    expect(b.shortBy).toBe(500)
  })

  it('never overwrites the claim once set', () => {
    const inv = { ...linked, utility_billed: 8000 }
    expect(pay('8000', undefined, inv).invoicePatch.utility_billed).toBe(8000)
    expect(pay('7500', BORNE_BY_COMPANY, inv).invoicePatch.utility_billed).toBe(8000)
  })
})

describe('recording is safe to repeat — the previous shortfall is undone first', () => {
  const alreadyShort = { ...linked, discount_applied: 7500, utility_billed: 8000, utility_shortfall: 500, shortfall_borne_by: 'customer' }

  it('the same short-pay again lands on the same credit, not 500 lower', () => {
    expect(pay('7500', BORNE_BY_CUSTOMER, alreadyShort).invoicePatch.discount_applied).toBe(7500)
  })

  it('switching the decision to company restores the customer credit', () => {
    expect(pay('7500', BORNE_BY_COMPANY, alreadyShort).invoicePatch.discount_applied).toBe(8000)
  })

  it('a full payment after a customer-borne shortfall restores the credit and clears the decision', () => {
    const b = pay('8000', undefined, alreadyShort)
    expect(b.invoicePatch).toEqual({ utility_billed: 8000, utility_shortfall: null, shortfall_borne_by: null, discount_applied: 8000 })
  })

  it('a deeper shortfall adjusts from the original credit, not from the reduced one', () => {
    expect(pay('7000', BORNE_BY_CUSTOMER, alreadyShort).invoicePatch.discount_applied).toBe(7000)
  })

  it('never drives the credit below zero', () => {
    const inv = { ...linked, discount_applied: 300 }
    expect(pay('7500', BORNE_BY_CUSTOMER, inv).invoicePatch.discount_applied).toBe(0)
  })
})

describe('reopen undoes the settlement', () => {
  const shortRow = { ...rowB, incentive_amount: '7500', amount: '7500', net_cost: '15300' }

  it('restores the row to the claim and the customer credit to what it was', () => {
    const inv = { ...linked, discount_applied: 7500, utility_billed: 8000, utility_shortfall: 500, shortfall_borne_by: 'customer' }
    const { rowPatch, invoicePatch } = buildReopenPatch(shortRow, inv)
    expect(rowPatch).toMatchObject({ payment_status: 'Open', paid_at: null, amount: 8000, incentive_amount: 8000, net_cost: 14800 })
    expect(invoicePatch).toEqual({ discount_applied: 8000, utility_shortfall: null, shortfall_borne_by: null })
  })

  it('a company-borne shortfall leaves the credit alone and clears the decision', () => {
    const inv = { ...linked, discount_applied: 8000, utility_billed: 8000, utility_shortfall: 500, shortfall_borne_by: 'company' }
    const { invoicePatch } = buildReopenPatch(shortRow, inv)
    expect(invoicePatch).toEqual({ discount_applied: 8000, utility_shortfall: null, shortfall_borne_by: null })
  })

  it('is safe to repeat — the second reopen changes nothing', () => {
    const inv = { ...linked, discount_applied: 8000, utility_billed: 8000, utility_shortfall: null, shortfall_borne_by: null }
    const { rowPatch, invoicePatch } = buildReopenPatch({ ...rowB }, inv)
    expect(rowPatch.amount).toBe(8000)
    expect(invoicePatch.discount_applied).toBe(8000)
  })

  it('without a linked invoice behaves exactly as before — status and date only', () => {
    const { rowPatch, invoicePatch } = buildReopenPatch(shortRow, null)
    expect(rowPatch).not.toHaveProperty('amount')
    expect(invoicePatch).toBeNull()
  })
})

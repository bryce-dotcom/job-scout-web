import { describe, it, expect } from 'vitest'
import {
  TRANSFER_CATEGORY, isTransferCategory, resolveIsTransfer, transferFields, needsCategories,
  processorPayoutNote,
} from '../../supabase/functions/_shared/transferRule.ts'

// Tracy's ticket, as tests. She picked "Transfer (between accounts)" from the
// category dropdown; the app demanded a tax category she had no honest answer
// for, and then counted the money as real anyway.

describe('saying "transfer" either way means the same thing', () => {
  it('the checkbox marks it a transfer', () => {
    expect(resolveIsTransfer({ flagged: true })).toBe(true)
  })

  it('the dropdown marks it a transfer too — this is the bug Tracy hit', () => {
    expect(resolveIsTransfer({ category: TRANSFER_CATEGORY })).toBe(true)
  })

  it('a normal category is not a transfer', () => {
    expect(resolveIsTransfer({ category: 'Job Materials' })).toBe(false)
    expect(resolveIsTransfer({ category: '' })).toBe(false)
    expect(resolveIsTransfer({})).toBe(false)
  })

  it('is not fooled by casing or stray whitespace', () => {
    expect(isTransferCategory(' transfer ')).toBe(true)
    expect(isTransferCategory('TRANSFER')).toBe(true)
  })

  it('does not treat a merely transfer-ish name as a transfer', () => {
    // 'Transfer Fee' is a real bank expense and belongs in the P&L.
    expect(isTransferCategory('Transfer Fee')).toBe(false)
    expect(isTransferCategory('Wire Transfer Fee')).toBe(false)
  })

  it('only a literal true flags it — not a truthy string', () => {
    expect(resolveIsTransfer({ flagged: 'no' })).toBe(false)
  })
})

describe('what gets written', () => {
  it('a transfer keeps no categories, so it cannot re-enter the P&L', () => {
    expect(transferFields({ category: TRANSFER_CATEGORY, taxCategory: 'Income' }))
      .toEqual({ is_transfer: true, user_category: null, user_tax_category: null })
  })

  it('the checkbox route lands identically to the dropdown route', () => {
    expect(transferFields({ flagged: true, category: 'Sales', taxCategory: 'Income' }))
      .toEqual(transferFields({ category: 'Transfer' }))
  })

  it('a real expense keeps both categories', () => {
    expect(transferFields({ category: 'Fuel', taxCategory: 'Line 20 - Auto expenses' }))
      .toEqual({ is_transfer: false, user_category: 'Fuel', user_tax_category: 'Line 20 - Auto expenses' })
  })
})

describe('what the save is allowed to demand', () => {
  it('never asks a transfer for a tax category — there is no true answer', () => {
    expect(needsCategories({ category: TRANSFER_CATEGORY })).toBe(false)
    expect(needsCategories({ flagged: true })).toBe(false)
  })

  it('still asks everything else for both', () => {
    expect(needsCategories({ category: 'Supplies' })).toBe(true)
  })
})

describe('why a processor payout is not income', () => {
  it('explains a Stripe payout', () => {
    expect(processorPayoutNote('Stripe Payout')).toMatch(/already counted as income/i)
    expect(processorPayoutNote('Transfer from Stripe')).toMatch(/report the revenue twice/i)
  })

  it('covers the other processors on the same footing', () => {
    expect(processorPayoutNote('PayPal Transfer')).not.toBe(null)
    expect(processorPayoutNote('Square payout')).not.toBe(null)
  })

  it('says nothing about an ordinary deposit', () => {
    // A customer check IS income — it must not get the payout explanation.
    expect(processorPayoutNote('Check Deposit - Remote Deposit')).toBe(null)
    expect(processorPayoutNote('Ach Deposit Company: Evergreen')).toBe(null)
    expect(processorPayoutNote('Home banking Deposit Transfer from S0059')).toBe(null)
  })

  it('says nothing about a Stripe FEE, which is a real expense', () => {
    expect(processorPayoutNote('Stripe fee')).toBe(null)
  })

  it('survives an empty description', () => {
    expect(processorPayoutNote('')).toBe(null)
    expect(processorPayoutNote(null)).toBe(null)
  })
})

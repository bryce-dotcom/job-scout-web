import { describe, it, expect } from 'vitest'
import {
  TRANSFER_CATEGORY, isTransferCategory, resolveIsTransfer, transferFields, needsCategories, displayCategory, isAiCategoryGuess,
  displayJobId, isAiJobGuess, costingJobId, processorPayoutNote,
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

// ── What the screen shows for a transfer ───────────────────────────────────
//
// Tracy, f31332d3: "I made the wrong choice for a stripe transaction on 9/28
// for the amount of $1496.74 by classifying it as a service… no matter how many
// times I save it or refresh the system It will not default to what I chose…
// It will tell you what's saving it but then when you look, it didn't save it.
// It went back to what you very first chose."
//
// Nothing was failing to save. transferFields deliberately stores
// user_category = null for a transfer (leaving 'Transfer' there would put the
// money back in the P&L), and every display read `user_category || ai_category`
// — so the row came back wearing the AI's first guess, "Service". The flag had
// saved and the reports were right; only the screen lied.
describe('displayCategory: a transfer shows as a transfer', () => {
  it('shows Transfer when the flag is set, whatever the AI guessed', () => {
    expect(displayCategory({ is_transfer: true, user_category: null, ai_category: 'Service' }))
      .toBe(TRANSFER_CATEGORY)
  })

  it('is exactly what transferFields persists, round-tripped', () => {
    // The two halves have to agree or the screen drifts from the data again.
    const saved = transferFields({ category: TRANSFER_CATEGORY })
    expect(displayCategory({ ...saved, ai_category: 'Service' })).toBe(TRANSFER_CATEGORY)
  })

  it('prefers the person over the AI for anything else', () => {
    expect(displayCategory({ user_category: 'Fuel', ai_category: 'Service' })).toBe('Fuel')
    expect(displayCategory({ user_category: null, ai_category: 'Service' })).toBe('Service')
  })

  it('is empty when there is nothing to show, never undefined', () => {
    expect(displayCategory({})).toBe('')
    expect(displayCategory(null)).toBe('')
  })
})

describe('isAiCategoryGuess: a transfer is never an unconfirmed guess', () => {
  it('a flagged transfer is a decision, not a guess', () => {
    expect(isAiCategoryGuess({ is_transfer: true, user_category: null, ai_category: 'Service' })).toBe(false)
  })

  it('an AI category nobody has touched is a guess', () => {
    expect(isAiCategoryGuess({ user_category: null, ai_category: 'Service' })).toBe(true)
  })

  it('a human category is not a guess', () => {
    expect(isAiCategoryGuess({ user_category: 'Fuel', ai_category: 'Service' })).toBe(false)
    expect(isAiCategoryGuess({})).toBe(false)
    expect(isAiCategoryGuess(null)).toBe(false)
  })
})

// Tracy's second ticket, one field over. The $3,875.43 Central Valley deposit
// the matcher put on The Breakfast Club at 0.75 confidence: she took the job
// off, saved, and it came straight back.
describe('displayJobId: once a person has answered, the guess stops answering', () => {
  it('shows the job a person chose', () => {
    expect(displayJobId({ job_id: 21043, ai_job_id: 999, confirmed: true })).toBe(21043)
  })

  it('offers the guess while nobody has decided', () => {
    expect(displayJobId({ job_id: null, ai_job_id: 21043, confirmed: false })).toBe(21043)
    expect(displayJobId({ job_id: null, ai_job_id: 21043 })).toBe(21043)
  })

  it('an emptied job on a confirmed row stays empty — this is the bug', () => {
    expect(displayJobId({ job_id: null, ai_job_id: 21043, confirmed: true })).toBe(null)
  })

  it('has nothing to show when there is nothing', () => {
    expect(displayJobId({})).toBe(null)
    expect(displayJobId(null)).toBe(null)
  })
})

describe('isAiJobGuess: style the guess as a guess', () => {
  it('a job with no human answer behind it is a guess', () => {
    expect(isAiJobGuess({ job_id: null, ai_job_id: 21043, confirmed: false })).toBe(true)
  })

  it('a chosen job is not a guess', () => {
    expect(isAiJobGuess({ job_id: 21043, ai_job_id: 21043, confirmed: true })).toBe(false)
  })

  it('a confirmed row with no job shows nothing to style', () => {
    expect(isAiJobGuess({ job_id: null, ai_job_id: 21043, confirmed: true })).toBe(false)
    expect(isAiJobGuess(null)).toBe(false)
  })
})

// Tracy's ticket one layer down. a8cff7af stopped the guess coming back on
// SCREEN, but four money paths still read `job_id || ai_job_id`, so a job
// went on being charged for a guess nobody had confirmed — and the overhead
// pool went on losing the same dollars to it.
describe("costingJobId: only a person's answer moves money", () => {
  it('counts the job a person chose', () => {
    expect(costingJobId({ job_id: 21043, ai_job_id: 999 })).toBe(21043)
  })

  it("never counts the matcher's guess, reviewed or not", () => {
    expect(costingJobId({ job_id: null, ai_job_id: 21043, confirmed: false })).toBe(null)
    expect(costingJobId({ job_id: null, ai_job_id: 21043, confirmed: true })).toBe(null)
  })

  it('ignores confidence — being sure is not the same as being asked', () => {
    expect(costingJobId({ job_id: null, ai_job_id: 21043, ai_job_confidence: 0.99 })).toBe(null)
  })

  it('is stricter than the display rule, on purpose', () => {
    const guess = { job_id: null, ai_job_id: 21043, confirmed: false }
    expect(displayJobId(guess)).toBe(21043)   // on screen, where isAiJobGuess labels it
    expect(costingJobId(guess)).toBe(null)    // in a total, which cannot label anything
  })

  it('has nothing to count when there is nothing', () => {
    expect(costingJobId({})).toBe(null)
    expect(costingJobId(null)).toBe(null)
    expect(costingJobId(undefined)).toBe(null)
    expect(costingJobId({ job_id: '' })).toBe(null)
  })
})

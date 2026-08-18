import { describe, it, expect } from 'vitest'
import { isStripeJournalRow, hasBankTwin, dedupeStripePayouts } from './bankLedger'

// Shapes taken from the real pair found on company 3.
const journal = (over = {}) => ({
  plaid_transaction_id: 'stripe_po_1', amount: -262.89, date: '2026-06-11',
  name: 'Stripe Payout', merchant_name: 'Stripe', connected_account_id: null,
  user_category: 'Sales', confirmed: true, ...over,
})
const bank = (over = {}) => ({
  plaid_transaction_id: 'Ax9', amount: -262.89, date: '2026-06-11',
  name: 'Transfer from Stripe', merchant_name: null, connected_account_id: 2,
  user_category: 'Sales', ...over,
})

describe('telling the two importers apart', () => {
  it('recognises the synthetic payout journal by its key', () => {
    // stripe-sync-books prefixes the id so it can never collide with a real
    // Plaid transaction. There is no `source` column despite the comment that
    // promises one, so the prefix is the only discriminator.
    expect(isStripeJournalRow(journal())).toBe(true)
    expect(isStripeJournalRow(bank())).toBe(false)
    expect(isStripeJournalRow(null)).toBe(false)
  })
})

describe('finding the payout already in the bank feed', () => {
  it('matches on amount, a nearby date, and the bank row naming Stripe', () => {
    expect(hasBankTwin(journal(), [journal(), bank()])).toBe(true)
  })

  it('allows the posting date to lag the arrival date', () => {
    expect(hasBankTwin(journal(), [journal(), bank({ date: '2026-06-13' })])).toBe(true)
  })

  it('will not match a transaction that merely shares an amount', () => {
    // Without the name condition, a $262.89 Home Depot run two days later would
    // suppress a real payout.
    expect(hasBankTwin(journal(), [journal(), bank({ name: 'Home Depot', merchant_name: 'Home Depot' })])).toBe(false)
  })

  it('will not match across a wide date gap', () => {
    expect(hasBankTwin(journal(), [journal(), bank({ date: '2026-06-20' })])).toBe(false)
  })

  it('will not match a different amount', () => {
    expect(hasBankTwin(journal(), [journal(), bank({ amount: -262.9 })])).toBe(false)
  })

  it('never treats another journal row as the bank side', () => {
    // Two payouts of equal value must not cancel each other out.
    expect(hasBankTwin(journal(), [journal(), journal({ plaid_transaction_id: 'stripe_po_2' })])).toBe(false)
  })
})

describe('deduping the ledger', () => {
  it('drops the journal row and keeps the bank transaction', () => {
    const { rows, hidden } = dedupeStripePayouts([journal(), bank()])
    expect(hidden).toBe(1)
    expect(rows).toHaveLength(1)
    expect(rows[0].connected_account_id).toBe(2)   // the real bank row survived
  })

  it('keeps a payout the bank feed does not have', () => {
    // 10 of the 31 have no twin — a payout to an account that isn't connected
    // here is the only record we hold, and hiding it would lose the money.
    const orphan = journal({ plaid_transaction_id: 'stripe_po_9', date: '2026-04-29', amount: -137.92 })
    const { rows, hidden } = dedupeStripePayouts([orphan])
    expect(hidden).toBe(0)
    expect(rows).toHaveLength(1)
  })

  it('never hides a bank row, whatever it is named', () => {
    const { rows } = dedupeStripePayouts([bank(), bank({ plaid_transaction_id: 'Bx1' })])
    expect(rows).toHaveLength(2)
  })

  it('leaves a ledger with no Stripe rows exactly as it was', () => {
    const plain = [bank({ name: 'Home Depot', merchant_name: 'Home Depot' })]
    expect(dedupeStripePayouts(plain)).toEqual({ rows: plain, hidden: 0 })
  })

  it('handles an empty ledger', () => {
    expect(dedupeStripePayouts([])).toEqual({ rows: [], hidden: 0 })
    expect(dedupeStripePayouts()).toEqual({ rows: [], hidden: 0 })
  })

  it('removes each duplicate once, not the whole run', () => {
    const rows = [
      journal({ plaid_transaction_id: 'stripe_a', amount: -100, date: '2026-07-01' }),
      bank({ plaid_transaction_id: 'b1', amount: -100, date: '2026-07-01' }),
      journal({ plaid_transaction_id: 'stripe_b', amount: -100, date: '2026-07-02' }),
      bank({ plaid_transaction_id: 'b2', amount: -100, date: '2026-07-02' }),
    ]
    const { rows: kept, hidden } = dedupeStripePayouts(rows)
    expect(hidden).toBe(2)
    expect(kept).toHaveLength(2)
    expect(kept.every(r => !r.plaid_transaction_id.startsWith('stripe_'))).toBe(true)
  })
})

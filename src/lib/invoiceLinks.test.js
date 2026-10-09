import { describe, it, expect } from 'vitest'
import {
  billToWarnings, deleteBlockers, deleteIsBlocked, deleteMessage, CHANGE_INSTEAD,
} from './invoiceLinks'

// Tracy, TIME SENSITIVE, 2026-10-07, invoice INV-MUBGM140:
//   "Failed to delete invoice: ... violates foreign key constraint
//    "plaid_transactions_matched_invoice_id_fkey" ... I need to make a change
//    just to the name on the invoice billing and the system won't let me."

describe('what stops a delete', () => {
  it('names the bank match in words, never the constraint', () => {
    const [b] = deleteBlockers({ bankMatches: 1 })
    expect(b.sentence).toMatch(/1 bank transaction is matched/)
    expect(b.sentence).toMatch(/unmatched in Books/)
    expect(b.sentence).not.toMatch(/fkey|constraint|plaid_transactions/)
  })

  it('a bank match is detachable — the transaction survives, just unlinked', () => {
    expect(deleteBlockers({ bankMatches: 2 })[0].detachable).toBe(true)
    expect(deleteIsBlocked(deleteBlockers({ bankMatches: 2 }))).toBe(false)
  })

  it('a deposit is NOT detachable, because that is money with a record', () => {
    const blockers = deleteBlockers({ leadPayments: 1 })
    expect(blockers[0].detachable).toBe(false)
    expect(deleteIsBlocked(blockers)).toBe(true)
    expect(blockers[0].sentence).toMatch(/strip money of its record/)
  })

  it('catches the OTHER blocker too, not just the one in her error', () => {
    // lead_payments is also NO ACTION. Fixing only the bank match would have
    // moved the same raw error onto the next invoice carrying a deposit.
    const both = deleteBlockers({ bankMatches: 1, leadPayments: 2 })
    expect(both.map((b) => b.kind)).toEqual(['bank', 'deposit'])
    expect(deleteIsBlocked(both)).toBe(true)
  })

  it('counts read as English on both sides of one', () => {
    expect(deleteBlockers({ bankMatches: 1 })[0].sentence).toMatch(/transaction is matched/)
    expect(deleteBlockers({ bankMatches: 3 })[0].sentence).toMatch(/transactions are matched/)
    expect(deleteBlockers({ leadPayments: 1 })[0].sentence).toMatch(/1 deposit .*points at/)
    expect(deleteBlockers({ leadPayments: 2 })[0].sentence).toMatch(/2 deposits .*point at/)
  })

  it('nothing attached is not a blocker', () => {
    expect(deleteBlockers({})).toEqual([])
    expect(deleteBlockers()).toEqual([])
    expect(deleteIsBlocked([])).toBe(false)
  })
})

describe('what the person is shown', () => {
  it('keeps the plain question when nothing is attached', () => {
    expect(deleteMessage([])).toBe('Are you sure you want to delete this invoice? This cannot be undone.')
  })

  it('warns and still offers to go ahead when it is only a bank match', () => {
    const m = deleteMessage(deleteBlockers({ bankMatches: 1 }))
    expect(m).toMatch(/^Delete this invoice\?/)
    expect(m).toMatch(/cannot be undone/)
  })

  it('stops outright for a deposit, and says why', () => {
    const m = deleteMessage(deleteBlockers({ leadPayments: 1 }))
    expect(m).toMatch(/can't be deleted yet/)
    expect(m).not.toMatch(/cannot be undone/)   // nothing is going to happen
  })

  it('never shows a constraint name', () => {
    const m = deleteMessage(deleteBlockers({ bankMatches: 2, leadPayments: 1 }))
    expect(m).not.toMatch(/fkey|violates|foreign key/)
  })

  it('points at the thing she actually wanted', () => {
    expect(CHANGE_INSTEAD).toMatch(/Change next to Bill To/)
    expect(CHANGE_INSTEAD).toMatch(/do not need to delete/)
  })
})

describe('changing who it is billed to', () => {
  it('always says the job stays put', () => {
    // Billing a property manager for work at a tenant site is ordinary, which
    // is exactly why this field should have been editable all along.
    expect(billToWarnings({}).join(' ')).toMatch(/job keeps its own customer/i)
  })

  it('says what moves when money has been taken', () => {
    const w = billToWarnings({
      payments: [{ amount: 1200 }, { amount: 300.5 }],
      from: 'Davicaro Properties', to: 'Davicaro Holdings LLC',
    }).join(' ')
    expect(w).toMatch(/2 payments totalling \$1,500\.50/)
    expect(w).toMatch(/from Davicaro Properties to Davicaro Holdings LLC/)
  })

  it('flags trade credit, which does NOT move with the invoice', () => {
    const w = billToWarnings({ payments: [{ amount: 500, payment_method: 'Trade Credit' }] }).join(' ')
    expect(w).toMatch(/drawn from the current customer/)
    expect(w).toMatch(/check both balances/)
  })

  it('stays quiet about money when there is none', () => {
    const w = billToWarnings({ payments: [] }).join(' ')
    expect(w).not.toMatch(/payment/)
    expect(w).not.toMatch(/credit/)
  })

  it('ignores a zero or reversed payment row', () => {
    expect(billToWarnings({ payments: [{ amount: 0 }] }).join(' ')).not.toMatch(/totalling/)
  })
})

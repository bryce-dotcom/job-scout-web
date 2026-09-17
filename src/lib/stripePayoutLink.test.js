import { describe, it, expect } from 'vitest'
import { payoutCharges, findBankTwin, planPayoutLink, payoutNote, intentOf } from '../../supabase/functions/_shared/stripePayoutLink.ts'
import { hasBankTwin } from './bankLedger'

// Tracy, 2026-09-16 (b6e2f81d): "It's hard to match stripe deposits to invoice
// because they are bulk deposits for several invoices." Stripe knows what is
// inside each payout; this is the rule that reads it.

const ARRIVAL = Math.floor(new Date('2026-09-14T00:00:00Z').getTime() / 1000)
const payout = { id: 'po_1', amount: 211487, arrival_date: ARRIVAL, status: 'paid' }
const charge = (id, intent, amount, fee) => ({ id: `txn_${id}`, type: 'charge', amount, fee, net: amount - fee, source: { id: `ch_${id}`, object: 'charge', payment_intent: intent } })
const balance = [
  { id: 'txn_po', type: 'payout', amount: -211487, fee: 0, net: -211487, source: 'po_1' },
  charge('a', 'pi_a', 150000, 4380),
  charge('b', 'pi_b', 50000, 1480),
  charge('c', 'pi_c', 20000, 610),
]
const exact = [
  { id: 'txn_po', type: 'payout', amount: -211487, fee: 0, net: -211487, source: 'po_1' },
  charge('a', 'pi_a', 150000, 4380),   // net 145620
  charge('b', 'pi_b', 50000, 1480),    // net 48520
  charge('c', 'pi_c', 18000, 653),     // net 17347  → 211487
]
const pay = (id, intent, invoice, extra = {}) => ({ id, invoice_id: invoice, amount: 1, stripe_payment_intent_id: intent, source_transaction_id: null, invoice: { invoice_id: `INV-${invoice}` }, ...extra })
const bank = (id, amount, date, name = 'Transfer from Stripe', extra = {}) => ({ id, amount, date, name, merchant_name: null, plaid_transaction_id: `plaid_${id}`, ...extra })

describe('reading a payout', () => {
  it('splits charges from the rest and drops the payout\'s own line', () => {
    const { charges, others } = payoutCharges([...exact, { id: 'txn_r', type: 'refund', amount: -5000, fee: 0, net: -5000, source: 're_1' }])
    expect(charges.map((c) => c.intent)).toEqual(['pi_a', 'pi_b', 'pi_c'])
    expect(charges[0]).toMatchObject({ chargeId: 'ch_a', gross: 1500, fee: 43.8, net: 1456.2 })
    expect(others).toEqual([{ btId: 'txn_r', type: 'refund', net: -50, description: null }])
  })

  it('an unexpanded source has no intent to read', () => {
    expect(intentOf({ id: 'x', type: 'charge', amount: 1, fee: 0, net: 1, source: 'ch_x' })).toBeNull()
  })
})

describe('the bank twin is the row lib/bankLedger already treats as the twin', () => {
  const journal = { plaid_transaction_id: 'stripe_po_1', amount: -2114.87, date: '2026-09-14', name: 'Stripe Payout', merchant_name: 'Stripe' }
  const cases = [
    ['same amount, same day, names Stripe', bank(1, -2114.87, '2026-09-14'), true],
    ['two days later', bank(2, -2114.87, '2026-09-16'), true],
    ['three days later', bank(3, -2114.87, '2026-09-17'), false],
    ['does not name Stripe', bank(4, -2114.87, '2026-09-14', 'Home banking Deposit Transfer from S0059'), false],
    ['a cent off', bank(5, -2114.88, '2026-09-14'), false],
    ['the journal row itself', { ...journal, id: 6 }, false],
  ]
  for (const [label, row, expected] of cases) {
    it(label, () => {
      expect(hasBankTwin(journal, [journal, row])).toBe(expected)
      expect(!!findBankTwin(payout, [row]).twin).toBe(expected)
    })
  }

  it('the bank\'s own "Transfer from Stripe" beats the same money moved on with Stripe typed in the memo (HHH, seven pairs)', () => {
    const hop = bank(4641, -141.36, '2026-09-16', 'Home banking Deposit Transfer from S0059 - Stripe deposit transfer')
    const landing = bank(4645, -141.36, '2026-09-16', 'Transfer from Stripe')
    const found = findBankTwin({ ...payout, amount: 14136 }, [hop, landing])
    expect(found.twin.id).toBe(4645)
    expect(found.ambiguous).toBe(false)
    // Either way round, and a merchant_name of Stripe counts as the counterparty too.
    expect(findBankTwin({ ...payout, amount: 14136 }, [landing, hop]).twin.id).toBe(4645)
    expect(findBankTwin({ ...payout, amount: 14136 }, [hop, { ...hop, id: 7, name: 'STRIPE', merchant_name: 'Stripe' }]).twin.id).toBe(7)
    // Two memo-only rows are still a tie.
    expect(findBankTwin({ ...payout, amount: 14136 }, [hop, { ...hop, id: 8 }]).ambiguous).toBe(true)
  })

  it('nearest by date wins; equally near is a question, not a guess', () => {
    const near = findBankTwin(payout, [bank(1, -2114.87, '2026-09-16'), bank(2, -2114.87, '2026-09-15')])
    expect(near.twin.id).toBe(2)
    const tie = findBankTwin(payout, [bank(1, -2114.87, '2026-09-15'), bank(2, -2114.87, '2026-09-13')])
    expect(tie.twin).toBeNull()
    expect(tie.ambiguous).toBe(true)
  })
})

describe('the plan for one payout', () => {
  const payments = [pay(101, 'pi_a', 501), pay(102, 'pi_b', 502), pay(103, 'pi_c', 503)]
  const twin = bank(9, -2114.87, '2026-09-14', 'Transfer from Stripe', { notes: null })

  it('every charge recorded and the deposit in the bank: link it all', () => {
    const plan = planPayoutLink({ payout, balanceTxns: exact, payments, bankRows: [twin] })
    expect(plan.outcome).toBe('linked')
    expect(plan.sumMatches).toBe(true)
    expect(plan.mapped.map((m) => m.paymentId)).toEqual([101, 102, 103])
    expect(plan.actions.stampPayments).toEqual([101, 102, 103])
    expect(plan.actions.linkPayments).toEqual([101, 102, 103])
    expect(plan.actions.twinUpdate).toMatchObject({
      stripe_payout_id: 'po_1', is_transfer: true, confirmed: true, user_category: null, user_tax_category: null,
      matched_invoice_id: 501, matched_payment_id: 101,
    })
    expect(plan.actions.twinUpdate.notes).toBe('Stripe payout po_1 · 3 card payments · $2,180.00 charged − $65.13 Stripe fees = $2,114.87 · INV-501, INV-502, INV-503')
    expect(plan.fees).toBe(65.13)
  })

  it('a charge JobScout never recorded is named, not invented', () => {
    const plan = planPayoutLink({ payout, balanceTxns: exact, payments: payments.slice(0, 2), bankRows: [twin] })
    expect(plan.outcome).toBe('linked')
    expect(plan.unmapped.map((u) => u.intent)).toEqual(['pi_c'])
    expect(plan.actions.linkPayments).toEqual([101, 102])
    expect(plan.note).toContain('1 charge not recorded in JobScout (pi_c $173.47)')
  })

  it('no deposit in the bank yet: stamp the payments, link nothing, wait', () => {
    const plan = planPayoutLink({ payout, balanceTxns: exact, payments, bankRows: [] })
    expect(plan.outcome).toBe('waiting_for_bank')
    expect(plan.actions.stampPayments).toEqual([101, 102, 103])
    expect(plan.actions.linkPayments).toEqual([])
    expect(plan.actions.twinUpdate).toBeNull()
  })

  it('a payout still in transit waits even when a look-alike deposit exists', () => {
    const plan = planPayoutLink({ payout: { ...payout, status: 'in_transit' }, balanceTxns: exact, payments, bankRows: [twin] })
    expect(plan.outcome).toBe('waiting_for_bank')
    expect(plan.actions.twinUpdate).toBeNull()
  })

  it('a payment someone tied to a different deposit stays there', () => {
    const plan = planPayoutLink({ payout, balanceTxns: exact, payments: [pay(101, 'pi_a', 501, { source_transaction_id: 77 }), payments[1], payments[2]], bankRows: [twin] })
    expect(plan.actions.linkPayments).toEqual([102, 103])
    expect(plan.actions.twinUpdate.matched_payment_id).toBe(102)
    expect(plan.mapped[0].linkedTo).toBe(77)
  })

  it('a bank row a person matched to something else is a conflict, not an overwrite', () => {
    const claimed = { ...twin, matched_invoice_id: 999, matched_payment_id: 555 }
    const plan = planPayoutLink({ payout, balanceTxns: exact, payments, bankRows: [claimed] })
    expect(plan.outcome).toBe('twin_conflict')
    expect(plan.actions.twinUpdate).toBeNull()
    expect(plan.actions.linkPayments).toEqual([])
    expect(plan.actions.stampPayments).toEqual([101, 102, 103])
  })

  it('a bank row matched by hand to one of this payout\'s own payments is the same answer', () => {
    const byHand = { ...twin, matched_invoice_id: 502, matched_payment_id: 102 }
    const plan = planPayoutLink({ payout, balanceTxns: exact, payments, bankRows: [byHand] })
    expect(plan.outcome).toBe('linked')
  })

  it('a bank row already carrying this payout is done', () => {
    const plan = planPayoutLink({ payout, balanceTxns: exact, payments, bankRows: [{ ...twin, stripe_payout_id: 'po_1' }] })
    expect(plan.outcome).toBe('already_linked')
    expect(plan.actions.twinUpdate).toBeNull()
  })

  it('a bank row already flagged as a transfer by hand still gets its composition', () => {
    const plan = planPayoutLink({ payout, balanceTxns: exact, payments, bankRows: [{ ...twin, is_transfer: true, confirmed: true, notes: 'Tracy: stripe' }] })
    expect(plan.outcome).toBe('linked')
    expect(plan.actions.twinUpdate.notes).toMatch(/^Tracy: stripe\nStripe payout po_1/)
  })

  it('parts that do not add up to the payout are said so', () => {
    const plan = planPayoutLink({ payout, balanceTxns: balance, payments, bankRows: [twin] })
    expect(plan.sumMatches).toBe(false)
    expect(plan.note).toContain('parts total $2,135.30, payout $2,114.87')
  })

  it('a refund inside the payout is part of the arithmetic and the note', () => {
    const withRefund = [...exact.slice(0, 3), charge('c', 'pi_c', 23000, 653), { id: 'txn_r', type: 'refund', amount: -5000, fee: 0, net: -5000, source: 're_1' }]
    const plan = planPayoutLink({ payout, balanceTxns: withRefund, payments, bankRows: [twin] })
    expect(plan.sumMatches).toBe(true)
    expect(plan.note).toContain('refund -$50.00')
  })
})

describe('the note', () => {
  it('reads as a sentence about money, with the invoices it paid', () => {
    expect(payoutNote({ payoutId: 'po_9', mapped: [{ invoiceNo: 'INV-A', invoiceId: 1 }, { invoiceNo: null, invoiceId: 2 }], unmapped: [], others: [], gross: 100, fees: 3.2, net: 96.8, amount: 96.8 }))
      .toBe('Stripe payout po_9 · 2 card payments · $100.00 charged − $3.20 Stripe fees = $96.80 · INV-A, invoice 2')
  })
})

describe('a charge JobScout never recorded still names its invoice', () => {
  it('reads document_id off the charge and reports the invoice and its status', () => {
    const bt = { id: 'txn_z', type: 'charge', amount: 64622, fee: 1904, net: 62718, source: { id: 'ch_z', object: 'charge', payment_intent: 'pi_z', metadata: { document_id: '32700', company_id: '3' }, description: 'INV-MQZ' } }
    const plan = planPayoutLink({
      payout: { id: 'po_z', amount: 62718, arrival_date: ARRIVAL, status: 'paid' },
      balanceTxns: [bt], payments: [], bankRows: [],
      invoices: [{ id: 32700, invoice_id: 'INV-MQZ', payment_status: 'Pending' }],
    })
    expect(plan.unmapped[0]).toMatchObject({ intent: 'pi_z', docId: 32700, invoiceNo: 'INV-MQZ', invoiceStatus: 'Pending', net: 627.18 })
    expect(plan.note).toContain('1 charge not recorded in JobScout (INV-MQZ pi_z $627.18)')
    expect(plan.actions.stampPayments).toEqual([])
  })
})

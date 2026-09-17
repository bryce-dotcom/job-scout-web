import { describe, it, expect } from 'vitest'
import { recordedEntries, findRecordedSet, nearestRecordedSet, utilityTargets, splitPlan, bankRowPointer, depositIsMatched } from './depositReconcile'

// Tracy, 2026-09-16 — three tickets, one shape: a deposit that is not one
// new payment on one customer invoice.

const janPro = (id, inv, amount) => ({ id, invoice_id: inv, amount, date: '2026-09-14', method: 'Check', notes: 'CK#10121 deposit 9.14.2026', source_transaction_id: null, invoice: { invoice_id: `INV-${inv}`, customer: { name: 'Jan Pro' } } })

describe('one cheque, several invoices — Jan Pro, $670', () => {
  const payments = [janPro(28880, 32520, 380), janPro(28881, 32666, 145), janPro(28882, 32792, 145), { id: 1, invoice_id: 9, amount: 145, date: '2026-09-14', source_transaction_id: 4001, invoice: {} }]
  const entries = recordedEntries({ payments, depositDate: '2026-09-14' })

  it('lists only recorded money with no deposit linked yet', () => {
    expect(entries.map((e) => e.id)).toEqual([28880, 28881, 28882])
    expect(entries[0].label).toBe('INV-32520 — Jan Pro')
    expect(entries[0].kind).toBe('payment')
  })

  it('finds the three payments that add up to the deposit', () => {
    const set = findRecordedSet(entries, 670, '2026-09-14')
    expect(set.entries.map((e) => e.id).sort()).toEqual([28880, 28881, 28882])
    expect(set.total).toBe(670)
  })

  it('still prefers a single exact payment when there is one', () => {
    const set = findRecordedSet(entries, 380, '2026-09-14')
    expect(set.entries).toHaveLength(1)
    expect(set.entries[0].id).toBe(28880)
  })

  it('the bank row points at the first payment; each payment points back (Books writes that)', () => {
    expect(bankRowPointer(entries[0])).toEqual({ matched_invoice_id: 32520, matched_payment_id: 28880, matched_utility_invoice_id: null })
  })
})

describe('a utility cheque covering two jobs — SRP, $57,372.68', () => {
  const settlements = [
    { id: 111, invoice_id: 32661, utility_name: 'Salt River Project (SRP)', amount: 30000, paid_at: '2026-09-14T12:00:00.000Z', payment_status: 'Paid', source_transaction_id: null, invoice: { invoice_id: 'INV-MRMH8SRI', customer: { name: 'SMC Auto' } } },
    { id: 116, invoice_id: 32717, utility_name: 'Salt River Project (SRP)', amount: 26892.68, paid_at: '2026-09-14T12:00:00.000Z', payment_status: 'Paid', source_transaction_id: null, invoice: { invoice_id: 'INV-MSGCJWMW', customer: { name: 'Drive 999' } } },
    { id: 114, invoice_id: 32714, utility_name: 'Rocky Mountain Power', amount: 6524, paid_at: '2026-08-24T12:00:00.000Z', payment_status: 'Paid', source_transaction_id: null, invoice: { invoice_id: 'INV-MSG82KFQ' } },
  ]
  const entries = recordedEntries({ settlements, depositDate: '2026-09-14' })

  it('utility settlements are recorded money too, and August is outside the window', () => {
    expect(entries.map((e) => e.id)).toEqual([111, 116])
    expect(entries[0].kind).toBe('settlement')
    expect(entries[0].label).toBe('Salt River Project (SRP) incentive on INV-MRMH8SRI — SMC Auto')
  })

  it('the two do not add up to the cheque, and the gap is named rather than hidden', () => {
    expect(findRecordedSet(entries, 57372.68, '2026-09-14')).toBeNull()
    const near = nearestRecordedSet(entries, 57372.68, '2026-09-14')
    expect(near.entries.map((e) => e.id).sort()).toEqual([111, 116])
    expect(near.total).toBe(56892.68)
    expect(near.gap).toBe(480)
  })

  it('a gap too large to be the same money is not offered', () => {
    expect(nearestRecordedSet(entries, 100000, '2026-09-14')).toBeNull()
    expect(nearestRecordedSet(entries, 56892.68, '2026-09-14')).toBeNull() // exact — that is findRecordedSet's answer
  })

  it('a settlement points the bank row at its invoice and its record', () => {
    expect(bankRowPointer(entries[0])).toEqual({ matched_invoice_id: 32661, matched_payment_id: null, matched_utility_invoice_id: 111 })
  })
})

describe('a set is one payer\'s money — what HHH\'s books taught the first version', () => {
  const srp = (id, inv, amount, who) => ({ id, invoice_id: inv, utility_name: 'Salt River Project (SRP)', amount, paid_at: '2026-09-14T12:00:00.000Z', payment_status: 'Paid', source_transaction_id: null, invoice: { invoice_id: `INV-${inv}`, customer: { name: who } } })
  const pay = (id, inv, amount, who, date = '2026-09-14', customerId = null) => ({ id, invoice_id: inv, amount, date, source_transaction_id: null, invoice: { invoice_id: `INV-${inv}`, customer_id: customerId, customer: { name: who } } })

  it('SRP\'s cheque is not the two SRP settlements plus Maria Ferland\'s $480 cheque from the same morning', () => {
    const entries = recordedEntries({ settlements: [srp(111, 32661, 30000, 'SMC Auto'), srp(116, 32717, 26892.68, 'Drive 999')], payments: [pay(28875, 32862, 480, 'Maria Ferland')], depositDate: '2026-09-14' })
    expect(findRecordedSet(entries, 57372.68, '2026-09-14')).toBeNull()
    const near = nearestRecordedSet(entries, 57372.68, '2026-09-14')
    expect(near.entries.map((e) => e.id).sort()).toEqual([111, 116])
    expect(near.gap).toBe(480)
  })

  it('a $3,000 cheque is not six customers\' payments that happen to sum to it', () => {
    const parts = [[1, 1156.4, 'Reilley'], [2, 983.25, 'Ibarra'], [3, 400, 'Jan Pro'], [4, 244.56, 'Taft'], [5, 213.99, 'Redman'], [6, 1.81, 'Turo']]
    const strangers = recordedEntries({ payments: parts.map(([id, amt, who]) => pay(id, id, amt, who)), depositDate: '2026-09-14' })
    expect(findRecordedSet(strangers, 3000, '2026-09-14')).toBeNull()
    // The same six from one customer are that customer's cheque.
    const oneCustomer = recordedEntries({ payments: parts.map(([id, amt]) => pay(id, id, amt, 'Reilley')), depositDate: '2026-09-14' })
    expect(findRecordedSet(oneCustomer, 3000, '2026-09-14').entries).toHaveLength(6)
  })

  it('one customer\'s payments entered together a day after the deposit are still its parts (Central V, $9,042.67)', () => {
    const entries = recordedEntries({ payments: [pay(28834, 32739, 6499.71, 'Chris Reilley', '2026-08-27', 77), pay(28835, 32737, 1386.56, 'Chris Reilley', '2026-08-27', 77), pay(28836, 32736, 1156.4, 'Chris Reilley', '2026-08-27', 77), pay(9, 9, 1000, 'Someone Else', '2026-08-27', 78)], depositDate: '2026-08-26' })
    const set = findRecordedSet(entries, 9042.67, '2026-08-26')
    expect(set.entries.map((e) => e.id).sort()).toEqual([28834, 28835, 28836])
  })

  it('a settlement and a customer payment are never one set, even for the same job', () => {
    const entries = recordedEntries({ settlements: [srp(111, 32661, 30000, 'SMC Auto')], payments: [pay(5, 32661, 480, 'SMC Auto')], depositDate: '2026-09-14' })
    expect(findRecordedSet(entries, 30480, '2026-09-14')).toBeNull()
  })

  it('a payment with no customer on it matches alone or not at all', () => {
    const entries = recordedEntries({ payments: [{ id: 1, invoice_id: null, amount: 100, date: '2026-09-14', source_transaction_id: null }, { id: 2, invoice_id: null, amount: 200, date: '2026-09-14', source_transaction_id: null }], depositDate: '2026-09-14' })
    expect(findRecordedSet(entries, 300, '2026-09-14')).toBeNull()
    expect(findRecordedSet(entries, 200, '2026-09-14').entries[0].id).toBe(2)
    expect(nearestRecordedSet(entries, 305, '2026-09-14')).toBeNull()
  })
})

describe('the utility\'s money with no customer invoice to match — Evergreen ACH, $6,524', () => {
  it('a settlement recorded on the day is the exact match', () => {
    const entries = recordedEntries({ settlements: [{ id: 114, invoice_id: 32714, utility_name: 'Rocky Mountain Power', amount: 6524, paid_at: '2026-08-24T12:00:00.000Z', source_transaction_id: null, invoice: { invoice_id: 'INV-MSG82KFQ', customer: { name: 'Ryan Kimball' } } }], depositDate: '2026-08-24' })
    const set = findRecordedSet(entries, 6524, '2026-08-24')
    expect(set.entries[0].id).toBe(114)
  })

  it('when nothing is recorded yet, the open utility receivable is a target', () => {
    const invoices = [
      { id: 32714, invoice_id: 'INV-MSG82KFQ', utility_owes: 6524, utility_paid_at: null, utility_billed: null, customer: { name: 'Ryan Kimball' } },
      { id: 1, invoice_id: 'INV-PAID', utility_owes: 500, utility_paid_at: '2026-08-01' },   // settled — not a target
      { id: 2, invoice_id: 'INV-NONE', utility_owes: null },                                  // no utility on it
    ]
    const rows = [{ id: 114, invoice_id: 32714, utility_name: 'Rocky Mountain Power', amount: 6524, incentive_amount: 6524, payment_status: 'Open' }]
    const t = utilityTargets({ invoices, rows })
    expect(t).toHaveLength(1)
    expect(t[0]).toMatchObject({ kind: 'utility', invoiceId: 32714, open: 6524, expected: 6524, label: 'Rocky Mountain Power incentive on INV-MSG82KFQ — Ryan Kimball' })
    expect(t[0].row.id).toBe(114)
  })

  it('a utility record with no invoice is still a target, keyed by the record', () => {
    const t = utilityTargets({ orphans: [{ id: 90, invoice_id: null, utility_name: 'Rocky Mountain Power', amount: 3294, incentive_amount: 3294, payment_status: 'Open', customer_name: 'WY bitter creek' }, { id: 91, invoice_id: null, amount: 10, payment_status: 'Paid' }] })
    expect(t).toHaveLength(1)
    expect(t[0].key).toBe('utility-row:90')
    expect(bankRowPointer({ kind: 'settlement', id: 90, invoiceId: null })).toEqual({ matched_invoice_id: null, matched_payment_id: null, matched_utility_invoice_id: 90 })
  })
})

describe('splitting a deposit across several targets', () => {
  const targets = [{ key: 'a', open: 380 }, { key: 'b', open: 145 }, { key: 'c', open: 145 }]

  it('each target takes what it is owed, in order, until the deposit runs out', () => {
    const plan = splitPlan(targets, 670)
    expect(plan.rows.map((r) => r.amount)).toEqual([380, 145, 145])
    expect(plan.allocated).toBe(670)
    expect(plan.leftover).toBe(0)
  })

  it('a deposit short of the targets leaves the last one short, and says so', () => {
    const plan = splitPlan(targets, 600)
    expect(plan.rows.map((r) => r.amount)).toEqual([380, 145, 75])
    expect(plan.rows[2].short).toBe(70)
    expect(plan.leftover).toBe(0)
  })

  it('a typed amount wins over the default and the leftover is reported', () => {
    const plan = splitPlan(targets, 670, { a: '300' })
    expect(plan.rows[0].amount).toBe(300)
    expect(plan.rows[1].amount).toBe(145)
    expect(plan.leftover).toBe(80)
  })

  it('never allocates more than a target is owed by default, and rounds to cents', () => {
    const plan = splitPlan([{ key: 'x', open: 10.005 }], 1000)
    expect(plan.rows[0].amount).toBe(10.01)
    expect(plan.leftover).toBe(989.99)
  })
})

describe('is a bank row matched?', () => {
  it('any of the three pointers counts', () => {
    expect(depositIsMatched({ matched_invoice_id: 1 })).toBe(true)
    expect(depositIsMatched({ matched_payment_id: 1 })).toBe(true)
    expect(depositIsMatched({ matched_utility_invoice_id: 1 })).toBe(true)
    expect(depositIsMatched({})).toBe(false)
    expect(depositIsMatched(null)).toBe(false)
  })
})

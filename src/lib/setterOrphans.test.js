import { describe, it, expect } from 'vitest'
import { strandedSetterFees, strandedTotal, matchSentence, nameKey, phoneKey } from './setterOrphans'

// Tracy, 9 Sep and again 25 Sep. Twice in three weeks, and she had to find
// both by hand: "I have noticed several commissions I should have received
// did not get tied to me."
//
// HHH pays setters on the quote_created rule, so an appointment fee sits
// pending until a quote lands ON THAT LEAD. A rep books the work against a
// second lead for the same customer and the fee waits forever. Measured on
// the live data: 12 of Tracy's 276 pending rows, $850, are this.

const fee = (over = {}) => ({ id: 1, lead_id: 10, employee_id: 18, amount: 75, commission_type: 'appointment_set', payment_status: 'pending', ...over })
const hers = (over = {}) => ({ id: 10, business_name: 'Halifax Flooring', phone: '(801) 555-0142', email: 'ops@halifax.com', customer_id: null, quote_id: null, ...over })
const theirs = (over = {}) => ({ id: 11, business_name: 'Halifax Flooring', phone: '(801) 555-0142', email: 'ops@halifax.com', customer_id: null, quote_id: 4757, ...over })

describe('a setter fee stranded on the lead the quote never reached', () => {
  it('finds the lead the quote actually went to', () => {
    const found = strandedSetterFees({ commissions: [fee()], leads: [hers(), theirs()] })
    expect(found).toHaveLength(1)
    expect(found[0].quotedLead.id).toBe(11)
    expect(strandedTotal(found)).toBe(75)
  })

  it('matches on the phone when the names look nothing alike', () => {
    // Tracy: "Sometimes they will put in the name of the person vs the
    // business name. This will also bypass the lead I created for them."
    // Same number, so it is the same people.
    const found = strandedSetterFees({
      commissions: [fee()],
      leads: [hers(), theirs({ business_name: null, customer_name: 'Dave Kowalczyk' })],
    })
    expect(found[0].how).toBe('phone')
    expect(matchSentence('phone')).toBe('the same phone number')
  })

  it('does not match on a phone too short to mean anything', () => {
    // A lead with "555" in the box must not match every other lead with "555".
    const found = strandedSetterFees({
      commissions: [fee()],
      leads: [hers({ phone: '555', email: null }), theirs({ phone: '555', email: null, business_name: 'Totally Different Co' })],
    })
    expect(found).toHaveLength(0)
  })

  it('prefers the customer record over the phone over the name', () => {
    const found = strandedSetterFees({
      commissions: [fee()],
      leads: [hers({ customer_id: 900 }), theirs({ customer_id: 900 })],
    })
    expect(found[0].how).toBe('customer')
  })

  it('says nothing about a fee whose own lead has the quote', () => {
    // The ordinary happy path: she set it, it got quoted, the trigger earns it.
    const found = strandedSetterFees({ commissions: [fee()], leads: [hers({ quote_id: 4757 }), theirs()] })
    expect(found).toHaveLength(0)
  })

  it('says nothing about a lead nobody has quoted anywhere', () => {
    // Most of Tracy's 276 pending rows. The appointment simply has not been
    // quoted yet, and calling that stranded would cry wolf 264 times.
    const found = strandedSetterFees({ commissions: [fee()], leads: [hers(), theirs({ quote_id: null })] })
    expect(found).toHaveLength(0)
  })

  it('leaves earned and paid fees alone', () => {
    for (const payment_status of ['earned', 'paid']) {
      expect(strandedSetterFees({ commissions: [fee({ payment_status })], leads: [hers(), theirs()] })).toHaveLength(0)
    }
  })

  it('ignores a lead-source fee, which is not waiting on a quote', () => {
    const found = strandedSetterFees({ commissions: [fee({ commission_type: 'lead_source' })], leads: [hers(), theirs()] })
    expect(found).toHaveLength(0)
  })

  it('never matches a lead to itself', () => {
    const found = strandedSetterFees({ commissions: [fee({ lead_id: 11 })], leads: [theirs({ quote_id: null })] })
    expect(found).toHaveLength(0)
  })

  it('normalises the way the duplicates are actually typed', () => {
    expect(nameKey({ business_name: 'Halifax Flooring' })).toBe('halifaxflooring')
    expect(nameKey({ business_name: 'HALIFAX  flooring,' })).toBe('halifaxflooring')
    expect(nameKey({ customer_name: 'U.I.S.' })).toBe('uis')
    expect(phoneKey('(801) 555-0142')).toBe('8015550142')
  })

  it('puts the surest matches first', () => {
    const rows = strandedSetterFees({
      commissions: [fee({ id: 1, lead_id: 10 }), fee({ id: 2, lead_id: 20, amount: 25 })],
      leads: [
        hers(),
        theirs(),
        hers({ id: 20, business_name: 'Riverside Apartments', phone: null, email: null, customer_id: 77 }),
        theirs({ id: 21, business_name: 'Riverside Apts', phone: null, email: null, customer_id: 77, quote_id: 5009 }),
      ],
    })
    expect(rows.map(r => r.how)).toEqual(['customer', 'phone'])
  })

  it('survives empty and junk input', () => {
    expect(strandedSetterFees()).toEqual([])
    expect(strandedSetterFees({ commissions: [null], leads: [null] })).toEqual([])
    expect(strandedTotal()).toBe(0)
  })
})

describe('the page has to hand the rule enough to decide with', () => {
  // Payroll's leads query was `id, salesperson_id, salesperson_ids`. The rule
  // reads quote_id, the names, the phone, the email and customer_id — so it
  // was handed leads with no quote on any of them, concluded nothing was
  // stranded, and the panel never appeared. The logic was right and the
  // answer was still wrong, which is the same shape as the omitted
  // business_unit that held 92 bonuses for a photo check that unit does not
  // do. Only a grep can see it.
  it('Payroll selects every column the match is made on', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(resolve(here, '../pages/Payroll.jsx'), 'utf8')
    const sel = src.match(/\.from\('leads'\)\s*(?:\/\/[^\n]*\n\s*)*\.select\('([^']+)'\)/)
    expect(sel, "Payroll's leads select").toBeTruthy()
    for (const col of ['quote_id', 'business_name', 'customer_name', 'phone', 'email', 'customer_id']) {
      expect(sel[1], `leads select is missing ${col}`).toContain(col)
    }
  })

  it('Payroll actually calls the rule', async () => {
    const { readFileSync } = await import('node:fs')
    const { fileURLToPath } = await import('node:url')
    const { dirname, resolve } = await import('node:path')
    const here = dirname(fileURLToPath(import.meta.url))
    const src = readFileSync(resolve(here, '../pages/Payroll.jsx'), 'utf8')
    expect(src).toMatch(/strandedSetterFees\(/)
    // A stranded fee is pending, so it is in neither `details` nor the paid
    // count — the card it lives on has to open for it too.
    expect(src).toMatch(/strandedSetter \|\| \[\]\)\.length > 0/)
  })
})

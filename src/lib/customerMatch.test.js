import { describe, it, expect } from 'vitest'
import { contactGapPatch } from './customerMatch'

// Doug (ad33b5fe): "Damion can see the contact info in the Job. I cannot, i did
// refresh my system."
//
// Nothing was hidden from him. Halverson Mechanical already existed as a
// customer — name and address, no phone, no email — so converting the lead
// matched that record and used it as-is. The lead's phone and email stayed on
// the lead, and the job reads the CUSTOMER. Damien could see them because he
// works the lead.
describe('filling the contact a matched customer is missing', () => {
  const lead = { phone: '8014304041', email: 'dave@halversonmechanical.com', address: '2488 s 1620 w' }

  it('fills the blanks the lead can answer', () => {
    const customer = { name: 'Halverson Mechanical', address: '2488 1620 W', phone: '', email: null }
    expect(contactGapPatch(customer, lead)).toEqual({
      phone: '8014304041',
      email: 'dave@halversonmechanical.com',
    })
  })

  // The important half: a corrected customer record outranks an old lead.
  it('never overwrites something already there', () => {
    const customer = { phone: '801-555-0000', email: 'billing@halverson.com', address: 'Suite 4' }
    expect(contactGapPatch(customer, lead)).toBeNull()
  })

  it('leaves a filled field alone while filling an empty one', () => {
    const customer = { phone: '801-555-0000', email: '' }
    expect(contactGapPatch(customer, lead)).toEqual({
      email: 'dave@halversonmechanical.com',
      address: '2488 s 1620 w',
    })
  })

  it('treats whitespace as empty, because that is how it arrives', () => {
    expect(contactGapPatch({ phone: '   ' }, { phone: '8014304041' })).toEqual({ phone: '8014304041' })
  })

  it('returns null rather than an empty write when the lead knows nothing', () => {
    expect(contactGapPatch({ phone: '', email: '' }, { phone: '', email: null })).toBeNull()
    expect(contactGapPatch(null, lead)).toBeNull()
    expect(contactGapPatch({}, null)).toBeNull()
  })
})

import { describe, it, expect } from 'vitest'
import { generateBidLabelPdf } from './bidLabelPdf'

describe('the sealed-bid label sheet', () => {
  it('prints the buyer, the envelope wording, our return address, and the ship-by date', () => {
    const doc = generateBidLabelPdf({
      opportunity: { buyer: 'City of Ogden — Parks & Recreation', solicitation_number: 'ITB 2026-114', title: 'LED Retrofit', due_at: '2026-10-14T20:00:00Z', submit_to: { address: '2549 Washington Blvd, Suite 510, Ogden, UT 84401' }, requirements: { label_text: 'ITB 2026-114 — LED Retrofit', copies: 2 } },
      company: { legal_name: 'Summit Field Company LLC', address: '412 Canyon Rd', city: 'Ogden', state: 'UT', zip: '84401' },
    })
    const raw = doc.output()
    for (const s of ['City of Ogden', 'ITB 2026-114', 'Summit Field Company LLC', 'Ship by: Monday, October 12', 'Copies: 2']) expect(raw).toContain(s)
    expect(doc.getNumberOfPages()).toBe(1)
  })
  it('says so when the notice gave no address', () => {
    const raw = generateBidLabelPdf({ intake: { bid_number: 'RFQ 9', buyer: '' }, company: {} }).output()
    expect(raw).toContain('address not in the notice')
    expect(raw).toContain('SEALED BID')
  })
})

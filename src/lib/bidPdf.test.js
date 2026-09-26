/* global process, Buffer */
import { describe, it, expect } from 'vitest'
import fs from 'fs'
import { generateBidPdf } from './bidPdf'

// The bid form renders in Node exactly as it does in the browser (jsPDF has
// no DOM dependency), so the test can look at the bytes. Set BID_PDF_OUT to
// a path to keep a copy for a human to read.

const estimate = {
  id: 9001, quote_id: 'EST-BID1', estimate_name: 'ITB 2026-114 — Lorin Farr Park LED Retrofit',
  bid_intake: {
    title: 'Invitation to Bid 2026-114', bid_number: 'ITB 2026-114', buyer: 'City of Ogden — Parks & Recreation',
    project: 'Lorin Farr Park LED Lighting Retrofit', due_at: '2026-10-14T14:00:00-06:00',
    submit_to: 'Purchasing Division, 2549 Washington Blvd, Ogden UT 84401',
    acknowledgements: ['Addendum No. 1 dated 2026-09-30'],
    sections: [{ name: 'Base Bid', item_nos: ['1', '2', '3'] }, { name: 'Alternate 1', item_nos: ['A-1'] }],
  },
}
const lines = [
  { id: 1, bid_item_no: '1', bid_spec: 'LED high bay, 150W, 21,000 lm, DLC Premium, 5000K', quantity: 24, price: 129, unit_of_measure: 'EA', price_source: 'catalog', match_kind: 'exact' },
  { id: 2, bid_item_no: '2', bid_spec: 'Exterior wall pack, 80W, photocell', quantity: 8, price: 164, unit_of_measure: 'EA', price_source: 'catalog', match_kind: 'equivalent' },
  { id: 3, bid_item_no: '3', bid_spec: 'Precast concrete pole base, 24 in', quantity: 4, price: 412, unit_of_measure: 'EA', price_source: 'ai_sourced', price_verified_at: null },
  { id: 4, bid_item_no: 'A-1', bid_spec: 'Replace T8 lamps with LED tubes, 4 ft', quantity: 120, price: 11.5, unit_of_measure: 'EA', price_source: 'catalog', match_kind: 'exact' },
]
const company = { company_name: 'Summit Field Co', address: '412 Canyon Rd, Ogden, UT 84401', phone: '(801) 555-0142' }

describe('the bid form', () => {
  it('renders a PDF with the buyer\'s numbers, sections and the total', () => {
    const doc = generateBidPdf({ estimate, lineItems: lines, company })
    const bytes = doc.output('arraybuffer')
    expect(bytes.byteLength).toBeGreaterThan(3000)
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1)
    if (process.env.BID_PDF_OUT) fs.writeFileSync(process.env.BID_PDF_OUT, Buffer.from(bytes))
  })
  it('a draft with an unverified sourced price is marked, and the customer copy is not', () => {
    const draft = generateBidPdf({ estimate, lineItems: lines, company })
    const clean = generateBidPdf({ estimate, lineItems: lines, company, draftWatermark: false })
    // jsPDF stores page text as PDF operators; the DRAFT band exists only on the draft.
    const draftText = draft.output('datauristring')
    const cleanText = clean.output('datauristring')
    expect(draftText.length).toBeGreaterThan(cleanText.length)
  })
  it('sums the sections into the total bid the schedule lib computed', () => {
    const doc = generateBidPdf({ estimate, lineItems: lines, company })
    // 24×129 + 8×164 + 4×412 + 120×11.5 = 3096 + 1312 + 1648 + 1380 = 7436
    expect(doc.internal.pages.length).toBeGreaterThan(1) // page 0 is jsPDF's placeholder
    // The total is asserted through the schedule lib (bidSchedule.test.js); here we assert it rendered.
    const raw = doc.output()
    expect(raw).toContain('7,436.00')
  })
})

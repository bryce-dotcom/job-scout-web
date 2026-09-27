import { describe, it, expect } from 'vitest'
import { generateCoverLetterPdf, generateQualificationsPdf } from './bidPacketPdf'

const company = { company_name: 'Summit Field Co', legal_name: 'Summit Field Company LLC', address: '412 Canyon Rd', city: 'Ogden', state: 'UT', zip: '84401', phone: '(801) 555-0142', ein: '87-1234567', naics_code: '238210', entity_type: 'LLC', state_of_incorporation: 'UT' }
const opportunity = { buyer: 'City of Ogden — Parks & Recreation', solicitation_number: 'ITB 2026-114', title: 'Lorin Farr Park LED Retrofit', submit_to: { contact_name: 'J. Purchasing', address: '2549 Washington Blvd, Ogden UT' } }

describe('the cover letter', () => {
  it('renders the buyer, the solicitation, the letter and the total', () => {
    const doc = generateCoverLetterPdf({ company, opportunity, coverLetter: 'Please find our bid enclosed.\n\nWe hold the licenses named in section 3.', total: 21034, signer: { name: 'Mike Sullivan', title: 'Owner' } })
    const raw = doc.output()
    expect(raw).toContain('ITB 2026-114')
    expect(raw).toContain('Please find our bid enclosed.')
    expect(raw).toContain('21,034.00')
    expect(raw).toContain('Mike Sullivan')
    expect(doc.getNumberOfPages()).toBe(1)
  })
})

describe('the qualification statement', () => {
  it('renders the firm, its licenses, bonding, past performance, people and certificates', () => {
    const doc = generateQualificationsPdf({ company, profile: {
      capability_statement: 'Commercial LED retrofits across Utah and Arizona since 2019.',
      licenses: [{ state: 'UT', type: 'E200 Electrical', number: '12345-5501', expires: '2027-11-30' }],
      bonding: { single_limit: 500000, aggregate_limit: 1500000, surety_agent: 'Mountain West Surety' },
      past_performance: [{ project: 'Weber County Library', customer: 'Weber County', value: 84000, year: 2025, description: '412 fixtures, 6 weeks.' }],
      key_personnel: [{ name: 'Sarah Chen', title: 'Project Manager', years: 9 }],
      federal: { uei: 'ABC123DEF456', cage: '9XYZ1' },
    }, certs: [{ label: 'Certificate of insurance', present: true, expires: '2026-12-31' }, { label: 'W-9', present: false }] })
    const raw = doc.output()
    for (const s of ['Statement of Qualifications', 'Summit Field Company LLC', 'E200 Electrical', '500,000.00', 'Weber County Library', 'Sarah Chen', 'ABC123DEF456', 'not on file']) expect(raw).toContain(s)
  })
})

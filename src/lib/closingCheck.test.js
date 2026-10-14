import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { closingGaps, isArizona, gapsEmail } from '../../supabase/functions/_shared/closingCheck.ts'

const here = dirname(fileURLToPath(import.meta.url))
const won = readFileSync(resolve(here, '../../supabase/functions/_shared/arnieWon.ts'), 'utf8').replace(/\r\n/g, '\n')

const complete = () => ({
  quote: { estimate_name: 'AZ Lets Fix It', business_unit: 'Energy Scout', signed_proposal_attachment_id: 91 },
  party: { business_name: 'Lets Fix It', phone: '(480) 555-0101', email: 'owner@letsfixit.com', address: '12 E Main St, Mesa AZ 85201' },
  lines: [
    { item_id: 2371, item_name: 'SMBE 60/80/100W Cobra Head LOW WATT', description: 'Replace 400W MH shoebox with 60W LED cobra head. 20 ft off the ground, lift. Slip fit mount.' },
    { item_id: 1440, item_name: 'SMBE 10/20/30/40W Slim Cutoff Wall Pack', description: 'Existing 400W wall pack, 15 ft no lift.' },
    { item_id: 2255, item_name: 'MES Cobra Head Mount - Slip Fit', description: 'Slip fitter for cobra heads.' },
  ],
  products: { 2371: { spec_sheet_url: 'x' }, 1440: { spec_sheet_url: null }, 900: { spec_sheet_url: 'y' } },
  components: { 1440: [900] },
  annualSavings: 1950,
})
const items = (x) => closingGaps(x).map((g) => g.item)

describe("Cole's closing check, item by item", () => {
  it('a complete estimate passes', () => {
    expect(closingGaps(complete())).toEqual([])
  })
  it('customer name, phone, email and address', () => {
    const x = complete(); x.party = { business_name: '', phone: '555', email: 'none', address: '' }
    expect(items(x)).toEqual(expect.arrayContaining(['Customer name', 'Customer phone', 'Customer email', 'Customer address']))
  })
  it('business unit and project name', () => {
    const x = complete(); x.quote = { ...x.quote, business_unit: '', estimate_name: '' }
    expect(items(x)).toEqual(expect.arrayContaining(['Business Unit', 'Project name']))
  })
  it('notes on every fixture line: height, existing wattage, and the mount on cobras and floods', () => {
    const x = complete(); x.lines[0] = { ...x.lines[0], description: 'New cobra head.' }
    const g = closingGaps(x).find((y) => y.item === 'Line notes')
    expect(g.detail).toMatch(/height, existing wattage, mount/)
  })
  it('GM lines need no notes and no spec sheet', () => {
    expect(items(complete())).not.toContain('Spec sheets')
  })
  it('signed terms are required in Arizona — and a signature on the lead counts', () => {
    const x = complete(); x.quote = { ...x.quote, signed_proposal_attachment_id: null }
    expect(items(x)).toContain('Signed terms')
    expect(items({ ...x, signedOnLead: true })).not.toContain('Signed terms')
    const ut = complete(); ut.quote = { ...ut.quote, estimate_name: 'UT Somewhere', signed_proposal_attachment_id: null }; ut.party = { ...ut.party, address: '1 Main, Provo UT' }
    expect(items(ut)).not.toContain('Signed terms')
  })
  it('spec sheets from JobScout: the product\'s own, or a component inside the bundle', () => {
    const x = complete(); x.components = {}
    const g = closingGaps(x).find((y) => y.item === 'Spec sheets')
    expect(g.detail).toMatch(/Slim Cutoff Wall Pack/)
  })
  it('annual savings', () => {
    expect(items({ ...complete(), annualSavings: null })).toContain('Annual savings')
  })
  it('Arizona by address, else an "AZ " estimate name', () => {
    expect(isArizona({}, { address: '1 Main, Mesa, Arizona' })).toBe(true)
    expect(isArizona({ estimate_name: 'AZ Viking Auto' }, {})).toBe(true)
    expect(isArizona({ estimate_name: 'Lazy Dog' }, { address: 'Provo UT' })).toBe(false)
  })
})

describe('the email to the rep', () => {
  it('lists every gap, to the rep, in plain words', () => {
    const m = gapsEmail({ repName: 'Cole Westcott', ref: 'EST-1', forWhom: 'Lets Fix It', gaps: [{ item: 'Signed terms', detail: 'Arizona needs them' }], from: 'Jenny' })
    expect(m.subject).toBe('Before EST-1 (Lets Fix It) can be approved')
    expect(m.text).toMatch(/^Hi Cole,/)
    expect(m.text).toMatch(/- Signed terms: Arizona needs them/)
  })
})

describe('the won card enforces it — for the playbook\'s business unit only', () => {
  it('refuses while anything is missing, and says how to get it fixed', () => {
    expect(won).toMatch(/if \(unit && String\(est\.quote\.business_unit \|\| ''\)\.trim\(\)\.toLowerCase\(\) === unit\.toLowerCase\(\)\)/)
    expect(won).toMatch(/is not ready to approve — it is missing:/)
    expect(won).toMatch(/target=closing_gaps/)
  })
})

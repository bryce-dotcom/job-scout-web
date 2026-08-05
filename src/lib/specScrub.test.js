import { describe, it, expect } from 'vitest'
import {
  buildDenyTerms, scrubText, isIdentifyingRow, publicSheet, findLeaks, DEFAULT_KEEP_TERMS,
} from './specScrub'

// Real values from product 1374 (SMBE 50/60/70/90/110W Highbay) and its
// manufacturer spec sheet.
const PRODUCT = {
  manufacturer: 'MES',
  model_number: 'MES-PHB-SSRP-110WB1ML1A1-abW50',
  dlc_listing_number: 'PXXXXXXX',
}
const BRAND_TERMS = [
  'LEDone', 'LEDone Corp', 'ledonecorp.com', 'www.ledonecorp.com',
  '(844) LEDONE6', '1-510-217-9461', 'Lumileds',
  'LOC-2FTFLHB-MW(70/90/110)50KD', 'SMBE', 'DLC',
]

describe('deciding what to hide', () => {
  const deny = buildDenyTerms(PRODUCT, BRAND_TERMS)

  it('hides the manufacturer, the model and the DLC listing number', () => {
    // model_number embeds the maker code and a DLC number is a public lookup —
    // either one lets the customer re-bid the job elsewhere.
    expect(deny).toContain('MES')
    expect(deny).toContain('MES-PHB-SSRP-110WB1ML1A1-abW50')
    expect(deny).toContain('PXXXXXXX')
  })

  it('KEEPS SMBE even though the extractor flags it as a brand', () => {
    // SMBE is the customer's own product line. This is the single most
    // important line in the file: scrubbing it would gut the sheet.
    expect(deny).not.toContain('SMBE')
    expect(DEFAULT_KEEP_TERMS).toContain('SMBE')
  })

  it('puts longer terms first so removal cannot leave a fragment', () => {
    // Removing "LEDone" before "LEDone Corp" would leave a dangling "Corp".
    const iCorp = deny.indexOf('LEDone Corp')
    const iBare = deny.indexOf('LEDone')
    expect(iCorp).toBeLessThan(iBare)
  })

  it('survives a product with nothing recorded', () => {
    expect(buildDenyTerms(null, [])).toEqual([])
    expect(buildDenyTerms({}, undefined)).toEqual([])
  })
})

describe('the substring trap', () => {
  const deny = buildDenyTerms(PRODUCT, BRAND_TERMS)

  it('does not gut ordinary words that contain a short brand token', () => {
    // Measured on 1374: case-insensitive "LOC" hits 8 ordinary words and 0
    // real ones. Blanket substring removal would mangle the customer's sheet.
    const text = 'Local dimming, block housing, allocated driver, 3 times rated'
    expect(scrubText(text, ['LOC', 'MES'])).toBe(text)
  })

  it('still removes the same token when it stands alone', () => {
    expect(scrubText('Made by MES in China', ['MES'])).toBe('Made by in China')
  })

  it('removes long distinctive strings regardless of case', () => {
    expect(scrubText('Visit WWW.LEDONECORP.COM today', deny)).not.toMatch(/ledonecorp/i)
  })
})

describe('contact details always go', () => {
  it('strips urls, emails and phone numbers even if nobody flagged them', () => {
    const out = scrubText('Call (844) LEDONE6 or 1-510-217-9461, sales@ledonecorp.com, www.ledonecorp.com', [])
    expect(out).not.toMatch(/844|510-217|@|www\./i)
  })
})

describe('rows that name the part', () => {
  it('drops them outright', () => {
    expect(isIdentifyingRow({ label: 'Catalog #' })).toBe(true)
    expect(isIdentifyingRow({ label: 'Model Number' })).toBe(true)
    expect(isIdentifyingRow({ label: 'DLC Listing' })).toBe(true)
    expect(isIdentifyingRow({ label: 'Manufacturer' })).toBe(true)
  })

  it('keeps the ones a buyer actually needs', () => {
    expect(isIdentifyingRow({ label: 'Wattage' })).toBe(false)
    expect(isIdentifyingRow({ label: 'IP Rating' })).toBe(false)
    expect(isIdentifyingRow({ label: 'Lifetime' })).toBe(false)
  })
})

describe('the customer-facing sheet', () => {
  const extraction = {
    specs: [
      { label: 'Wattage', value: '110W' },
      { label: 'IP Rating', value: 'IP40' },
      { label: 'Lifetime', value: '50,000 hours' },
      { label: 'Catalog #', value: 'LOC-2FTFLHB-MW(70/90/110)50KD' },
      { label: 'Manufacturer', value: 'LEDone Corp' },
      { label: 'LED Chips', value: 'Lumileds 2835' },
    ],
    applications: ['Warehouses', 'Factories'],
    construction: 'Die formed galvanized steel by LEDone Corp, www.ledonecorp.com',
    brand_terms: BRAND_TERMS,
  }
  const sheet = publicSheet(extraction, PRODUCT)

  it('keeps the specs that sell the job', () => {
    const labels = sheet.specs.map(s => s.label)
    expect(labels).toContain('Wattage')
    expect(labels).toContain('IP Rating')
    expect(labels).toContain('Lifetime')
  })

  it('drops the rows that name the part', () => {
    const labels = sheet.specs.map(s => s.label)
    expect(labels).not.toContain('Catalog #')
    expect(labels).not.toContain('Manufacturer')
    expect(sheet.dropped).toBeGreaterThanOrEqual(2)
  })

  it('drops a row whose value scrubs away to nothing', () => {
    // "LED Chips: Lumileds 2835" -> "2835" alone is meaningless; a blank or
    // nonsense spec on a customer's proposal is worse than no spec.
    const chips = sheet.specs.find(s => s.label === 'LED Chips')
    expect(chips?.value ?? '').not.toMatch(/Lumileds/i)
  })

  it('cleans the construction blurb without emptying it', () => {
    expect(sheet.construction).toMatch(/galvanized steel/i)
    expect(sheet.construction).not.toMatch(/LEDone|ledonecorp/i)
  })

  it('LEAKS NOTHING — the test the whole feature rests on', () => {
    const deny = buildDenyTerms(PRODUCT, BRAND_TERMS)
    expect(findLeaks(sheet, deny)).toEqual([])
  })

  it('still says SMBE', () => {
    const withName = { ...sheet, title: 'SMBE 110W Highbay' }
    expect(JSON.stringify(withName)).toMatch(/SMBE/)
  })

  it('survives junk', () => {
    expect(publicSheet(null, null).specs).toEqual([])
    expect(publicSheet({}, PRODUCT).specs).toEqual([])
  })
})

describe('never silently change a number', () => {
  it('keeps a leading minus on a negative value', () => {
    // The cleanup used to trim a leading "-" as stray punctuation, turning
    // "-20°C to 40°C" into "20°C to 40°C" — a 40-degree error published as
    // fact on a customer's proposal.
    expect(scrubText('-20°C to 40°C (-4°F to 104°F)', ['MES'])).toBe('-20°C to 40°C (-4°F to 104°F)')
    expect(scrubText('-40', [])).toBe('-40')
  })

  it('still trims a dash left dangling by a removal', () => {
    expect(scrubText('Housing - MES', ['MES'])).toBe('Housing')
  })

  it('leaves ordinary spec values untouched', () => {
    for (const v of ['50,000 hours', '120–277V', '10,640 lm', '0-10V standard', 'IP40', '152 lm/W']) {
      expect(scrubText(v, ['MES', 'LOC'])).toBe(v)
    }
  })
})

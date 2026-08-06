import { describe, it, expect } from 'vitest'
import {
  buildDenyTerms, scrubText, isIdentifyingRow, publicSheet, publicTitle, findLeaks, DEFAULT_KEEP_TERMS, datasheetRows,
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

describe('the product name itself', () => {
  // The extraction run turned up products named after the maker outright:
  // "MES 8ft Linear Strip 40/53/68/80W", "LEDONE 8ft Strip Light 60W/70W/90W",
  // "Canopy 40W/50W/60W/75W (MES)". The name is the sheet title and the
  // proposal card heading — scrubbing the specs under a branded heading
  // achieves nothing.
  const deny = buildDenyTerms({ manufacturer: 'MES' }, ['LEDOne', 'MES'])

  it('strips a leading manufacturer name', () => {
    expect(publicTitle('MES 8ft Linear Strip 40/53/68/80W', deny)).toBe('8ft Linear Strip 40/53/68/80W')
  })

  it('strips a trailing "(MES)" without leaving empty brackets', () => {
    expect(publicTitle('Canopy 40W/50W/60W/75W (MES)', deny)).toBe('Canopy 40W/50W/60W/75W')
  })

  it('keeps our own line name', () => {
    expect(publicTitle('SMBE 50/60/70/90/110W Highbay', deny)).toBe('SMBE 50/60/70/90/110W Highbay')
  })

  it('publishes NOTHING rather than the maker when the name is only the brand', () => {
    // This previously returned the raw name, on the reasoning that an untitled
    // row is worse than a branded one. It isn't: the whole point of the sheet
    // is that a customer cannot identify the manufacturer and re-bid the job.
    // It also broke the feature outright — the raw name tripped the sheet's own
    // leak check, and because a send builds ONE combined PDF, 7 such products
    // withheld the entire attachment for every estimate they appeared on.
    // The caller renders the product category, or "Product", instead.
    expect(publicTitle('MES', deny)).toBe('')
  })

  it('does not treat our own product name as a brand just because the extractor did', () => {
    // The extractor flags "product-line name", so it returns whole names like
    // "SMBE 290W/320W/350W Highbay LIFT". Denying that scrubbed the sheet's
    // own title.
    const d = buildDenyTerms(
      { manufacturer: 'MES' },
      ['SMBE 290W/320W/350W Highbay LIFT', 'SMBE Canopies', 'MES', 'LEDOne'],
    )
    expect(d).not.toContain('SMBE 290W/320W/350W Highbay LIFT')
    expect(d).not.toContain('SMBE Canopies')
    expect(d).toContain('MES')
    expect(publicTitle('SMBE 290W/320W/350W Highbay LIFT', d)).toBe('SMBE 290W/320W/350W Highbay LIFT')
  })

  it('still removes the maker from a name that also carries ours', () => {
    const d = buildDenyTerms({ manufacturer: 'MES' }, ['SMBE MES 20/40/60/80W Canopy Relocate', 'MES'])
    expect(publicTitle('SMBE MES 20/40/60/80W Canopy Relocate', d)).toBe('SMBE 20/40/60/80W Canopy Relocate')
  })
})

describe('the shared manufacturer vocabulary', () => {
  // Product 1486 is named "SMBE MES 20/40/60/80W Canopy Relocate" but its
  // manufacturer field says LEDOne, and MES appears only inside the composite
  // brand term "SMBE MES" — dropped for containing our own SMBE. Without the
  // workspace-wide list, MES stayed on the customer's page.
  const product = { manufacturer: 'LEDOne', model_number: null, dlc_listing_number: null }
  const brandTerms = ['LEDone', 'SMBE MES', 'ledonecorp.com']

  it('misses a maker that belongs to a different product without the list', () => {
    const deny = buildDenyTerms(product, brandTerms)
    expect(publicTitle('SMBE MES 20/40/60/80W Canopy Relocate', deny)).toContain('MES')
  })

  it('catches it once the workspace list is supplied', () => {
    const deny = buildDenyTerms(product, brandTerms, undefined, ['MES', 'LEDOne', 'Maverick Lighting'])
    expect(deny).toContain('MES')
    expect(publicTitle('SMBE MES 20/40/60/80W Canopy Relocate', deny))
      .toBe('SMBE 20/40/60/80W Canopy Relocate')
  })

  it('still keeps our own line', () => {
    const deny = buildDenyTerms(product, brandTerms, undefined, ['MES', 'LEDOne'])
    expect(deny).not.toContain('SMBE')
    expect(publicTitle('SMBE 110W Highbay', deny)).toBe('SMBE 110W Highbay')
  })
})

describe('datasheetRows — the shape that crashed the Products page', () => {
  // products_services.datasheet_json holds TWO shapes. The Products modal
  // rendered Object.entries(datasheet) and pushed the value into JSX, which
  // was fine for the flat map and threw React error #31 ("objects are not
  // valid as a React child", keys {label, value}) for all 189 products
  // carrying the extraction. Damien could not open a single product.
  const extracted = {
    specs: [
      { label: 'Wattage (this model)', value: '290W / 320W / 350W (selectable)' },
      { label: 'CCT', value: '5000K' },
    ],
    applications: ['Warehouses', 'Factories'],
    construction: 'Die formed galvanized steel',
    brand_terms: ['LEDOne', 'MES'],
    source: { url: 'https://example/spec.pdf', chars: 4598 },
  }

  it('returns flat label/value strings, never objects', () => {
    const rows = datasheetRows(extracted)
    expect(rows.length).toBeGreaterThan(0)
    for (const r of rows) {
      expect(typeof r.label).toBe('string')
      expect(typeof r.value).toBe('string')
    }
  })

  it('keeps the extracted specs', () => {
    const rows = datasheetRows(extracted)
    expect(rows.find(r => r.label === 'CCT')?.value).toBe('5000K')
  })

  it('renders a list as text rather than handing an array to JSX', () => {
    expect(datasheetRows(extracted).find(r => r.label === 'Applications')?.value)
      .toBe('Warehouses, Factories')
  })

  it('never emits the internal bookkeeping keys', () => {
    const labels = datasheetRows(extracted).map(r => r.label)
    expect(labels).not.toContain('brand_terms')
    expect(labels).not.toContain('source')
    expect(labels).not.toContain('specs')
  })

  it('still handles the old hand-typed flat map', () => {
    expect(datasheetRows({ Wattage: '110W', CRI: '80+' })).toEqual([
      { label: 'Wattage', value: '110W' },
      { label: 'CRI', value: '80+' },
    ])
  })

  it('survives junk', () => {
    expect(datasheetRows(null)).toEqual([])
    expect(datasheetRows({})).toEqual([])
    expect(datasheetRows('nonsense')).toEqual([])
    expect(datasheetRows({ specs: 'not-an-array' })).toEqual([])
    expect(datasheetRows({ specs: [null, { label: 'A' }, { value: 'B' }] })).toEqual([])
  })
})

describe('publicTitle when the product is named after its maker', () => {
  // The extraction lists the product's OWN NAME among brand_terms, e.g.
  // "MES 36W 2x2 Backlit Panel". Scrubbing that leaves nothing; the old code
  // fell back to the RAW name and the leak check then flagged the string it
  // had just restored. 7 products failed, and because a send builds ONE
  // combined sheet, any single one of them withheld the whole attachment.
  const deny = ['MES', 'Maverick LED', 'MES 36W 2x2 Backlit Panel']

  it('strips the maker but keeps the useful name', () => {
    expect(publicTitle('MES 36W 2x2 Backlit Panel', deny)).toBe('36W 2x2 Backlit Panel')
  })

  it('ignores a deny term that covers the entire title', () => {
    // It says nothing about WHICH part is the brand, so it cannot be applied.
    expect(publicTitle('MES HB Control', ['MES HB Control', 'MES'])).toBe('HB Control')
  })

  it('NEVER falls back to a raw name that contains a denied term', () => {
    // Returning the raw name is exactly how the manufacturer reaches a
    // customer. Empty is correct; callers render 'Product'.
    expect(publicTitle('MES', ['MES'])).toBe('')
    expect(publicTitle('Maverick LED', ['Maverick LED'])).toBe('')
  })

  it('leaves a clean name alone', () => {
    expect(publicTitle('SMBE 110W Highbay', ['MES'])).toBe('SMBE 110W Highbay')
  })

  it('survives junk', () => {
    expect(publicTitle(null, ['MES'])).toBe('')
    expect(publicTitle('  ', ['MES'])).toBe('')
  })
})

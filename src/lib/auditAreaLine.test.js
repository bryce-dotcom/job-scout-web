import { describe, it, expect } from 'vitest'
import {
  areaAnnotations, areaWattsReduced, areaOrderQty, auditCostPerWatt,
  areaHasRecordedPrice, auditAreaToIntakeLine, auditAreasToIntakeLines,
} from './auditAreaLine'
import * as core from '../../supabase/functions/_shared/auditAreaLine.ts'

// The real Cocola area: 30 four-lamp T5 highbays -> SMBE highbay at $434.98.
const cocolaArea = {
  area_name: '4-Lamp T5 4ft High Bay',
  fixture_count: 30,
  existing_wattage: 216,
  led_wattage: 165,
  led_replacement_id: 1377,
  unit_price: 434.98,
  product_qty: 30,
  line_total: 13049.40,
  lamps_per_fixture: 4,
  priced_per_lamp: false,
  override_notes: 'ballast bypass needed',
  photos: ['audits/194/photo_0.jpg'],
}

describe('precedence: what the area recorded wins', () => {
  it('prices from the recorded basis, not the catalogue or the watts', () => {
    const l = auditAreaToIntakeLine(cocolaArea, { costPerWatt: 999 })
    expect(l.price).toBe(434.98)
    expect(l.quantity).toBe(30)
    expect(l.line_total).toBe(13049.40)
  })
  it('falls back to the catalogue price when nothing was recorded', () => {
    const a = { ...cocolaArea, unit_price: null, line_total: null, product_qty: null,
      led_product: { name: 'SMBE Highbay', price: 434.98 } }
    const l = auditAreaToIntakeLine(a, { costPerWatt: 999 })
    expect(l.price).toBe(434.98)
    expect(l.quantity).toBe(30)
    expect(l.line_total).toBe(13049.40)
  })
  it('falls back to cost-per-watt only when there is no price at all', () => {
    const a = { area_name: 'Old area', fixture_count: 10, existing_wattage: 100, led_wattage: 40 }
    const l = auditAreaToIntakeLine(a, { costPerWatt: 2 })
    expect(l.price).toBe(120)          // (100-40) x $2, per fixture
    expect(l.line_total).toBe(1200)    // x 10 fixtures
  })
})

describe('the negative-line bug, in every copy', () => {
  it('never prices below zero when the baseline is missing', () => {
    // existW = 0 is a new install or an unrecorded baseline. All four copies
    // produced a negative unit price here.
    const a = { area_name: 'New install', fixture_count: 5, existing_wattage: 0, led_wattage: 40 }
    const l = auditAreaToIntakeLine(a, { costPerWatt: 3 })
    expect(l.price).toBe(0)
    expect(l.line_total).toBe(0)
  })
  it('never reports negative watts reduced', () => {
    expect(areaWattsReduced({ fixture_count: 5, existing_wattage: 0, led_wattage: 40 })).toBe(0)
    expect(areaWattsReduced({ fixture_count: 5, existing_wattage: 100, led_wattage: 40 })).toBe(300)
  })
})

describe('order quantity', () => {
  it('uses the recorded product_qty when present', () => {
    expect(areaOrderQty({ fixture_count: 30, product_qty: 120 })).toBe(120)
  })
  it('falls back to the fixture count', () => {
    expect(areaOrderQty({ fixture_count: 30 })).toBe(30)
  })
  it('never returns zero', () => {
    expect(areaOrderQty({})).toBe(1)
    expect(areaOrderQty({ fixture_count: 0 })).toBe(1)
  })
})

describe('annotations travel on every path', () => {
  it('carries notes and photos', () => {
    const l = auditAreaToIntakeLine(cocolaArea)
    expect(l.notes).toBe('ballast bypass needed')
    expect(l.photos).toEqual(['audits/194/photo_0.jpg'])
  })
  it('LeadDetail used to drop notes entirely — it cannot now', () => {
    const l = auditAreaToIntakeLine({ ...cocolaArea, photos: [] })
    expect(l.notes).toBe('ballast bypass needed')
  })
  it('returns both keys even when empty, so a spread cannot keep stale values', () => {
    expect(areaAnnotations({})).toEqual({ notes: null, photos: [] })
    expect(areaAnnotations(null)).toEqual({ notes: null, photos: [] })
  })
  it('drops blank notes and falsy photos', () => {
    expect(areaAnnotations({ override_notes: '   ', photos: [null, 'a', ''] }))
      .toEqual({ notes: null, photos: ['a'] })
  })
})

describe('naming and description', () => {
  it('names by the product sold, falling back to the area', () => {
    expect(auditAreaToIntakeLine({ ...cocolaArea, led_product: { name: 'SMBE Highbay' } }).item_name)
      .toBe('SMBE Highbay')
    expect(auditAreaToIntakeLine(cocolaArea).item_name).toBe('4-Lamp T5 4ft High Bay - LED Retrofit')
  })
  it('uses the caller-supplied describe, so wording stays where it is authored', () => {
    const l = auditAreaToIntakeLine(cocolaArea, { describe: (a) => `${a.area_name} · 24 ft` })
    expect(l.description).toBe('4-Lamp T5 4ft High Bay · 24 ft')
  })
  it('has a null description when no describe is given', () => {
    expect(auditAreaToIntakeLine(cocolaArea).description).toBe(null)
  })
})

describe('whole-audit conversion', () => {
  const areas = [
    cocolaArea,
    { ...cocolaArea, area_name: '2-Lamp T8 4ft Wrap', fixture_count: 3, product_qty: 3,
      unit_price: 397.5, line_total: 1192.5, led_replacement_id: 2312 },
    { ...cocolaArea, area_name: '2-Lamp T12 8ft Strip', fixture_count: 8, product_qty: 8,
      unit_price: 391, line_total: 3128, led_replacement_id: 1476 },
  ]
  it('reconciles to the recorded totals with no cost-per-watt anywhere', () => {
    const lines = auditAreasToIntakeLines(areas, { quoteAmount: 999999 })
    const sum = lines.reduce((s, l) => s + l.line_total, 0)
    expect(sum).toBeCloseTo(13049.40 + 1192.5 + 3128, 2)
  })
  it('does not back-derive when every area carries a price', () => {
    expect(areas.every(areaHasRecordedPrice)).toBe(true)
    // A wildly wrong quoteAmount must not move a single line.
    const a = auditAreasToIntakeLines(areas, { quoteAmount: 1 })
    const b = auditAreasToIntakeLines(areas, { quoteAmount: 10_000_000 })
    expect(a).toEqual(b)
  })
  it('uses cost-per-watt only for the legacy areas that need it', () => {
    const legacy = [{ area_name: 'Legacy', fixture_count: 10, existing_wattage: 100, led_wattage: 40 }]
    const lines = auditAreasToIntakeLines(legacy, { quoteAmount: 1200 })
    // 600 watts reduced total, $1200 -> $2/W -> $120/fixture -> $1200
    expect(lines[0].line_total).toBeCloseTo(1200, 2)
  })
  it('handles an audit with no areas', () => {
    expect(auditAreasToIntakeLines([], { quoteAmount: 100 })).toEqual([])
    expect(auditCostPerWatt([], 100)).toBe(0)
  })
})

describe('shim and core cannot drift', () => {
  it('produce identical output', () => {
    expect(auditAreaToIntakeLine(cocolaArea)).toEqual(core.auditAreaToIntakeLine(cocolaArea))
    expect(areaAnnotations(cocolaArea)).toEqual(core.areaAnnotations(cocolaArea))
    expect(areaOrderQty(cocolaArea)).toBe(core.areaOrderQty(cocolaArea))
  })
})

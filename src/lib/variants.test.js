import { describe, it, expect } from 'vitest'
import {
  naturalCompare, deriveVariantAxes, defaultVariantSelection, resolveVariant, variantPriceRange,
} from './variants'

// A trimmed SMBE-like fixture: 2 wattage tiers x a few install combos.
const rows = [
  { id: 1, name: '50-110 base', unit_price: 251.6, vendor_sku: '09240-03', variant_options: { Wattage: '50-110W', Lift: false, Controls: false, Relocate: false } },
  { id: 2, name: '50-110 lift', unit_price: 421.58, vendor_sku: '09240-03', variant_options: { Lift: true, Controls: false, Relocate: false, Wattage: '50-110W' } }, // keys deliberately reordered (jsonb does this)
  { id: 3, name: '50-110 lift+ctrl', unit_price: 504.78, vendor_sku: '09240-03', variant_options: { Wattage: '50-110W', Lift: true, Controls: true, Relocate: false } },
  { id: 4, name: '360-440 base', unit_price: 468.78, vendor_sku: null, variant_options: { Wattage: '360-440W', Lift: false, Controls: false, Relocate: false } },
  { id: 5, name: '360-440 relocate', unit_price: 676.28, vendor_sku: null, variant_options: { Wattage: '360-440W', Lift: false, Controls: false, Relocate: true } },
]

describe('naturalCompare', () => {
  it('orders wattage ranges by leading number, not lexically', () => {
    const sorted = ['150-220W', '50-110W', '90-165W', '360-440W'].sort(naturalCompare)
    expect(sorted).toEqual(['50-110W', '90-165W', '150-220W', '360-440W'])
  })
})

describe('deriveVariantAxes', () => {
  const axes = deriveVariantAxes(rows)
  it('puts the single-select axis first, toggles after — regardless of stored key order', () => {
    expect(axes.map((a) => a.name)).toEqual(['Wattage', 'Controls', 'Lift', 'Relocate'])
  })
  it('types axes by value kind', () => {
    expect(axes.find((a) => a.name === 'Wattage').type).toBe('select')
    expect(axes.find((a) => a.name === 'Lift').type).toBe('toggle')
  })
  it('natural-sorts select values and normalizes toggles to [false, true]', () => {
    expect(axes.find((a) => a.name === 'Wattage').values).toEqual(['50-110W', '360-440W'])
    expect(axes.find((a) => a.name === 'Lift').values).toEqual([false, true])
  })
})

describe('resolveVariant', () => {
  const group = { rows, axes: deriveVariantAxes(rows) }
  it('resolves a selection to exactly one real row', () => {
    expect(resolveVariant(group, { Wattage: '50-110W', Lift: true, Controls: true, Relocate: false })?.id).toBe(3)
  })
  it('treats missing toggles as false', () => {
    expect(resolveVariant(group, { Wattage: '50-110W' })?.id).toBe(1)
  })
  it('returns null when the combination is not stocked', () => {
    expect(resolveVariant(group, { Wattage: '360-440W', Lift: true, Controls: false, Relocate: false })).toBeNull()
  })
  it('default selection lands on the base row of the first wattage', () => {
    const sel = defaultVariantSelection(group.axes)
    expect(sel).toEqual({ Wattage: '50-110W', Controls: false, Lift: false, Relocate: false })
    expect(resolveVariant(group, sel)?.id).toBe(1)
  })
})

describe('variantPriceRange', () => {
  it('spans min to max unit_price', () => {
    expect(variantPriceRange(rows)).toEqual({ min: 251.6, max: 676.28 })
  })
})

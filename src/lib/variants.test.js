import { describe, it, expect } from 'vitest'
import {
  naturalCompare, deriveVariantAxes, defaultVariantSelection, resolveVariant, variantPriceRange,
  groupProductsForPicker,
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

describe('groupProductsForPicker', () => {
  const rows = [
    { id: 1, name: 'SMBE Highbay 100W', variant_group_id: 'g1', variant_group_label: 'SMBE Highbay' },
    { id: 2, name: 'SMBE Highbay 240W', variant_group_id: 'g1', variant_group_label: 'SMBE Highbay' },
    { id: 3, name: 'SMBE Highbay 150W', variant_group_id: 'g1', variant_group_label: 'SMBE Highbay' },
    { id: 4, name: 'Zip Ties' },
    { id: 5, name: 'Anchor Bolt' },
  ]

  it('groups a variant family and leaves other products loose', () => {
    const { groups, loose } = groupProductsForPicker(rows)
    expect(groups).toHaveLength(1)
    expect(groups[0].label).toBe('SMBE Highbay')
    expect(groups[0].items).toHaveLength(3)
    expect(loose.map(p => p.name)).toEqual(['Anchor Bolt', 'Zip Ties'])
  })

  it('keeps EVERY product selectable — nothing is hidden', () => {
    const { groups, loose } = groupProductsForPicker(rows)
    const total = groups.reduce((s, g) => s + g.items.length, 0) + loose.length
    expect(total).toBe(rows.length)
  })

  it('sorts variants naturally by wattage, not alphabetically', () => {
    const { groups } = groupProductsForPicker(rows)
    expect(groups[0].items.map(i => i.name)).toEqual([
      'SMBE Highbay 100W', 'SMBE Highbay 150W', 'SMBE Highbay 240W',
    ])
  })

  it('does not make a group header for a family of one', () => {
    const { groups, loose } = groupProductsForPicker([
      { id: 9, name: 'Lonely', variant_group_id: 'g9', variant_group_label: 'Lonely Fam' },
      { id: 10, name: 'Plain' },
    ])
    expect(groups).toHaveLength(0)
    expect(loose.map(p => p.name)).toEqual(['Lonely', 'Plain'])
  })

  it('handles empty / junk input without throwing', () => {
    expect(groupProductsForPicker([])).toEqual({ groups: [], loose: [] })
    expect(groupProductsForPicker(null)).toEqual({ groups: [], loose: [] })
    expect(groupProductsForPicker([null, undefined])).toEqual({ groups: [], loose: [] })
  })
})

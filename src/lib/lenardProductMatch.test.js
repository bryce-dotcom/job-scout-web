import { describe, it, expect } from 'vitest'
import {
  scoreProductMatch, getMatchedProducts, findBestProduct,
  productIsSellable, groupNameMap, productWattages,
} from './lenardProductMatch'

// Real groups from company 3's price book, Electrical Services (Bundles).
const groups = [
  { id: 3, name: 'SMBE Highbays' }, { id: 2, name: 'SMBE Wraps' },
  { id: 7, name: 'SMBE Panels' }, { id: 6, name: 'SMBE Strip Light' },
  { id: 9, name: 'SMBE Vapor Tight' }, { id: 5, name: 'SMBE Wallpack' },
  { id: 4, name: 'SMBE Cobra Heads' }, { id: 30, name: 'SMBE Floods' },
  { id: 34, name: 'SMBE Troffer' }, { id: 25, name: 'PRODUCT' },
]
const G = groupNameMap(groups)

const p = (over) => ({ id: 1, name: 'Some Product', unit_price: 100, group_id: 25, ...over })

describe('the tenant grouping beats the product name', () => {
  it('matches a highbay by its group even when the name would not', () => {
    // "MES 50/60/70/90/110W Highbay - 2ft" happens to say highbay, but this one
    // is deliberately named so only the group can identify it.
    const prod = p({ name: 'MES 131.6 2ft', group_id: 3 })
    expect(scoreProductMatch(prod, 'High Bay', 0, G)).toBeGreaterThanOrEqual(200)
  })
  it('scores a group match above a name-only match', () => {
    const byGroup = p({ name: 'Nondescript', group_id: 3 })
    const byName = p({ name: 'Warehouse Highbay Fixture', group_id: 25 })
    expect(scoreProductMatch(byGroup, 'High Bay', 0, G))
      .toBeGreaterThan(scoreProductMatch(byName, 'High Bay', 0, G))
  })
  it('still matches on name when the product has no group', () => {
    const prod = p({ name: 'LED Highbay 110W', group_id: null })
    expect(scoreProductMatch(prod, 'High Bay', 0, G)).toBeGreaterThanOrEqual(100)
  })
})

describe('the wallpack bug: spacing must not decide a match', () => {
  it('"SMBE Wallpack" matches the keyword "wall pack"', () => {
    // Squashing to letters+digits is the whole point. Without it this scored 0
    // and the most common exterior family never auto-selected.
    expect(scoreProductMatch(p({ group_id: 5 }), 'Outdoor', 0, G)).toBeGreaterThanOrEqual(200)
    expect(scoreProductMatch(p({ group_id: 5 }), 'Wall Pack', 0, G)).toBeGreaterThanOrEqual(200)
  })
  it('"SMBE Highbays" matches "high bay"', () => {
    expect(scoreProductMatch(p({ group_id: 3 }), 'High Bay', 0, G)).toBeGreaterThanOrEqual(200)
  })
  it('cobra heads count as an area light', () => {
    expect(scoreProductMatch(p({ group_id: 4 }), 'Area Light', 0, G)).toBeGreaterThanOrEqual(200)
  })
})

describe('families map to the right categories', () => {
  const cases = [
    ['Linear', 6, 'SMBE Strip Light'], ['Linear', 2, 'SMBE Wraps'],
    ['Linear', 9, 'SMBE Vapor Tight'], ['Recessed', 7, 'SMBE Panels'],
    ['Recessed', 34, 'SMBE Troffer'], ['Outdoor', 30, 'SMBE Floods'],
    ['High Bay', 3, 'SMBE Highbays'],
  ]
  cases.forEach(([cat, gid, label]) => {
    it(`${cat} -> ${label}`, () => {
      expect(scoreProductMatch(p({ group_id: gid }), cat, 0, G)).toBeGreaterThanOrEqual(200)
    })
  })
  it('does not offer a highbay for a recessed fixture', () => {
    expect(scoreProductMatch(p({ group_id: 3 }), 'Recessed', 0, G)).toBeLessThan(100)
  })
})

describe('wattage orders within the family', () => {
  const family = [
    p({ id: 1, name: 'SMBE 90/110/130/150/165W Highbay', group_id: 3 }),
    p({ id: 2, name: 'SMBE 50/60/70W Highbay', group_id: 3 }),
  ]
  it('reads every selectable wattage, not just one', () => {
    expect(productWattages('SMBE 90/110/130/150/165W Highbay - 2ft LIFT'))
      .toEqual([90, 110, 130, 150, 165])
    expect(productWattages('SMBE  21/26/34/40W Linear Strip - 4ft')).toEqual([21, 26, 34, 40])
  })
  it('picks the family that can actually reach the target', () => {
    // 95W: the 90-165W fixture covers it at 110. The 50/60/70W unit tops out
    // at 70 and physically cannot. Reading one number per name got this wrong.
    expect(getMatchedProducts(family, 'High Bay', 95, G)[0].id).toBe(1)
  })
  it('still prefers the smaller unit for a small target', () => {
    expect(getMatchedProducts(family, 'High Bay', 55, G)[0].id).toBe(2)
  })
  it('handles a name with no wattage at all', () => {
    expect(productWattages('ES LIFT')).toEqual([])
    expect(productWattages(null)).toEqual([])
  })
})

describe('auto-select refuses to put a $0 line in front of a customer', () => {
  it('skips an unpriced product even with a perfect category match', () => {
    const unpriced = p({ id: 9, name: '2L MES T8 4ft Tube', unit_price: null, group_id: 3 })
    const priced = p({ id: 10, name: 'SMBE Highbay', unit_price: 434.98, group_id: 3 })
    expect(findBestProduct([unpriced, priced], 'High Bay', 0, G).id).toBe(10)
  })
  it('returns null rather than auto-select something unpriced', () => {
    const unpriced = p({ unit_price: 0, group_id: 3 })
    expect(findBestProduct([unpriced], 'High Bay', 0, G)).toBe(null)
  })
  it('returns null when nothing matches the category', () => {
    expect(findBestProduct([p({ group_id: 3 })], 'Recessed', 0, G)).toBe(null)
  })
  it('knows what is sellable', () => {
    expect(productIsSellable({ unit_price: 1 })).toBe(true)
    expect(productIsSellable({ unit_price: 0 })).toBe(false)
    expect(productIsSellable({ unit_price: null })).toBe(false)
    expect(productIsSellable({})).toBe(false)
  })
})

describe('edge cases', () => {
  it('handles an empty catalogue', () => {
    expect(getMatchedProducts([], 'High Bay', 0, G)).toEqual([])
    expect(findBestProduct([], 'High Bay', 0, G)).toBe(null)
    expect(findBestProduct(null, 'High Bay', 0, G)).toBe(null)
  })
  it('handles a missing group map (ungrouped tenant)', () => {
    expect(scoreProductMatch(p({ name: 'LED Highbay' }), 'High Bay', 0, undefined))
      .toBeGreaterThanOrEqual(100)
  })
  it('handles an unknown fixture category', () => {
    expect(scoreProductMatch(p({ group_id: 3 }), 'Nonsense', 0, G)).toBe(0)
  })
  it('groupNameMap trims and ignores junk', () => {
    expect(groupNameMap([{ id: 1, name: '  PRODUCT  ' }, null, { name: 'no id' }]))
      .toEqual({ 1: 'PRODUCT' })
    expect(groupNameMap(undefined)).toEqual({})
  })
})

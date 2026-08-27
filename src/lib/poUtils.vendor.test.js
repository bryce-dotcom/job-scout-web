import { describe, it, expect } from 'vitest'
import {
  VENDOR_PROBLEM, resolveOrderVendor, partitionByVendor, describeBlockedVendors,
} from './poUtils'

// The real vendor list for company 3 on the day this was reported.
const vendors = [
  { id: 1, name: 'Maverick Lighting', active: false },
  { id: 2, name: 'LEDOne', active: true },
  { id: 4, name: 'MES', active: true },
  { id: 7, name: 'SunPZone', active: true },
  { id: 8, name: 'Warehouse Lighting', active: true },
]
const byId = Object.fromEntries(vendors.map(v => [v.id, v]))
const item = (over) => ({ productId: 1, name: 'MES 90/110/130/150/165W Highbay - 2ft', vendorId: 4, ...over })

describe('resolveOrderVendor', () => {
  it('accepts an active vendor', () => {
    expect(resolveOrderVendor(4, byId)).toEqual({ vendorId: 4, problem: null, vendorName: 'MES' })
  })
  it('refuses a DEACTIVATED vendor and names it', () => {
    // The bug: 31 products point at vendor 1, which appears in no picker.
    const r = resolveOrderVendor(1, byId)
    expect(r.vendorId).toBe(null)
    expect(r.problem).toBe(VENDOR_PROBLEM.INACTIVE)
    expect(r.vendorName).toBe('Maverick Lighting')
  })
  it('refuses a product with no vendor rather than guessing', () => {
    expect(resolveOrderVendor(null, byId).problem).toBe(VENDOR_PROBLEM.NONE)
  })
  it('refuses a vendor that no longer exists', () => {
    expect(resolveOrderVendor(999, byId).problem).toBe(VENDOR_PROBLEM.UNKNOWN)
  })
})

describe('partitionByVendor', () => {
  it('groups orderable items and holds back the rest', () => {
    const items = [
      item({ productId: 10, vendorId: 4 }),
      item({ productId: 11, vendorId: 4 }),
      item({ productId: 12, vendorId: 2 }),
      item({ productId: 13, vendorId: 1, name: 'MES HB Control' }),   // deactivated
      item({ productId: 14, vendorId: null, name: 'Orphan part' }),   // unassigned
    ]
    const { groups, blocked } = partitionByVendor(items, vendors)
    expect([...groups.keys()].sort()).toEqual([2, 4])
    expect(groups.get(4)).toHaveLength(2)
    expect(blocked.map(b => b.problem).sort())
      .toEqual([VENDOR_PROBLEM.INACTIVE, VENDOR_PROBLEM.NONE])
  })

  it('never invents a vendor for an unassigned item', () => {
    // The old code sent these to vendors[0] — the alphabetically first active
    // vendor — so an unassigned product silently became an order to LEDOne.
    const { groups, blocked } = partitionByVendor([item({ vendorId: null })], vendors)
    expect(groups.size).toBe(0)
    expect(blocked).toHaveLength(1)
  })

  it('a PO is never addressed to a deactivated vendor', () => {
    const { groups } = partitionByVendor([item({ vendorId: 1 })], vendors)
    expect(groups.has(1)).toBe(false)
    expect(groups.size).toBe(0)
  })

  it('needs the FULL vendor list, inactive included, to name the problem', () => {
    // Every picker in the app filters active=true. Hand the guard that list and
    // a deactivated vendor reads as "unknown" and cannot be explained.
    const activeOnly = vendors.filter(v => v.active)
    expect(partitionByVendor([item({ vendorId: 1 })], activeOnly).blocked[0].problem)
      .toBe(VENDOR_PROBLEM.UNKNOWN)
    expect(partitionByVendor([item({ vendorId: 1 })], vendors).blocked[0].problem)
      .toBe(VENDOR_PROBLEM.INACTIVE)
  })

  it('handles empty input', () => {
    expect(partitionByVendor([], vendors).groups.size).toBe(0)
    expect(partitionByVendor(null, null).blocked).toEqual([])
  })
})

describe('describeBlockedVendors', () => {
  it('names the vendor and the products a human has to fix', () => {
    const msg = describeBlockedVendors([
      { item: { name: 'MES HB Control' }, problem: VENDOR_PROBLEM.INACTIVE, vendorName: 'Maverick Lighting' },
      { item: { name: 'MES Highbay 2ft' }, problem: VENDOR_PROBLEM.INACTIVE, vendorName: 'Maverick Lighting' },
    ])
    expect(msg).toMatch(/Maverick Lighting" is deactivated/)
    expect(msg).toMatch(/MES HB Control/)
    expect(msg).toMatch(/^2 item\(s\)/)
  })
  it('groups the reasons rather than repeating them per product', () => {
    const msg = describeBlockedVendors([
      { item: { name: 'A' }, problem: VENDOR_PROBLEM.INACTIVE, vendorName: 'Maverick Lighting' },
      { item: { name: 'B' }, problem: VENDOR_PROBLEM.NONE },
    ])
    expect(msg.split('\n')).toHaveLength(2)
    expect(msg).toMatch(/no vendor set/)
  })
  it('truncates a long list instead of printing forty names', () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ item: { name: `P${i}` }, problem: VENDOR_PROBLEM.NONE }))
    expect(describeBlockedVendors(many)).toMatch(/and 5 more/)
  })
  it('says nothing when nothing is blocked', () => {
    expect(describeBlockedVendors([])).toBe('')
    expect(describeBlockedVendors(null)).toBe('')
  })
})

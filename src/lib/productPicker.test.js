import { describe, it, expect } from 'vitest'
import { sameType, groupServiceIndex, serviceTypeOf, serviceTypeCounts, chipTypes } from './productPicker'

// Christopher, eede9f95: "Not sure where the old option went to add a specific
// service." Nothing had been removed. The picker took a row's category from its
// product_group alone, so a row with no group had no category — no chip, and
// excluded by every chip filter. HHH's real data, which these use:
//
//   grouped:    Electrical (294), Window Cleaning (77), Service (3), service (22)
//   group-less: Google (5), LABOR Energy Scout (2), Custom Services (2),
//               Energy Efficiency (2), Incentives (1)

const GROUPS = [
  { id: 10, service_type: 'Electrical' },
  { id: 11, service_type: 'Window Cleaning' },
]
const idx = groupServiceIndex(GROUPS)

describe('a row with no group still has a category', () => {
  it('prefers the group, falls back to the row', () => {
    expect(serviceTypeOf({ group_id: 10, type: 'ignored' }, idx)).toBe('Electrical')
    expect(serviceTypeOf({ group_id: null, type: 'Custom Services' }, idx)).toBe('Custom Services')
  })

  it('no longer returns null for the rows that were unreachable', () => {
    // Each of these was invisible to every chip before.
    for (const t of ['Google', 'LABOR Energy Scout', 'Custom Services', 'Energy Efficiency', 'Incentives']) {
      expect(serviceTypeOf({ type: t }, idx)).toBe(t)
    }
  })

  it('is null only when there is genuinely nothing to go on', () => {
    expect(serviceTypeOf({}, idx)).toBe(null)
    expect(serviceTypeOf(null, idx)).toBe(null)
    expect(serviceTypeOf({ group_id: 999 }, idx)).toBe(null)
  })
})

describe('Service and service are one category', () => {
  it('matches case- and padding-insensitively', () => {
    expect(sameType('Service', 'service')).toBe(true)
    expect(sameType(' Service ', 'SERVICE')).toBe(true)
    expect(sameType('Service', 'Electrical')).toBe(false)
    expect(sameType(null, null)).toBe(true)
    expect(sameType('Service', null)).toBe(false)
  })

  it('adds the two spellings into one chip total', () => {
    const products = [
      { type: 'Service' }, { type: 'service' }, { type: 'service' }, { type: 'SERVICE' },
      { group_id: 10 },
    ]
    const counts = serviceTypeCounts(products, idx)
    expect(counts.Service).toBe(4)            // first spelling seen wins the label
    expect(counts.service).toBeUndefined()    // not a second chip
    expect(counts.Electrical).toBe(1)
  })

  it('offers one chip per category, not one per spelling', () => {
    const chips = chipTypes({
      serviceTypes: ['Electrical'],
      productGroups: GROUPS,
      products: [{ type: 'service' }, { type: 'Service' }, { type: 'Google' }],
    })
    expect(chips).toEqual(['Electrical', 'Window Cleaning', 'service', 'Google'])
  })
})

describe('the chip list', () => {
  it('puts configured types first, then groups, then row-only types', () => {
    const chips = chipTypes({
      serviceTypes: ['Window Cleaning'],
      productGroups: [{ id: 10, service_type: 'Electrical' }],
      products: [{ type: 'Incentives' }],
    })
    expect(chips).toEqual(['Window Cleaning', 'Electrical', 'Incentives'])
  })

  it('skips blanks rather than rendering an empty chip', () => {
    expect(chipTypes({ serviceTypes: ['', null], productGroups: [{ id: 1 }], products: [{ type: '' }] })).toEqual([])
  })

  it('survives junk', () => {
    expect(chipTypes({})).toEqual([])
    expect(chipTypes()).toEqual([])
    expect(serviceTypeCounts(null, {})).toEqual({})
    expect(groupServiceIndex(null)).toEqual({})
  })
})

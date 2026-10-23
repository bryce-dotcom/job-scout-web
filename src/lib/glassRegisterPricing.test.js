import { describe, it, expect } from 'vitest'
import { priceRegister, zoneWorkKey, registerWorkKeys, registerMissingWork } from './glassRegisterPricing'
import { zonesFromRows } from './walterRows'
import { expandRegister } from './walterDemoRegister'

// The products Bryce put in HHH's book on 2026-10-23, priced per zone.
const L1 = { id: 2848, name: 'Glass Restoration — Light Abrasion (L1)', unit_price: 225, group_id: 37, active: true }
const L2 = { id: 2849, name: 'Glass Restoration — Deep or Edge (L2)', unit_price: 565, group_id: 37, active: true }
const FINISH = { id: 2850, name: 'Glass Restoration — Optical Finishing', unit_price: 80, group_id: 37, active: true }
// The one that must NOT be chosen for architectural glass.
const SHOWER = { id: 900, name: 'Shower Glass Restoration', unit_price: 15, group_id: 37, active: true }
const GROUPS = [{ id: 37, name: 'Glass Restoration' }]

const BOOK = [L1, L2, FINISH, SHOWER]
const opts = { products: BOOK, groups: GROUPS }

const zone = (code, severity, over = {}) => ({ id: code, code, severity, ...over })
const line = (r, name) => r.lines.find((l) => String(l.item_name).includes(name))

describe('which product a zone is resurfaced with', () => {
  it('maps the severity ladder onto the three products', () => {
    expect(zoneWorkKey({ severity: 'L1' })).toBe('restoration_light')
    expect(zoneWorkKey({ severity: 'L2' })).toBe('restoration_deep')
  })

  it('gives an L0 no restoration product at all', () => {
    // It is probably residue. Pricing it as restoration charges $225 for work
    // a cloth does, and splitBySeverity already sends it to the cleaning crew.
    expect(zoneWorkKey({ severity: 'L0' })).toBe(null)
  })

  it('asks only for the work the register actually has', () => {
    expect(registerWorkKeys([zone('A1', 'L1')]).sort())
      .toEqual(['optical_finish', 'restoration_light'])
    expect(registerWorkKeys([zone('A1', 'L0')])).toEqual([])
  })
})

describe('a register priced from the book', () => {
  const zones = [
    zone('A1', 'L1'), zone('A2', 'L1'), zone('A3', 'L1'),
    zone('A4', 'L2'), zone('A5', 'L2'),
    zone('A6', 'L0'),
    zone('A7', 'L2', { not_restorable_reason: 'factory_defect' }),
    zone('A8', 'L1', { duplicate_of: 'A1' }),
  ]

  it('bills one line per severity, not one line per zone', () => {
    const r = priceRegister(zones, opts)
    expect(line(r, 'Light Abrasion').quantity).toBe(3)
    expect(line(r, 'Light Abrasion').price).toBe(225)
    expect(line(r, 'Light Abrasion').line_total).toBe(675)
    expect(line(r, 'Deep or Edge').quantity).toBe(2)
    expect(line(r, 'Deep or Edge').line_total).toBe(1130)
  })

  it('finishes every zone it resurfaced, once', () => {
    // Two passes over the SAME zones — not the severity lines added again.
    const r = priceRegister(zones, opts)
    expect(line(r, 'Optical Finishing').quantity).toBe(5)
    expect(line(r, 'Optical Finishing').line_total).toBe(400)
  })

  it('comes to the sum of its lines', () => {
    const r = priceRegister(zones, opts)
    expect(r.total).toBe(675 + 1130 + 400)
    expect(r.zones_counted).toBe(5)
  })

  it('leaves the L0 to the cleaning crew and says so', () => {
    const r = priceRegister(zones, opts)
    expect(r.to_clean.map((z) => z.id)).toEqual(['A6'])
    expect(r.lines.every((l) => !String(l.item_name).includes('A6'))).toBe(true)
  })

  it('keeps an untouchable mark out of the price but names it', () => {
    const r = priceRegister(zones, opts)
    expect(r.excluded.map((z) => z.id)).toEqual(['A7'])
  })

  it('never counts a duplicate photograph twice', () => {
    const r = priceRegister(zones, opts)
    expect(line(r, 'Light Abrasion').quantity).toBe(3)   // A8 repeats A1
  })

  it('points each line at the product in the catalogue', () => {
    const r = priceRegister(zones, opts)
    expect(line(r, 'Light Abrasion').item_id).toBe(2848)
    expect(line(r, 'Deep or Edge').item_id).toBe(2849)
    expect(line(r, 'Optical Finishing').item_id).toBe(2850)
  })

  it('does not reach for the shower product', () => {
    // $15 a shower is not $565 a zone of architectural glass, and the two sit
    // in the same group.
    const r = priceRegister(zones, opts)
    expect(r.lines.some((l) => l.item_id === SHOWER.id)).toBe(false)
  })
})

describe('when the tenant has no product for the work', () => {
  const noBook = { products: [SHOWER], groups: GROUPS }
  const zones = [zone('A1', 'L1'), zone('A2', 'L2')]

  it('says which work it cannot price', () => {
    const r = priceRegister(zones, noBook)
    expect(r.unpriced.map((u) => u.work).sort())
      .toEqual(['optical_finish', 'restoration_deep', 'restoration_light'])
  })

  it('prices it at nothing rather than inventing a rate', () => {
    // The whole reason this file exists. The old engine always had an answer.
    const r = priceRegister(zones, noBook)
    expect(r.total).toBe(0)
    expect(r.lines.every((l) => l.unpriced)).toBe(true)
  })

  it('still shows the zones, so nobody loses them', () => {
    const r = priceRegister(zones, noBook)
    expect(line(r, 'L1 zones').quantity).toBe(1)
    expect(line(r, 'L2 zones').quantity).toBe(1)
  })

  it('reports the gap through missingGlassWork too', () => {
    expect(registerMissingWork(zones, noBook).sort())
      .toEqual(['optical_finish', 'restoration_deep', 'restoration_light'])
    expect(registerMissingWork(zones, opts)).toEqual([])
  })
})

describe('the demo register, priced from the book', () => {
  const zones = zonesFromRows(expandRegister())

  it('prices its 8 light and 6 deep zones at the book rate', () => {
    const r = priceRegister(zones, opts)
    expect(r.zones_counted).toBe(14)
    expect(line(r, 'Light Abrasion').quantity).toBe(8)
    expect(line(r, 'Deep or Edge').quantity).toBe(6)
    expect(line(r, 'Optical Finishing').quantity).toBe(14)
    // 8x225 + 6x565 + 14x80
    expect(r.total).toBe(1800 + 3390 + 1120)
  })

  it('routes its four L0s to cleaning and excludes its five', () => {
    const r = priceRegister(zones, opts)
    expect(r.to_clean).toHaveLength(4)
    expect(r.excluded).toHaveLength(5)
  })
})

describe('nothing at all', () => {
  it('prices an empty register as nothing, without lines', () => {
    const r = priceRegister([], opts)
    expect(r.lines).toEqual([])
    expect(r.total).toBe(0)
    expect(r.zones_counted).toBe(0)
  })

  it('survives junk', () => {
    expect(priceRegister(null, opts).total).toBe(0)
    expect(priceRegister(undefined).total).toBe(0)
  })
})

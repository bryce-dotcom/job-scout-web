import { describe, it, expect } from 'vitest'
import {
  matchGlassProducts, bestGlassProduct, missingGlassWork,
  isSubscriptionProduct, productIsSellable,
} from './glassProductMatch'

// HHH's actual price book, as the tenant typed it. Prices and group names are
// real; this is the shape Walter has to sell from rather than price around.
const GROUPS = [
  { id: 1, name: 'Windows' },
  { id: 11, name: 'Commercial Windows' },
  { id: 12, name: 'Residential Windows' },
  { id: 13, name: 'Stone Restoration' },
  { id: 24, name: 'LIFT' },
  { id: 3, name: 'SMBE Highbays' },
]

const BOOK = [
  { id: 1, name: 'Residential Interior Windows', group_id: 12, type: 'Window Cleaning', unit_price: 3, active: true },
  { id: 2, name: 'Residential Exterior Windows', group_id: 12, type: 'Window Cleaning', unit_price: 6, active: true },
  { id: 3, name: 'Residential Interior Windows (Subscription)', group_id: 12, type: 'Window Cleaning', unit_price: 0.12, active: true },
  { id: 4, name: 'Residential Exterior Windows (Subscription)', group_id: 12, type: 'Window Cleaning', unit_price: 0.17, active: true },
  { id: 5, name: 'Commercial Interior Window Cleaning', group_id: 11, type: 'Window Cleaning', unit_price: 2, active: true },
  { id: 6, name: 'Store Front/Commercial Exterior Window Cleaning', group_id: 11, type: 'Window Cleaning', unit_price: 4, active: true },
  { id: 7, name: 'Post Construction Window Cleaning (More than 6)', group_id: 28, type: 'Window Cleaning', unit_price: 20, active: true },
  { id: 8, name: 'Post Construction Window Cleaning (Less than 4)', group_id: 12, type: 'Window Cleaning', unit_price: 6, active: true },
  { id: 9, name: 'Residential Hard Water Removal', group_id: 12, type: 'Window Cleaning', unit_price: 2.5, active: true },
  { id: 10, name: 'Commercial Hard Water Removal', group_id: 11, type: 'Window Cleaning', unit_price: 2, active: false },
  { id: 11, name: 'Screen Cleaning', group_id: 12, type: 'Window Cleaning', unit_price: 1, active: true },
  { id: 12, name: 'Window Screen Repair/Replacement', group_id: 12, type: 'Window Cleaning', unit_price: 10, active: true },
  { id: 13, name: 'Partition Glass', group_id: 11, type: 'Window Cleaning', unit_price: 3, active: true },
  { id: 14, name: 'Window Well Cleaning', group_id: 12, type: 'Window Cleaning', unit_price: 7, active: true },
  { id: 15, name: 'Shower Glass Restoration', group_id: 12, type: 'Window Cleaning', unit_price: 15, active: true },
  // Lighting, which a glass matcher must never return.
  { id: 90, name: 'LIFT 2L 8\' T8s (Type B) 38W 4K FA8', group_id: 3, type: 'Electrical', unit_price: 73.74, active: true },
  { id: 91, name: 'SMBE Highbay 150W', group_id: 3, type: 'Electrical', unit_price: 120, active: true },
  // Priced at nothing, so not sellable however well it matches.
  { id: 92, name: 'Exterior Window Rinse', group_id: 12, type: 'Window Cleaning', unit_price: 0, active: true },
]

const opts = { groups: GROUPS }

describe('the subscription trap', () => {
  it('knows a membership price from a one-off one by the only signal there is', () => {
    // No column says so. pricing_model is null on every one of them and `type`
    // is identical; the word in the name is all there is.
    expect(isSubscriptionProduct({ name: 'Residential Exterior Windows (Subscription)' })).toBe(true)
    expect(isSubscriptionProduct({ name: 'Residential Exterior Windows' })).toBe(false)
  })

  it('a one-off bid gets the $6 pane, never the $0.17 one', () => {
    const p = bestGlassProduct(BOOK, { ...opts, work: 'exterior', segment: 'residential' })
    expect(p.unit_price).toBe(6)
    expect(isSubscriptionProduct(p)).toBe(false)
  })

  it('and a membership gets the $0.17 one when it is asked for', () => {
    const p = bestGlassProduct(BOOK, { ...opts, work: 'exterior', segment: 'residential', recurring: true })
    expect(p.unit_price).toBe(0.17)
  })

  it('never mixes the two in one list', () => {
    const oneOff = matchGlassProducts(BOOK, { ...opts, work: 'interior' })
    expect(oneOff.every((m) => !isSubscriptionProduct(m.product))).toBe(true)
  })
})

describe('matching work to what the tenant sells', () => {
  it('residential and commercial exterior are different prices, and the takeoff says which', () => {
    //  a pane at a house,  at a storefront. 'exterior' alone cannot choose.
    expect(bestGlassProduct(BOOK, { ...opts, work: 'exterior', segment: 'residential' }).unit_price).toBe(6)
    expect(bestGlassProduct(BOOK, { ...opts, work: 'exterior', segment: 'commercial' }).unit_price).toBe(4)
    expect(bestGlassProduct(BOOK, { ...opts, work: 'interior', segment: 'residential' }).unit_price).toBe(3)
    expect(bestGlassProduct(BOOK, { ...opts, work: 'interior', segment: 'commercial' }).unit_price).toBe(2)
  })

  it('post-construction is a product, not a multiplier on cleaning', () => {
    const p = bestGlassProduct(BOOK, { ...opts, work: 'post_construction' })
    expect(p.name).toContain('Post Construction')
  })

  it('hard water is a product too', () => {
    expect(bestGlassProduct(BOOK, { ...opts, work: 'hard_water' }).name).toContain('Hard Water')
  })

  it('screens, screen repair and window wells are each their own line', () => {
    expect(bestGlassProduct(BOOK, { ...opts, work: 'screens' }).unit_price).toBe(1)
    expect(bestGlassProduct(BOOK, { ...opts, work: 'screen_repair' }).unit_price).toBe(10)
    expect(bestGlassProduct(BOOK, { ...opts, work: 'window_well' }).unit_price).toBe(7)
  })

  it('never returns lighting, whatever the keyword overlap', () => {
    // "LIFT 2L 8' T8s" is a lamp. A glass matcher reaching into SMBE groups
    // is how a rep ends up quoting a highbay to wash a window.
    for (const work of Object.keys({ interior: 1, exterior: 1, post_construction: 1, restoration: 1 })) {
      const all = matchGlassProducts(BOOK, { ...opts, work })
      expect(all.every((m) => m.product.type !== 'Electrical')).toBe(true)
    }
  })

  it('skips a product the book gives no price', () => {
    expect(productIsSellable({ unit_price: 0 })).toBe(false)
    const all = matchGlassProducts(BOOK, { ...opts, work: 'exterior' })
    expect(all.some((m) => m.product.id === 92)).toBe(false)
  })

  it('skips an inactive product by default', () => {
    const all = matchGlassProducts(BOOK, { ...opts, work: 'hard_water' })
    expect(all.some((m) => m.product.active === false)).toBe(false)
  })
})

describe('work the book has no product for', () => {
  it('says so rather than falling back on an invented rate', () => {
    // HHH sells Shower Glass Restoration and nothing for architectural glass
    // by damage zone. Walter must say that out loud; the whole point of this
    // file is to stop guessing a price.
    const missing = missingGlassWork(BOOK, ['interior', 'exterior', 'curtain_wall_reglaze'], opts)
    expect(missing).toEqual(['curtain_wall_reglaze'])
  })

  it('finds the shower product for restoration, which is all there is', () => {
    expect(bestGlassProduct(BOOK, { ...opts, work: 'restoration' }).name).toBe('Shower Glass Restoration')
  })

  it('an empty book is empty, not a crash', () => {
    expect(bestGlassProduct([], { ...opts, work: 'exterior' })).toBe(null)
    expect(matchGlassProducts(null, { ...opts, work: 'exterior' })).toEqual([])
  })

  it('no groups still matches on type, for a tenant who never grouped anything', () => {
    const ungrouped = [{ id: 1, name: 'Exterior Window Cleaning', type: 'Window Cleaning', unit_price: 5, active: true }]
    expect(bestGlassProduct(ungrouped, { groups: [], work: 'exterior' }).unit_price).toBe(5)
  })
})

// Found against HHH's real 825-product book, invisible in an 18-row fixture.
describe('the SMBE Panels collision', () => {
  const GROUPS2 = [{ id: 7, name: 'SMBE Panels' }, { id: 12, name: 'Residential Windows' }]
  const BOOK2 = [
    { id: 1, name: 'SMBE 14/17/20/28W 1x4 Back Lit Panel', group_id: 7, type: 'Electrical Services (Bundles)', unit_price: 88, active: true },
    { id: 2, name: 'Residential Exterior Windows', group_id: 12, type: 'Window Cleaning', unit_price: 6, active: true },
  ]

  it('"pane" is inside "SMBE Panels", and that let 63 lamps into a window quote', () => {
    const all = matchGlassProducts(BOOK2, { groups: GROUPS2, work: 'exterior' })
    expect(all.every((m) => m.product.type !== 'Electrical Services (Bundles)')).toBe(true)
    expect(all.map((m) => m.product.id)).toEqual([2])
  })

  it('being in a glass group is a tie-breaker, never a qualification', () => {
    // A window-group product that does no exterior work must not be offered
    // for exterior work just because of the group it sits in.
    const book = [
      { id: 1, name: 'Window Well Cleaning', group_id: 12, type: 'Window Cleaning', unit_price: 7, active: true },
      { id: 2, name: 'Residential Exterior Windows', group_id: 12, type: 'Window Cleaning', unit_price: 6, active: true },
    ]
    const all = matchGlassProducts(book, { groups: GROUPS2, work: 'exterior' })
    expect(all.map((m) => m.product.id)).toEqual([2])
  })
})

// The products added to HHH's book on 2026-10-23, in the shape they were added.
describe('restoration severity is three products, not one rate', () => {
  const GROUPS3 = [{ id: 37, name: 'Glass Restoration' }, { id: 12, name: 'Residential Windows' }]
  const BOOK3 = [
    { id: 1, name: 'Glass Restoration — Light Abrasion (L1)', group_id: 37, type: 'Glass Restoration', unit_price: 225, active: true },
    { id: 2, name: 'Glass Restoration — Deep or Edge (L2)', group_id: 37, type: 'Glass Restoration', unit_price: 565, active: true },
    { id: 3, name: 'Glass Restoration — Optical Finishing', group_id: 37, type: 'Glass Restoration', unit_price: 80, active: true },
    { id: 4, name: 'Shower Glass Restoration', group_id: 12, type: 'Window Cleaning', unit_price: 15, active: true },
  ]

  it('prices a light mark and a deep one differently', () => {
    expect(bestGlassProduct(BOOK3, { groups: GROUPS3, work: 'restoration_light' }).unit_price).toBe(225)
    expect(bestGlassProduct(BOOK3, { groups: GROUPS3, work: 'restoration_deep' }).unit_price).toBe(565)
  })

  it('finds the finishing pass as its own product', () => {
    expect(bestGlassProduct(BOOK3, { groups: GROUPS3, work: 'optical_finish' }).unit_price).toBe(80)
  })

  it('does not confuse a shower with architectural glass', () => {
    // $15 a pane for hard water on a shower screen is a different trade from
    // $565 a zone for resurfacing a scratched curtain wall.
    expect(bestGlassProduct(BOOK3, { groups: GROUPS3, work: 'restoration_deep' }).id).not.toBe(4)
  })

  it('the family probe finds the trade without being a price', () => {
    // It matches every severity, so it answers "do they do this?" and nothing
    // more. Pricing goes through the severity keys.
    expect(matchGlassProducts(BOOK3, { groups: GROUPS3, work: 'restoration' }).length).toBeGreaterThan(1)
  })
})

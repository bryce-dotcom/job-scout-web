import { describe, it, expect } from 'vitest'
import { priceTakeoff, cleaningWorkKey, rowFaces, takeoffMissingWork } from './glassCleaningPricing'
import {
  DEMO_PRODUCTS, DEMO_PRODUCT_GROUPS, DEMO_TAKEOFF, DEMO_TYPES,
} from './walterDemoTakeoff'

// HHH's real book, trimmed to the window side. These are the prices in
// company 3 on 2026-10-24, verified against the live table — the whole point
// of the rebuild is that these numbers are theirs and not ours.
const P = {
  resInt: { id: 1064, name: 'Residential Interior Windows', unit_price: 3, group_id: 1, active: true },
  resExt: { id: 1065, name: 'Residential Exterior Windows', unit_price: 6, group_id: 1, active: true },
  resIntExt: { id: 2185, name: 'Interior/Exterior Residential Window Cleaning', unit_price: 9, group_id: 1, active: true },
  resIntSub: { id: 1092, name: 'Residential Interior Windows (Subscription)', unit_price: 0.12, group_id: 1, active: true },
  resExtSub: { id: 1093, name: 'Residential Exterior Windows (Subscription)', unit_price: 0.17, group_id: 1, active: true },
  comInt: { id: 1077, name: 'Commercial Interior Window Cleaning', unit_price: 2, group_id: 2, active: true },
  comExt: { id: 1070, name: 'Store Front/Commercial Exterior Window Cleaning', unit_price: 4, group_id: 2, active: true },
  ladderInt: { id: 2190, name: 'Commercial Interior Ladder Windows', unit_price: 4, group_id: 2, active: true },
  ladderExt: { id: 2191, name: 'Commercial Exterior Ladder Windows', unit_price: 5, group_id: 2, active: true },
  waterfed: { id: 2192, name: 'Exterior WaterFed windows above 2 stories', unit_price: 7, group_id: 2, active: true },
  // Every LIFT product in the real book is INACTIVE as of 2026-10-24.
  liftOff: { id: 1121, name: 'Commercial Windows (LIFT Up To 10 Floors)', unit_price: 5, group_id: 2, active: false },
  pcSmall: { id: 1081, name: 'Post Construction Window Cleaning (Less than 4ft wide/high)', unit_price: 6, group_id: 1, active: true },
  pcMedium: { id: 1082, name: 'Post Construction Window Cleaning (More than 4ft wide/high)', unit_price: 4, group_id: 1, active: true },
  pcLarge: { id: 1066, name: 'Post Construction Window Cleaning (More than 6ft wide/high', unit_price: 20, group_id: 1, active: true },
  // The add-on rows sit in a group called 'Add on Services', which carries no
  // glass word at all. They qualify on their type column instead, exactly as
  // they do in the live book — every one of them is type 'Window Cleaning'.
  screens: { id: 1083, name: 'Screen Cleaning', unit_price: 1, group_id: 1, type: 'Window Cleaning', active: true },
  tracks: { id: 2201, name: 'Window Track Cleaning', unit_price: 5, group_id: 3, type: 'Window Cleaning', active: true },
  hardWater: { id: 1104, name: 'Residential Hard Water Removal', unit_price: 2.5, group_id: 1, type: 'Window Cleaning', active: true },
  well: { id: 1068, name: 'Window Well Cleaning', unit_price: 7, group_id: 1, type: 'Window Cleaning', active: true },
}
const BOOK = Object.values(P)
const GROUPS = [
  { id: 1, name: 'Residential Windows' },
  { id: 2, name: 'Commercial Windows' },
  { id: 3, name: 'Add on Services' },
]

const TYPES = [
  { type_code: 'double_hung', type_name: 'Double-hung', panes_per_unit: 2, lites_per_unit: 2, bill_lites: false, typical_width_in: 32, typical_height_in: 60, size_band: 'over_4', screens_per_unit: 1, has_track: true },
  { type_code: 'casement', type_name: 'Casement', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 24, typical_height_in: 48, size_band: 'under_4', screens_per_unit: 1, has_track: false },
  { type_code: 'picture', type_name: 'Picture / fixed', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 60, typical_height_in: 48, size_band: 'over_4', screens_per_unit: 0, has_track: false },
  { type_code: 'picture_large', type_name: 'Picture, large format', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 96, typical_height_in: 72, size_band: 'over_6', screens_per_unit: 0, has_track: false },
  { type_code: 'french_door', type_name: 'French door, 15-lite', panes_per_unit: 1, lites_per_unit: 15, bill_lites: true, typical_width_in: 36, typical_height_in: 80, size_band: 'over_6', screens_per_unit: 0, has_track: false },
  { type_code: 'curtain_wall', type_name: 'Curtain wall unit', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 60, typical_height_in: 120, size_band: 'over_6', screens_per_unit: 0, has_track: false },
  { type_code: 'storefront', type_name: 'Storefront panel', panes_per_unit: 1, lites_per_unit: 1, bill_lites: false, typical_width_in: 48, typical_height_in: 84, size_band: 'over_6', screens_per_unit: 0, has_track: false },
]

const opts = { products: BOOK, groups: GROUPS, types: TYPES }
const line = (r, name) => r.lines.find((l) => String(l.item_name).includes(name))

describe('inside and out are two products, never one doubled', () => {
  const rows = [{ area_name: 'Bedrooms', type_code: 'double_hung', units: 10, face: 'both', segment: 'residential' }]

  it('bills 20 panes inside at $3 and 20 outside at $6', () => {
    const r = priceTakeoff(rows, opts)
    expect(line(r, 'Residential Interior').quantity).toBe(20)
    expect(line(r, 'Residential Interior').line_total).toBe(60)
    expect(line(r, 'Residential Exterior').quantity).toBe(20)
    expect(line(r, 'Residential Exterior').line_total).toBe(120)
    expect(r.total).toBe(180 + 10 * 1 + 10 * 5)   // + screens + tracks
  })

  it('bills one face when only one face is in scope', () => {
    const r = priceTakeoff([{ ...rows[0], face: 'out' }], opts)
    expect(line(r, 'Residential Interior')).toBeUndefined()
    expect(line(r, 'Residential Exterior').quantity).toBe(20)
  })

  it('is not the same as the combined product, at a storefront', () => {
    // $2 inside + $4 outside is $6. The commercial combo is $7. A bid that
    // swapped one for the other would be a dollar a pane out.
    expect(rowFaces({ face: 'both' })).toEqual(['in', 'out'])
    const r = priceTakeoff([{ type_code: 'storefront', units: 10, face: 'both', segment: 'commercial' }], opts)
    expect(r.total).toBe(10 * 2 + 10 * 4)
  })
})

describe('the pane count is the bid', () => {
  it('turns units into panes through the catalogue', () => {
    const r = priceTakeoff([{ type_code: 'double_hung', units: 14, face: 'out', segment: 'residential' }], opts)
    // 14 windows is 28 panes, not 14. Half a bid rides on this.
    expect(line(r, 'Residential Exterior').quantity).toBe(28)
    expect(r.counts.units).toBe(14)
    expect(r.counts.panes).toBe(28)
  })

  it('bills a French door by its lites', () => {
    const r = priceTakeoff([{ type_code: 'french_door', units: 2, face: 'out', segment: 'residential' }], opts)
    expect(line(r, 'Residential Exterior').quantity).toBe(30)
    expect(r.counts.lites_billed).toBe(30)
  })

  it('adds up one line per product across every area', () => {
    // Fourteen areas of exterior glass is one line a customer can read, not
    // fourteen $6 lines nobody checks.
    const rows = Array.from({ length: 14 }, (_, i) => ({
      area_name: `Elevation ${i + 1}`, type_code: 'casement', units: 3, face: 'out', segment: 'residential',
    }))
    const r = priceTakeoff(rows, opts)
    const l = line(r, 'Residential Exterior')
    expect(l.quantity).toBe(42)
    expect(l.areas).toHaveLength(14)
    expect(r.lines.filter((x) => x.work === 'exterior')).toHaveLength(1)
  })
})

describe('what hangs off the glass', () => {
  it('finds screens and tracks from the catalogue without being asked', () => {
    // The old assessment asked for screen and track counts as free numbers,
    // which is how a patio door track got left off a bid by being left blank.
    const r = priceTakeoff([{ type_code: 'double_hung', units: 12, face: 'out', segment: 'residential' }], opts)
    expect(line(r, 'Screen Cleaning').quantity).toBe(12)
    expect(line(r, 'Window Track Cleaning').quantity).toBe(12)
  })

  it('gives fixed glass no screen and no track', () => {
    const r = priceTakeoff([{ type_code: 'picture', units: 8, face: 'out', segment: 'residential' }], opts)
    expect(line(r, 'Screen Cleaning')).toBeUndefined()
    expect(line(r, 'Window Track Cleaning')).toBeUndefined()
  })

  it('charges hard water removal on top of the clean, not instead of it', () => {
    // The old engine made hard water a 3.4x multiplier on the clean. It is a
    // separate product: the glass still has to be washed first.
    const r = priceTakeoff([{ type_code: 'picture', units: 10, face: 'out', segment: 'residential', condition: 'hard_water' }], opts)
    expect(line(r, 'Residential Exterior').line_total).toBe(60)
    expect(line(r, 'Hard Water').quantity).toBe(10)
    expect(r.total).toBe(60 + 25)
  })

  it('takes an add-on the rep asked for, at the quantity they gave', () => {
    const r = priceTakeoff([{
      type_code: 'casement', units: 4, face: 'out', segment: 'residential',
      addons: [{ work: 'window_well', qty: 4 }],
    }], opts)
    expect(line(r, 'Window Well').quantity).toBe(4)
  })
})

describe('post-construction is a different product per size', () => {
  it('prices a small window at the under-4ft product', () => {
    const r = priceTakeoff([{ type_code: 'casement', units: 10, face: 'out', segment: 'residential', condition: 'post_construction' }], opts)
    expect(line(r, 'Less than 4ft').quantity).toBe(10)
    expect(line(r, 'Less than 4ft').price).toBe(6)
  })

  it('prices a big sheet at the over-6ft product', () => {
    const r = priceTakeoff([{ type_code: 'picture_large', units: 10, face: 'out', segment: 'residential', condition: 'post_construction' }], opts)
    expect(line(r, 'More than 6ft').price).toBe(20)
  })

  it('follows a measurement over the catalogue average', () => {
    const r = priceTakeoff([{
      type_code: 'casement', units: 5, face: 'out', segment: 'residential',
      condition: 'post_construction', width_in: 90, height_in: 60,
    }], opts)
    expect(line(r, 'More than 6ft').quantity).toBe(5)
  })

  it('replaces the plain clean rather than adding to it', () => {
    const r = priceTakeoff([{ type_code: 'casement', units: 10, face: 'out', segment: 'residential', condition: 'post_construction' }], opts)
    expect(line(r, 'Residential Exterior')).toBeUndefined()
  })

  it('still sells the screens', () => {
    const r = priceTakeoff([{ type_code: 'double_hung', units: 10, face: 'out', segment: 'residential', condition: 'post_construction' }], opts)
    expect(line(r, 'Screen Cleaning').quantity).toBe(10)
  })
})

describe('reach picks a different product, and only where the book prices it', () => {
  it('leaves a house on the plain product however high the window is', () => {
    // HHH has no residential height product. The $6 already assumes a ladder.
    const ground = priceTakeoff([{ type_code: 'double_hung', units: 10, face: 'out', segment: 'residential', floor: 1 }], opts)
    const upstairs = priceTakeoff([{ type_code: 'double_hung', units: 10, face: 'out', segment: 'residential', floor: 2 }], opts)
    expect(upstairs.total).toBe(ground.total)
    expect(cleaningWorkKey({ segment: 'residential', floor: 3 }, null, 'out')).toBe('exterior')
  })

  it('moves a commercial second storey onto the ladder product', () => {
    const r = priceTakeoff([{ type_code: 'storefront', units: 20, face: 'out', segment: 'commercial', floor: 2 }], opts)
    expect(line(r, 'Exterior Ladder').quantity).toBe(20)
    expect(line(r, 'Exterior Ladder').price).toBe(5)
    expect(line(r, 'Store Front/Commercial')).toBeUndefined()
  })

  it('moves a commercial third storey onto the waterfed product', () => {
    const r = priceTakeoff([{ type_code: 'curtain_wall', units: 30, face: 'out', segment: 'commercial', floor: 3 }], opts)
    expect(line(r, 'WaterFed').quantity).toBe(30)
    expect(line(r, 'WaterFed').price).toBe(7)
  })

  it('uses the interior ladder product for high glass inside', () => {
    const r = priceTakeoff([{ type_code: 'picture', units: 6, face: 'in', segment: 'commercial', reach_in: 240 }], opts)
    expect(line(r, 'Interior Ladder').quantity).toBe(6)
  })

  it('will not reach for an inactive lift product, and reports the gap', () => {
    // Every LIFT row in the real book is switched off. An eighth storey has
    // nothing to price against and the honest answer is to say so.
    const r = priceTakeoff([{ type_code: 'curtain_wall', units: 40, face: 'out', segment: 'commercial', floor: 8 }], opts)
    expect(r.lines.some((l) => l.item_id === P.liftOff.id)).toBe(false)
    expect(r.unpriced.map((u) => u.work)).toContain('lift')
    expect(r.total).toBe(0)
  })
})

describe('a recurring plan is the subscription price, not the one-off', () => {
  it('prices a monthly plan from the subscription twin', () => {
    // $0.17 against $6. Picking the wrong one charges 3% of the job.
    const r = priceTakeoff(
      [{ type_code: 'double_hung', units: 10, face: 'both', segment: 'residential' }],
      { ...opts, recurring: true },
    )
    expect(line(r, 'Residential Exterior').price).toBe(0.17)
    expect(line(r, 'Residential Interior').price).toBe(0.12)
  })
})

describe('when the book has no product', () => {
  it('says so instead of inventing a rate', () => {
    const r = priceTakeoff(
      [{ type_code: 'curtain_wall', units: 10, face: 'out', segment: 'commercial', floor: 9 }],
      { products: [], groups: GROUPS, types: TYPES },
    )
    expect(r.total).toBe(0)
    expect(r.lines.every((l) => l.unpriced)).toBe(true)
    expect(r.unpriced).toHaveLength(1)
  })

  it('still shows the line, so nobody loses the glass', () => {
    const r = priceTakeoff(
      [{ type_code: 'casement', units: 10, face: 'out', segment: 'residential' }],
      { products: [], groups: GROUPS, types: TYPES },
    )
    expect(r.lines).toHaveLength(2)      // the glass and its screens
    expect(r.counts.panes).toBe(10)
  })

  it('reports the gap through takeoffMissingWork too', () => {
    const rows = [{ type_code: 'curtain_wall', units: 10, face: 'out', segment: 'commercial', floor: 9 }]
    expect(takeoffMissingWork(rows, { ...opts, segment: 'commercial' })).toEqual(['lift'])
    expect(takeoffMissingWork(
      [{ type_code: 'casement', units: 4, face: 'out', segment: 'residential' }],
      { ...opts, segment: 'residential' },
    )).toEqual([])
  })
})

describe('where the book prices one job twice', () => {
  it('reports the ambiguity rather than letting the alphabet decide', () => {
    // Two products for the same work at different prices. matchGlassProducts
    // breaks the tie on NAME, never on price, so the winner here is decided
    // by the letter A — which is fine only if somebody is told.
    const twice = [
      { id: 900, name: 'Residential Exterior Windows', unit_price: 6, group_id: 1, active: true },
      { id: 901, name: 'Residential Exterior Windows - Standard', unit_price: 9, group_id: 1, active: true },
    ]
    const r = priceTakeoff(
      [{ type_code: 'casement', units: 10, face: 'out', segment: 'residential' }],
      { products: twice, groups: GROUPS, types: TYPES },
    )
    expect(r.ambiguities).toHaveLength(1)
    expect(r.ambiguities[0].low).toBe(6)
    expect(r.ambiguities[0].high).toBe(9)
    expect(r.ambiguities[0].spread).toBe(1.5)
    expect(line(r, 'Residential Exterior').ambiguous).toBe(true)
  })

  it('says nothing about two rows at the same price', () => {
    // The real book has literal duplicates — two Window Screen
    // Repair/Replacement at $10 apiece. Those cost nobody anything.
    const dupes = [
      { id: 900, name: 'Residential Exterior Windows', unit_price: 6, group_id: 1, active: true },
      { id: 901, name: 'Residential Exterior Windows - Standard', unit_price: 6, group_id: 1, active: true },
    ]
    const r = priceTakeoff(
      [{ type_code: 'casement', units: 10, face: 'out', segment: 'residential' }],
      { products: dupes, groups: GROUPS, types: TYPES },
    )
    expect(r.ambiguities).toEqual([])
  })
})

describe('the demo takeoff, priced from the demo book', () => {
  // The very rows the seed script plants and the screen shows, so the demo on
  // screen and the figures here cannot drift apart. Same reasoning as
  // walterRows.test.js pricing the demo register.
  const gid = new Map(DEMO_PRODUCT_GROUPS.map((g, i) => [g.name, i + 1]))
  const demoBook = DEMO_PRODUCTS.map((p, i) => ({
    id: 5000 + i, name: p.name, unit_price: p.unit_price,
    group_id: gid.get(p.group), type: 'Window Cleaning', active: true,
  }))
  const demoGroups = DEMO_PRODUCT_GROUPS.map((g) => ({ id: gid.get(g.name), name: g.name }))
  const demoOpts = { products: demoBook, groups: demoGroups, types: DEMO_TYPES }
  const r = priceTakeoff(DEMO_TAKEOFF, demoOpts)

  it('counts 52 windows as 96 panes and 180 pane-faces', () => {
    expect(r.counts.units).toBe(52)
    expect(r.counts.panes).toBe(96)
    expect(r.counts.pane_faces).toBe(180)
  })

  it('bills the French doors by their 30 lites', () => {
    expect(r.counts.lites_billed).toBe(30)
  })

  it('splits post-construction across all three size bands', () => {
    expect(line(r, 'Less than 4ft').quantity).toBe(17)
    expect(line(r, 'More than 4ft').quantity).toBe(10)
    expect(line(r, 'More than 6ft').quantity).toBe(18)
  })

  it('finds 26 screens and 16 tracks without being told', () => {
    // These both came out ZERO the first time this ran: glass_areas defaulted
    // screens and tracks to 0, so the row always "said" something and the
    // catalogue was never asked. And six hinged types were recorded as having
    // a track, which is a $5 line on every casement in every bid.
    expect(line(r, 'Screen Cleaning').quantity).toBe(26)
    expect(line(r, 'Window Track Cleaning').quantity).toBe(16)
  })

  it('charges the six window wells the basement row asked for', () => {
    expect(line(r, 'Window Well').quantity).toBe(6)
  })

  it('prices the whole walk at 1260.50 with nothing unpriced', () => {
    expect(r.total).toBe(1260.5)
    expect(r.unpriced).toEqual([])
    expect(r.ambiguities).toEqual([])
    expect(r.unknown_types).toEqual([])
  })
})

describe('nothing at all', () => {
  it('prices an empty takeoff as nothing', () => {
    const r = priceTakeoff([], opts)
    expect(r.lines).toEqual([])
    expect(r.total).toBe(0)
    expect(r.counts.panes).toBe(0)
  })

  it('survives junk', () => {
    expect(priceTakeoff(null, opts).total).toBe(0)
    expect(priceTakeoff(undefined).total).toBe(0)
  })

  it('names a window type the catalogue is missing rather than dropping it', () => {
    // One pane a unit is the floor, not an answer: the same row as a
    // double-hung is two. So the glass is still billed and the gap is said
    // out loud, because a silent halving is the version nobody catches.
    const r = priceTakeoff([{ type_code: 'nope', units: 5, face: 'out' }], opts)
    expect(r.counts.panes).toBe(5)
    expect(r.unknown_types).toEqual(['nope'])
    expect(r.total).toBe(30)
  })

  it('counts panes once and pane-faces twice when both sides are in scope', () => {
    const r = priceTakeoff([{ type_code: 'double_hung', units: 10, face: 'both', segment: 'residential' }], opts)
    expect(r.counts.panes).toBe(20)
    expect(r.counts.pane_faces).toBe(40)
  })
})

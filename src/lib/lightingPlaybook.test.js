import { describe, it, expect } from 'vitest'
import { parseTakeoff, planEstimate, kindOf, playbookFor } from '../../supabase/functions/_shared/lightingPlaybook.ts'

// HHH's live catalogue rows (company 3, type "Electrical Services (Bundles)"),
// copied 2026-10-14. Prices are what the estimates below were built at.
const B = 'Electrical Services (Bundles)'
const CATALOG = [
  [1505, 'ES LIFT ', 49.98],
  [2371, 'SMBE 60/80/100W Cobra Head LOW WATT', 417],
  [2392, 'SMBE 60/80/100W Cobra Head LOW WATT w/o LIFT', 297],
  [2260, 'SMBE 25/45/60W Flood', 159.5],
  [2261, 'SMBE 25/45/60W Flood w/ Lift', 269.48],
  [1440, 'SMBE 10/20/30/40W Slim Cutoff Wall Pack', 179.5],
  [2178, 'SMBE 10/20/30/40W Slim Cutoff Wall Pack w/ Lift', 409.48],
  [2182, 'SMBE 15/20/30W Mini Wallpack ', 163.5],
  [1125, 'SMBE 50/60/70/90/110W Highbay - 2ft', 251.6],
  [2234, 'SMBE 9W 4FT T8 Type B Tube ', 42.38],
  [2236, 'SMBE 2L 9W 4FT T8 Type B Tube ', 60.76],
  [2238, 'SMBE 3L 9W 4FT T8 Type B Tube ', 76.74],
  [2240, 'SMBE 4L 9W 4FT T8 Type B Tube ', 99.92],
  [2374, 'SMBE 1L 43W 8ft Tube 40K ', 75.6],
  [2375, 'SMBE 2L 43W 8ft Tube 40K ', 120],
  [2255, 'MES Cobra Head Mount - Slip Fit', 26],
  [2256, 'MES Cobra Head Mount - Arm Fit', 26],
  [2257, 'MES Cobra Head Mount - Trunnion Fit', 26],
].map(([id, name, unit_price]) => ({ id, name, unit_price, type: B }))

const plan = (takeoff, opts) => {
  const items = parseTakeoff(takeoff)
  if (typeof items === 'string') throw new Error(items)
  return planEstimate(items, CATALOG, opts)
}
const byName = (p, n) => p.lines.filter((l) => l.item_name.trim() === n)

describe("Cole's real estimates, rebuilt from the takeoff", () => {
  it('EST-MV1KLY3M "AZ Lets Fix It": six shoebox cobras, five wall packs no-lift — to the cent', () => {
    const p = plan([
      { kind: 'cobra', qty: 6, existing_watts: 400, words: '400W MH shoebox', mount: 'pole' },
      { kind: 'wall_pack', qty: 5, existing_watts: 400, no_lift: true },
    ], { rebateGiven: 3861.50 })
    expect(p.ok).toBe(true)
    expect(byName(p, 'SMBE 60/80/100W Cobra Head LOW WATT')[0]).toMatchObject({ quantity: 6, price: 417 })
    expect(byName(p, 'SMBE 10/20/30/40W Slim Cutoff Wall Pack')[0]).toMatchObject({ quantity: 5, price: 179.5 })
    // The room is exactly six $77 slip fitters — the lines Cole added himself.
    expect(byName(p, 'MES Cobra Head Mount - Slip Fit')[0]).toMatchObject({ quantity: 6, price: 77 })
    expect(p.lines.some((l) => l.role === 'lift_gm')).toBe(false)
    expect(p.subtotal).toBe(3861.5)
    expect(p.incentive).toBe(3861.5)
    expect(p.out_of_pocket).toBe(0)
  })

  it('EST-MV0EXDHU "AZ MDC": a cobra, eight 750W floods on a lift — cobra mount first', () => {
    const p = plan([
      { kind: 'cobra', qty: 1, existing_watts: 400, words: '400W MH shoebox pole light', mount: 'pole' },
      { kind: 'flood', qty: 8, existing_watts: 750 },
    ], { rebateGiven: 2649.84 })
    expect(byName(p, 'SMBE 25/45/60W Flood w/ Lift')[0]).toMatchObject({ quantity: 8, price: 269.48 })
    expect(byName(p, 'MES Cobra Head Mount - Slip Fit')[0]).toMatchObject({ quantity: 1, price: 77 })
    expect(byName(p, 'MES Cobra Head Mount - Trunnion Fit')).toHaveLength(0)
    expect(p.subtotal).toBe(2649.84)
    expect(p.out_of_pocket).toBe(0)
  })
})

describe('the Arizona swaps, as written', () => {
  it('cobra/shoebox → 60W cobra; 750 and over too; "marked 10" is a 400', () => {
    for (const w of [400, 750, 1000]) expect(plan([{ kind: 'cobra', qty: 1, existing_watts: w }]).lines[0].description).toMatch(/with 60W LED cobra head/)
    expect(plan([{ kind: 'cobra', qty: 1, marked: '10' }]).lines[0].description).toMatch(/400W/)
  })
  it('flood: 400 → 45W, 750 → 60W, over 750 → 60W', () => {
    expect(plan([{ kind: 'flood', qty: 1, existing_watts: 400 }]).lines[0].description).toMatch(/with 45W LED flood/)
    expect(plan([{ kind: 'flood', qty: 1, existing_watts: 750 }]).lines[0].description).toMatch(/with 60W LED flood/)
    expect(plan([{ kind: 'flood', qty: 1, existing_watts: 1500 }]).lines[0].description).toMatch(/with 60W/)
  })
  it('mini wall packs are 15W and never on a lift', () => {
    const l = plan([{ kind: 'mini_wall_pack', qty: 3 }]).lines[0]
    expect(l.item_name.trim()).toBe('SMBE 15/20/30W Mini Wallpack')
    expect(l.description).toMatch(/15W/)
    expect(l.description).toMatch(/no lift/)
  })
  it('high bays to 400W → 60W high bay; 6-lamp T5 → a full high bay, not tubes; interior is never on a lift', () => {
    const hb = plan([{ kind: 'high_bay', qty: 4, existing_watts: 400, location: 'exterior' }]).lines[0]
    expect(hb.item_name).toBe('SMBE 50/60/70/90/110W Highbay - 2ft')
    expect(hb.description).toMatch(/Interior, no lift/)
    expect(plan([{ kind: 't5_high_bay', qty: 2, lamps: 6 }]).lines[0].item_name).toBe('SMBE 50/60/70/90/110W Highbay - 2ft')
  })
  it('T8s → Type B tubes by lamp count (2L ≈ $61, 3L ≈ $77); 8 ft → 43W 8 ft tubes', () => {
    expect(plan([{ kind: 't8_4ft', qty: 10, lamps: 2 }]).lines[0]).toMatchObject({ price: 60.76 })
    expect(plan([{ kind: 't8_4ft', qty: 10, lamps: 3 }]).lines[0]).toMatchObject({ price: 76.74 })
    expect(plan([{ kind: 't8_4ft', qty: 1, lamps: 1 }]).lines[0].item_name.trim()).toBe('SMBE 9W 4FT T8 Type B Tube')
    expect(plan([{ kind: 't8_8ft', qty: 1, lamps: 1 }]).lines[0].item_name.trim()).toBe('SMBE 1L 43W 8ft Tube 40K')
    expect(plan([{ kind: 't8_8ft', qty: 1, lamps: 2 }]).lines[0].item_name.trim()).toBe('SMBE 2L 43W 8ft Tube 40K')
  })
})

describe('lift, heads, notes', () => {
  it('exterior is 20 ft on a lift unless marked no-lift (15 ft, the no-lift product)', () => {
    const lift = plan([{ kind: 'cobra', qty: 1, existing_watts: 400 }]).lines[0]
    expect(lift.price).toBe(417)
    expect(lift.description).toMatch(/20 ft off the ground, lift/)
    const no = plan([{ kind: 'cobra', qty: 1, existing_watts: 400, no_lift: true }]).lines[0]
    expect(no.item_name).toBe('SMBE 60/80/100W Cobra Head LOW WATT w/o LIFT')
    expect(no.price).toBe(297)
    expect(no.description).toMatch(/15 ft off the ground, no lift/)
  })
  it('every fixture line notes the existing wattage, the height and the mount', () => {
    const p = plan([{ kind: 'cobra', qty: 2, existing_watts: 400, mount: 'arm' }, { kind: 'flood', qty: 1, existing_watts: 400 }])
    for (const l of p.lines.filter((x) => x.role === 'fixture')) {
      expect(l.description).toMatch(/\d+W/)
      expect(l.description).toMatch(/ft off the ground/)
    }
    expect(p.lines[0].description).toMatch(/Arm fit mount/)
    expect(p.lines[1].description).toMatch(/Trunnion mount/)
  })
  it('the rep\'s "400 watt" is not doubled into "400W 400 watt"', () => {
    const d = plan([{ kind: 'cobra', qty: 4, existing_watts: 400, words: '400 watt shoeboxes on poles' }]).lines[0].description
    expect(d).toMatch(/^Replace 400 watt shoeboxes on poles with 60W/)
  })
  it('quantity is heads, as given — never multiplied by lamps', () => {
    expect(plan([{ kind: 't8_4ft', qty: 12, lamps: 4 }]).lines[0].quantity).toBe(12)
  })
})

describe('GMs keep the customer at $0, never more', () => {
  it('no rebate room, no GMs', () => {
    const p = plan([{ kind: 'cobra', qty: 2, existing_watts: 400 }], { rebateGiven: 500 })
    expect(p.lines.filter((l) => l.role !== 'fixture')).toHaveLength(0)
    expect(p.incentive).toBe(500)
    expect(p.gm_note).toMatch(/does not cover more than the fixtures/)
  })
  it('mounts first, then the WHOLE lift GM or none — ES LIFT at $49.98, 2 hr per fixture on the lift', () => {
    const p = plan([{ kind: 'cobra', qty: 2, existing_watts: 400 }], { rebateGiven: 834 + 154 + 2 * 2 * 49.98 })
    expect(byName(p, 'MES Cobra Head Mount - Slip Fit')[0]).toMatchObject({ quantity: 2, price: 77 })
    expect(byName(p, 'ES LIFT')[0]).toMatchObject({ quantity: 4, price: 49.98 })
    expect(p.out_of_pocket).toBe(0)
    // One cent short and the lift goes; the mounts stay.
    const q = plan([{ kind: 'cobra', qty: 2, existing_watts: 400 }], { rebateGiven: 834 + 154 + 2 * 2 * 49.98 - 0.01 })
    expect(byName(q, 'ES LIFT')).toHaveLength(0)
    expect(byName(q, 'MES Cobra Head Mount - Slip Fit')[0].quantity).toBe(2)
  })
  it('the lift is never a custom line', () => {
    const p = plan([{ kind: 'cobra', qty: 1, existing_watts: 400 }], { rebateGiven: 10000 })
    const lift = p.lines.find((l) => l.role === 'lift_gm')
    expect(lift.item_id).toBe(1505)
  })
  it('incentive is the lower of the rebate and the subtotal', () => {
    const p = plan([{ kind: 'cobra', qty: 1, existing_watts: 400 }], { rebateGiven: 10000 })
    expect(p.incentive).toBe(p.subtotal)
  })
  it('Utah: no SRP numbers, so no GMs unless a rebate is given', () => {
    const p = plan([{ kind: 'cobra', qty: 4, existing_watts: 1000 }], { state: 'UT' })
    expect(p.rebate).toBe(0)
    expect(p.gm_note).toMatch(/Utah/)
  })
  it('a little room, not enough for one mount, says exactly that', () => {
    // Live on 10-14: $1.24 of room was reported as "does not cover more".
    const p = plan([{ kind: 'cobra', qty: 1, existing_watts: 400 }], { rebateGiven: 418.24 })
    expect(p.gm_note).toMatch(/leaves only \$1\.24 past the fixtures — not enough for a \$77 mount/)
  })
  it('an estimated rebate says it is one', () => {
    const p = plan([{ kind: 'flood', qty: 10, existing_watts: 1000 }])
    expect(p.rebate_source).toBe('estimated')
    expect(p.assumptions.join(' ')).toMatch(/ESTIMATE from SRP/)
  })
})

describe('reading the takeoff', () => {
  it('kinds from the rep\'s words', () => {
    expect(kindOf({ words: '400 watt shoebox on the south lot' })).toBe('cobra')
    expect(kindOf({ words: 'security light over the back door' })).toBe('mini_wall_pack')
    expect(kindOf({ words: 'two lamp four foot troffer' })).toBe('t8_4ft')
    expect(kindOf({ words: 'eight foot strip' })).toBe('t8_8ft')
    expect(kindOf({ words: 'six lamp T5 high bay' })).toBe('t5_high_bay')
  })
  it('refuses what it cannot build, in words a rep understands', () => {
    expect(parseTakeoff([{ words: 'neon sign', qty: 1 }])).toMatch(/not a fixture I have a rule for/)
    expect(parseTakeoff([{ kind: 'cobra', qty: 'some' }])).toMatch(/how many heads/)
    expect(parseTakeoff([])).toMatch(/no fixtures/)
  })
  it('a product missing from the bundle stops the build instead of guessing', () => {
    const r = planEstimate([{ kind: 'cobra', qty: 1, existing_watts: 400, location: 'exterior' }], CATALOG.filter((p) => p.id !== 2371))
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/is not in the Electrical Services \(Bundles\) section/)
  })
  it('only the bundle section counts', () => {
    const elsewhere = CATALOG.map((p) => (p.id === 2371 ? { ...p, type: 'Electrical' } : p))
    expect(planEstimate([{ kind: 'cobra', qty: 1, existing_watts: 400, location: 'exterior' }], elsewhere).ok).toBe(false)
  })
  it('the playbook is chosen by the company setting', () => {
    expect(playbookFor('"energy_scout_lighting"')?.business_unit).toBe('Energy Scout')
    expect(playbookFor('energy_scout_lighting')?.business_unit).toBe('Energy Scout')
    expect(playbookFor(null)).toBeNull()
  })
})

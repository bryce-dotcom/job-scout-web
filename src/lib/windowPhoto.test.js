import { describe, it, expect } from 'vitest'
import {
  buildWindowPhotoPrompt, normalizeAnalysis, runReady, photoRunToRow,
} from './windowPhoto'
import { rowPanes, accessFor } from './windowTypes'
import { priceTakeoff } from './glassCleaningPricing'
import { DEMO_TYPES, DEMO_PRODUCTS, DEMO_PRODUCT_GROUPS } from './walterDemoTakeoff'

// A trimmed catalogue with the fields the prompt and the gate actually read.
const TYPES = [
  {
    type_code: 'double_hung', type_name: 'Double-hung', family: 'operable',
    panes_per_unit: 2, lites_per_unit: 2, bill_lites: false,
    typical_width_in: 32, typical_height_in: 60, size_band: 'over_4',
    screens_per_unit: 1, has_track: true,
    identification_tips: 'A horizontal meeting rail across the middle.',
    common_mistakes: 'Counted as one pane. It is two — the upper sash and the lower sash.',
    typical_locations: ['bedrooms', 'living rooms'],
  },
  {
    type_code: 'divided_lite_6', type_name: 'Divided lite sash, 6 over 6', family: 'operable',
    panes_per_unit: 2, lites_per_unit: 12, bill_lites: true,
    typical_width_in: 32, typical_height_in: 60, size_band: 'over_4',
    screens_per_unit: 1, has_track: true,
    identification_tips: 'True muntins carry putty and cast a shadow.',
    common_mistakes: 'Confused with a snap-in grille, which is one pane.',
    typical_locations: ['historic homes'],
  },
  {
    type_code: 'picture', type_name: 'Picture / fixed', family: 'fixed',
    panes_per_unit: 1, lites_per_unit: 1, bill_lites: false,
    typical_width_in: 60, typical_height_in: 48, size_band: 'over_4',
    screens_per_unit: 0, has_track: false,
    identification_tips: 'No sash, no hardware, no screen.',
    common_mistakes: null, typical_locations: null,
  },
]

const SCALE = [
  {
    reference_code: 'entry_door', reference_name: 'Entry door leaf', dimension_in: 80,
    dimension_of: 'height', reliability: 'high',
    notes: 'Residential doors are 6ft 8in almost without exception.',
  },
  {
    reference_code: 'person', reference_name: 'Adult standing', dimension_in: 68,
    dimension_of: 'height', reliability: 'low', notes: 'People vary.',
  },
]

const run = (over = {}) => ({
  area_name: 'Front elevation, upstairs',
  type_code: 'double_hung',
  units: 4,
  floor: 2,
  reach_in: 156,
  width_in: 32,
  height_in: 60,
  divided_lites: false,
  screens_visible: true,
  condition: 'maintenance',
  confidence: 'high',
  why: 'meeting rail across each sash',
  watch_for: null,
  ...over,
})

const analysis = (over = {}) => ({
  surface: 'front elevation of a two-storey brick house',
  storeys: 2,
  wall_material: 'brick',
  segment_looks_like: 'residential',
  scale: { reference_code: 'entry_door', how: 'the door leaf is 80in' },
  runs: [run()],
  not_counted: ['the rear and both side elevations'],
  notes: null,
  ...over,
})

describe('the prompt', () => {
  const p = buildWindowPhotoPrompt({ types: TYPES, scale: SCALE, context: null })

  it('carries every catalogue code, so the model can only name what exists', () => {
    for (const t of TYPES) expect(p).toContain(t.type_code)
  })

  it("carries the catalogue's own warnings rather than paraphrasing them", () => {
    expect(p).toContain('It is two — the upper sash and the lower sash')
    expect(p).toContain('True muntins carry putty')
  })

  it('spells out billing by the lite as an instruction, not as a number', () => {
    expect(p).toContain('12 lites, BILLED BY THE LITE')
    // The ones that bill by the pane must NOT say it.
    expect(p).toMatch(/double_hung \| Double-hung \| operable \| 2 panes/)
  })

  it('tells the model to count units and never panes', () => {
    expect(p).toContain('COUNT UNITS. NEVER COUNT PANES')
    expect(p).toContain('It is NOT 12')
  })

  it('forbids pricing, which is the price book’s job', () => {
    expect(p).toContain('never name a product')
    expect(p).toContain('never give a dollar figure')
  })

  it('names each scale reference with its reliability', () => {
    expect(p).toContain('entry_door | Entry door leaf | 80in height | reliability high')
    expect(p).toContain('person | Adult standing | 68in height | reliability low')
  })

  it('asks for the reach to the TOP of the glass, which is what decides access', () => {
    expect(p).toMatch(/reach_in — how far ABOVE THE GROUND the TOP of that glass is/)
  })

  it('relays what the rep said without letting it set the answer', () => {
    const withCtx = buildWindowPhotoPrompt({
      types: TYPES, scale: SCALE,
      context: { face: 'both', segment: 'commercial', storeys: 3, notes: 'back half is screened' },
    })
    expect(withCtx).toContain('has this job down as commercial')
    expect(withCtx).toContain('inside AND outside')
    expect(withCtx).toContain('3 storey(s)')
    expect(withCtx).toContain('back half is screened')
  })

  it('does not ask for a face or a segment per run — the rep owns those', () => {
    expect(p).not.toContain('"face"')
    expect(p).not.toContain('"segment":')
  })
})

describe('the gate on what comes back', () => {
  it('passes a clean answer through', () => {
    const a = normalizeAnalysis(analysis(), TYPES, SCALE)
    expect(a.runs).toHaveLength(1)
    expect(a.runs[0].type_code).toBe('double_hung')
    expect(a.runs[0].type_code_rejected).toBeNull()
    expect(a.runs[0].units).toBe(4)
    expect(a.storeys).toBe(2)
    expect(a.not_counted).toEqual(['the rear and both side elevations'])
  })

  it('refuses an invented type_code but keeps the run and remembers the guess', () => {
    const a = normalizeAnalysis(analysis({ runs: [run({ type_code: 'tilt_turn_euro' })] }), TYPES, SCALE)
    expect(a.runs).toHaveLength(1)
    expect(a.runs[0].type_code).toBeNull()
    expect(a.runs[0].type_code_rejected).toBe('tilt_turn_euro')
    // The count survives, because a run the rep can name beats a dropped run.
    expect(a.runs[0].units).toBe(4)
  })

  it('looks the scale reference up instead of believing the inches it was told', () => {
    const a = normalizeAnalysis(
      analysis({ scale: { reference_code: 'entry_door', dimension_in: 96, reliability: 'high', how: 'x' } }),
      TYPES, SCALE,
    )
    expect(a.scale.dimension_in).toBe(80)
    expect(a.scale.reference_name).toBe('Entry door leaf')
    expect(a.scale.reliability).toBe('high')
  })

  it('keeps a reference it cannot find, with nothing invented around it', () => {
    const a = normalizeAnalysis(
      analysis({ scale: { reference_code: 'fence_post', how: 'the fence' } }), TYPES, SCALE,
    )
    expect(a.scale.reference_code).toBe('fence_post')
    expect(a.scale.dimension_in).toBeNull()
    expect(a.scale.reliability).toBeNull()
  })

  it('clamps a reach no building has instead of putting the crew on ropes', () => {
    const a = normalizeAnalysis(analysis({ runs: [run({ reach_in: 99999, floor: 400 })] }), TYPES, SCALE)
    expect(a.runs[0].reach_in).toBe(9600)
    expect(a.runs[0].floor).toBe(60)
  })

  it('reads a reach of 0 as no measurement at all', () => {
    // The first real answer off an elevation with no door in frame said
    // "reach_in is left null" in its own scale note and then put 0 on all
    // eight runs. Zero is not a low window, it is a window lying on the
    // ground, and accessFor() reads this number to decide about ladders.
    for (const v of [0, '0', -40, 0.5]) {
      expect(normalizeAnalysis(analysis({ runs: [run({ reach_in: v })] }), TYPES, SCALE).runs[0].reach_in)
        .toBeNull()
    }
    // A real low window still measures.
    expect(normalizeAnalysis(analysis({ runs: [run({ reach_in: 36 })] }), TYPES, SCALE).runs[0].reach_in).toBe(36)
  })

  it('turns a nonsense count into one window rather than zero or NaN', () => {
    for (const units of [0, -3, 'lots', null, undefined, NaN]) {
      expect(normalizeAnalysis(analysis({ runs: [run({ units })] }), TYPES, SCALE).runs[0].units).toBe(1)
    }
  })

  it('falls back to the cheap, safe end of every enum', () => {
    const a = normalizeAnalysis(
      analysis({ runs: [run({ condition: 'filthy', confidence: 'certain' })], segment_looks_like: 'industrial' }),
      TYPES, SCALE,
    )
    // Not post_construction, which would multiply the price off a guess.
    expect(a.runs[0].condition).toBe('maintenance')
    // Not high, which would dress a guess up as an observation.
    expect(a.runs[0].confidence).toBe('low')
    expect(a.segment_looks_like).toBeNull()
  })

  it('keeps divided_lites as three answers, because unsure is one of them', () => {
    const g = (v) => normalizeAnalysis(analysis({ runs: [run({ divided_lites: v })] }), TYPES, SCALE).runs[0].divided_lites
    expect(g(true)).toBe(true)
    expect(g(false)).toBe(false)
    expect(g(null)).toBeNull()
    expect(g('yes')).toBeNull()
    expect(g(1)).toBeNull()
  })

  it('survives a response with nothing in it', () => {
    for (const raw of [{}, null, undefined, { runs: 'four' }, []]) {
      const a = normalizeAnalysis(raw, TYPES, SCALE)
      expect(a.runs).toEqual([])
      expect(a.not_counted).toEqual([])
      expect(a.scale).toBeNull()
    }
  })

  it('will not be handed a hundred runs to paste into a bid', () => {
    const many = Array.from({ length: 100 }, () => run())
    expect(normalizeAnalysis(analysis({ runs: many }), TYPES, SCALE).runs).toHaveLength(40)
  })
})

describe('a proposal as a row', () => {
  it('takes face and segment from the rep, never from the photograph', () => {
    const row = photoRunToRow(normalizeAnalysis(analysis(), TYPES, SCALE).runs[0], {
      face: 'out', segment: 'commercial',
    })
    expect(row.face).toBe('out')
    expect(row.segment).toBe('commercial')
    // Nothing in the run can reach these.
    const sneaky = photoRunToRow({ ...run(), face: 'in', segment: 'residential' }, { face: 'both', segment: 'commercial' })
    expect(sneaky.face).toBe('both')
    expect(sneaky.segment).toBe('commercial')
  })

  it('defaults to the whole job when the rep set nothing', () => {
    const row = photoRunToRow(run(), {})
    expect(row.face).toBe('both')
    expect(row.segment).toBe('residential')
  })

  it('translates divided_lites into the flag that bills by the lite', () => {
    expect(photoRunToRow(run({ divided_lites: true })).count_lites).toBe(true)
    expect(photoRunToRow(run({ divided_lites: null })).count_lites).toBeNull()
  })

  it('leaves screens to the catalogue unless the photo shows none', () => {
    // Seen on the windows: the catalogue knows how many per unit, the photo does not.
    expect(photoRunToRow(run({ screens_visible: true })).screens).toBeNull()
    // Plainly none on the house: a hard zero, so nobody is billed for screens.
    expect(photoRunToRow(run({ screens_visible: false })).screens).toBe(0)
    expect(photoRunToRow(run({ screens_visible: null })).screens).toBeNull()
  })

  it('never carries a track count — a photo cannot see into a track', () => {
    expect(photoRunToRow(run()).tracks).toBeNull()
  })
})

describe('a counted photo becomes a priced takeoff', () => {
  // The demo book as the seed plants it, given the ids a real table would —
  // the same transform glassCleaningPricing.test.js uses, so the figures here
  // and the figures on the demo screen cannot drift apart.
  const gid = new Map(DEMO_PRODUCT_GROUPS.map((g, i) => [g.name, i + 1]))
  const book = {
    products: DEMO_PRODUCTS.map((p, i) => ({
      id: 5000 + i, name: p.name, unit_price: p.unit_price,
      group_id: gid.get(p.group), type: 'Window Cleaning', active: true,
    })),
    groups: DEMO_PRODUCT_GROUPS.map((g) => ({ id: gid.get(g.name), name: g.name })),
    types: DEMO_TYPES,
  }

  it('runs the whole way from the model’s answer to money', () => {
    const a = normalizeAnalysis(analysis({
      runs: [
        run({ type_code: 'double_hung', units: 6, floor: 1, reach_in: 90 }),
        run({ area_name: 'Living room', type_code: 'picture', units: 1, floor: 1, reach_in: 80, screens_visible: false }),
      ],
    }), TYPES, SCALE)
    const rows = a.runs.map((r) => photoRunToRow(r, { face: 'both', segment: 'residential' }))
    const priced = priceTakeoff(rows, book)

    // Six double-hungs are twelve panes, not six and not twenty-four.
    expect(rowPanes(rows[0], DEMO_TYPES.find((t) => t.type_code === 'double_hung')).panes).toBe(12)
    expect(priced.counts.units).toBe(7)
    expect(priced.total).toBeGreaterThan(0)
    expect(priced.unpriced).toEqual([])
    expect(priced.unknown_types).toEqual([])
  })

  it('will not let a run with no type reach the bid, where it would bill half', () => {
    const a = normalizeAnalysis(analysis({ runs: [run({ type_code: 'tilt_turn_euro', units: 6 })] }), TYPES, SCALE)
    expect(runReady(a.runs[0])).toBe(false)
    expect(runReady(normalizeAnalysis(analysis(), TYPES, SCALE).runs[0])).toBe(true)

    // This is what runReady is protecting against. priceTakeoff flags a
    // type_code it does not KNOW, but a refused run carries none at all, so
    // it prices silently at one pane a unit — six windows, six panes, where
    // six double-hungs are twelve. Nothing downstream would say a word.
    const row = photoRunToRow(a.runs[0], { face: 'out', segment: 'residential' })
    const priced = priceTakeoff([row], book)
    expect(priced.unknown_types).toEqual([])
    expect(priced.counts.pane_faces).toBe(6)
    expect(priceTakeoff(
      [{ ...row, type_code: 'double_hung' }], book,
    ).counts.pane_faces).toBe(12)
  })

  it('the reach the photo measured is what picks the access, on commercial', () => {
    // 3rd storey outside on a commercial building is pole work, not a ladder.
    expect(accessFor({ floor: 3, face: 'out', reach_in: 260, segment: 'commercial' })).toBe('waterfed')
    // The same window inside is reached off the floor it stands on.
    expect(accessFor({ floor: 3, face: 'in', reach_in: 90, segment: 'commercial' })).toBe('ground')
  })
})

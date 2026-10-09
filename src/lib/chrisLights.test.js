import { describe, it, expect } from 'vitest'
import {
  COVERAGE, COVERAGE_KEYS, faceOf, feetPerPixel, pixelsPerFoot, runLengthFt,
  runsForCoverage, coverageFeet, coverageOptions, lightsPrice, quoteProblem, lightsIntakeLines,
} from './chrisLights'

// Antonino Lawn Care: "Can we get a mode for Christmas lights where we can
// take a picture or use maps to show them their house and what would look
// like with lights." Bryce: front / half house / full house toggles.

// A simple house: 60ft street face, 30ft down each side, 60ft across the back.
const HOUSE = [
  { id: 1, face: 'front', length_ft: 60 },
  { id: 2, face: 'side', length_ft: 30 },
  { id: 3, face: 'side', length_ft: 30 },
  { id: 4, face: 'back', length_ft: 60 },
]

describe('coverage is a filter over real runs, never a multiplier', () => {
  it('front counts only the street-facing runs', () => {
    expect(coverageFeet(HOUSE, 'front')).toBe(60)
  })

  it('half house is front plus the sides', () => {
    expect(coverageFeet(HOUSE, 'half')).toBe(120)
  })

  it('full house is everything traced', () => {
    expect(coverageFeet(HOUSE, 'full')).toBe(180)
  })

  it('the feet change because different RUNS are counted', () => {
    // Not a percentage of a total. The lamp multiplier turned $20,549.90 into
    // $67,198.60 by scaling a quantity nobody traced; this never scales.
    expect(runsForCoverage(HOUSE, 'front').map((r) => r.id)).toEqual([1])
    expect(runsForCoverage(HOUSE, 'half').map((r) => r.id)).toEqual([1, 2, 3])
    expect(runsForCoverage(HOUSE, 'full').map((r) => r.id)).toEqual([1, 2, 3, 4])
  })

  it('an untagged run is a side, never free', () => {
    const odd = [{ length_ft: 25 }, { face: 'nonsense', length_ft: 25 }]
    expect(faceOf(odd[0])).toBe('side')
    expect(faceOf(odd[1])).toBe('side')
    expect(coverageFeet(odd, 'half')).toBe(50)
    expect(coverageFeet(odd, 'front')).toBe(0)
  })

  it('offers every toggle with its real footage, for the buttons', () => {
    const opts = coverageOptions(HOUSE)
    expect(opts.map((o) => o.key)).toEqual(COVERAGE_KEYS)
    expect(opts.map((o) => o.feet)).toEqual([60, 120, 180])
    expect(opts.map((o) => o.runs)).toEqual([1, 3, 4])
    expect(opts[2].label).toBe(COVERAGE.full.label)
  })

  it('survives nothing traced', () => {
    expect(coverageFeet([], 'full')).toBe(0)
    expect(coverageFeet()).toBe(0)
    expect(runsForCoverage()).toEqual([])
  })
})

describe('the scale comes from the map, so there is no calibration step', () => {
  it('matches the known Web Mercator resolution', () => {
    // zoom 20 at 40.42N (Highland, Utah) is 0.1137 m/px — checked against a
    // live Esri World Imagery tile while building this.
    const fpp = feetPerPixel(40.420771, 20)
    expect(fpp).toBeCloseTo(0.1137 / 0.3048, 3)
    expect(pixelsPerFoot(40.420771, 20)).toBeCloseTo(2.68, 1)
  })

  it('a pixel covers more ground further from the equator', () => {
    expect(feetPerPixel(60, 20)).toBeLessThan(feetPerPixel(0, 20))
  })

  it('halves with every zoom level', () => {
    expect(feetPerPixel(40, 19) / feetPerPixel(40, 20)).toBeCloseTo(2, 6)
  })

  it('refuses a latitude Mercator cannot express', () => {
    expect(feetPerPixel(89, 20)).toBe(null)
    expect(feetPerPixel(40, 0)).toBe(null)
    expect(pixelsPerFoot(89, 20)).toBe(null)
  })
})

describe('tracing a run', () => {
  const fpp = 0.373   // ~zoom 20 in Utah

  it('measures a straight run', () => {
    expect(runLengthFt([{ x: 0, y: 0 }, { x: 100, y: 0 }], fpp)).toBe(37.3)
  })

  it('follows every corner of a dog-leg', () => {
    const pts = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    expect(runLengthFt(pts, fpp)).toBe(74.6)
  })

  it('is zero until there are two points', () => {
    expect(runLengthFt([{ x: 0, y: 0 }], fpp)).toBe(0)
    expect(runLengthFt([], fpp)).toBe(0)
    expect(runLengthFt(null, fpp)).toBe(0)
  })

  it('refuses to guess without a scale', () => {
    expect(runLengthFt([{ x: 0, y: 0 }, { x: 100, y: 0 }], 0)).toBe(0)
  })
})

describe('what it costs', () => {
  it('is feet times the rate', () => {
    expect(lightsPrice({ feet: 180, perFootRate: 6.5 }).total).toBe(1170)
  })

  it('lifts a small job to the minimum, and says it did', () => {
    const p = lightsPrice({ feet: 40, perFootRate: 6.5, minimumCharge: 450 })
    expect(p.line_total).toBe(260)
    expect(p.total).toBe(450)
    expect(p.minimum_applied).toBe(true)
  })

  it('leaves a big job alone', () => {
    expect(lightsPrice({ feet: 180, perFootRate: 6.5, minimumCharge: 450 }).minimum_applied).toBe(false)
  })

  it('never returns a negative or a NaN', () => {
    expect(lightsPrice({ feet: -10, perFootRate: 6.5 }).total).toBe(0)
    expect(lightsPrice({ feet: 100, perFootRate: 'nonsense' }).total).toBe(0)
    expect(lightsPrice({}).total).toBe(0)
    expect(lightsPrice().total).toBe(0)
  })
})

describe('what stops a quote', () => {
  it('asks for a trace before anything else', () => {
    expect(quoteProblem({ runs: [], perFootRate: 6.5 })).toMatch(/Trace the roofline/)
  })

  it('explains an empty coverage rather than quoting zero', () => {
    const backOnly = [{ face: 'back', length_ft: 60 }]
    expect(quoteProblem({ runs: backOnly, coverage: 'front', perFootRate: 6.5 }))
      .toMatch(/Nothing is tagged for front only/)
  })

  it('will not quote without a rate', () => {
    expect(quoteProblem({ runs: HOUSE, coverage: 'full', perFootRate: 0 })).toMatch(/price per foot/)
  })

  it('is happy with a traced house and a rate', () => {
    expect(quoteProblem({ runs: HOUSE, coverage: 'full', perFootRate: 6.5 })).toBe(null)
  })
})

describe('the estimate lines', () => {
  it('quotes the feet as the quantity and the rate as the price', () => {
    const [line] = lightsIntakeLines({ runs: HOUSE, coverage: 'full', perFootRate: 6.5, address: '12 Elm St' })
    expect(line.quantity).toBe(180)
    expect(line.price).toBe(6.5)
    expect(line.unit_of_measure).toBe('ft')
    expect(line.item_name).toMatch(/full house/)
  })

  it('shows the customer which faces they are paying for', () => {
    const [line] = lightsIntakeLines({ runs: HOUSE, coverage: 'half', perFootRate: 6.5 })
    expect(line.description).toMatch(/120 ft of roofline/)
    expect(line.description).toMatch(/60 ft front, 60 ft side/)
  })

  it('puts a minimum on its OWN line instead of inflating the rate', () => {
    // A customer who can read the maths is a customer who trusts the number.
    const lines = lightsIntakeLines({ runs: [{ face: 'front', length_ft: 40 }], coverage: 'front', perFootRate: 6.5, minimumCharge: 450 })
    expect(lines).toHaveLength(2)
    expect(lines[0].price).toBe(6.5)
    expect(lines[1].item_name).toBe('Minimum install charge')
    expect(lines[1].price).toBe(190)
    expect(lines[0].quantity * lines[0].price + lines[1].price).toBe(450)
  })

  it('needs no minimum line when the job clears it', () => {
    expect(lightsIntakeLines({ runs: HOUSE, coverage: 'full', perFootRate: 6.5, minimumCharge: 450 })).toHaveLength(1)
  })
})

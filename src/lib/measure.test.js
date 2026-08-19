import { describe, it, expect } from 'vitest'
import {
  toFeet, distancePx, polylineLengthPx, polygonAreaPx, polygonPerimeterPx,
  isSelfIntersecting, calibrate, measure, toTakeoffItem, MEASURE_TARGETS,
} from './measure'

// A 20 ft scale bar drawn 100px long → 5 px per foot.
const CAL = calibrate({ p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, realLength: 20, unit: 'ft' })
const PPF = CAL.px_per_ft

describe('calibration is the whole foundation', () => {
  it('turns a tapped known distance into pixels per foot', () => {
    expect(CAL.valid).toBe(true)
    expect(PPF).toBe(5)
  })

  it('handles a diagonal calibration line', () => {
    const c = calibrate({ p1: { x: 0, y: 0 }, p2: { x: 30, y: 40 }, realLength: 10, unit: 'ft' })
    expect(c.px_per_ft).toBe(5)   // hypotenuse 50 / 10 ft
  })

  it('accepts other units', () => {
    expect(toFeet(24, 'in')).toBe(2)
    expect(toFeet(2, 'yd')).toBe(6)
    expect(toFeet(1, 'm')).toBeCloseTo(3.28, 2)
    const c = calibrate({ p1: { x: 0, y: 0 }, p2: { x: 120, y: 0 }, realLength: 240, unit: 'in' })
    expect(c.px_per_ft).toBe(6)   // 240 in = 20 ft, 120px / 20ft
  })

  it('refuses to calibrate off nothing', () => {
    expect(calibrate({ p1: { x: 5, y: 5 }, p2: { x: 5, y: 5 }, realLength: 20 }).valid).toBe(false)
    expect(calibrate({ p1: { x: 0, y: 0 }, p2: { x: 100, y: 0 }, realLength: 0 }).valid).toBe(false)
  })

  it('warns when the calibration line is too short to be trusted', () => {
    // 12px standing in for 20 ft means one sloppy tap moves every later number.
    const short = calibrate({ p1: { x: 0, y: 0 }, p2: { x: 12, y: 0 }, realLength: 20 })
    expect(short.valid).toBe(true)
    expect(short.warning).toMatch(/short/i)
    expect(CAL.warning).toBeNull()
  })
})

describe('pixel geometry', () => {
  it('measures a straight run', () => {
    expect(distancePx({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5)
  })

  it('adds up a multi-segment run', () => {
    expect(polylineLengthPx([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }])).toBe(150)
  })

  it('shoelaces a rectangle', () => {
    const r = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]
    expect(polygonAreaPx(r)).toBe(5000)
    expect(polygonPerimeterPx(r)).toBe(300)
  })

  it('does not care which way round you traced it', () => {
    const cw = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }]
    const ccw = [...cw].reverse()
    expect(polygonAreaPx(ccw)).toBe(polygonAreaPx(cw))
  })

  it('returns zero rather than nonsense for too few points', () => {
    expect(polygonAreaPx([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBe(0)
    expect(polylineLengthPx([{ x: 0, y: 0 }])).toBe(0)
  })
})

describe('a crossed outline is caught, because the eye will not catch it', () => {
  it('spots a bowtie', () => {
    const bowtie = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]
    expect(isSelfIntersecting(bowtie)).toBe(true)
  })

  it('leaves a clean rectangle alone', () => {
    expect(isSelfIntersecting([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }, { x: 0, y: 50 }])).toBe(false)
  })

  it('leaves an L-shape alone', () => {
    const L = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 40 }, { x: 40, y: 40 }, { x: 40, y: 100 }, { x: 0, y: 100 }]
    expect(isSelfIntersecting(L)).toBe(false)
  })

  it('surfaces it on the measurement, not just as a boolean', () => {
    const m = measure({ points: [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }], mode: 'area', px_per_ft: PPF })
    expect(m.warnings.join(' ')).toMatch(/crosses itself/i)
  })
})

describe('measuring off the sheet', () => {
  it('converts a traced run to linear feet', () => {
    const m = measure({ points: [{ x: 0, y: 0 }, { x: 500, y: 0 }], mode: 'line', px_per_ft: PPF })
    expect(m.valid).toBe(true)
    expect(m.length_ft).toBe(100)   // 500px / 5 ppf
  })

  it('converts a traced outline to square feet — area scales with the SQUARE of the ratio', () => {
    // 500 x 250 px at 5 px/ft is 100 x 50 ft = 5,000 sf, not 125,000/5.
    const m = measure({
      points: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 250 }, { x: 0, y: 250 }],
      mode: 'area', px_per_ft: PPF,
    })
    expect(m.area_sf).toBe(5000)
    expect(m.perimeter_ft).toBe(300)
  })

  it('refuses to measure before calibration', () => {
    const m = measure({ points: [{ x: 0, y: 0 }, { x: 500, y: 0 }], mode: 'line', px_per_ft: null })
    expect(m.valid).toBe(false)
    expect(m.reason).toMatch(/calibrat/i)
  })

  it('asks for more points rather than guessing', () => {
    expect(measure({ points: [{ x: 0, y: 0 }], mode: 'line', px_per_ft: PPF }).reason).toMatch(/two points/i)
    expect(measure({ points: [{ x: 0, y: 0 }, { x: 5, y: 5 }], mode: 'area', px_per_ft: PPF }).reason).toMatch(/three points/i)
  })
})

describe('a measurement becomes a takeoff item', () => {
  const lineM = measure({ points: [{ x: 0, y: 0 }, { x: 1200, y: 0 }], mode: 'line', px_per_ft: PPF })
  const areaM = measure({
    points: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 250 }, { x: 0, y: 250 }],
    mode: 'area', px_per_ft: PPF,
  })

  it('carries a traced run into a trench, with the dimensions no plan view can show', () => {
    const item = toTakeoffItem({
      measurement: lineM, work_type: 'trench',
      extras: { width_ft: 2.5, depth_ft: 6, protection: 'sloped' },
      source_ref: 'Traced on C-401',
    })
    expect(item.length_ft).toBe(240)
    expect(item.depth_ft).toBe(6)
    expect(item.source).toBe('measured')
    expect(item.source_ref).toBe('Traced on C-401')
  })

  it('carries a traced outline into an area item with its perimeter', () => {
    const item = toTakeoffItem({ measurement: areaM, work_type: 'mass_ex', extras: { depth_ft: 2 } })
    expect(item.area_sf).toBe(5000)
    expect(item.perimeter_ft).toBe(300)
    expect(item.depth_ft).toBe(2)
  })

  it('marks a traced item fully confident — the user drew it themselves', () => {
    // Unlike an AI reading, a trace is the user asserting the number, so it
    // must not sit in the "unconfirmed guess" bucket holding the bid back.
    expect(toTakeoffItem({ measurement: areaM, work_type: 'mass_ex' }).confidence).toBe(1)
  })

  it('returns nothing from an invalid measurement', () => {
    expect(toTakeoffItem({ measurement: { valid: false }, work_type: 'mass_ex' })).toBeNull()
  })

  it('offers only work types the traced shape can actually produce', () => {
    expect(MEASURE_TARGETS.line.map((t) => t.work_type)).toContain('trench')
    expect(MEASURE_TARGETS.line.map((t) => t.work_type)).not.toContain('mass_ex')
    expect(MEASURE_TARGETS.area.map((t) => t.work_type)).toContain('mass_ex')
  })
})

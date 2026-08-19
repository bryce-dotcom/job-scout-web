import { describe, it, expect } from 'vitest'
import {
  countsTowardCalibration, summarizeTakeoff, buildSamples, computeFactors,
  toCalibrationRows, explainFactor, MACHINE, SHIFT,
} from './digCalibration'

const item = (work_type, machine_hours, loads = 0) => ({ work_type, machine_hours, loads })
const machineHrs = (work_type, actual_hours, extra = {}) => ({ work_type, actual_hours, hours_kind: MACHINE, ...extra })
const shiftHrs = (work_type, actual_hours, extra = {}) => ({ work_type, actual_hours, hours_kind: SHIFT, counts_toward_calibration: false, ...extra })

// ═══════════════════════════════════════════════════════════════════════
// The rule the whole loop rests on
// ═══════════════════════════════════════════════════════════════════════

describe('a shift is not a machine hour', () => {
  it('counts machine hours', () => {
    expect(countsTowardCalibration(machineHrs('trench', 6))).toBe(true)
  })

  it('does not count a time-clock shift', () => {
    // A shift carries travel, fuelling, lunch and waiting on trucks. Feeding
    // it into a production factor inflates every future bid invisibly.
    expect(countsTowardCalibration(shiftHrs('trench', 9))).toBe(false)
  })

  it('counts a shift only once somebody deliberately says it is machine time', () => {
    expect(countsTowardCalibration(shiftHrs('trench', 9, { counts_toward_calibration: true }))).toBe(true)
  })

  it('ignores an actual with no hours on it', () => {
    expect(countsTowardCalibration(machineHrs('trench', 0))).toBe(false)
    expect(countsTowardCalibration({ work_type: 'trench', actual_loads: 12, hours_kind: MACHINE })).toBe(false)
  })

  it('keeps shift hours visible even though they do not calibrate', () => {
    // Losing them would hide the finding that the day was mostly standing around.
    const s = summarizeTakeoff({
      bidItems: [item('trench', 10)],
      actuals: [machineHrs('trench', 12), shiftHrs('trench', 18)],
    })
    const row = s.rows[0]
    expect(row.actual_hours).toBe(12)     // only machine time
    expect(row.shift_hours).toBe(18)      // but the shift is still on the report
  })
})

// ═══════════════════════════════════════════════════════════════════════
// One takeoff
// ═══════════════════════════════════════════════════════════════════════

describe('estimated against actual, per work type', () => {
  const summary = summarizeTakeoff({
    bidItems: [item('trench', 10, 20), item('trench', 6, 10), item('mass_ex', 40, 100)],
    actuals: [machineHrs('trench', 20, { actual_loads: 36 }), machineHrs('mass_ex', 34, { actual_loads: 95 })],
  })

  it('adds up several items of the same work type into one row', () => {
    const trench = summary.rows.find((r) => r.work_type === 'trench')
    expect(trench.estimated_hours).toBe(16)   // 10 + 6
    expect(trench.estimated_loads).toBe(30)
  })

  it('reports the variance as a ratio and a delta', () => {
    const trench = summary.rows.find((r) => r.work_type === 'trench')
    expect(trench.hours_variance).toBe(1.25)   // 20 actual / 16 estimated
    expect(trench.hours_delta).toBe(4)
    expect(trench.status).toBe('over')
  })

  it('calls a job that came in early', () => {
    const mass = summary.rows.find((r) => r.work_type === 'mass_ex')
    expect(mass.status).toBe('under')
    expect(mass.hours_delta).toBe(-6)
  })

  it('treats within 5% either way as on the money, not a variance to chase', () => {
    const over = summarizeTakeoff({ bidItems: [item('trench', 100)], actuals: [machineHrs('trench', 103)] })
    const under = summarizeTakeoff({ bidItems: [item('trench', 100)], actuals: [machineHrs('trench', 97)] })
    expect(over.rows[0].status).toBe('on')
    expect(under.rows[0].status).toBe('on')
  })

  it('puts the boundary at exactly 5%, inclusive', () => {
    // 40 estimated, 38 actual is exactly 5% under — inside the band, so 'on'.
    const edge = summarizeTakeoff({ bidItems: [item('mass_ex', 40)], actuals: [machineHrs('mass_ex', 38)] })
    expect(edge.rows[0].status).toBe('on')
  })

  it('rolls up totals across work types', () => {
    expect(summary.totals.estimated_hours).toBe(56)
    expect(summary.totals.actual_hours).toBe(54)
    expect(summary.totals.hours_variance).toBeCloseTo(0.964, 2)
  })

  it('sorts the biggest estimate first, because that is where the money is', () => {
    expect(summary.rows[0].work_type).toBe('mass_ex')
  })
})

describe('work that happened but was never bid', () => {
  it('surfaces it rather than dropping it', () => {
    // "We hauled all day and it was not in the bid" is the single most useful
    // thing this report can tell somebody.
    const s = summarizeTakeoff({
      bidItems: [item('trench', 10)],
      actuals: [machineHrs('trench', 10), machineHrs('haul_off', 7)],
    })
    const haul = s.rows.find((r) => r.work_type === 'haul_off')
    expect(haul).toBeTruthy()
    expect(haul.estimated_hours).toBe(0)
    expect(haul.actual_hours).toBe(7)
    expect(haul.status).toBe('incomplete')   // nothing to compare against
  })

  it('does not let unbid work become a calibration sample', () => {
    const s = summarizeTakeoff({ bidItems: [], actuals: [machineHrs('haul_off', 7)] })
    expect(buildSamples([{ takeoff_id: 1, summary: s }]).haul_off).toBeUndefined()
  })
})

describe('an estimate with nothing logged against it', () => {
  it('stays incomplete rather than reading as a 100% saving', () => {
    const s = summarizeTakeoff({ bidItems: [item('trench', 10)], actuals: [] })
    expect(s.rows[0].status).toBe('incomplete')
    expect(s.rows[0].hours_variance).toBeNull()
  })
})

// ═══════════════════════════════════════════════════════════════════════
// Across jobs
// ═══════════════════════════════════════════════════════════════════════

const jobs = (pairs) =>
  pairs.map(([est, act], i) => ({
    takeoff_id: i + 1,
    summary: summarizeTakeoff({ bidItems: [item('trench', est)], actuals: [machineHrs('trench', act)] }),
  }))

describe('samples become a factor', () => {
  it('needs three jobs before it touches a bid', () => {
    const f2 = computeFactors(buildSamples(jobs([[10, 13], [20, 25]])))
    expect(f2.trench.applied).toBe(false)
    expect(f2.trench.factor).toBe(1)
    expect(f2.trench.needed).toBe(1)

    const f3 = computeFactors(buildSamples(jobs([[10, 13], [20, 25], [30, 36]])))
    expect(f3.trench.applied).toBe(true)
    expect(f3.trench.sample_n).toBe(3)
  })

  it('learns that this crew runs over, and by how much', () => {
    const f = computeFactors(buildSamples(jobs([[10, 13], [20, 25], [30, 36]])))
    // 74 actual over 60 estimated
    expect(f.trench.factor).toBeCloseTo(1.233, 2)
  })

  it('learns the happy direction too', () => {
    const f = computeFactors(buildSamples(jobs([[10, 8], [20, 15], [30, 24]])))
    expect(f.trench.factor).toBeLessThan(1)
  })

  it('flags when a catastrophe got capped', () => {
    const f = computeFactors(buildSamples(jobs([[10, 400], [10, 12], [10, 11]])))
    expect(f.trench.factor).toBeLessThanOrEqual(2)
    expect(f.trench.clamped).toBe(true)
  })

  it('keeps work types separate — two verticals learn two sets of rates', () => {
    const samples = buildSamples([
      { takeoff_id: 1, summary: summarizeTakeoff({ bidItems: [item('trench', 10), item('mass_ex', 10)], actuals: [machineHrs('trench', 15), machineHrs('mass_ex', 9)] }) },
      { takeoff_id: 2, summary: summarizeTakeoff({ bidItems: [item('trench', 10), item('mass_ex', 10)], actuals: [machineHrs('trench', 15), machineHrs('mass_ex', 9)] }) },
      { takeoff_id: 3, summary: summarizeTakeoff({ bidItems: [item('trench', 10), item('mass_ex', 10)], actuals: [machineHrs('trench', 15), machineHrs('mass_ex', 9)] }) },
    ])
    const f = computeFactors(samples)
    expect(f.trench.factor).toBeCloseTo(1.5, 2)
    expect(f.mass_ex.factor).toBeCloseTo(0.9, 2)
  })
})

describe('what gets written back', () => {
  it('writes only the factors that actually apply', () => {
    const f = computeFactors(buildSamples([
      ...jobs([[10, 13], [20, 25], [30, 36]]),
      { takeoff_id: 9, summary: summarizeTakeoff({ bidItems: [item('mass_ex', 10)], actuals: [machineHrs('mass_ex', 12)] }) },
    ]))
    const rows = toCalibrationRows(f, 3)
    expect(rows).toHaveLength(1)
    expect(rows[0].work_type).toBe('trench')
    expect(rows[0].company_id).toBe(3)
    expect(rows[0].sample_n).toBe(3)
  })

  it('writes nothing when nothing has enough history', () => {
    expect(toCalibrationRows(computeFactors(buildSamples(jobs([[10, 13]]))), 3)).toHaveLength(0)
  })
})

describe('the explanation, because a factor nobody understands gets switched off', () => {
  it('says how many more jobs are needed', () => {
    const f = computeFactors(buildSamples(jobs([[10, 13]])))
    expect(explainFactor(f.trench)).toMatch(/2 more before this starts affecting bids/)
  })

  it('says which way it runs and what that does to the price', () => {
    const f = computeFactors(buildSamples(jobs([[10, 13], [20, 25], [30, 36]])))
    const text = explainFactor(f.trench)
    expect(text).toMatch(/23% longer/)
    expect(text).toMatch(/prices higher/)
  })

  it('says so when a bad job got capped', () => {
    const f = computeFactors(buildSamples(jobs([[10, 400], [10, 12], [10, 11]])))
    expect(explainFactor(f.trench)).toMatch(/Capped/)
  })

  it('says plainly when no adjustment is warranted', () => {
    const f = computeFactors(buildSamples(jobs([[10, 10], [20, 20], [30, 30]])))
    expect(explainFactor(f.trench)).toMatch(/No adjustment/)
  })
})

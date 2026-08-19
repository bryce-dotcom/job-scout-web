// Meter maths for fleet lifecycle — engine hours, idle hours, odometer.
//
// Imports the edge function's module directly rather than a copy. Hours feed
// the lifecycle bar, cost-per-hour, utilisation and the sell/keep call, so a
// second implementation would be a second set of answers. It is pure TS with
// no Deno imports, which is what lets vitest read it straight.
//
// The cases below are the ones live ignition data actually produces. Every
// one of them was a way to silently invent or lose hours, and invented hours
// become invented depreciation on a screen telling someone to sell a machine.

import { describe, it, expect } from 'vitest'
import {
  computeMeters,
  toEngineIntervals,
  mergeIntervals,
  subtractCoverage,
  odometerFromTrips,
  idleSecondsFromBreadcrumbs,
  tripsToIntervals,
} from '../../supabase/functions/_shared/fleetMeters.ts'

const H = 3_600_000
const T0 = Date.parse('2026-08-11T08:00:00Z')
const ev = (hoursFromT0, on) => ({ engine_on: on, occurred_at: new Date(T0 + hoursFromT0 * H).toISOString() })
const span = (fromH, toH) => ({ start: T0 + fromH * H, end: T0 + toH * H })

describe('engine interval pairing', () => {
  it('pairs a clean on/off into one interval', () => {
    const { intervals, unpaired } = toEngineIntervals([ev(0, true), ev(2, false)], T0 + 3 * H)
    expect(intervals).toHaveLength(1)
    expect(unpaired).toBe(0)
  })

  it('keeps the ORIGINAL start when "on" repeats', () => {
    // Taking the later report would shorten every interval it touches, which
    // under-reports hours on exactly the machines that run longest.
    expect(computeMeters([ev(0, true), ev(2, true), ev(3, false)], [], T0 + 4 * H).engineHours).toBe(3)
  })

  it('discards a leading orphan "off" instead of inventing hours', () => {
    // The matching "on" rolled off the provider's ~30-event window. Assuming
    // it started at the beginning of the window would fabricate runtime.
    expect(computeMeters([ev(1, false), ev(2, true), ev(4, false)], [], T0 + 5 * H).engineHours).toBe(2)
  })

  it('counts a still-running engine up to now', () => {
    const r = computeMeters([ev(0, true)], [], T0 + 3 * H)
    expect(r.engineHours).toBe(3)
    expect(r.openSince).toBe(new Date(T0).toISOString())
  })

  it('sorts events that arrive out of order', () => {
    expect(computeMeters([ev(2, false), ev(0, true)], [], T0 + 3 * H).engineHours).toBe(2)
  })

  it('reports unpaired events rather than hiding them', () => {
    expect(computeMeters([ev(1, false), ev(2, true), ev(3, true), ev(4, false)], [], T0 + 5 * H).unpaired).toBe(2)
  })

  it('ignores malformed timestamps', () => {
    const r = computeMeters([{ engine_on: true, occurred_at: 'not-a-date' }, ev(0, true), ev(1, false)], [], T0 + 2 * H)
    expect(r.engineHours).toBe(1)
  })
})

describe('idle hours', () => {
  it('treats engine time with no trip as fully idle', () => {
    expect(computeMeters([ev(0, true), ev(2, false)], [], T0 + 3 * H).idleFloorHours).toBe(2)
  })

  it('treats engine time fully covered by a trip as zero idle', () => {
    expect(computeMeters([ev(0, true), ev(2, false)], [span(0, 2)], T0 + 3 * H).idleFloorHours).toBe(0)
  })

  it('subtracts only the moving portion', () => {
    expect(computeMeters([ev(0, true), ev(2, false)], [span(0, 0.5)], T0 + 3 * H).idleFloorHours).toBe(1.5)
  })

  it('does not double-subtract overlapping trips', () => {
    // Two trips covering 0-2 and 1-3 remove three hours if naively summed,
    // which would report negative idle on a four-hour run.
    expect(computeMeters([ev(0, true), ev(4, false)], [span(0, 2), span(1, 3)], T0 + 5 * H).idleFloorHours).toBe(1)
  })

  it('never lets idle exceed engine hours', () => {
    // A trip wider than the ignition window (clock skew between provider
    // subsystems) must not produce idle > engine or a negative working figure.
    const r = computeMeters([ev(0, true), ev(1, false)], [span(-5, 9)], T0 + 2 * H)
    expect(r.idleFloorHours).toBeLessThanOrEqual(r.engineHours)
    expect(r.movingHours).toBeGreaterThanOrEqual(0)
  })

  it('splits engine time into working + idle exactly', () => {
    const r = computeMeters([ev(0, true), ev(4, false)], [span(1, 2)], T0 + 5 * H)
    expect(r.movingHours + r.idleFloorHours).toBeCloseTo(r.engineHours, 2)
  })
})

describe('interval helpers', () => {
  it('merges touching and overlapping ranges', () => {
    expect(mergeIntervals([span(0, 2), span(1, 3), span(5, 6)])).toHaveLength(2)
  })

  it('drops zero-length and inverted ranges', () => {
    expect(mergeIntervals([span(2, 2), span(3, 1)])).toHaveLength(0)
  })

  it('returns the full span when nothing covers it', () => {
    expect(subtractCoverage([span(0, 2)], [])).toBe(2 * H)
  })
})

describe('odometer', () => {
  it('takes the max, never the sum', () => {
    // ending_mileage is already cumulative; summing multiplies the reading.
    expect(odometerFromTrips([
      { summary: { ending_mileage: 120.5 } },
      { summary: { ending_mileage: 193.4 } },
      { summary: { ending_mileage: 0 } },
    ])).toBe(193.4)
  })

  it('returns null when no trip carries a reading', () => {
    expect(odometerFromTrips([{ summary: {} }, {}])).toBeNull()
  })
})

describe('trip shapes', () => {
  it('prefers the summary window over the ignition window', () => {
    // The outer window is the ignition cycle and runs ~0.5h longer than the
    // summary on every real trip — the provider's trip-close timeout. Using
    // it makes trips blanket every engine-on minute, so idle reports exactly
    // zero on every asset forever and looks like a real answer.
    const t = {
      start_time: new Date(T0).toISOString(),
      end_time: new Date(T0 + 3 * H).toISOString(),
      summary: {
        start_time: new Date(T0).toISOString(),
        end_time: new Date(T0 + 2 * H).toISOString(),
      },
    }
    const [iv] = tripsToIntervals([t])
    expect(iv.end - iv.start).toBe(2 * H)
  })

  it('surfaces idle that the ignition window would have hidden', () => {
    const trip = {
      start_time: new Date(T0).toISOString(),
      end_time: new Date(T0 + 3 * H).toISOString(),
      summary: { start_time: new Date(T0).toISOString(), end_time: new Date(T0 + 2 * H).toISOString() },
    }
    const r = computeMeters([ev(0, true), ev(3, false)], tripsToIntervals([trip]), T0 + 4 * H)
    expect(r.engineHours).toBe(3)
    expect(r.idleFloorHours).toBe(1)
  })

  it('accepts start_time/end_time and summary variants', () => {
    const rows = [
      { start_time: new Date(T0).toISOString(), end_time: new Date(T0 + H).toISOString() },
      { summary: { start_time: new Date(T0 + 2 * H).toISOString(), end_time: new Date(T0 + 3 * H).toISOString() } },
    ]
    expect(tripsToIntervals(rows)).toHaveLength(2)
  })

  it('skips trips that never ended', () => {
    expect(tripsToIntervals([{ start_time: new Date(T0).toISOString(), end_time: null }])).toHaveLength(0)
  })
})

describe('idle from breadcrumbs', () => {
  // The measurement that makes idle real. Trip windows run first-movement to
  // last-movement and swallow every stop; breadcrumbs carry a speed roughly
  // every 20 seconds and can tell parked from moving.
  const pt = (secs, speed) => ({ occurred_at: new Date(T0 + secs * 1000).toISOString(), speed })

  it('counts an interval only when both ends are stationary', () => {
    expect(idleSecondsFromBreadcrumbs([pt(0, 0), pt(60, 0)]).idleSeconds).toBe(60)
  })

  it('ignores the decelerating and accelerating halves of a stop', () => {
    // Requiring both ends stationary. Counting one-ended intervals would make
    // most of a delivery route read as idle.
    expect(idleSecondsFromBreadcrumbs([pt(0, 30), pt(60, 0)]).idleSeconds).toBe(0)
    expect(idleSecondsFromBreadcrumbs([pt(0, 0), pt(60, 30)]).idleSeconds).toBe(0)
  })

  it('treats GPS jitter as stationary', () => {
    // A parked vehicle reports 0.3-0.8 mph, so zero is the wrong threshold.
    expect(idleSecondsFromBreadcrumbs([pt(0, 0.6), pt(60, 0.4)]).idleSeconds).toBe(60)
  })

  it('will not manufacture idle across a hole in the data', () => {
    // Live gaps reach 20 minutes. Counting the whole gap because both ends
    // read zero invents idle that was never observed.
    const r = idleSecondsFromBreadcrumbs([pt(0, 0), pt(1200, 0)], { maxGapSeconds: 120 })
    expect(r.idleSeconds).toBe(120)
    expect(r.cappedGaps).toBe(1)
  })

  it('sorts points that arrive newest-first', () => {
    // The provider returns them in descending time order.
    expect(idleSecondsFromBreadcrumbs([pt(60, 0), pt(0, 0)]).idleSeconds).toBe(60)
  })

  it('accumulates several stops in one trip', () => {
    const r = idleSecondsFromBreadcrumbs([
      pt(0, 0), pt(30, 0),      // 30s stopped
      pt(60, 25), pt(90, 25),   // moving
      pt(120, 0), pt(150, 0),   // 30s stopped
    ])
    expect(r.idleSeconds).toBe(60)
  })

  it('returns zero for empty or single-point trails', () => {
    expect(idleSecondsFromBreadcrumbs([]).idleSeconds).toBe(0)
    expect(idleSecondsFromBreadcrumbs([pt(0, 0)]).idleSeconds).toBe(0)
  })

  it('skips points with unusable timestamps or speeds', () => {
    const r = idleSecondsFromBreadcrumbs([
      { occurred_at: 'nonsense', speed: 0 }, pt(0, 0), pt(60, 0), { occurred_at: null, speed: 0 },
    ])
    expect(r.idleSeconds).toBe(60)
    expect(r.sampled).toBe(2)
  })
})

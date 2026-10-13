import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { milesBetween, jobPinLooksThin, shiftOnSite } from './onSite'

// Real rows from HHH, 2026-10, behind an HR complaint that a tech was booking
// hours to jobs he was not at. The trail map showed dots and no job, so
// nobody could tell. These are the shifts, measured.

const ARIZONA_EQUIPMENT = { job_title: 'AZ arizona equipment', job_address: '2323 W Buckeye Rd, Phoenix, AZ 85009', latitude: 33.4373, longitude: -112.1101 }
const onSite = { lat: 33.4373, lng: -112.1101 }                 // a fix on the site
const acrossTown = { lat: 33.5722, lng: -112.0891 }             // ~9.5 mi north

describe('distance', () => {
  it('measures a short hop in feet, not miles', () => {
    const d = milesBetween(onSite, { lat: 33.4375, lng: -112.1101 })
    expect(d).toBeLessThan(0.05)
    expect(d).toBeGreaterThan(0)
  })

  it('measures across town', () => {
    expect(milesBetween(onSite, acrossTown)).toBeGreaterThan(8)
    expect(milesBetween(onSite, acrossTown)).toBeLessThan(11)
  })

  it('is null on junk rather than NaN', () => {
    expect(milesBetween(null, onSite)).toBeNull()
    expect(milesBetween({ lat: 'x', lng: 1 }, onSite)).toBeNull()
    expect(milesBetween({ lat: 33 }, onSite)).toBeNull()
  })
})

describe('a shift measured against its job', () => {
  it('says he was there when a fix lands on the site', () => {
    const v = shiftOnSite({ job: ARIZONA_EQUIPMENT, points: [acrossTown, onSite, acrossTown] })
    expect(v.status).toBe('on_site')
    expect(v.onSiteCount).toBe(1)
    expect(v.pointCount).toBe(3)
    expect(v.headline).toMatch(/At the job/)
  })

  it('reports the gap when nothing is near the site', () => {
    // London, 9 Oct, AZ fast auto parts: 5.4 hours, 7 fixes, nearest 22.56 mi
    const far = { lat: 33.78, lng: -112.35 }
    const v = shiftOnSite({ job: ARIZONA_EQUIPMENT, points: [far, far, far] })
    expect(v.status).toBe('away')
    expect(v.nearestMiles).toBeGreaterThan(20)
    expect(v.headline).toMatch(/Never closer than/)
  })

  it('reads a close fix in feet, because miles-to-two-decimals means nothing on a lot', () => {
    const v = shiftOnSite({ job: ARIZONA_EQUIPMENT, points: [{ lat: 33.4374, lng: -112.1102 }] })
    // the radius stays in miles (it is a setting people type), the measured
    // distance reads in feet when it is a lot's width rather than a drive
    expect(v.headline).toMatch(/within 0\.25 mi/)
    expect(v.detail).toMatch(/\d+ ft from the site/)
  })
})

describe('it will not accuse anyone on bad data', () => {
  // "AZ Fix it auto", address "1625 w sunrise blvd" — no city, no state. It
  // geocoded to Salt Lake City; the tech's fixes read 495 miles away while he
  // was in Arizona all day. Absence is the wrong conclusion.
  const THIN = { job_title: 'AZ Fix it auto', job_address: '1625 w sunrise blvd', latitude: 40.6126, longitude: -111.9364 }

  it('calls out a job whose own pin is a guess', () => {
    const v = shiftOnSite({ job: THIN, points: [onSite, onSite] })
    expect(v.status).toBe('job_pin_unreliable')
    expect(v.headline).toMatch(/job location looks wrong/i)
    expect(v.detail).toMatch(/1625 w sunrise blvd/)
    expect(v.detail).toMatch(/no city or state/)
  })

  it('still trusts a proper address that is genuinely far away', () => {
    const v = shiftOnSite({ job: ARIZONA_EQUIPMENT, points: [{ lat: 40.6126, lng: -111.9364 }] })
    expect(v.status).toBe('away')
  })

  it('never says "away" with nothing to measure', () => {
    expect(shiftOnSite({ job: ARIZONA_EQUIPMENT, points: [] }).status).toBe('unknown')
    expect(shiftOnSite({ job: { ...ARIZONA_EQUIPMENT, latitude: null }, points: [onSite] }).status).toBe('unknown')
    expect(shiftOnSite({ job: null, points: [onSite] }).status).toBe('unknown')
    expect(shiftOnSite({}).status).toBe('unknown')
  })

  it('ignores points with junk coordinates instead of counting them', () => {
    const v = shiftOnSite({ job: ARIZONA_EQUIPMENT, points: [{ lat: null, lng: null }, onSite] })
    expect(v.pointCount).toBe(1)
    expect(v.status).toBe('on_site')
  })
})

describe('what counts as thin', () => {
  it('a street line on its own is thin', () => {
    expect(jobPinLooksThin({ job_address: '1625 w sunrise blvd' })).toBe(true)
    expect(jobPinLooksThin({ job_address: '' })).toBe(true)
    expect(jobPinLooksThin({})).toBe(true)
  })

  it('a city, a state code or a postcode is enough', () => {
    expect(jobPinLooksThin({ job_address: '2323 W Buckeye Rd, Phoenix, AZ 85009' })).toBe(false)
    expect(jobPinLooksThin({ job_address: '1625 w sunrise blvd 85301' })).toBe(false)
    expect(jobPinLooksThin({ job_address: '1625 w sunrise blvd AZ' })).toBe(false)
  })
})

describe('the radius is a knob, not a constant', () => {
  it('a tighter radius can turn a yes into a no', () => {
    const edge = { lat: 33.4420, lng: -112.1101 }   // ~0.32 mi north
    expect(shiftOnSite({ job: ARIZONA_EQUIPMENT, points: [edge] }).status).toBe('away')
    expect(shiftOnSite({ job: ARIZONA_EQUIPMENT, points: [edge], radiusMiles: 0.5 }).status).toBe('on_site')
  })
})

// The pings themselves: more of them, taken when the app is demonstrably
// awake, rather than a faster timer that a sleeping phone ignores.
describe('where the fixes come from', () => {
  const read = (p) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..', p), 'utf8')

  it('one writer records every fix, with a reason', () => {
    const lib = read('src/lib/locationPing.js')
    expect(lib).toMatch(/export async function recordPing/)
    expect(lib).toMatch(/reason,/)
    // it must never break the work it is attached to
    expect(lib).toMatch(/catch \{/)
  })

  it('the interval timer goes through it too, so both kinds match', () => {
    const hook = read('src/hooks/useLocationTracking.js')
    expect(hook).toMatch(/import \{ recordPing \}/)
    expect(hook).toMatch(/recordPing\(\{ companyId, employeeId, timeClockId: entryId, reason \}\)/)
  })

  it('Field Scout takes a fix at the moments a tech is actually in the app', () => {
    const fs = read('src/pages/FieldScout.jsx')
    for (const reason of ['clock_in', 'clock_out', 'payment', 'verification']) {
      expect(fs).toMatch(new RegExp(`reason: '${reason}'`))
    }
  })

  it('the reason column exists for them to land in', () => {
    const sql = read('supabase/migrations/20261013160220_location_ping_reason.sql')
    expect(sql).toMatch(/add column if not exists reason text/)
  })
})

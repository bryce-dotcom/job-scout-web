import { describe, it, expect } from 'vitest'
import { dedupeHash, prefilter, countdown, statusForScore, shouldNotify, setAsideRequirement } from './bidFit'

// The deterministic half of Sal: what is decided before a model is asked.

const profile = {
  service_lines: [
    { label: 'Lighting retrofit', naics: ['238210'], commodity_codes: ['285'], keywords: ['lighting', 'LED', 'retrofit'], exclusions: ['traffic signal'] },
    { label: 'Janitorial', naics: ['561720'], keywords: ['janitorial', 'custodial'] },
  ],
  service_area: { states: ['UT', 'AZ'], home: { lat: 40.42, lng: -111.79 }, radius_km: 150 },
  value_min: 5000, value_max: 500000,
  set_asides: ['sb'],
  thresholds: { auto_dismiss_below: 30, notify_at: 70, due_margin_hours: 24 },
}
const now = new Date('2026-09-26T12:00:00Z')
const inTenDays = '2026-10-06T20:00:00Z'

describe('dedupe: two feeds describing one solicitation collapse', () => {
  it('keys on the buyer\'s own number when there is one', () => {
    const a = dedupeHash({ solicitation_number: 'ITB 2026-114', buyer: 'City of Ogden', title: 'LED Retrofit', due_at: inTenDays })
    const b = dedupeHash({ solicitation_number: 'itb-2026-114', buyer: 'OGDEN CITY', title: 'Lorin Farr Park LED', due_at: '2026-10-07' })
    expect(a).toBe(b)
  })
  it('falls back to buyer + title + due day', () => {
    const a = dedupeHash({ buyer: 'City of Ogden', title: 'Lorin Farr Park LED Retrofit', due_at: '2026-10-06T20:00:00Z' })
    const b = dedupeHash({ buyer: 'city of ogden', title: 'Lorin Farr Park — LED retrofit', due_at: '2026-10-06T23:59:00Z' })
    const c = dedupeHash({ buyer: 'City of Ogden', title: 'Lorin Farr Park LED Retrofit', due_at: '2026-10-07T20:00:00Z' })
    expect(a).toBe(b)
    expect(a).not.toBe(c)
  })
})

describe('prefilter: what never reaches the model', () => {
  it('passes a lighting job in-state with a code match and scores it up', () => {
    const r = prefilter({ title: 'Lorin Farr Park LED Retrofit', buyer: 'City of Ogden', naics: ['238210'], place: { state: 'UT' }, due_at: inTenDays }, profile, now)
    expect(r.pass).toBe(true)
    expect(r.score).toBeGreaterThanOrEqual(60)
    expect(r.matched_line).toBe('Lighting retrofit')
  })
  it('rejects the wrong state', () => {
    const r = prefilter({ title: 'LED Retrofit', place: { state: 'TX' }, due_at: inTenDays }, profile, now)
    expect(r.pass).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/Outside service area \(TX\)/)
  })
  it('does not reject when the state is unknown', () => {
    expect(prefilter({ title: 'LED Retrofit', due_at: inTenDays }, profile, now).pass).toBe(true)
  })
  it('rejects a place beyond the radius and keeps a near one', () => {
    const far = prefilter({ title: 'LED', latitude: 37.1, longitude: -113.6, due_at: inTenDays }, profile, now)   // St George, ~400 km
    const near = prefilter({ title: 'LED', latitude: 40.76, longitude: -111.89, due_at: inTenDays }, profile, now) // SLC
    expect(far.pass).toBe(false)
    expect(near.pass).toBe(true)
    expect(near.reasons.join(' ')).toMatch(/km from home/)
  })
  it('blocks a set-aside the company does not hold, allows one it does', () => {
    const sdv = prefilter({ title: 'LED', set_aside: 'Service-Disabled Veteran-Owned Small Business (SDVOSB) Set-Aside', due_at: inTenDays }, profile, now)
    expect(sdv.pass).toBe(false)
    expect(sdv.blockers[0]).toMatch(/Service-disabled veteran-owned set-aside — not held/)
    const sb = prefilter({ title: 'LED', set_aside: 'Total Small Business Set-Aside', due_at: inTenDays }, profile, now)
    expect(sb.pass).toBe(true)
    expect(sb.blockers).toEqual([])
  })
  it('rejects an excluded keyword even with a code match', () => {
    const r = prefilter({ title: 'Traffic Signal LED Replacement', naics: ['238210'], due_at: inTenDays }, profile, now)
    expect(r.pass).toBe(false)
    expect(r.reasons.join(' ')).toMatch(/Excluded: "traffic signal"/)
  })
  it('marks a deadline inside the margin as expired, not dismissed', () => {
    const r = prefilter({ title: 'LED', due_at: '2026-09-27T06:00:00Z' }, profile, now) // 18 h away, margin 24 h
    expect(r.expired).toBe(true)
    expect(statusForScore(80, profile, r)).toBe('expired')
  })
  it('rejects outside the size band only when the notice says a number', () => {
    expect(prefilter({ title: 'LED', estimated_value_high: 2000, due_at: inTenDays }, profile, now).pass).toBe(false)
    expect(prefilter({ title: 'LED', estimated_value_low: 900000, due_at: inTenDays }, profile, now).pass).toBe(false)
    expect(prefilter({ title: 'LED', due_at: inTenDays }, profile, now).pass).toBe(true)
  })
  it('works with an empty profile', () => {
    const r = prefilter({ title: 'Anything', due_at: inTenDays }, null, now)
    expect(r.pass).toBe(true)
    expect(r.score).toBe(20)
  })
})

describe('status and notification thresholds', () => {
  it('auto-dismisses below the floor and notifies at the ceiling', () => {
    const pre = prefilter({ title: 'LED', due_at: inTenDays }, profile, now)
    expect(statusForScore(20, profile, pre)).toBe('dismissed')
    expect(statusForScore(45, profile, pre)).toBe('new')
    expect(shouldNotify(69, profile)).toBe(false)
    expect(shouldNotify(70, profile)).toBe(true)
  })
})

describe('countdown reads like a person says it', () => {
  it('days and hours, red under three days', () => {
    expect(countdown('2026-09-28T16:00:00Z', now)).toMatchObject({ label: 'Due in 2d 4h', urgency: 'red' })
    expect(countdown('2026-10-01T12:00:00Z', now)).toMatchObject({ label: 'Due in 5d 0h', urgency: 'amber' })
    expect(countdown(inTenDays, now).urgency).toBe('ok')
    expect(countdown('2026-09-26T13:30:00Z', now).label).toBe('Due in 1h 30m')
    expect(countdown('2026-09-20T00:00:00Z', now).urgency).toBe('past')
    expect(countdown(null, now).urgency).toBe('none')
  })
})

describe('set-aside words from the portals', () => {
  it('maps the common phrasings', () => {
    expect(setAsideRequirement('WOSB')?.need).toBe('wosb')
    expect(setAsideRequirement('8(a) Competitive')?.need).toBe('8a')
    expect(setAsideRequirement('HUBZone Set-Aside')?.need).toBe('hubzone')
    expect(setAsideRequirement('Full and Open')).toBe(null)
    expect(setAsideRequirement('')).toBe(null)
  })
})

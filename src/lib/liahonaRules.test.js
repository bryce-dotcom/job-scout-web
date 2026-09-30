import { describe, it, expect } from 'vitest'
import { leadStatusForJob } from './leadDeliveryStatus.js'
import { tidyOwner } from './parcels.js'
import { sourceFor, coverageLabel, PARCEL_SOURCES } from './parcelSources.js'
import { knockOutcome, isToday, hasCoords, latLngPairs, latLngOf } from '../components/liahona/util.js'

// The small pure rules behind Liahona. Each one was written after a real
// miss (a status the board could not fetch, an owner string a rep could not
// read), so each case here is one of those.

describe('leadStatusForJob: a converted lead mirrors its job, in the company\'s own statuses', () => {
  // HHH's real settings, and the point is the LAST one: the id a job carries
  // ('Paid') is not the label on the board ('Payments'). The fixture used to
  // build every row as { id: n, name: n }, so it could not see the resolver
  // reading `name` — and a paid deal's lead walked back to 'Scheduled'.
  const hhh = [
    ...['Chillin', 'Need To Order', 'Scheduled', 'In Progress', 'On Hold', 'Completed', 'Verified Complete', 'Invoiced'].map(n => ({ id: n, name: n })),
    { id: 'Paid', name: 'Payments' },
    { id: 'Closed', name: 'Closed' },
  ]
  it('uses the job status itself when the company has it', () => {
    expect(leadStatusForJob('Scheduled', hhh)).toBe('Scheduled')
    expect(leadStatusForJob('Paid', hhh)).toBe('Paid')
  })

  it('matches on the status id, not the board label', () => {
    // A renamed stage must not strand the lead. 'Payments' is what the board
    // shows; 'Paid' is what jobs.status holds and what leads.status must get.
    expect(leadStatusForJob('Paid', hhh)).toBe('Paid')
    expect(leadStatusForJob('Paid', hhh)).not.toBe('Scheduled')
  })
  it('maps the old default names onto the nearest configured status', () => {
    expect(leadStatusForJob('Job Scheduled', hhh)).toBe('Scheduled')
    expect(leadStatusForJob('Job Complete', hhh)).toBe('Completed')
  })
  it('keeps the defaults for a company with no configured statuses', () => {
    expect(leadStatusForJob('Scheduled', [])).toBe('Job Scheduled')
    expect(leadStatusForJob('Completed', [])).toBe('Job Complete')
    expect(leadStatusForJob(null, undefined)).toBe('Job Scheduled')
  })
  it('never returns a status the company does not have', () => {
    for (const js of ['Job Scheduled', 'Job Complete', 'Whatever', null]) expect(hhh.map(s => s.id)).toContain(leadStatusForJob(js, hhh))
  })
})

describe('tidyOwner: assessor owner strings as a rep would say them', () => {
  it('drops tenancy tags and merges a shared surname', () => {
    expect(tidyOwner('Kara Carlston (Jt); David Alan Carlston (Jt)')).toBe('Kara & David Alan Carlston')
  })
  it('flips surname-first filings', () => {
    expect(tidyOwner('WOOD,ROY E & WOOD,MARIA A')).toBe('Roy E & Maria A Wood')
    expect(tidyOwner('CITRARO, ANTHONY DAVID')).toBe('Anthony David Citraro')
    expect(tidyOwner('NAGY, MIKLOS ET AL')).toBe('Miklos Nagy')
  })
  it('leaves entities alone', () => {
    expect(tidyOwner('SMITH FAMILY TRUST, THE')).toBe('Smith Family Trust, The')
    expect(tidyOwner('CITY & COUNTY OF DENVER')).toBe('City & County Of Denver')
  })
  it('reads placeholders as no owner and drops a trailing separator', () => {
    expect(tidyOwner('Trust Not Identified')).toBeNull()
    expect(tidyOwner('')).toBeNull()
    expect(tidyOwner('Mecklenburg County; ')).toBe('Mecklenburg County')
  })
})

describe('parcelSources: the registry', () => {
  it('picks the county row over the statewide row for the same state', () => {
    expect(sourceFor({ state: '37', name: 'Wake County' }).id).toBe('wake')
    expect(sourceFor({ state: '37', name: 'Durham County' }).id).toBe('nconemap')
    expect(sourceFor({ state: '08', name: 'Denver County' }).id).toBe('denver')
    expect(sourceFor({ state: '08', name: 'Weld County' }).id).toBe('colorado')
  })
  it('has nothing for a state with no source, and Utah is not in the registry', () => {
    expect(sourceFor({ state: '06', name: 'Los Angeles County' })).toBeNull()
    expect(sourceFor({ state: '49', name: 'Salt Lake County' })).toBeNull()
    expect(sourceFor(null)).toBeNull()
  })
  it('every row has an id, a label, a state, a URL and a read()', () => {
    for (const s of PARCEL_SOURCES) {
      expect(s.id).toBeTruthy(); expect(s.label).toBeTruthy(); expect(s.state).toMatch(/^\d{2}$/)
      expect(s.url).toMatch(/^https:\/\/.+\/(MapServer|FeatureServer)\/\d+$/); expect(typeof s.read).toBe('function')
    }
    expect(coverageLabel()).toMatch(/^Utah, /)
  })
  it('the Colorado composite skips right-of-way polygons', () => {
    const co = PARCEL_SOURCES.find(s => s.id === 'colorado')
    expect(co.read({ parcel_id: 'ROW', owner: null })).toBeNull()
    expect(co.read({ parcel_id: '1', owner: 'X', situsAdd: '1 Main' }).owner_name).toBe('X')
  })
})

describe('knocks: what the lead card logs, the pin badge reads back', () => {
  it('recognises each outcome from the note, and only for visits', () => {
    expect(knockOutcome({ method: 'visit', note: 'Knocked: not home' }).id).toBe('not_home')
    expect(knockOutcome({ method: 'visit', note: 'Knocked: talked to them · nice guy' }).id).toBe('talked')
    expect(knockOutcome({ method: 'visit', note: 'Knocked: left a card' }).id).toBe('left_card')
    expect(knockOutcome({ method: 'visit', note: 'Knocked: asked for a callback' }).id).toBe('callback')
    expect(knockOutcome({ method: 'visit', note: null }).id).toBe('visit')
    expect(knockOutcome({ method: 'call', note: 'Knocked: not home' })).toBeNull()
  })
  it('isToday is local-day, not 24 hours', () => {
    const now = new Date()
    expect(isToday(now.toISOString())).toBe(true)
    const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1); yesterday.setHours(23, 59, 0, 0)
    expect(isToday(yesterday.toISOString())).toBe(false)
    expect(isToday(null)).toBe(false)
  })
})

// ── A bad coordinate must not take the map down ────────────────────────────
//
// Crash 33894f25: "Invalid LatLng object: (NaN, NaN)" on /pipeline, and Noah
// (69736f51) "it won't let me view the map". hasCoords validated the LATITUDE
// only, so a row with a good latitude and an unparseable longitude passed the
// filter, reached Leaflet, and threw — killing the map that was about to draw
// everyone else's pins.
describe('hasCoords / latLngPairs: one unplottable row cannot kill the map', () => {
  it('requires BOTH halves to be finite', () => {
    expect(hasCoords({ latitude: 40.7, longitude: -111.9 })).toBe(true)
    expect(hasCoords({ latitude: 40.7, longitude: 'unknown' })).toBe(false)
    expect(hasCoords({ latitude: 'unknown', longitude: -111.9 })).toBe(false)
    expect(hasCoords({ latitude: 40.7, longitude: null })).toBe(false)
    expect(hasCoords({ latitude: null, longitude: null })).toBe(false)
    expect(hasCoords(null)).toBe(false)
  })

  it('rejects Infinity, which Number() will happily produce', () => {
    expect(hasCoords({ latitude: '1e999', longitude: -111.9 })).toBe(false)
  })

  it('drops the bad rows and keeps the good ones', () => {
    const rows = [
      { latitude: 40.7, longitude: -111.9 },
      { latitude: 41.2, longitude: 'nope' },
      { latitude: null, longitude: null },
      { latitude: '39.5', longitude: '-111.0' },
    ]
    expect(latLngPairs(rows)).toEqual([[40.7, -111.9], [39.5, -111]])
  })

  it('returns an empty list for junk instead of throwing', () => {
    expect(latLngPairs(null)).toEqual([])
    expect(latLngPairs([])).toEqual([])
  })
})

describe('latLngOf: a geocode hit with no coordinates is not a place', () => {
  it('accepts a real pair, including numeric strings', () => {
    expect(latLngOf({ lat: 40.7, lng: -111.9 })).toEqual([40.7, -111.9])
    expect(latLngOf({ lat: '40.7', lng: '-111.9' })).toEqual([40.7, -111.9])
  })

  it('returns null for the shapes that used to crash the map', () => {
    // The search box only checked `if (!hit)`, so each of these reached
    // setView and threw "Invalid LatLng object: (NaN, NaN)".
    expect(latLngOf({ formatted: '123 Main St' })).toBe(null)
    expect(latLngOf({ lat: undefined, lng: undefined })).toBe(null)
    expect(latLngOf({ lat: 40.7 })).toBe(null)
    expect(latLngOf({ lat: 'nope', lng: 'nope' })).toBe(null)
    expect(latLngOf(null)).toBe(null)
    expect(latLngOf(undefined)).toBe(null)
  })
})

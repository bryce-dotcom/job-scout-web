import { describe, it, expect, vi, afterEach } from 'vitest'
import { createRequire } from 'node:module'

// The cron's geocoder is CommonJS (Vercel function); load it as such.
const { normalize, plausibleFor, looksGeocodable, localize, nearHome, homeFor, geocodeAddress, HOME_KM } = createRequire(import.meta.url)('./geocodeAddress.js')

// The geocoder grew up on HHH's Utah and Arizona addresses. These pin the
// rules that keep it honest for every other tenant (2026-09-24: "Tampa, FL
// 33606" used to normalise to "Tampa, UT", every hit outside the Mountain
// West was thrown away, and a lawn crew's "1495 mountain view dr" could only
// ever land in Salt Lake County).

describe('normalize', () => {
  it('leaves an address with a state and ZIP alone, wherever it is', () => {
    expect(normalize('1007 W Horatio St, Tampa, FL 33606')).toBe('1007 W Horatio St, Tampa, FL 33606')
    expect(normalize('12 Main St, Boston MA 02116')).toBe('12 Main St, Boston, MA 02116')
    expect(normalize('12000 E Girard Ave, Aurora, CO 80014-1234')).toBe('12000 E Girard Ave, Aurora, CO 80014-1234')
  })
  it('does not read FL as a floor', () => {
    expect(normalize('1007 W Horatio St, Tampa, FL 33606')).toContain('FL 33606')
    expect(normalize('200 Newbury St Floor 3, Boston, MA')).toBe('200 Newbury St, Boston, MA')
  })
  it('strips building and suite fragments but keeps the ZIP', () => {
    expect(normalize('3300 N Running Creek Way, Bldg B Suite 150, Lehi, Ut 84043')).toBe('3300 N Running Creek Way, Lehi, UT 84043')
    expect(normalize('2582 E Evening Star Dr Ste 5, Holladay, UT 84124')).toBe('2582 E Evening Star Dr, Holladay, UT 84124')
  })
  it('adds the state only when a known Utah or Arizona city says so', () => {
    expect(normalize('4048 S Lincoln View Ln, Holladay')).toBe('4048 S Lincoln View Ln, Holladay, UT')
    expect(normalize('100 N Gilbert Rd, Gilbert')).toBe('100 N Gilbert Rd, Gilbert, AZ')
    expect(normalize('57 N Chalk Maple Vineyard')).toBe('57 N Chalk Maple Vineyard, UT')
    expect(normalize('1441 N York St')).toBe('1441 N York St')
    expect(normalize('805 Washington St, Raleigh NC')).toBe('805 Washington St, Raleigh, NC')
  })
})

const spanishFork = { lat: 40.118, lng: -111.66, city: 'Spanish Fork', state: 'UT' }
const denver = { lat: 39.74, lng: -104.99, city: 'Denver', state: 'CO' }

describe('localize: a city-less address is read from the tenant home', () => {
  it('appends the home city and state', () => {
    expect(localize('1495 mountain view dr', spanishFork)).toBe('1495 mountain view dr, Spanish Fork, UT')
    expect(localize('400 Commerce Dr', denver)).toBe('400 Commerce Dr, Denver, CO')
  })
  it('leaves an address alone when it already says where it is', () => {
    expect(localize('400 Commerce Dr, Lakewood, CO', spanishFork)).toBeNull()
    expect(localize('898 S State St, Orem, UT 84058', spanishFork)).toBeNull()
    expect(localize('57 N Chalk Maple Vineyard, UT', spanishFork)).toBeNull()
    expect(localize('1495 mountain view dr', null)).toBeNull()
    expect(localize('1495 mountain view dr', { lat: 1, lng: 2 })).toBeNull()
  })
  it('expands Utah town shorthand only for a Utah home', () => {
    expect(localize('1467 e dover drive sf', spanishFork)).toBe('1467 e dover drive, Spanish Fork, UT')
    expect(localize('193 South 1060 East, AF', spanishFork)).toBe('193 South 1060 East, American Fork, UT')
    expect(localize('438 canyon view drive PG', spanishFork)).toBe('438 canyon view drive, Pleasant Grove, UT')
    expect(localize('1467 e dover drive sf', denver)).toBe('1467 e dover drive sf, Denver, CO')
  })
})

describe('nearHome', () => {
  it('accepts the next town over and refuses the town 80 km up the valley with the same grid numbers', () => {
    expect(HOME_KM).toBe(60)
    expect(nearHome({ lat: 40.234, lng: -111.659 }, spanishFork)).toBe(true)   // Provo
    expect(nearHome({ lat: 41.22, lng: -111.97 }, spanishFork)).toBe(false)    // Ogden
    expect(nearHome(null, spanishFork)).toBe(false)
    expect(nearHome({ lat: 40.2, lng: -111.7 }, null)).toBe(false)
    expect(nearHome({ lat: 40.2, lng: -111.7 }, { city: 'Spanish Fork', state: 'UT' })).toBe(false)
  })
})

describe('plausibleFor: how far a hit may be from what the address says', () => {
  const tampa = { lat: 27.94, lng: -82.47 }, holladay = { lat: 40.68, lng: -111.82 }, ogden = { lat: 41.22, lng: -111.97 }, paris = { lat: 48.85, lng: 2.35 }
  it('state or ZIP: anywhere in the US', () => {
    expect(plausibleFor('1007 W Horatio St, Tampa, FL 33606', tampa)).toBe(true)
    expect(plausibleFor('805 Washington St, Raleigh NC', { lat: 35.79, lng: -78.65 })).toBe(true)
    expect(plausibleFor('1007 W Horatio St, Tampa, FL 33606', paris)).toBe(false)
  })
  it('a Utah/Arizona city alone: the Mountain West', () => {
    expect(plausibleFor('4048 S Lincoln View Ln, Holladay', holladay)).toBe(true)
    expect(plausibleFor('4048 S Lincoln View Ln, Holladay', tampa)).toBe(false)
  })
  it('bare grid numbers: near the tenant home, or Salt Lake County when no home is known', () => {
    expect(plausibleFor('4048 S 1300 E', holladay)).toBe(true)
    expect(plausibleFor('4048 S 1300 E', ogden)).toBe(false)
    expect(plausibleFor('400 Commerce Dr', { lat: 39.7, lng: -105.0 }, denver)).toBe(true)
    expect(plausibleFor('400 Commerce Dr', holladay, denver)).toBe(false)
    expect(plausibleFor('400 Commerce Dr', { lat: 39.7, lng: -105.0 })).toBe(false)
  })
  it('nothing is plausible for a miss', () => { expect(plausibleFor('anything', null)).toBe(false) })
})

describe('looksGeocodable', () => {
  it('needs a street number and rejects PO boxes and bare towns', () => {
    expect(looksGeocodable('4048 S Lincoln View Ln, Holladay')).toBe(true)
    expect(looksGeocodable('Denver, CO')).toBe(false)
    expect(looksGeocodable('PO Box 12, Lehi UT')).toBe(false)
  })
})

// Census stub: answers only the queries it is given, like the real thing.
const queriedAddress = url => decodeURIComponent(new URL(url).searchParams.get('address') || new URL(url).searchParams.get('q') || '')
function stubCensus(answers) {
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    const hit = answers[queriedAddress(url)]
    const body = String(url).includes('census') ? { result: { addressMatches: hit ? [{ coordinates: { x: hit.lng, y: hit.lat }, addressComponents: { city: hit.city, state: hit.state } }] : [] } } : []
    return { ok: true, json: async () => body }
  }))
}
afterEach(() => vi.unstubAllGlobals())

describe('homeFor + geocodeAddress with a home', () => {
  it('resolves the tenant home from its companies row, city named by the Census match', async () => {
    stubCensus({ '6395 W 10400 N Highland, UT 84003': { lat: 40.43, lng: -111.79, city: 'HIGHLAND', state: 'UT' } })
    expect(await homeFor({ address: '6395 W 10400 N Highland, UT 84003', city: null, state: null, zip: null })).toEqual({ lat: 40.43, lng: -111.79, city: 'Highland', state: 'UT' })
    expect(await homeFor({ address: null, city: null, state: null, zip: null })).toBeNull()
    expect(await homeFor(null)).toBeNull()
  })
  it('pins a city-less address through the home city and refuses a hit far from home', async () => {
    stubCensus({
      '1495 mountain view dr, Spanish Fork, UT': { lat: 40.107, lng: -111.628, city: 'SPANISH FORK', state: 'UT' },
      '3550 Harrison Blvd, Spanish Fork, UT': { lat: 41.22, lng: -111.97, city: 'OGDEN', state: 'UT' },
    })
    expect(await geocodeAddress('1495 mountain view dr', { allowNominatim: false, home: spanishFork })).toEqual({ lat: 40.107, lng: -111.628, source: 'census+home' })
    expect(await geocodeAddress('3550 Harrison Blvd', { allowNominatim: false, home: spanishFork })).toBeNull()
  })
  it('an address that says where it is never gets the home appended', async () => {
    stubCensus({ '1007 W Horatio St, Tampa, FL 33606': { lat: 27.94, lng: -82.47, city: 'TAMPA', state: 'FL' } })
    expect(await geocodeAddress('1007 W Horatio St, Tampa, FL 33606', { allowNominatim: false, home: spanishFork })).toEqual({ lat: 27.94, lng: -82.47, source: 'census' })
    expect(fetch.mock.calls.map(([u]) => queriedAddress(u))).toEqual(['1007 W Horatio St, Tampa, FL 33606'])
  })
})

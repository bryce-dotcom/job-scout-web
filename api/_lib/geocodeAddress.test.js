import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'

// The cron's geocoder is CommonJS (Vercel function); load it as such.
const { normalize, plausibleFor, looksGeocodable } = createRequire(import.meta.url)('./geocodeAddress.js')

// The geocoder grew up on HHH's Utah and Arizona addresses. These pin the
// rules that keep it honest for every other state (2026-09-24: "Tampa, FL
// 33606" used to normalise to "Tampa, UT", and every hit outside the
// Mountain West was thrown away).

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
    expect(normalize('1441 N York St')).toBe('1441 N York St')
    expect(normalize('805 Washington St, Raleigh NC')).toBe('805 Washington St, Raleigh, NC')
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
  it('bare grid numbers: Salt Lake County only, because grid numbers repeat per town', () => {
    expect(plausibleFor('4048 S 1300 E', holladay)).toBe(true)
    expect(plausibleFor('4048 S 1300 E', ogden)).toBe(false)
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

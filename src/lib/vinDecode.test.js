// VIN decoding — the cheap path to acquisition data.
//
// The network call is stubbed. What is worth testing is the mapping onto our
// asset classes and the failure handling, because the whole point of this
// feature is that it beats typing, and a decoder that rejects real VINs or
// mislabels a service truck as a half-ton is worse than the form it replaces.

import { describe, it, expect } from 'vitest'
import {
  normalizeVin, isPlausibleVin, vinProblem, assetClassFromDecode, decodeVin,
} from './vinDecode'

const ok = (results) => ({
  ok: true,
  json: async () => ({ Results: [results] }),
})

describe('VIN validation', () => {
  it('normalises spacing and case', () => {
    expect(normalizeVin(' 1c6srfjt8rn123456 ')).toBe('1C6SRFJT8RN123456')
    expect(normalizeVin('1C6-SRFJT8RN123456')).toBe('1C6SRFJT8RN123456')
  })

  it('rejects the letters a VIN cannot contain', () => {
    // I, O and Q are excluded precisely because they look like 1 and 0, which
    // is exactly the transcription error worth catching before a lookup.
    expect(isPlausibleVin('1C6SRFJT8RN12345O')).toBe(false)
    expect(vinProblem('1C6SRFJT8RN12345O')).toMatch(/I, O or Q/)
  })

  it('says how far off the length is', () => {
    expect(vinProblem('1C6SRF')).toMatch(/17 characters — this one is 6/)
  })

  it('accepts a well-formed VIN', () => {
    expect(vinProblem('1C6SRFJT8RN123456')).toBeNull()
  })
})

describe('asset class mapping', () => {
  it('calls a half-ton a pickup', () => {
    expect(assetClassFromDecode({ BodyClass: 'Pickup', VehicleType: 'TRUCK', GVWR: 'Class 2F: 7,001 - 8,000 lb' }))
      .toBe('pickup')
  })

  it('separates a one-ton service truck from a half-ton', () => {
    // vPIC calls both "Pickup". They are different assets with different
    // lives, and weight is what actually tells them apart.
    expect(assetClassFromDecode({ BodyClass: 'Pickup', VehicleType: 'TRUCK', GVWR: 'Class 3: 10,001 - 14,000 lb' }))
      .toBe('service_truck')
  })

  it('reads heavy trucks by weight class', () => {
    expect(assetClassFromDecode({ BodyClass: 'Truck', VehicleType: 'TRUCK', GVWR: 'Class 5: 16,001 - 19,500 lb' })).toBe('box_truck')
    expect(assetClassFromDecode({ BodyClass: 'Truck', VehicleType: 'TRUCK', GVWR: 'Class 8: 33,001 lb and above' })).toBe('dump_truck')
  })

  it('recognises trailers and vans', () => {
    expect(assetClassFromDecode({ BodyClass: 'Trailer', VehicleType: 'TRAILER' })).toBe('trailer')
    expect(assetClassFromDecode({ BodyClass: 'Cargo Van', VehicleType: 'TRUCK' })).toBe('van')
  })

  it('falls back rather than guessing wildly', () => {
    expect(assetClassFromDecode({})).toBe('other')
  })
})

describe('decodeVin', () => {
  it('returns the fields the lifecycle needs', async () => {
    const r = await decodeVin('1C6SRFJT8RN123456', {
      fetchImpl: async () => ok({
        Make: 'RAM', Model: '1500', ModelYear: '2024',
        BodyClass: 'Pickup', VehicleType: 'TRUCK', GVWR: 'Class 2F: 7,001 - 8,000 lb',
        ErrorCode: '0',
      }),
    })
    expect(r.ok).toBe(true)
    expect(r).toMatchObject({ make: 'RAM', model: '1500', modelYear: 2024, assetClass: 'pickup', meterBasis: 'miles' })
    expect(r.warning).toBeNull()
  })

  it('keeps a decode whose check digit fails, but warns', async () => {
    // Real VINs get transcribed with a typo constantly. The decode is still
    // right about make, model and year, and rejecting it sends the user back
    // to typing everything by hand.
    const r = await decodeVin('1C6SRFJT8RN123456', {
      fetchImpl: async () => ok({
        Make: 'RAM', Model: '1500', ModelYear: '2024', BodyClass: 'Pickup',
        ErrorCode: '1', ErrorText: '1 - Check Digit (9th position) does not calculate properly',
      }),
    })
    expect(r.ok).toBe(true)
    expect(r.make).toBe('RAM')
    expect(r.warning).toMatch(/check digit/i)
  })

  it('treats a 200 with no Make as a failure', async () => {
    // vPIC answers 200 with empty fields for a VIN it cannot place, so status
    // alone does not mean success.
    const r = await decodeVin('1C6SRFJT8RN123456', { fetchImpl: async () => ok({ Make: '', ErrorText: '11 - Incorrect Model Year' }) })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/Model Year|by hand/)
  })

  it('never throws when the service is unreachable', async () => {
    const r = await decodeVin('1C6SRFJT8RN123456', { fetchImpl: async () => { throw new Error('offline') } })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/by hand/)
  })

  it('reports an HTTP failure without pretending it decoded', async () => {
    const r = await decodeVin('1C6SRFJT8RN123456', { fetchImpl: async () => ({ ok: false, status: 503 }) })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/503/)
  })

  it('rejects a malformed VIN before spending a request', async () => {
    let called = false
    const r = await decodeVin('nope', { fetchImpl: async () => { called = true; return ok({}) } })
    expect(r.ok).toBe(false)
    expect(called).toBe(false)
  })

  it('discards an implausible model year', async () => {
    const r = await decodeVin('1C6SRFJT8RN123456', {
      fetchImpl: async () => ok({ Make: 'RAM', Model: '1500', ModelYear: '0' }),
    })
    expect(r.modelYear).toBeNull()
  })
})

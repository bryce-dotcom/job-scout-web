import { describe, it, expect } from 'vitest'
import { exemptUnits, verificationRequiredFor, anyUnitRequiresVerification } from './verificationPolicy'

const UNITS = ['Energy Scout', 'HHH Building Services']

describe('SAFETY: nothing configured means nothing changes', () => {
  it('requires verification for every unit when the setting is absent', () => {
    for (const v of [undefined, null, '', '[]', [], 'null']) {
      expect(verificationRequiredFor('Energy Scout', v)).toBe(true)
      expect(verificationRequiredFor('HHH Building Services', v)).toBe(true)
      expect(verificationRequiredFor(null, v)).toBe(true)
      expect(anyUnitRequiresVerification(UNITS, v)).toBe(true)
    }
  })

  it('keeps unknown or blank business units gated', () => {
    const setting = JSON.stringify(['HHH Building Services'])
    expect(verificationRequiredFor(null, setting)).toBe(true)
    expect(verificationRequiredFor('', setting)).toBe(true)
    expect(verificationRequiredFor('Some New Division', setting)).toBe(true)
  })
})

describe('exempting a single unit', () => {
  const setting = JSON.stringify(['HHH Building Services'])

  it('drops the requirement only for that unit', () => {
    expect(verificationRequiredFor('HHH Building Services', setting)).toBe(false)
    expect(verificationRequiredFor('Energy Scout', setting)).toBe(true)
  })

  it('matches case- and whitespace-insensitively', () => {
    expect(verificationRequiredFor('  hhh building services ', setting)).toBe(false)
    expect(verificationRequiredFor('HHH BUILDING SERVICES', setting)).toBe(false)
  })

  it('still reports that some unit needs verification', () => {
    expect(anyUnitRequiresVerification(UNITS, setting)).toBe(true)
  })
})

describe('exempting every unit', () => {
  const setting = JSON.stringify(UNITS)
  it('turns the daily check off too', () => {
    expect(anyUnitRequiresVerification(UNITS, setting)).toBe(false)
  })
})

describe('exemptUnits parsing', () => {
  it('accepts a JSON array, a comma string, an array, or objects with name', () => {
    expect(exemptUnits('["A","B"]')).toEqual(['A', 'B'])
    expect(exemptUnits('A, B')).toEqual(['A', 'B'])
    expect(exemptUnits(['A', 'B'])).toEqual(['A', 'B'])
    expect(exemptUnits([{ name: 'A' }, { name: 'B' }])).toEqual(['A', 'B'])
  })

  it('ignores junk instead of throwing', () => {
    expect(exemptUnits('{not json')).toEqual(['{not json'])
    expect(exemptUnits(null)).toEqual([])
    expect(exemptUnits(42)).toEqual([])
    expect(exemptUnits(['', '  ', null])).toEqual([])
  })
})

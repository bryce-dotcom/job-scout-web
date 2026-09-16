import { describe, it, expect } from 'vitest'
import { zelleSenderName, matchCustomerName } from './zelleSender'

describe('zelleSenderName', () => {
  it('reads the common bank descriptors', () => {
    expect(zelleSenderName({ name: 'Zelle payment from DANA SMITH for INV-1042' })).toBe('Dana Smith')
    expect(zelleSenderName({ name: 'ZELLE FROM SMITH DANA' })).toBe('Smith Dana')
    expect(zelleSenderName({ name: 'Zelle Transfer Conf# abc123; Dana Smith' })).toBe('Dana Smith')
  })
  it('returns null for non-Zelle rows and rows with no name left', () => {
    expect(zelleSenderName({ name: 'VENMO CASHOUT' })).toBe(null)
    expect(zelleSenderName({ name: 'Zelle payment' })).toBe(null)
    expect(zelleSenderName(null)).toBe(null)
  })
})

describe('matchCustomerName', () => {
  const customers = [{ name: 'Dana Smith' }, { name: 'Smith Electrical LLC' }, { name: 'Northbridge Dental' }]
  it('matches on two shared name words, in either order', () => {
    expect(matchCustomerName('Dana Smith', customers)?.candidate.name).toBe('Dana Smith')
    expect(matchCustomerName('Smith Dana', customers)?.candidate.name).toBe('Dana Smith')
  })
  it('does not match a lone surname shared by two customers', () => {
    expect(matchCustomerName('Smith', customers)).toBe(null)
  })
  it('matches a single-word business name', () => {
    expect(matchCustomerName('Northbridge', customers)?.candidate.name).toBe('Northbridge Dental')
  })
  it('returns null when nothing fits', () => {
    expect(matchCustomerName('Pat Jones', customers)).toBe(null)
    expect(matchCustomerName('', customers)).toBe(null)
  })
})

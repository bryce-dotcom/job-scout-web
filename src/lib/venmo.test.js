import { describe, it, expect } from 'vitest'
import { normalizeVenmoHandle, venmoPayUrl, venmoSmsBody } from './venmo'

describe('normalizeVenmoHandle — whatever gets pasted, store the bare username', () => {
  it('strips a leading @', () => {
    expect(normalizeVenmoHandle('@Acme-Services')).toBe('Acme-Services')
  })
  it('strips profile URLs, with or without /u/', () => {
    expect(normalizeVenmoHandle('https://venmo.com/Acme-Services')).toBe('Acme-Services')
    expect(normalizeVenmoHandle('https://venmo.com/u/Acme-Services?utm=x')).toBe('Acme-Services')
    expect(normalizeVenmoHandle('venmo.com/Acme-Services')).toBe('Acme-Services')
  })
  it('drops whitespace and tolerates empty input', () => {
    expect(normalizeVenmoHandle('  Acme Services ')).toBe('AcmeServices')
    expect(normalizeVenmoHandle('')).toBe('')
    expect(normalizeVenmoHandle(null)).toBe('')
  })
})

describe('venmoPayUrl', () => {
  it('prefills recipient, amount and note', () => {
    expect(venmoPayUrl({ handle: '@Acme-Services', amount: '125.5', note: 'INV-1042' }))
      .toBe('https://venmo.com/Acme-Services?txn=pay&amount=125.50&note=INV-1042')
  })
  it('omits amount when it is missing or zero', () => {
    expect(venmoPayUrl({ handle: 'Acme', amount: '', note: 'INV-1' })).toBe('https://venmo.com/Acme?txn=pay&note=INV-1')
    expect(venmoPayUrl({ handle: 'Acme', amount: 0 })).toBe('https://venmo.com/Acme?txn=pay')
  })
  it('returns null without a handle, so callers can hide the button', () => {
    expect(venmoPayUrl({ handle: '', amount: 10 })).toBe(null)
  })
})

describe('venmoSmsBody', () => {
  it('gives the customer the handle, amount, note and link', () => {
    const body = venmoSmsBody({ customerName: 'Dana', handle: 'Acme', amount: 200, note: 'INV-7' })
    expect(body).toContain('Hi Dana')
    expect(body).toContain('@Acme')
    expect(body).toContain('$200.00')
    expect(body).toContain('"INV-7"')
    expect(body).toContain('https://venmo.com/Acme?txn=pay&amount=200.00&note=INV-7')
  })
})

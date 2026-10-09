import { describe, it, expect } from 'vitest'
import { usd, estimatePhrase, estimateSubject } from '../../supabase/functions/_shared/estimateDescriptor.ts'

// Bryce: "the follow up email should say something about the estimate instead
// of just a number... i whouldnt know what the fuck you were following up on by
// just a number." The emails said "Estimate EST-MTVT2OBE" and nothing else.

describe('naming the estimate', () => {
  it('says what it is and what it costs, using real HHH data', () => {
    expect(estimatePhrase({ quoteNumber: 'EST-MTVT2OBE', serviceType: 'Energy Efficiency', amount: 73450.28, lineCount: 5 }))
      .toBe('your Energy Efficiency estimate — 5 items, $73,450 (EST-MTVT2OBE)')
  })

  it('keeps the number, because the office quotes it on the phone', () => {
    expect(estimatePhrase({ quoteNumber: 'EST-MUPW7T4U', serviceType: 'Energy Efficiency', amount: 6026.4 }))
      .toContain('(EST-MUPW7T4U)')
  })

  it('drops a missing piece without breaking the sentence', () => {
    // 56 of the 75 followed-up estimates are missing something.
    expect(estimatePhrase({ quoteNumber: 'EST-X', amount: 8559.38 })).toBe('your estimate — $8,559 (EST-X)')
    expect(estimatePhrase({ quoteNumber: 'EST-X', serviceType: 'Energy Efficiency' })).toBe('your Energy Efficiency estimate (EST-X)')
    expect(estimatePhrase({ quoteNumber: 'EST-X' })).toBe('your estimate (EST-X)')
    expect(estimatePhrase({})).toBe('your estimate')
    expect(estimatePhrase()).toBe('your estimate')
  })

  it('does not say "1 items"', () => {
    expect(estimatePhrase({ quoteNumber: 'EST-X', amount: 500, lineCount: 1 })).toBe('your estimate — $500 (EST-X)')
  })

  it('never uses estimate_name, which holds the CUSTOMER\'s own name', () => {
    // 'siding solutions & construction' addressed to siding solutions reads
    // like a mistake, so the field is not consulted at all.
    const phrase = estimatePhrase({ quoteNumber: 'EST-X', serviceType: 'Energy Efficiency', amount: 100 })
    expect(phrase).not.toMatch(/siding|FBM|RED-E/i)
  })
})

describe('the money', () => {
  it('is whole dollars — cents are noise at this size', () => {
    expect(usd(73450.28)).toBe('$73,450')
    expect(usd(6026.4)).toBe('$6,026')
    expect(usd(500)).toBe('$500')
  })

  it('says nothing rather than $0 or NaN', () => {
    expect(usd(0)).toBe('')
    expect(usd(null)).toBe('')
    expect(usd(undefined)).toBe('')
    expect(usd('')).toBe('')
    expect(usd('not money')).toBe('')
    expect(usd(-20)).toBe('')
  })

  it('reads a numeric string, because PostgREST returns numerics as text', () => {
    expect(usd('73450.28')).toBe('$73,450')
  })
})

describe('the subject line', () => {
  it('carries the money, which is what gets a third email opened', () => {
    expect(estimateSubject('Following up', { serviceType: 'Energy Efficiency', amount: 73450.28 }))
      .toBe('Following up: Energy Efficiency estimate — $73,450')
  })

  it('still reads with nothing known', () => {
    expect(estimateSubject('Following up', {})).toBe('Following up: estimate')
  })
})

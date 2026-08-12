import { describe, it, expect } from 'vitest'
import {
  sanitizeClaim, sanitizeValueSection, findClaimLeaks, stripMoney, softenPromises,
  TAX_DISCLAIMER, VALUE_KINDS,
} from './valueClaims'

// This section goes onto a document a customer signs. The model writes the
// copy, so the copy has to be filtered — the proposal generator already
// learned that a prompt is a request, not a constraint.

describe('a tax claim can never carry a number', () => {
  it('strips a dollar figure the model invented', () => {
    const c = sanitizeClaim({
      kind: 'tax',
      title: 'Section 179D',
      detail: 'You qualify for a $12,000 deduction this year.',
    })
    expect(c.detail).not.toMatch(/\$|12,000/)
    expect(findClaimLeaks({ claims: [c] })).toEqual([])
  })

  it('strips a percentage too', () => {
    const c = sanitizeClaim({ kind: 'tax', detail: 'Write off 60% of the cost immediately.' })
    expect(c.detail).not.toMatch(/60\s?%/)
  })

  it('always attaches the advisor line', () => {
    expect(sanitizeClaim({ kind: 'tax', detail: 'May qualify for accelerated depreciation.' }).disclaimer)
      .toBe(TAX_DISCLAIMER)
  })
})

describe('property and rent claims describe, never promise', () => {
  it('turns a promise into a typical case', () => {
    const c = sanitizeClaim({
      kind: 'property_value',
      detail: 'This will increase your building value and is worth more at sale.',
    })
    expect(c.detail).toContain('typically increases')
    expect(c.detail).not.toMatch(/will increase/i)
    expect(c.detail).not.toMatch(/\bis worth\b/)
  })

  it('removes a hard figure and demands a basis', () => {
    const c = sanitizeClaim({ kind: 'property_value', detail: 'Adds $40,000 to the appraisal.' })
    expect(c.detail).not.toMatch(/40,000/)
    expect(c.basis).toBeTruthy()
  })

  it('strips a guarantee', () => {
    expect(softenPromises('Guaranteed higher rents')).not.toMatch(/guarantee/i)
  })
})

describe('the soft reasons may keep their numbers', () => {
  it('leaves productivity and maintenance copy alone', () => {
    // "cuts callbacks by 30%" is an operational claim about our own work, not
    // a statement about someone's taxes or their appraisal.
    const c = sanitizeClaim({ kind: 'maintenance', detail: 'Cuts relamping callbacks by 30% in year one.' })
    expect(c.detail).toContain('30%')
    expect(VALUE_KINDS.maintenance.allowsMoney).toBe(true)
  })
})

describe('what gets rejected outright', () => {
  it('drops a category the model invented', () => {
    expect(sanitizeClaim({ kind: 'crypto_yield', detail: 'Big returns.' })).toBeNull()
  })

  it('drops an empty claim', () => {
    expect(sanitizeClaim({ kind: 'tax', detail: '' })).toBeNull()
    expect(sanitizeClaim(null)).toBeNull()
  })

  it('returns null for a section where nothing survives', () => {
    expect(sanitizeValueSection({ claims: [{ kind: 'nope', detail: 'x' }] })).toBeNull()
    expect(sanitizeValueSection(null)).toBeNull()
  })
})

describe('the whole section', () => {
  const section = sanitizeValueSection({
    heading: 'Beyond the energy savings',
    content: 'This project will increase your property value by $50,000.',
    claims: [
      { kind: 'tax', detail: 'Claim a $12,000 179D deduction.' },
      { kind: 'property_value', detail: 'Guaranteed to add 5% to your appraisal.' },
      { kind: 'appearance', detail: 'A building that looks cared for.' },
      { kind: 'made_up', detail: 'Nonsense.' },
    ],
  })

  it('keeps the valid claims and drops the invented one', () => {
    expect(section.claims.map(c => c.kind)).toEqual(['tax', 'property_value', 'appearance'])
  })

  it('cleans the section intro as well as the claims', () => {
    expect(section.content).not.toMatch(/50,000/)
    expect(section.content).not.toMatch(/will increase/i)
  })

  it('leaks nothing', () => {
    expect(findClaimLeaks(section)).toEqual([])
  })

  it('caps the list so it stays persuasive', () => {
    const many = sanitizeValueSection({
      claims: Array.from({ length: 12 }, () => ({ kind: 'appearance', detail: 'Looks better.' })),
    })
    expect(many.claims.length).toBeLessThanOrEqual(6)
  })
})

describe('stripMoney', () => {
  it('handles the shapes a model actually writes', () => {
    expect(stripMoney('$1,200')).not.toMatch(/1,200/)
    expect(stripMoney('1200 dollars')).not.toMatch(/1200/)
    expect(stripMoney('up to 15%')).not.toMatch(/15\s?%/)
  })
})

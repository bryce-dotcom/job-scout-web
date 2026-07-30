import { describe, it, expect } from 'vitest'
import { isContractor, hasW9, w9Status, contractorsMissingW9 } from './w9Status'

const w2 = { name: 'Tracy', tax_classification: 'W2' }
const done = { name: 'Angeline', tax_classification: '1099', w9_legal_name: 'Angeline Putnam', ssn_last4: '1234' }
const bare = { name: 'Noah', tax_classification: '1099' }

describe('isContractor', () => {
  it('recognises 1099 / contractor, not W-2', () => {
    expect(isContractor(bare)).toBe(true)
    expect(isContractor({ tax_classification: 'contractor' })).toBe(true)
    expect(isContractor(w2)).toBe(false)
    expect(isContractor({})).toBe(false)
    expect(isContractor(null)).toBe(false)
  })
})

describe('hasW9', () => {
  it('needs BOTH a legal name and some taxpayer ID', () => {
    expect(hasW9(done)).toBe(true)
    expect(hasW9(bare)).toBe(false)
    expect(hasW9({ w9_legal_name: 'Only Name' })).toBe(false)          // no TIN
    expect(hasW9({ ssn_last4: '1234' })).toBe(false)                   // no name
    expect(hasW9({ w9_legal_name: '   ', ssn_last4: '1234' })).toBe(false) // blank name
  })

  it('accepts a business EIN or an encrypted SSN as the taxpayer ID', () => {
    expect(hasW9({ w9_legal_name: 'Pup Dog LLC', w9_ein_last4: '1871' })).toBe(true)
    expect(hasW9({ w9_legal_name: 'Someone', ssn_encrypted: 'enc::abc' })).toBe(true)
  })
})

describe('w9Status', () => {
  it('classifies each employee', () => {
    expect(w9Status(w2)).toBe('not_required')
    expect(w9Status(done)).toBe('on_file')
    expect(w9Status(bare)).toBe('missing')
  })
})

describe('contractorsMissingW9', () => {
  it('lists only active contractors without a W-9', () => {
    const list = contractorsMissingW9([w2, done, bare, { name: 'Gone', tax_classification: '1099', active: false }])
    expect(list.map((e) => e.name)).toEqual(['Noah'])
  })

  it('is empty when everyone is covered', () => {
    expect(contractorsMissingW9([w2, done])).toEqual([])
    expect(contractorsMissingW9([])).toEqual([])
  })
})

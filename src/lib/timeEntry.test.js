import { describe, it, expect } from 'vitest'
import { validateTimeEntry, MAX_ENTRY_HOURS } from './timeEntry'

// Every case here is a row that actually exists in time_log.

describe('what the typed hours box refuses', () => {
  it('refuses a whole-job total typed as one person (job 12798 was 55.52h x5)', () => {
    const r = validateTimeEntry({ employee_id: 19, hours: 55.52 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/per person/i)
  })

  it('refuses negative hours, and says how to reverse an entry instead', () => {
    const r = validateTimeEntry({ employee_id: 55, hours: -3 })
    expect(r.ok).toBe(false)
    expect(r.error).toMatch(/edit or delete/i)
  })

  it('refuses zero', () => {
    expect(validateTimeEntry({ employee_id: 1, hours: 0 }).ok).toBe(false)
  })

  it('refuses a missing person — hours have to belong to someone', () => {
    expect(validateTimeEntry({ hours: 5 }).ok).toBe(false)
  })

  it('refuses text', () => {
    expect(validateTimeEntry({ employee_id: 1, hours: 'all day' }).ok).toBe(false)
  })
})

describe('what it allows', () => {
  it('an ordinary shift', () => {
    expect(validateTimeEntry({ employee_id: 1, hours: 7.5 }).ok).toBe(true)
  })

  it('a long but possible day, right up to the limit', () => {
    expect(validateTimeEntry({ employee_id: 1, hours: MAX_ENTRY_HOURS }).ok).toBe(true)
  })

  it('a short visit', () => {
    expect(validateTimeEntry({ employee_id: 1, hours: 0.25 }).ok).toBe(true)
  })

  it('accepts hours typed as a string, which is what an input gives you', () => {
    expect(validateTimeEntry({ employee_id: 1, hours: '6' }).ok).toBe(true)
  })
})

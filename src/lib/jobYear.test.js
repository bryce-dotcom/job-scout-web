import { describe, it, expect } from 'vitest'
import { jobYear, availableJobYears } from './jobYear'

describe('jobYear', () => {
  it('prefers the scheduled start', () => {
    expect(jobYear({ start_date: '2024-06-01', completed_at: '2025-01-01', created_at: '2023-01-01' })).toBe(2024)
  })

  it('falls back to completed, then created', () => {
    expect(jobYear({ completed_at: '2025-03-04', created_at: '2023-01-01' })).toBe(2025)
    expect(jobYear({ created_at: '2023-01-01' })).toBe(2023)
  })

  // The jobs that went missing: scheduled into next year.
  it('gives a future-dated job its real year', () => {
    expect(jobYear({ start_date: '2027-04-01' })).toBe(2027)
    expect(jobYear({ start_date: '2032-01-15' })).toBe(2032)
  })

  it('returns null when there is no date at all', () => {
    expect(jobYear({})).toBeNull()
    expect(jobYear(null)).toBeNull()
    expect(jobYear({ start_date: null, completed_at: null, created_at: null })).toBeNull()
  })

  it('returns null for a year that is data damage, not a schedule', () => {
    expect(jobYear({ start_date: '1970-01-01' })).toBeNull()
    expect(jobYear({ start_date: 'not a date' })).toBeNull()
  })
})

describe('availableJobYears', () => {
  it('offers a button for a job scheduled next year', () => {
    // The old code clamped to `y <= this year`, which is what hid these.
    const years = availableJobYears([{ start_date: '2027-04-01' }])
    expect(years).toContain(2027)
  })

  it('is newest first and has no duplicates', () => {
    const years = availableJobYears([
      { start_date: '2024-01-01' }, { start_date: '2024-08-01' },
      { start_date: '2026-01-01' }, { start_date: '2022-01-01' },
    ])
    expect(years).toEqual([2026, 2024, 2022])
  })

  it('offers nothing for jobs with no usable date', () => {
    expect(availableJobYears([{}, { start_date: '1970-01-01' }])).toEqual([])
  })

  // THE invariant. This is exactly what Alayda reported failing: the Active
  // count and the sum over the year buttons have to agree.
  it('every dated job is reachable by clicking exactly one year', () => {
    const jobs = [
      { id: 1, start_date: '2027-04-01' },              // future — used to vanish
      { id: 2, start_date: '2032-01-15' },              // far future — used to vanish
      { id: 3, completed_at: '2019-06-01' },            // before the old 2020 floor
      { id: 4, created_at: '2026-02-02' },
      { id: 5, start_date: '2024-05-05', created_at: '2026-01-01' },
      { id: 6, start_date: null, completed_at: null, created_at: '2021-09-09' },
    ]
    const years = availableJobYears(jobs)
    for (const j of jobs) {
      const hits = years.filter(y => jobYear(j) === y)
      expect(hits, `job ${j.id} must be reachable under exactly one year`).toHaveLength(1)
    }
    // and the counts add up, which is the thing she was checking by hand
    const summed = years.reduce((n, y) => n + jobs.filter(j => jobYear(j) === y).length, 0)
    expect(summed).toBe(jobs.length)
  })

  it('an undated job is counted nowhere, and that is honest', () => {
    const jobs = [{ id: 1, start_date: '2026-01-01' }, { id: 2 }]
    const years = availableJobYears(jobs)
    const summed = years.reduce((n, y) => n + jobs.filter(j => jobYear(j) === y).length, 0)
    expect(summed).toBe(1)
  })
})

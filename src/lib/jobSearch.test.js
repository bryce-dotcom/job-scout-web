import { describe, it, expect } from 'vitest'
import { normalizeSearch, matchesJobSearch, jobSearchRank, searchJobs, jobSearchFields } from './jobSearch'

// Shapes taken from real rows: customer_name/business_name are often null and
// the identity arrives through the joined customer.
const COSTCO = {
  job_id: '8631',
  job_title: 'Commercial Window Cleaning  - Store Front/Commercial Exterior Window Cleaning',
  customer_name: null,
  business_name: null,
  customer: { business_name: 'Syracuse Costco', phone: '(801) 555-1234' },
  job_address: '45 W S Temple St, Salt Lake City, UT 84101',
  status: 'Completed',
  business_unit: 'HHH Building Services',
}
const OBRIEN = {
  job_id: 'JOB-MQ5NYH9R',
  job_title: 'Highbay Retrofit',
  customer: { name: "O'Brien Manufacturing" },
  job_address: '900 S Draper Ln, Draper, UT',
  status: 'Scheduled',
  assigned_team: 'Crew B',
}
const JOBS = [COSTCO, OBRIEN]

describe('typing more words narrows instead of emptying', () => {
  it('matches across DIFFERENT fields — the whole point', () => {
    // "costco draper" style: customer from one field, place from another.
    // The old single-substring matcher returned nothing for this.
    expect(matchesJobSearch(OBRIEN, 'obrien draper')).toBe(true)
    expect(matchesJobSearch(COSTCO, 'costco temple')).toBe(true)
  })

  it('still rejects when one word matches nothing', () => {
    expect(matchesJobSearch(COSTCO, 'costco draper')).toBe(false)
  })

  it('ignores word order', () => {
    expect(matchesJobSearch(COSTCO, 'temple costco')).toBe(true)
  })

  it('an empty search keeps everything', () => {
    expect(matchesJobSearch(COSTCO, '')).toBe(true)
    expect(matchesJobSearch(COSTCO, '   ')).toBe(true)
  })
})

describe('punctuation should never lose a job', () => {
  it("finds O'Brien typed as OBrien and vice versa", () => {
    expect(matchesJobSearch(OBRIEN, 'obrien')).toBe(true)
    expect(matchesJobSearch(OBRIEN, "o'brien")).toBe(true)
    expect(matchesJobSearch(OBRIEN, 'o’brien')).toBe(true)   // curly apostrophe
  })

  it('folds the double space in a real job title', () => {
    expect(normalizeSearch('Commercial Window Cleaning  - Store Front')).toBe('commercial window cleaning store front')
  })
})

describe('phone numbers, however they were typed', () => {
  it('finds a stored (801) 555-1234 from digits', () => {
    expect(matchesJobSearch(COSTCO, '8015551234')).toBe(true)
    expect(matchesJobSearch(COSTCO, '5551234')).toBe(true)
  })

  it('does not match a number that is not there', () => {
    expect(matchesJobSearch(COSTCO, '9995551234')).toBe(false)
  })
})

describe('fields the old search ignored', () => {
  it('searches status, crew and business unit', () => {
    expect(matchesJobSearch(OBRIEN, 'scheduled')).toBe(true)
    expect(matchesJobSearch(OBRIEN, 'crew b')).toBe(true)
    expect(matchesJobSearch(COSTCO, 'hhh building')).toBe(true)
  })

  it('collects the joined customer as well as the flat columns', () => {
    // customer_name and business_name are null on the real row; identity comes
    // through the join, which is why searching the customer used to miss.
    const fields = jobSearchFields(COSTCO)
    expect(fields).toContain('Syracuse Costco')
  })
})

describe('the thing you searched for comes first', () => {
  it('puts an exact job number at the top', () => {
    const out = searchJobs([OBRIEN, COSTCO], '8631')
    expect(out[0]).toBe(COSTCO)
    expect(jobSearchRank(COSTCO, '8631')).toBe(0)
  })

  it('ranks a customer-name hit above a passing mention', () => {
    const noisy = { job_id: '1', job_title: 'Repair', notes: 'called Costco about parts' }
    const out = searchJobs([noisy, COSTCO], 'costco')
    expect(out[0]).toBe(COSTCO)
  })

  it('keeps the caller order within a rank', () => {
    const a = { job_id: 'a', customer: { name: 'Same Co' } }
    const b = { job_id: 'b', customer: { name: 'Same Co' } }
    expect(searchJobs([a, b], 'same co')).toEqual([a, b])
  })
})

describe('junk', () => {
  it('survives it', () => {
    expect(matchesJobSearch(null, 'x')).toBe(false)
    expect(matchesJobSearch({}, 'x')).toBe(false)
    expect(jobSearchFields(null)).toEqual([])
    expect(searchJobs(null, 'x')).toEqual([])
    expect(searchJobs(JOBS, null)).toEqual(JOBS)
  })
})

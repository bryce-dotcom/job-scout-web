import { describe, it, expect } from 'vitest'
import { jobTotalPolicy, linesTotalOf, adoptLinesTotal, manualTotal, jobGross } from './jobTotal'

// Demo job 23513, 16 Sep 2026: a $21,200 job with no lines got one $165 part
// and became a $165 job. 6,025 of HHH's priced jobs have no lines. A total no
// line produced is a person's number; lines added later never replace it.

const manual = { job_total: 21200, job_total_source: 'manual' }
const owned = { job_total: 21200, job_total_source: 'lines' }
const legacy = { job_total: 21200 }
const part = [{ total: 165 }]

describe('who owns the total', () => {
  it('a manual total is kept when a line shows up that does not match it', () => {
    expect(jobTotalPolicy(manual, part)).toMatchObject({ action: 'keep', stored: 21200, computed: 165 })
  })
  it('a line-owned total follows its lines', () => {
    expect(jobTotalPolicy(owned, part)).toMatchObject({ action: 'sync', computed: 165 })
  })
  it('a legacy total (no source recorded) behaves as it always did', () => {
    expect(jobTotalPolicy(legacy, part).action).toBe('sync')
  })
  it('nothing to do with no lines, or when the lines already agree', () => {
    expect(jobTotalPolicy(manual, []).action).toBe('none')
    expect(jobTotalPolicy(owned, [{ total: 21200 }]).action).toBe('none')
    expect(jobTotalPolicy(manual, [{ total: 21200 }]).action).toBe('none')
  })
  it('the lines total is net of the job discount, rounded to cents', () => {
    expect(linesTotalOf([{ total: 100 }, { total: 50.005 }], { discount: 20 })).toBe(130.01)
    expect(jobTotalPolicy({ job_total: 130.01, job_total_source: 'lines', discount: 20 }, [{ total: 100 }, { total: 50.005 }]).action).toBe('none')
  })
})

describe('the patches', () => {
  it('adopting the lines total makes the lines the owner', () => {
    expect(adoptLinesTotal(21365)).toEqual({ job_total: 21365, job_total_source: 'lines' })
  })
  it('a typed total is manual', () => {
    expect(manualTotal('4,500'.replace(',', ''))).toEqual({ job_total: 4500, job_total_source: 'manual' })
  })
})

describe('what the job bills for (jobGross)', () => {
  it('a manual price with incidental lines bills the price; line-owned bills the lines', () => {
    expect(jobGross({ job_total: 1650, job_total_source: 'manual' }, [{ total: 165 }])).toBe(1650)
    expect(jobGross({ job_total: 165, job_total_source: 'lines' }, [{ total: 165 }])).toBe(165)
    expect(jobGross({ job_total: 999 }, [{ total: 100 }, { total: 65 }])).toBe(165)   // legacy: the lines
  })
  it('with no lines it is the total, which is what every invoice path already did', () => {
    expect(jobGross({ job_total: 1650, job_total_source: 'manual' }, [])).toBe(1650)
    expect(jobGross({ job_total: 1650 }, null)).toBe(1650)
  })
  it('is before the job-level discount — the footer and the invoice take the discount off it', () => {
    expect(jobGross({ job_total: 1650, job_total_source: 'manual', discount: 100 }, [{ total: 165 }])).toBe(1650)
  })
})

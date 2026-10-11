import { describe, it, expect } from 'vitest'
import { costingKey, buildJobCostIndex, profitOnJobs } from './eosProfit'
import { jobCosting } from './reports'

describe('costingKey matches what jobCosting calls a row', () => {
  it('uses the human job id, falling back to the database id', () => {
    expect(costingKey({ job_id: 'JOB-ABC', id: 7 })).toBe('JOB-ABC')
    expect(costingKey({ id: 7 })).toBe('#7')
  })
})

describe('buildJobCostIndex', () => {
  it('keeps cost null when nothing was captured, which is not zero', () => {
    const idx = buildJobCostIndex([{ job: 'J-1', total_cost: null, labor_hours: null }])
    expect(idx.get('J-1')).toEqual({ cost: null, hours: 0, hasCost: false })
  })

  it('strips the indent jobCosting puts on a child row', () => {
    // A service visit renders as "  └ J-2" under its parent install.
    const idx = buildJobCostIndex([{ job: '  └ J-2', total_cost: 100, labor_hours: 2 }])
    expect(idx.has('J-2')).toBe(true)
    expect(idx.get('J-2').cost).toBe(100)
  })
})

describe('profitOnJobs — one set of jobs, asked one question', () => {
  const index = buildJobCostIndex([
    { job: 'J-1', total_cost: 3000, labor_hours: 40 },
    { job: 'J-2', total_cost: 2000, labor_hours: 60 },
    { job: 'J-3', total_cost: null, labor_hours: null },
  ])

  it('is worth minus cost, over the jobs whose cost is known', () => {
    // Bryce's example: finished work worth 10,000 that cost 5,000.
    const r = profitOnJobs([
      { job_id: 'J-1', job_total: 6000 },
      { job_id: 'J-2', job_total: 4000 },
    ], index)
    expect(r.value).toBe(10000)
    expect(r.cost).toBe(5000)
    expect(r.profit).toBe(5000)
    expect(r.margin).toBe(0.5)
  })

  it('divides that profit by the hours on THOSE jobs', () => {
    const r = profitOnJobs([
      { job_id: 'J-1', job_total: 6000 },
      { job_id: 'J-2', job_total: 4000 },
    ], index)
    expect(r.hours).toBe(100)
    expect(r.profitPerHour).toBe(50)
  })

  it('leaves a job with no cost recorded OUT, and counts it', () => {
    // Counting it as pure profit is what reported an 80% margin on HHH.
    const r = profitOnJobs([
      { job_id: 'J-1', job_total: 6000 },
      { job_id: 'J-3', job_total: 9549 },
    ], index)
    expect(r.value).toBe(6000)
    expect(r.profit).toBe(3000)
    expect(r.uncosted).toBe(1)
    expect(r.uncostedValue).toBe(9549)
  })

  it('treats a job missing from the index as uncosted, not as free', () => {
    const r = profitOnJobs([{ job_id: 'NEVER-SEEN', job_total: 500 }], index)
    expect(r.costed).toBe(0)
    expect(r.uncosted).toBe(1)
    expect(r.profit).toBe(0)
  })

  it('reports a loss as a loss', () => {
    const r = profitOnJobs([{ job_id: 'J-2', job_total: 1500 }], index)
    expect(r.profit).toBe(-500)
    expect(r.profitPerHour).toBeCloseTo(-8.33, 2)
  })

  it('never divides by zero hours', () => {
    const noHours = buildJobCostIndex([{ job: 'J-9', total_cost: 100, labor_hours: 0 }])
    expect(profitOnJobs([{ job_id: 'J-9', job_total: 500 }], noHours).profitPerHour).toBe(0)
  })

  it('returns zeros for an empty or junk list', () => {
    expect(profitOnJobs([], index).profit).toBe(0)
    expect(profitOnJobs(null, index).profit).toBe(0)
    expect(profitOnJobs([null], index).uncosted).toBe(0)
  })
})

describe('end to end against the real cost rule', () => {
  // Proves the key convention matches jobCosting's output rather than
  // assuming it: a mismatch here would silently report every job uncosted.
  const jobs = [{ id: 10, job_id: 'J-10', job_title: 'Retrofit', status: 'Completed', job_total: 10000 }]
  const jobLines = [{ job_id: 10, item_id: 101, quantity: 2, labor_cost: 0 }]
  const products = [{ id: 101, cost: 1500, material_or_labor: 'material' }]

  it('finds the job jobCosting costed, and subtracts from the job total', () => {
    const report = jobCosting({ jobs, jobLines, products, productComponents: [], payments: [], invoices: [] })
    const index = buildJobCostIndex(report.rows)
    const r = profitOnJobs(jobs, index)
    expect(r.costed).toBe(1)
    expect(r.cost).toBe(3000)
    expect(r.profit).toBe(7000)
  })
})

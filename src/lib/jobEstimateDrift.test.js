import { describe, it, expect } from 'vitest'
import { jobEstimateDrift } from './jobEstimateDrift'

const PRODUCTS = [
  { id: 1436, name: 'SMBE 40/53/68/80W Linear Strip - 8ft w/ Controls' },
  { id: 1496, name: 'SMBE 24/32/40W Linear Strip - 4ft w/ Controls' },
  { id: 1441, name: 'SMBE 30/60/90/120W Wallpack SHOEBOX' },
]

// The real Four Pines shape: the job holds the 4ft the estimate held on the day
// it was created; the estimate was revised to 8ft a fortnight later.
describe('Four Pines', () => {
  const jobLines = [{ item_id: 1441, quantity: 6 }, { item_id: 1496, quantity: 31 }]
  const quoteLines = [{ item_id: 1441, quantity: 6 }, { item_id: 1436, quantity: 31 }]

  it('names the product on each side rather than just saying they differ', () => {
    const d = jobEstimateDrift(jobLines, quoteLines, PRODUCTS)
    expect(d.hasDrift).toBe(true)
    expect(d.onlyOnEstimate.map((x) => x.name)).toEqual(['SMBE 40/53/68/80W Linear Strip - 8ft w/ Controls'])
    expect(d.onlyOnJob.map((x) => x.name)).toEqual(['SMBE 24/32/40W Linear Strip - 4ft w/ Controls'])
  })

  it('leaves the line they agree on out of it', () => {
    const d = jobEstimateDrift(jobLines, quoteLines, PRODUCTS)
    const all = [...d.onlyOnEstimate, ...d.onlyOnJob, ...d.quantityDiffers]
    expect(all.some((x) => String(x.item_id) === '1441')).toBe(false)
  })
})

describe('a job that matches its estimate says nothing', () => {
  it('reports no drift when the two agree', () => {
    const lines = [{ item_id: 1441, quantity: 6 }, { item_id: 1436, quantity: 31 }]
    expect(jobEstimateDrift(lines, lines, PRODUCTS).hasDrift).toBe(false)
  })

  it('does not care about row order or how the lines are split', () => {
    const job = [{ item_id: 1436, quantity: 20 }, { item_id: 1436, quantity: 11 }]
    const quote = [{ item_id: 1436, quantity: 31 }]
    expect(jobEstimateDrift(job, quote, PRODUCTS).hasDrift).toBe(false)
  })
})

describe('quantity changes are their own kind of difference', () => {
  it('reports both sides of a quantity change', () => {
    const d = jobEstimateDrift([{ item_id: 1436, quantity: 25 }], [{ item_id: 1436, quantity: 31 }], PRODUCTS)
    expect(d.quantityDiffers).toEqual([{
      item_id: '1436', name: 'SMBE 40/53/68/80W Linear Strip - 8ft w/ Controls', estimate: 31, job: 25,
    }])
    expect(d.onlyOnJob).toHaveLength(0)
  })
})

// Out-of-scope work is the common, legitimate reason a job differs — which is
// why this reports instead of reconciling. Wiping it would be the worse bug.
describe('extra work on the job is reported, not treated as an error', () => {
  it('lists work the job has and the estimate never did', () => {
    const d = jobEstimateDrift(
      [{ item_id: 1436, quantity: 31 }, { item_id: 1441, quantity: 2 }],
      [{ item_id: 1436, quantity: 31 }], PRODUCTS)
    expect(d.onlyOnJob.map((x) => x.name)).toEqual(['SMBE 30/60/90/120W Wallpack SHOEBOX'])
    expect(d.onlyOnEstimate).toHaveLength(0)
  })
})

describe('it cannot fall over on real rows', () => {
  it('ignores custom lines with no product', () => {
    const d = jobEstimateDrift(
      [{ description: 'Trip charge', quantity: 1 }],
      [{ description: 'Trip charge', quantity: 1 }], PRODUCTS)
    expect(d.hasDrift).toBe(false)
  })

  it('survives empty and missing input', () => {
    expect(jobEstimateDrift([], [], PRODUCTS).hasDrift).toBe(false)
    expect(jobEstimateDrift(null, null, null).hasDrift).toBe(false)
    expect(jobEstimateDrift([{ item_id: 1436 }], [], PRODUCTS).onlyOnJob).toHaveLength(1)
  })

  it('falls back to an id when the product is not in the catalogue', () => {
    expect(jobEstimateDrift([{ item_id: 9999, quantity: 1 }], [], []).onlyOnJob[0].name).toBe('Product 9999')
  })

  it('matches ids across the string/number divide these tables carry', () => {
    expect(jobEstimateDrift([{ item_id: '1436', quantity: 31 }], [{ item_id: 1436, quantity: 31 }], PRODUCTS).hasDrift).toBe(false)
  })
})

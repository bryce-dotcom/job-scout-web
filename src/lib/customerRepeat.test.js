import { describe, it, expect } from 'vitest'
import { MIN_REPEAT, ID_BATCH, batchIds, countsByCustomer, repeatChip, customerIdsOf } from './customerRepeat'

describe('the chip only appears when it says something', () => {
  it('says nothing about a first job', () => {
    expect(repeatChip(1)).toBe(null)
    expect(repeatChip(0)).toBe(null)
    expect(repeatChip(null)).toBe(null)
    expect(repeatChip(undefined)).toBe(null)
  })

  it('appears from the second completed job', () => {
    expect(MIN_REPEAT).toBe(2)
    expect(repeatChip(2)).toEqual({ count: 2, label: '2 completed jobs for this customer' })
    expect(repeatChip(7).count).toBe(7)
  })

  it('survives junk instead of rendering NaN', () => {
    expect(repeatChip('lots')).toBe(null)
    expect(repeatChip({})).toBe(null)
  })
})

describe('reading the counts back', () => {
  it('keys them by customer', () => {
    expect(countsByCustomer([
      { customer_id: 4, completed_count: 7 },
      { customer_id: 9, completed_count: 2 },
    ])).toEqual({ 4: 7, 9: 2 })
  })

  it('reads a count that came back as a string', () => {
    // count(*) is a bigint, and PostgREST hands bigint back as a string.
    expect(countsByCustomer([{ customer_id: 4, completed_count: '7' }])).toEqual({ 4: 7 })
  })

  it('drops rows that mean nothing', () => {
    expect(countsByCustomer([
      { customer_id: null, completed_count: 5 },
      { customer_id: 4, completed_count: 0 },
      { customer_id: 5, completed_count: 'x' },
    ])).toEqual({})
    expect(countsByCustomer(null)).toEqual({})
    expect(countsByCustomer()).toEqual({})
  })
})

describe('asking in batches, because the row cap is real', () => {
  it('splits past the batch size', () => {
    const ids = Array.from({ length: 1076 }, (_, i) => i + 1)
    const batches = batchIds(ids)
    expect(batches).toHaveLength(3)
    expect(batches.flat()).toHaveLength(1076)
    expect(batches.every(b => b.length <= ID_BATCH)).toBe(true)
  })

  it('stays under the 1000-row response cap', () => {
    expect(ID_BATCH).toBeLessThan(1000)
  })

  it('is one batch, or none, for small inputs', () => {
    expect(batchIds([1, 2, 3])).toEqual([[1, 2, 3]])
    expect(batchIds([])).toEqual([])
    expect(batchIds(null)).toEqual([])
  })
})

describe('who to ask about', () => {
  it('takes each customer once', () => {
    expect(customerIdsOf([
      { customer_id: 4 }, { customer_id: 4 }, { customer_id: 9 },
    ])).toEqual([4, 9])
  })

  it('reads the embedded customer when the column is not there', () => {
    expect(customerIdsOf([{ customer: { id: 12 } }])).toEqual([12])
  })

  it('skips the jobs with no customer', () => {
    // 38 HHH jobs have no customer_id at all.
    expect(customerIdsOf([{ customer_id: null }, { customer_id: '' }, {}])).toEqual([])
    expect(customerIdsOf(null)).toEqual([])
  })
})

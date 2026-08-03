import { describe, it, expect } from 'vitest'
import {
  getDeliveredStatusIds, getOpenStatusIds, wonJobsInRange,
  deliveredJobsInRange, jobValue, sumJobTotal, startOfMonth, startOfYear, daysAgo,
} from './jobMetrics'

// ─────────────────────────────────────────────────────────────────────────
// Feeds the Dashboard and the EOS scorecard. The source records the failure
// that motivated it: a tenant with no `category` flags configured showed
// ZERO completed jobs while 18 a week were actually delivering, because the
// delivered set came back empty and silently matched nothing. An empty set
// must never be the answer here — the fallback is the whole point.
// ─────────────────────────────────────────────────────────────────────────

describe('resolving which statuses count as delivered', () => {
  it('uses the company config when categories are set', () => {
    const ids = getDeliveredStatusIds([
      { id: 'done', category: 'delivered' },
      { id: 'wip', category: 'open' },
    ])
    expect(ids.has('done')).toBe(true)
    expect(ids.has('wip')).toBe(false)
  })

  it('falls back to standard names when NOTHING is categorised', () => {
    // The 18-jobs-a-week bug: no flags configured must not mean "nothing
    // is ever delivered".
    const ids = getDeliveredStatusIds([{ id: 'wip', category: 'open' }])
    expect(ids.size).toBeGreaterThan(0)
    expect(ids.has('Completed')).toBe(true)
    expect(ids.has('Invoiced')).toBe(true)
  })

  it('falls back when job statuses are missing entirely', () => {
    expect(getDeliveredStatusIds(null).has('Completed')).toBe(true)
    expect(getDeliveredStatusIds(undefined).size).toBeGreaterThan(0)
  })

  it('never returns an empty delivered set', () => {
    for (const input of [null, undefined, [], [{}], [{ category: 'open' }]]) {
      expect(getDeliveredStatusIds(input).size).toBeGreaterThan(0)
    }
  })

  it('open statuses are everything not marked delivered', () => {
    const open = getOpenStatusIds([
      { id: 'done', category: 'delivered' },
      { id: 'wip', category: 'open' },
      { id: 'new' },
    ])
    expect(open.has('wip')).toBe(true)
    expect(open.has('new')).toBe(true)
    expect(open.has('done')).toBe(false)
  })
})

describe('wonJobsInRange — a half-open window', () => {
  const jobs = [
    { id: 1, created_at: '2026-07-01T00:00:00Z' },
    { id: 2, created_at: '2026-07-15T00:00:00Z' },
    { id: 3, created_at: '2026-08-01T00:00:00Z' },
    { id: 4, created_at: null },
  ]

  it('includes the start instant and EXCLUDES the end instant', () => {
    // Half-open, so consecutive months cannot double-count a job.
    const r = wonJobsInRange(jobs, '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z')
    expect(r.map(j => j.id)).toEqual([1, 2])
  })

  it('drops jobs with no created_at instead of counting them', () => {
    expect(wonJobsInRange(jobs, null, null).map(j => j.id)).toEqual([1, 2, 3])
  })

  it('treats a null bound as unbounded on that side', () => {
    expect(wonJobsInRange(jobs, '2026-07-10T00:00:00Z', null).map(j => j.id)).toEqual([2, 3])
    expect(wonJobsInRange(jobs, null, '2026-07-10T00:00:00Z').map(j => j.id)).toEqual([1])
  })

  it('accepts Date objects as well as strings', () => {
    const r = wonJobsInRange(jobs, new Date('2026-07-01T00:00:00Z'), new Date('2026-08-01T00:00:00Z'))
    expect(r).toHaveLength(2)
  })

  it('returns an empty array for junk input rather than throwing', () => {
    expect(wonJobsInRange(null, null, null)).toEqual([])
    expect(wonJobsInRange([{ created_at: 'not-a-date' }], null, null)).toEqual([])
  })
})

describe('deliveredJobsInRange', () => {
  const statuses = [{ id: 'Completed', category: 'delivered' }, { id: 'In Progress', category: 'open' }]
  const jobs = [
    { id: 1, status: 'Completed', last_status_change_at: '2026-07-10T00:00:00Z' },
    { id: 2, status: 'In Progress', last_status_change_at: '2026-07-10T00:00:00Z' },
    { id: 3, status: 'Completed', last_status_change_at: '2026-06-01T00:00:00Z' },
  ]

  it('counts only delivered jobs inside the window', () => {
    const r = deliveredJobsInRange(jobs, statuses, '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z')
    expect(r.map(j => j.id)).toEqual([1])
  })

  it('falls back to updated_at when last_status_change_at is missing', () => {
    const r = deliveredJobsInRange(
      [{ id: 9, status: 'Completed', updated_at: '2026-07-10T00:00:00Z' }],
      statuses, '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z',
    )
    expect(r.map(j => j.id)).toEqual([9])
  })

  it('still finds delivered jobs when the tenant configured no categories', () => {
    const r = deliveredJobsInRange(
      [{ id: 5, status: 'Invoiced', last_status_change_at: '2026-07-10T00:00:00Z' }],
      [], '2026-07-01T00:00:00Z', '2026-08-01T00:00:00Z',
    )
    expect(r).toHaveLength(1)
  })
})

describe('jobValue — a priced job never counts as $0', () => {
  it('uses the job total when it has one', () => {
    expect(jobValue({ job_total: 5000 })).toBe(5000)
  })

  it('falls back to the linked estimate when job_total is blank', () => {
    // A job converted before pricing would otherwise vanish from Sales Won.
    const quotes = new Map([[77, 8200]])
    expect(jobValue({ job_total: null, quote_id: 77 }, quotes)).toBe(8200)
    expect(jobValue({ job_total: 0, quote_id: 77 }, quotes)).toBe(8200)
  })

  it('prefers the job total over the estimate when both exist', () => {
    expect(jobValue({ job_total: 5000, quote_id: 77 }, new Map([[77, 8200]]))).toBe(5000)
  })

  it('returns 0 when there is nothing to value it by', () => {
    expect(jobValue({})).toBe(0)
    expect(jobValue(null)).toBe(0)
    expect(jobValue({ quote_id: 99 }, new Map())).toBe(0)
  })

  it('sums a list, applying the estimate fallback per job', () => {
    const quotes = new Map([[77, 8200]])
    expect(sumJobTotal([{ job_total: 1000 }, { quote_id: 77 }], quotes)).toBe(9200)
  })

  it('sums to 0 for an empty or null list', () => {
    expect(sumJobTotal([])).toBe(0)
    expect(sumJobTotal(null)).toBe(0)
  })
})

describe('date windows are local, not UTC', () => {
  // These feed "this month" / "this year" tiles. Building them from UTC
  // would put the boundary in the wrong day for a Denver tenant.
  const now = new Date(2026, 6, 15, 13, 30) // 15 Jul 2026, local

  it('startOfMonth is midnight on the 1st, local', () => {
    const d = startOfMonth(now)
    expect(d.getFullYear()).toBe(2026)
    expect(d.getMonth()).toBe(6)
    expect(d.getDate()).toBe(1)
    expect(d.getHours()).toBe(0)
  })

  it('startOfYear is 1 January, local', () => {
    const d = startOfYear(now)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)
  })

  it('daysAgo counts back the right number of days', () => {
    expect(Math.round((now - daysAgo(30, now)) / 86400000)).toBe(30)
  })
})

import { describe, it, expect } from 'vitest'
import {
  resolveJobStatuses, HIDDEN_JOB_STATUSES,
  statusCategory, normalizeStatuses, statusesToSave,
} from './jobStatusVocabulary'
import { getDeliveredStatusIds } from './jobMetrics'

// Company 3's real configured list, shortened to the tail that matters.
const CONFIGURED = [
  { id: 'Scheduled', name: 'Scheduled', color: '#5a6349' },
  { id: 'In Progress', name: 'In Progress', color: '#c28b38' },
  { id: 'Completed', name: 'Completed', color: '#4a7c59' },
  { id: 'Invoiced', name: 'Invoiced', color: '#5a6349' },
  { id: 'Paid', name: 'Paid', color: '#4a7c59' },
]

describe('resolveJobStatuses', () => {
  it('returns the configured list unchanged when nothing new is in the data', () => {
    const jobs = [{ status: 'Scheduled' }, { status: 'Completed' }, { status: 'Paid' }]
    expect(resolveJobStatuses(CONFIGURED, jobs)).toEqual(CONFIGURED)
  })

  it('is a no-op before jobs have loaded', () => {
    expect(resolveJobStatuses(CONFIGURED, [])).toEqual(CONFIGURED)
    expect(resolveJobStatuses(CONFIGURED, null)).toEqual(CONFIGURED)
  })

  // The actual bug. 126 HHH jobs sat at 'Invoiced' — written by InvoiceDetail
  // on send — while no tenant had it configured, so the board had no column
  // for them and getFilteredJobs dropped every one.
  it('gives an unconfigured status that exists in the data its own column', () => {
    const configured = CONFIGURED.filter((s) => s.id !== 'Invoiced')
    const jobs = [{ status: 'Scheduled' }, { status: 'Invoiced' }]
    const out = resolveJobStatuses(configured, jobs)
    const ids = out.map((s) => s.id)
    expect(ids).toContain('Invoiced')
    expect(out.find((s) => s.id === 'Invoiced').discovered).toBe(true)
  })

  it('never drops a status the data contains', () => {
    const jobs = [{ status: 'Invoiced' }, { status: 'Awaiting Parts' }, { status: 'Scheduled' }]
    const ids = resolveJobStatuses([], jobs).map((s) => s.id)
    for (const j of jobs) expect(ids).toContain(j.status)
  })

  it('keeps configured order and appends discovered statuses after it', () => {
    const jobs = [{ status: 'Mystery' }]
    const out = resolveJobStatuses(CONFIGURED, jobs)
    expect(out.slice(0, CONFIGURED.length)).toEqual(CONFIGURED)
    expect(out[out.length - 1].id).toBe('Mystery')
  })

  it('does not flag configured statuses as discovered', () => {
    const jobs = [{ status: 'Invoiced' }, { status: 'Mystery' }]
    const out = resolveJobStatuses(CONFIGURED, jobs)
    expect(out.find((s) => s.id === 'Invoiced').discovered).toBeUndefined()
    expect(out.find((s) => s.id === 'Mystery').discovered).toBe(true)
  })

  // Failing open must not bury the board: company 3 has 6,196 archived jobs.
  it('holds back the deliberately hidden statuses', () => {
    const jobs = [{ status: 'Archived' }, { status: 'Cancelled' }, { status: 'Invoiced' }]
    const ids = resolveJobStatuses([], jobs).map((s) => s.id)
    expect(ids).toEqual(['Invoiced'])
    expect(HIDDEN_JOB_STATUSES.has('Archived')).toBe(true)
    expect(HIDDEN_JOB_STATUSES.has('Cancelled')).toBe(true)
  })

  it('still shows a hidden status if the tenant configured it on purpose', () => {
    const configured = [{ id: 'Archived', name: 'Archived', color: '#999' }]
    expect(resolveJobStatuses(configured, [{ status: 'Archived' }]).map((s) => s.id)).toEqual(['Archived'])
  })

  it('emits one column per distinct status, not one per job', () => {
    const jobs = Array.from({ length: 50 }, () => ({ status: 'Invoiced' }))
    expect(resolveJobStatuses([], jobs)).toHaveLength(1)
  })

  it('ignores jobs with no status', () => {
    const jobs = [{ status: null }, { status: '' }, {}, { status: 'Invoiced' }]
    expect(resolveJobStatuses([], jobs).map((s) => s.id)).toEqual(['Invoiced'])
  })

  it('colours a discovered status from the supplied map, else a neutral grey', () => {
    const jobs = [{ status: 'Invoiced' }, { status: 'Mystery' }]
    const out = resolveJobStatuses([], jobs, { colors: { Invoiced: '#5a6349' } })
    expect(out.find((s) => s.id === 'Invoiced').color).toBe('#5a6349')
    expect(out.find((s) => s.id === 'Mystery').color).toBe('#9ca3af')
  })

  it('does not mutate the configured list it was given', () => {
    const configured = [{ id: 'Scheduled', name: 'Scheduled', color: '#5a6349' }]
    const before = JSON.stringify(configured)
    resolveJobStatuses(configured, [{ status: 'Invoiced' }])
    expect(JSON.stringify(configured)).toBe(before)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// The settings editor reads with normalizeStatuses and writes with
// statusesToSave. When those two were separate hand-written mappers inside
// PMJobSetter they both rebuilt a status as {id, name, color} — so the
// Category dropdown always displayed "Open" whatever was stored, and one
// save of the panel wiped `category` from every status. Company 3 had six
// flagged delivered. jobMetrics' name-based fallback hid that for company 3
// (its six are a subset of DEFAULT_DELIVERED_NAMES) but SalesPipeline's date
// filter has no fallback, and any tenant with custom status names loses
// Jobs Delivered / Job Revenue outright.
// ─────────────────────────────────────────────────────────────────────────

// Company 3's real job_statuses setting, read verbatim from the live DB.
const COMPANY_3 = [
  { id: 'Chillin', name: 'Chillin', color: '#3b82f6', category: 'open' },
  { id: 'Need To Order', name: 'Need To Order', color: '#ec4899', category: 'open' },
  { id: 'Pre Inspection (Req)', name: 'Pre Inspection (Req)', color: '#ec4899', category: 'open' },
  { id: 'Waiting Product', name: 'Waiting Product', color: '#22c55e', category: 'open' },
  { id: 'Needs scheduling', name: 'Needs scheduling', color: '#9ca3af', category: 'open' },
  { id: 'Scheduled', name: 'Scheduled', color: '#f59e0b', category: 'open' },
  { id: 'In Progress', name: 'In Progress', color: '#f97316', category: 'open' },
  { id: 'On Hold', name: 'On Hold', color: '#94a3b8', category: 'open' },
  { id: 'Completed', name: 'Completed', color: '#4ade80', category: 'delivered' },
  { id: 'Verified Complete', name: 'Verified Complete', color: '#8b5cf6', category: 'delivered' },
  { id: 'Post Inspection (Req)', name: 'Post Inspection (Req)', color: '#14b8a6', category: 'delivered' },
  { id: 'Invoiced', name: 'Invoiced', color: '#5a6349', category: 'delivered' },
  { id: 'Paid', name: 'Paid', color: '#16a34a', category: 'delivered' },
  { id: 'Closed', name: 'Closed', color: '#6b7280', category: 'delivered' },
]
const DELIVERED_NAMES = [
  'Completed', 'Verified Complete', 'Post Inspection (Req)', 'Invoiced', 'Paid', 'Closed',
]
const deliveredIn = (list) => list.filter((s) => s.category === 'delivered').map((s) => s.name)

describe('statusCategory', () => {
  it('reads back what was stored', () => {
    expect(statusCategory({ category: 'delivered' })).toBe('delivered')
    expect(statusCategory({ category: 'open' })).toBe('open')
  })

  it('treats an unset category as open', () => {
    expect(statusCategory({ name: 'Scheduled' })).toBe('open')
    expect(statusCategory(null)).toBe('open')
    expect(statusCategory(undefined)).toBe('open')
  })

  it('never invents a third value — the dropdown only offers two', () => {
    for (const c of ['', 'Delivered', 'DELIVERED', 'closed', 42, null]) {
      expect(['open', 'delivered']).toContain(statusCategory({ category: c }))
    }
  })
})

describe('normalizeStatuses', () => {
  // The read half of the bug: the dropdown showed "Open" for all six.
  it('carries category through from the stored setting', () => {
    expect(deliveredIn(normalizeStatuses(COMPANY_3))).toEqual(DELIVERED_NAMES)
  })

  it('gives legacy string statuses the open category', () => {
    const out = normalizeStatuses(['Scheduled', 'Completed'])
    expect(out.map((s) => s.category)).toEqual(['open', 'open'])
    expect(out.map((s) => s.id)).toEqual(['Scheduled', 'Completed'])
  })

  it('is empty for an unconfigured tenant', () => {
    expect(normalizeStatuses(null)).toEqual([])
    expect(normalizeStatuses([])).toEqual([])
  })

  it('falls back to id when a status has no name, and keeps stored colour', () => {
    const out = normalizeStatuses([{ name: 'Paid', color: '#4a7c59' }])
    expect(out[0].id).toBe('Paid')
    expect(out[0].color).toBe('#4a7c59')
  })

  it('colours from the map, then the palette by index', () => {
    const opts = { colors: { Scheduled: '#5a6349' }, palette: ['#111', '#222'] }
    const out = normalizeStatuses(['Scheduled', 'Mystery', 'Other'], opts)
    expect(out.map((s) => s.color)).toEqual(['#5a6349', '#222', '#111'])
  })

  it('does not mutate the setting it was given', () => {
    const before = JSON.stringify(COMPANY_3)
    normalizeStatuses(COMPANY_3, { palette: ['#000'] })
    expect(JSON.stringify(COMPANY_3)).toBe(before)
  })
})

describe('statusesToSave', () => {
  // The write half of the bug: saving the panel wiped all six flags.
  it('keeps category on the way back out', () => {
    expect(deliveredIn(statusesToSave(COMPANY_3))).toEqual(DELIVERED_NAMES)
  })

  it('drops rows with no name — the blank row the + button adds', () => {
    const out = statusesToSave([...COMPANY_3, { id: '', name: '', color: '#111', isNew: true }])
    expect(out).toHaveLength(COMPANY_3.length)
    expect(out.every((s) => 'category' in s)).toBe(true)
  })

  it('gives a newly added status the open category the dropdown showed', () => {
    const added = { id: '', name: ' Punch List ', color: '#111', isNew: true }
    expect(statusesToSave([added])[0]).toEqual({
      id: 'Punch List', name: 'Punch List', color: '#111', category: 'open',
    })
  })

  it('persists a category the PM just changed in the dropdown', () => {
    const edited = COMPANY_3.map((s) => (s.name === 'Paid' ? { ...s, category: 'open' } : s))
    expect(deliveredIn(statusesToSave(edited))).toEqual(
      DELIVERED_NAMES.filter((n) => n !== 'Paid')
    )
  })

  it('writes only the four stored keys — no isNew/discovered leaks into settings', () => {
    const out = statusesToSave([{ name: 'Paid', color: '#111', category: 'delivered', isNew: true, discovered: true }])
    expect(Object.keys(out[0]).sort()).toEqual(['category', 'color', 'id', 'name'])
  })
})

describe('the settings-panel round trip', () => {
  // Open the panel, change nothing, hit Save. Company 3's six delivered
  // statuses must come out the far side intact.
  const roundTrip = (stored) => statusesToSave(normalizeStatuses(stored))

  it('preserves all six of company 3 delivered statuses', () => {
    expect(deliveredIn(roundTrip(COMPANY_3))).toEqual(DELIVERED_NAMES)
  })

  it('is stable — a second save changes nothing', () => {
    const once = roundTrip(COMPANY_3)
    expect(roundTrip(once)).toEqual(once)
  })

  it('keeps a CUSTOM delivered status, which no name-based fallback would', () => {
    // The unmasked case: jobMetrics' DEFAULT_DELIVERED_NAMES cannot rescue a
    // tenant whose delivered status is called something of their own.
    const custom = [
      { id: 'Wrenching', name: 'Wrenching', color: '#111', category: 'open' },
      { id: 'Buttoned Up', name: 'Buttoned Up', color: '#222', category: 'delivered' },
    ]
    expect(deliveredIn(roundTrip(custom))).toEqual(['Buttoned Up'])
  })


  it('survives a tenant still on the legacy string shape', () => {
    const out = roundTrip(['Scheduled', 'Completed'])
    expect(out.map((s) => s.category)).toEqual(['open', 'open'])
  })

  it('feeds getDeliveredStatusIds the same set before and after a save', () => {
    const before = getDeliveredStatusIds(COMPANY_3)
    const after = getDeliveredStatusIds(roundTrip(COMPANY_3))
    expect([...after].sort()).toEqual([...before].sort())
    expect(after.size).toBe(6)
  })
})

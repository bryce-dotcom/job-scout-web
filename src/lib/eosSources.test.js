import { describe, it, expect } from 'vitest'
import { AUTO_SOURCES } from '../pages/admin/EOS.jsx'

// The EOS scorecard's live metric definitions. Each one reads a different
// table, and the failure mode is always the same: it quietly returns 0 and
// the L10 meeting grades a number that isn't there. Man Hours read 0 for
// months because it queried the legacy typed-hours table instead of the time
// clock; Meetings Attended read 0 because nothing sets that status.
//
// These tests pin the shape of every source: it must survive empty data,
// must never return null/NaN, and the ones with a known reading must read it.

const WEEK = {
  s: '2026-09-14T06:00:00.000Z',
  e: '2026-09-21T05:59:59.999Z',
  sd: '2026-09-14',
  ed: '2026-09-20',
}
const compute = (key, data, entity = null) =>
  AUTO_SOURCES[key].compute(data, WEEK.s, WEEK.e, WEEK.sd, WEEK.ed, entity)

const EMPTY = {
  jobs: [], leads: [], invoices: [], utilityInvoices: [], payments: [], appointments: [],
  timeLogs: [], hourEntries: [], expenses: [], plaidTransactions: [], quotes: [],
  quoteAmountById: new Map(), leadPayments: [], submittals: [], jobStatuses: [], tz: 'America/Denver',
}

describe('every live metric survives an empty tenant', () => {
  for (const [key, src] of Object.entries(AUTO_SOURCES)) {
    it(`${key} returns a finite number, not null or NaN`, () => {
      const v = compute(key, EMPTY)
      expect(typeof v, `${src.label} returned ${typeof v}`).toBe('number')
      expect(Number.isFinite(v), `${src.label} returned ${v}`).toBe(true)
    })
  }

  it('every source declares a label, category and format', () => {
    for (const [key, src] of Object.entries(AUTO_SOURCES)) {
      expect(src.label, key).toBeTruthy()
      expect(['Sales', 'Operations', 'Finance'], key).toContain(src.category)
      expect(['number', 'currency'], key).toContain(src.format)
    }
  })
})

describe('hours come from the time clock, not the legacy typed table', () => {
  // The regression that started this: crews clock in to time_clock, and the
  // scorecard read time_log — 85 rows company-wide, none recent.
  const data = {
    ...EMPTY,
    jobs: [{ id: 10, business_unit: 'Energy Scout', status: 'Completed', completed_at: '2026-09-16T18:00:00Z', job_total: 9000 }],
    jobStatuses: [{ id: 'Completed', category: 'delivered' }],
    hourEntries: [
      { job_id: 10, clock_in: '2026-09-15T13:00:00Z', clock_out: '2026-09-15T21:00:00Z', total_hours: 8 },
      { job_id: 10, clock_in: '2026-09-16T13:00:00Z', clock_out: '2026-09-16T17:00:00Z', total_hours: 4 },
    ],
  }

  it('Total Man Hours counts punches in the week', () => {
    expect(compute('man_hours', data)).toBe(12)
  })

  it('Dollars / Hour divides delivered revenue by those hours', () => {
    expect(compute('dollars_per_hour', data)).toBe(750) // 9000 / 12
  })

  it('never divides by zero when nobody clocked in', () => {
    expect(compute('dollars_per_hour', { ...data, hourEntries: [] })).toBe(0)
  })

  it('scopes hours to a business unit through the job', () => {
    expect(compute('man_hours', data, 'Energy Scout')).toBe(12)
    expect(compute('man_hours', data, 'HHH Building Services')).toBe(0)
  })
})

describe('meetings', () => {
  const data = {
    ...EMPTY,
    leads: [{ id: 1, business_unit: 'Energy Scout' }],
    appointments: [
      { id: 'a', lead_id: 1, appointment_type: null, created_at: '2026-09-15T17:00:00Z', start_time: '2026-09-16T17:00:00Z', outcome: 'Quoted' },
      { id: 'b', lead_id: 1, appointment_type: 'Job', created_at: '2026-09-15T17:00:00Z', start_time: '2026-09-16T17:00:00Z' },
      { id: 'c', lead_id: 1, appointment_type: null, created_at: '2026-09-15T17:00:00Z', start_time: '2026-09-16T17:00:00Z', outcome: 'No Show' },
    ],
  }

  it('counts meetings set, ignoring crew job blocks', () => {
    expect(compute('meetings_created', data)).toBe(2)
  })

  it('counts only the meeting that actually happened', () => {
    expect(compute('meetings_attended', data)).toBe(1)
  })

  it('scopes through the lead, since appointments carry no business unit', () => {
    expect(compute('meetings_created', data, 'Energy Scout')).toBe(2)
    expect(compute('meetings_created', data, 'HHH Building Services')).toBe(0)
  })
})

describe('money', () => {
  it('Cash Collected finds a payment that only names its invoice', () => {
    // 5,729 of HHH's 5,980 payments have no job_id.
    const data = {
      ...EMPTY,
      jobs: [{ id: 10, business_unit: 'Energy Scout' }],
      invoices: [{ id: 7, job_id: 10 }],
      payments: [{ id: 'p', invoice_id: 7, job_id: null, date: '2026-09-16', amount: 2500 }],
    }
    expect(compute('cash_collected', data, 'Energy Scout')).toBe(2500)
    expect(compute('cash_collected', data, null)).toBe(2500)
  })

  it('Dollar Amount Sold values an unpriced job by its estimate', () => {
    const data = {
      ...EMPTY,
      jobs: [{ id: 1, created_at: '2026-09-15T17:00:00Z', job_total: null, quote_id: 42, business_unit: 'Energy Scout' }],
      quoteAmountById: new Map([[42, 8200]]),
    }
    expect(compute('sales_won', data)).toBe(8200)
  })
})

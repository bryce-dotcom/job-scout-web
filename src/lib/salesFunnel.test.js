import { describe, it, expect } from 'vitest'
import { computeSalesFunnel, funnelTotals } from './salesFunnel'

const employees = [{ id: 1, name: 'Noah' }, { id: 2, name: 'Cole' }]
const leads = [
  { id: 10, salesperson_id: 1 },              // Noah's lead
  { id: 11, lead_owner_id: 2 },               // Cole's lead (owner fallback)
  { id: 12, salesperson_id: null, lead_owner_id: null }, // unattributed
]
const appointments = [
  { salesperson_id: 1, start_time: '2026-07-10T17:00:00Z' },
  { salesperson_id: 1, start_time: '2026-07-11T17:00:00Z' },
  { salesperson_id: 2, start_time: '2026-07-12T17:00:00Z' },
  { salesperson_id: 2, appointment_type: 'Block', start_time: '2026-07-12T18:00:00Z' }, // blocked time ignored
]
const quotes = [
  { lead_id: 10, status: 'Approved', created_at: '2026-07-13T00:00:00Z' }, // Noah takeoff + close
  { lead_id: 10, status: 'Sent', created_at: '2026-07-14T00:00:00Z' },      // Noah takeoff
  { lead_id: 11, status: 'Approved', created_at: '2026-07-15T00:00:00Z' },  // Cole takeoff + close
  { lead_id: 12, status: 'Sent', created_at: '2026-07-16T00:00:00Z' },      // unattributed → skipped
  { salesperson_id: 2, lead_id: null, status: 'Sent', created_at: '2026-07-17T00:00:00Z' }, // direct rep on quote
]

describe('computeSalesFunnel', () => {
  const rows = computeSalesFunnel({ appointments, quotes, leads, employees })
  const noah = rows.find((r) => r.repId === 1)
  const cole = rows.find((r) => r.repId === 2)

  it('counts meetings per rep, ignoring blocked time', () => {
    expect(noah.meetings).toBe(2)
    expect(cole.meetings).toBe(1) // the Block does not count
  })
  it('attributes takeoffs via the lead owner when the quote has no rep', () => {
    expect(noah.takeoffs).toBe(2)
    expect(cole.takeoffs).toBe(2) // one via lead 11, one via direct salesperson_id on the quote
  })
  it('counts closed = approved quotes', () => {
    expect(noah.closed).toBe(1)
    expect(cole.closed).toBe(1)
  })
  it('drops unattributed quotes/leads', () => {
    expect(rows.every((r) => r.repId === 1 || r.repId === 2)).toBe(true)
  })
  it('computes close rate = approved / takeoffs', () => {
    expect(noah.closeRate).toBe(50) // 1 of 2
  })
})

describe('window filter', () => {
  it('excludes rows outside sinceIso', () => {
    const rows = computeSalesFunnel({ appointments, quotes, leads, employees }, { sinceIso: '2026-07-14T00:00:00Z' })
    const noah = rows.find((r) => r.repId === 1)
    expect(noah.meetings).toBe(0)   // both meetings are before the cutoff
    expect(noah.takeoffs).toBe(1)   // only the 07-14 quote
  })
})

describe('funnelTotals', () => {
  it('sums across reps', () => {
    const t = funnelTotals(computeSalesFunnel({ appointments, quotes, leads, employees }))
    expect(t).toMatchObject({ meetings: 3, takeoffs: 4, closed: 2, closeRate: 50 })
  })
})

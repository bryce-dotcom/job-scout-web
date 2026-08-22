import { describe, it, expect } from 'vitest'
import { computeRepRows, earnedRepInPeriod, liveInvoiceAvailable, syncRepCommissions } from './repCommissions'

// ─────────────────────────────────────────────────────────────────────────
// Sales commission. Untested until now, and the source comments call the
// live calculation "always breaking" — which matches the tickets:
//   - efd85146: commissions already PAID were not dropped from the next
//     payroll run (a straight double-pay risk)
//   - the lead-delete incident: deleting a lead wiped the setter's
//     commission, because ownership can flow through the lead, not the job
// Both are locked below.
// ─────────────────────────────────────────────────────────────────────────

const REP = { id: 5, name: 'Rep', is_commission: true, commission_services_rate: 10, commission_services_type: 'percent' }

const base = (over = {}) => ({
  employees: [REP],
  jobs: [{ id: 1, salesperson_id: 5 }],
  invoices: [{ id: 100, job_id: 1, amount: 1000 }],
  payments: [{ id: 900, invoice_id: 100, amount: 1000, date: '2026-07-10' }],
  leads: [], utilityInvoices: [],
  payrollConfig: {},
  ...over,
})

describe('commission is earned on money COLLECTED, not money invoiced', () => {
  it('pays on a collected payment', () => {
    const rows = computeRepRows(base())
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(100, 2) // 10% of $1,000
  })

  it('pays NOTHING on an invoice that has not been paid yet', () => {
    const rows = computeRepRows(base({ payments: [] }))
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBe(0)
  })

  it('pays proportionally on a partial payment', () => {
    const rows = computeRepRows(base({ payments: [{ id: 900, invoice_id: 100, amount: 400, date: '2026-07-10' }] }))
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(40, 2) // 10% of the $400 actually collected
  })

  it('pays on each instalment as it arrives, never more than the full rate', () => {
    const rows = computeRepRows(base({
      payments: [
        { id: 900, invoice_id: 100, amount: 600, date: '2026-07-10' },
        { id: 901, invoice_id: 100, amount: 400, date: '2026-07-20' },
      ],
    }))
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(100, 2)
  })
})

describe('who owns the sale', () => {
  it('credits the rep named on the job', () => {
    expect(computeRepRows(base()).length).toBeGreaterThan(0)
  })

  it('credits the rep via the LEAD when the job carries no salesperson', () => {
    // The lead-delete regression: ownership can live on the lead alone.
    const rows = computeRepRows(base({
      jobs: [{ id: 1, lead_id: 55 }],
      leads: [{ id: 55, salesperson_id: 5 }],
    }))
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(100, 2)
  })

  it('credits a rep listed in the lead salesperson_ids array', () => {
    const rows = computeRepRows(base({
      jobs: [{ id: 1, lead_id: 55 }],
      leads: [{ id: 55, salesperson_ids: [5] }],
    }))
    expect(rows.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(100, 2)
  })

  it('pays nobody for a job that belongs to a different rep', () => {
    const rows = computeRepRows(base({ jobs: [{ id: 1, salesperson_id: 999 }] }))
    expect(rows).toEqual([])
  })

  it('pays nothing to an employee who is not on commission', () => {
    const rows = computeRepRows(base({ employees: [{ ...REP, is_commission: false }] }))
    expect(rows).toEqual([])
  })

  it('pays nothing when the rep has no rate set', () => {
    const rows = computeRepRows(base({ employees: [{ ...REP, commission_services_rate: 0, commission_goods_rate: 0 }] }))
    expect(rows).toEqual([])
  })

  it('can be scoped to a single employee', () => {
    const two = [REP, { ...REP, id: 6 }]
    const jobs = [{ id: 1, salesperson_id: 5 }, { id: 2, salesperson_id: 6 }]
    const invoices = [{ id: 100, job_id: 1, amount: 1000 }, { id: 101, job_id: 2, amount: 1000 }]
    const payments = [
      { id: 900, invoice_id: 100, amount: 1000, date: '2026-07-10' },
      { id: 901, invoice_id: 101, amount: 1000, date: '2026-07-10' },
    ]
    const scoped = computeRepRows(base({ employees: two, jobs, invoices, payments }), 5)
    expect(scoped.every(r => r.employee_id === 5)).toBe(true)
  })
})

describe('earnedRepInPeriod — the double-pay guard (ticket efd85146)', () => {
  const rows = [
    { employee_id: 5, amount: 100, earned_at: '2026-07-10', payment_status: 'earned' },
    { employee_id: 5, amount: 250, earned_at: '2026-07-10', payment_status: 'paid' },
    { employee_id: 5, amount: 75, earned_at: '2026-07-10', payment_status: 'void' },
    { employee_id: 9, amount: 500, earned_at: '2026-07-10', payment_status: 'earned' },
  ]

  it('EXCLUDES commission that has already been paid out', () => {
    // This is the whole ticket: a paid commission reappearing on the next run.
    expect(earnedRepInPeriod(rows, 5)).toBe(100)
  })

  it('excludes voided commission', () => {
    expect(earnedRepInPeriod([rows[2]], 5)).toBe(0)
  })

  it('does not leak another rep\'s commission into this one\'s cheque', () => {
    expect(earnedRepInPeriod(rows, 5)).not.toContain(500)
    expect(earnedRepInPeriod(rows, 9)).toBe(500)
  })

  it('honours the pay-period window', () => {
    expect(earnedRepInPeriod(rows, 5, '2026-07-01', '2026-07-15')).toBe(100)
    expect(earnedRepInPeriod(rows, 5, '2026-08-01', '2026-08-15')).toBe(0)
  })

  it('includes the boundary days of the period', () => {
    const edge = [{ employee_id: 5, amount: 40, earned_at: '2026-07-01', payment_status: 'earned' }]
    expect(earnedRepInPeriod(edge, 5, '2026-07-01', '2026-07-15')).toBe(40)
  })

  it('a null period means all-time, not zero', () => {
    expect(earnedRepInPeriod(rows, 5, null, null)).toBe(100)
  })

  it('returns 0 rather than NaN for empty input', () => {
    expect(earnedRepInPeriod(null, 5)).toBe(0)
    expect(earnedRepInPeriod([], 5)).toBe(0)
  })
})

describe('liveInvoiceAvailable — what the ledger swap removes', () => {
  it('sums only the available invoice-commission portion', () => {
    const live = { details: [
      { type: 'invoice_commission', status: 'available', amount: 100 },
      { type: 'invoice_commission', status: 'pending', amount: 50 },
      { type: 'utility', status: 'available', amount: 900 },
    ] }
    // Utility/processor pay stays with the live calc — removing it would
    // silently delete a whole pay line.
    expect(liveInvoiceAvailable(live)).toBe(100)
  })

  it('handles a missing result without throwing', () => {
    expect(liveInvoiceAvailable(null)).toBe(0)
    expect(liveInvoiceAvailable({})).toBe(0)
  })
})

describe('never produces junk pay rows', () => {
  it('amounts are finite and positive', () => {
    for (const r of computeRepRows(base())) {
      expect(Number.isFinite(r.amount)).toBe(true)
      expect(r.amount).toBeGreaterThan(0)
    }
  })

  it('survives empty and missing input', () => {
    expect(() => computeRepRows({})).not.toThrow()
    expect(computeRepRows({})).toEqual([])
    expect(computeRepRows(base({ payments: undefined, invoices: undefined }))).toEqual([])
  })

  // NOTE for whoever reads this next: the destructuring defaults above only
  // fire on `undefined`, so an explicit `payments: null` DOES throw
  // "payments is not iterable". That is not a live bug — Payroll.jsx is the
  // only caller, its state starts as [] and every setter uses `|| []`
  // (Payroll.jsx:656-660), which is what keeps a failed Supabase query
  // (data === null) from reaching here. Don't remove those `|| []` guards
  // on the assumption this lib is null-safe; it isn't.
})

// ── The partial-data freeze ─────────────────────────────────────────────────
//
// Alayda (6988348a): "Damien Hargett's my pay nor is his comissions coming
// through, we need this fixed asap."
//
// His commissions WERE coming through by the time I looked — the frozen ledger
// did not exist when she reported. What the investigation turned up instead was
// worse: four rows in the ledger worth $5,744.96 more than they should be.
//
// Payroll syncs the ledger from jobs + invoices + payments, three separate
// paginated fetches, and the effect waited only on `jobs`. In the window where
// jobs had arrived and payments had not, every Paid invoice looked
// payment-less — the exact case the synthetic fallback is for — so it froze a
// row worth the WHOLE invoice rather than the amount received. On an Energy
// Scout invoice the difference is the utility incentive, which is separately
// commissioned as a `utility` row, so the rep was paid on it twice. The overage
// matched the utility row to the cent on three of the four.
describe('the ledger must not be written from half-loaded data', () => {
  const paidInvoice = { id: 1, job_id: 10, amount: 7113.77, payment_status: 'Paid', discount_applied: 5335.33 }
  const rep = { id: 72, company_id: 3, is_commission: true, commission_services_rate: 8.5, commission_services_type: 'percent' }
  const job = { id: 10, salesperson_id: 72 }

  it('a Paid invoice with genuinely no payment still earns — that case is real', () => {
    const rows = computeRepRows({
      employees: [rep], jobs: [job], leads: [], invoices: [paidInvoice], payments: [],
    })
    const synth = rows.filter((r) => r.source === 'live_synthetic')
    expect(synth).toHaveLength(1)
    expect(synth[0].basis_amount).toBe(7113.77)
  })

  // ...which is why the guard cannot live in computeRepRows: an empty payments
  // array is legitimate there. It has to stop at the write.
  it('refuses to write when there are invoices but not one payment anywhere', async () => {
    const calls = []
    const fakeSupabase = {
      from(table) { calls.push(table); return this },
      select() { return this }, eq() { return this }, in() { return this },
      insert() { calls.push('INSERT'); return Promise.resolve({ error: null }) },
      delete() { calls.push('DELETE'); return this },
      then(res) { return Promise.resolve({ data: [], error: null }).then(res) },
    }
    const out = await syncRepCommissions(fakeSupabase, 3, {
      employees: [rep], jobs: [job], leads: [], invoices: [paidInvoice], payments: [],
    })
    expect(out.skipped).toBe('partial-data')
    expect(out.inserted).toBe(0)
    expect(calls).not.toContain('INSERT')
  })

  it('writes normally once the payments have arrived', async () => {
    let inserted = null
    const fakeSupabase = {
      from() { return this },
      select() { return this }, eq() { return this }, in() { return this },
      insert(rows) { inserted = rows; return Promise.resolve({ error: null }) },
      delete() { return this },
      then(res) { return Promise.resolve({ data: [], error: null }).then(res) },
    }
    const out = await syncRepCommissions(fakeSupabase, 3, {
      employees: [rep], jobs: [job], leads: [], invoices: [paidInvoice],
      payments: [{ id: 5, invoice_id: 1, amount: 1778.44, date: '2026-07-13' }],
    })
    expect(out.skipped).toBeUndefined()
    expect(inserted).toHaveLength(1)
    // The amount received, not the invoice total — $151.17, not $604.67.
    expect(inserted[0].basis_amount).toBe(1778.44)
    expect(inserted[0].amount).toBe(151.17)
    expect(inserted[0].source).toBe('live')
  })
})

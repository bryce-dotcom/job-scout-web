import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { jobEarnsCommission, commissionMinJobTotal } from './commissionEligibility'
import { computeRepRows } from './repCommissions'
import { calculateInvoiceCommissions } from './bonusCalc'

// "5% on jobs over 10k" (Bryce, 3 Oct 2026, for Christopher Lyman). Every
// other rate here is a flat percentage of whatever the rep owns, so the floor
// is new — and it has to mean the same thing in the ledger that pays and in
// the figures the pages show, or My Pay promises money Payroll will not pay.

const PM = { id: 14, company_id: 3, name: 'PM', is_commission: true, commission_services_rate: 5, commission_services_type: 'percent', commission_min_job_total: 10000 }
const REP = { id: 9, company_id: 3, name: 'Rep', is_commission: true, commission_services_rate: 6, commission_services_type: 'percent' }

describe('the floor itself', () => {
  it('reads a missing, blank or zero floor as "every job"', () => {
    for (const v of [undefined, null, '', 0, '0', -5, 'abc']) {
      expect(commissionMinJobTotal({ commission_min_job_total: v })).toBe(0)
      expect(jobEarnsCommission({ job_total: 40 }, { commission_min_job_total: v })).toBe(true)
    }
  })

  it('measures the JOB total, not the invoice or the payment', () => {
    expect(jobEarnsCommission({ job_total: 12000 }, PM)).toBe(true)
    expect(jobEarnsCommission({ job_total: 10000 }, PM)).toBe(true)   // "over 10k" includes 10k
    expect(jobEarnsCommission({ job_total: 9999.99 }, PM)).toBe(false)
  })

  it('a job with no total recorded does not clear a floor', () => {
    expect(jobEarnsCommission({ job_total: null }, PM)).toBe(false)
    expect(jobEarnsCommission({}, PM)).toBe(false)
    expect(jobEarnsCommission({ job_total: null }, REP)).toBe(true)   // no floor, no question
  })
})

describe('the ledger that pays', () => {
  const JOBS = [
    { id: 1, company_id: 3, salesperson_id: 14, job_total: 23883, job_title: 'Power wash' },
    { id: 2, company_id: 3, salesperson_id: 14, job_total: 245, job_title: 'Window clean' },
  ]
  const INVOICES = [
    { id: 11, job_id: 1, amount: 23883, discount_applied: 0, tax_amount: 0, payment_status: 'Paid' },
    { id: 12, job_id: 2, amount: 245, discount_applied: 0, tax_amount: 0, payment_status: 'Paid' },
  ]
  const PAYMENTS = [
    { id: 101, invoice_id: 11, amount: 10000, date: '2026-10-01' },
    { id: 102, invoice_id: 12, amount: 245, date: '2026-10-01' },
  ]

  it('pays the big job and skips the small one', () => {
    const rows = computeRepRows({ employees: [PM], jobs: JOBS, invoices: INVOICES, payments: PAYMENTS })
    expect(rows).toHaveLength(1)
    expect(rows[0].job_id).toBe(1)
    expect(rows[0].amount).toBe(500)        // 5% of the $10,000 payment
    expect(rows[0].rate).toBe(5)
  })

  it('a rep with no floor still earns on both', () => {
    const rows = computeRepRows({ employees: [{ ...REP, id: 14 }], jobs: JOBS, invoices: INVOICES, payments: PAYMENTS })
    expect(rows.map(r => r.job_id).sort()).toEqual([1, 2])
  })

  it('a big job pays as each payment lands, not all at once', () => {
    const rows = computeRepRows({
      employees: [PM], jobs: JOBS, invoices: INVOICES,
      payments: [...PAYMENTS, { id: 103, invoice_id: 11, amount: 13883, date: '2026-10-15' }],
    })
    const onBigJob = rows.filter(r => r.job_id === 1)
    expect(onBigJob).toHaveLength(2)
    expect(onBigJob.reduce((s, r) => s + r.amount, 0)).toBeCloseTo(23883 * 0.05, 2)
  })
})

describe('the live figures agree with the ledger', () => {
  const JOBS = [
    { id: 1, salesperson_id: 14, job_total: 23883, job_title: 'Power wash' },
    { id: 2, salesperson_id: 14, job_total: 245, job_title: 'Window clean' },
  ]
  const INVOICES = [
    { id: 11, job_id: 1, amount: 23883, discount_applied: 0, payment_status: 'Paid' },
    { id: 12, job_id: 2, amount: 245, discount_applied: 0, payment_status: 'Paid' },
  ]
  const run = (employee) => calculateInvoiceCommissions({
    employee, jobs: JOBS, invoices: INVOICES,
    inPeriodPayments: [{ id: 101, invoice_id: 11, amount: 23883, date: '2026-10-01' },
      { id: 102, invoice_id: 12, amount: 245, date: '2026-10-01' }],
    payrollConfig: { commission_trigger: 'payment_received' },
    periodStartStr: '2026-10-01', periodEndStr: '2026-10-16',
  })

  it('the small job is not in the breakdown at all', () => {
    const { details } = run(PM)
    expect(details.map(d => d.jobTitle)).not.toContain('Window clean')
  })

  it('and the figure matches 5% of the big job', () => {
    expect(run(PM).available).toBeCloseTo(23883 * 0.05, 2)
  })

  it('without a floor both jobs count', () => {
    const { available } = run({ ...REP, id: 14 })
    expect(available).toBeCloseTo((23883 + 245) * 0.06, 2)
  })
})

// The column has to arrive at the calc. Payroll reads employees through the
// store's `*`, but My Pay names its columns, and a column left out of a
// select reads as undefined — which here means "no floor" and a promise the
// ledger will not keep.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf8')

describe('the pages fetch the floor', () => {
  it('My Pay selects commission_min_job_total', () => {
    const src = read('src/pages/MyPay.jsx')
    const at = src.indexOf("is_commission, commission_services_rate")
    expect(src.slice(at - 200, at + 400)).toMatch(/commission_min_job_total/)
  })

  it('the Employees form can set it', () => {
    const src = read('src/pages/Employees.jsx')
    expect(src).toMatch(/commission_min_job_total: formData\.commission_min_job_total/)
    expect(src).toMatch(/Only on jobs over/)
  })

  it('the pay-column guard covers it', () => {
    const sql = read('supabase/migrations/20261003153805_commission_min_job_total.sql')
    expect(sql).toMatch(/add column if not exists commission_min_job_total/)
    expect(sql).toMatch(/new\.commission_min_job_total\s+is distinct from old\.commission_min_job_total/)
  })
})

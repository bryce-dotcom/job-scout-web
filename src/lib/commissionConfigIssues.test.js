import { describe, it, expect } from 'vitest'
import { commissionConfigIssues, commissionIssueMessage } from './commissionConfigIssues'

// A warning nobody trusts is worse than no warning, so most of these tests are
// about what it must NOT flag.

const rep = (id, over = {}) => ({
  id, name: `Rep ${id}`, is_commission: true,
  commission_services_rate: 0, commission_goods_rate: 0,
  commission_processor_rate: 0, commission_setter_rate: 0,
  ...over,
})
const job = (id, salesperson_id) => ({ id, salesperson_id, lead_id: null })
const invoice = (id, job_id, amount, payment_status = 'Pending') => ({ id, job_id, amount, payment_status })
const payment = (id, invoice_id, amount) => ({ id, invoice_id, amount })

describe('the case this exists for', () => {
  // Damien: is_commission on, rate parked in the setter field, jobs sold and
  // paid, $0 earned, nothing said so.
  const data = {
    employees: [rep(72, { name: 'Damien Hargett', commission_setter_rate: 25 })],
    jobs: [job(1, 72)],
    invoices: [invoice(10, 1, 7113.77)],
    payments: [payment(100, 10, 1778.44)],
  }

  it('flags them', () => {
    const [issue] = commissionConfigIssues(data)
    expect(issue.employeeId).toBe(72)
    expect(issue.jobCount).toBe(1)
    expect(issue.collected).toBeCloseTo(1778.44, 2)
  })

  it('says where the rate actually went', () => {
    const msg = commissionIssueMessage(commissionConfigIssues(data)[0])
    expect(msg).toContain('Damien Hargett')
    expect(msg).toContain('setter field')
  })
})

describe('what it must not flag', () => {
  it('ignores a rep with a real rate', () => {
    expect(commissionConfigIssues({
      employees: [rep(1, { commission_services_rate: 8.5 })],
      jobs: [job(1, 1)], invoices: [invoice(10, 1, 500, 'Paid')], payments: [],
    })).toEqual([])
  })

  it('ignores a processor-only earner', () => {
    // Alayda earns on commission_processor_rate; zero services/goods is right.
    expect(commissionConfigIssues({
      employees: [rep(1, { commission_processor_rate: 10 })],
      jobs: [job(1, 1)], invoices: [invoice(10, 1, 500, 'Paid')], payments: [],
    })).toEqual([])
  })

  it('ignores anyone not marked as earning commission', () => {
    // Field techs and PMs own jobs with 0 rates entirely legitimately.
    expect(commissionConfigIssues({
      employees: [rep(1, { is_commission: false })],
      jobs: [job(1, 1)], invoices: [invoice(10, 1, 500, 'Paid')], payments: [],
    })).toEqual([])
  })

  it('ignores a rep whose jobs have collected nothing yet', () => {
    // Nothing is being lost, so there is nothing to shout about.
    expect(commissionConfigIssues({
      employees: [rep(1, { commission_setter_rate: 25 })],
      jobs: [job(1, 1)], invoices: [invoice(10, 1, 500, 'Pending')], payments: [],
    })).toEqual([])
  })

  it('ignores a rep who owns no jobs', () => {
    expect(commissionConfigIssues({
      employees: [rep(1)], jobs: [job(1, 99)],
      invoices: [invoice(10, 1, 500, 'Paid')], payments: [],
    })).toEqual([])
  })
})

describe('counting collected money', () => {
  it('counts a Paid invoice with no payment row', () => {
    // computeRepRows pays a synthetic row here, so this must count too.
    const [issue] = commissionConfigIssues({
      employees: [rep(1)], jobs: [job(1, 1)],
      invoices: [invoice(10, 1, 500, 'Paid')], payments: [],
    })
    expect(issue.collected).toBe(500)
  })

  it('does not double-count an invoice that has both', () => {
    const [issue] = commissionConfigIssues({
      employees: [rep(1)], jobs: [job(1, 1)],
      invoices: [invoice(10, 1, 500, 'Paid')], payments: [payment(1, 10, 500)],
    })
    expect(issue.collected).toBe(500)
  })

  it('puts the biggest loss first', () => {
    const issues = commissionConfigIssues({
      employees: [rep(1), rep(2)],
      jobs: [job(1, 1), job(2, 2)],
      invoices: [invoice(10, 1, 100, 'Paid'), invoice(20, 2, 900, 'Paid')],
      payments: [],
    })
    expect(issues.map(i => i.employeeId)).toEqual([2, 1])
  })
})

describe('junk', () => {
  it('survives being called with nothing', () => {
    expect(commissionConfigIssues()).toEqual([])
    expect(commissionConfigIssues({})).toEqual([])
    expect(commissionIssueMessage(null)).toBe('')
  })
})

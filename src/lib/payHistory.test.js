import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { paycheckDetail, runsWithStubs, sortPaychecks } from './payHistory'

// "I cant see history in payroll... which i should be able to (pay stubs) but
// also what jobs hes has been paid for" (Bryce, 7 Oct 2026). A stub says
// $1,194 of commission; the rep wants to know it was the Power Wash job.

const stub = { id: 1, employee_id: 14, pay_date: '2026-09-20', payroll_run_id: 13, gross_pay: 4694.15, net_pay: 3600 }
const jobLabel = (id) => ({ 101: 'Power Wash Building', 102: 'Juan Diego School', 103: 'Oquirh Mountain' }[id] || `Job ${id}`)

const comm = (over) => ({ id: 9, employee_id: 14, job_id: 101, amount: 1194.15, rate: 5, kind: 'services', payment_status: 'paid', paid_at: '2026-09-20T12:00:00Z', paid_payroll_run_id: 13, ...over })

describe('what one paycheck paid for', () => {
  it('names the jobs behind the commission', () => {
    const d = paycheckDetail({ stub, repCommissions: [comm()], jobLabel })
    expect(d.commissions).toHaveLength(1)
    expect(d.commissions[0].label).toBe('Power Wash Building')
    expect(d.commissionTotal).toBe(1194.15)
    expect(d.lines[0]).toMatchObject({ kind: 'commission', label: 'Power Wash Building', note: '5% commission' })
  })

  it('adds the bonus rows and the setter fees', () => {
    const d = paycheckDetail({
      stub,
      repCommissions: [comm()],
      leadCommissions: [{ id: 3, employee_id: 14, amount: 75, commission_type: 'appointment', payment_status: 'paid', paid_at: '2026-09-20', paid_payroll_run_id: 13 }],
      bonuses: [{ id: 5, employee_id: 14, job_id: 103, amount: 250, saved_hours: 8, status: 'paid', paid_at: '2026-09-20', paid_payroll_run_id: 13 }],
      jobLabel,
    })
    expect(d.setterTotal).toBe(75)
    expect(d.bonusTotal).toBe(250)
    expect(d.bonuses[0].label).toBe('Oquirh Mountain')
    expect(d.lines.map(l => l.kind)).toEqual(['commission', 'setter', 'bonus'])
  })

  it('lists commission the salary covered but does not count it as paid', () => {
    const d = paycheckDetail({ stub, repCommissions: [comm({ covered_by_salary: true })], jobLabel })
    expect(d.commissions).toHaveLength(1)          // still shown — he earned it
    expect(d.commissionTotal).toBe(0)              // but the check did not pay it
    expect(d.coveredBySalary).toBe(1194.15)
    expect(d.lines[0].note).toBe('settled by your salary')
  })

  it('ignores rows that are not paid yet', () => {
    const d = paycheckDetail({ stub, repCommissions: [comm({ payment_status: 'earned' })], jobLabel })
    expect(d.commissions).toHaveLength(0)
  })

  it('ignores another employee entirely', () => {
    const d = paycheckDetail({ stub, repCommissions: [comm({ employee_id: 99 })], jobLabel })
    expect(d.commissions).toHaveLength(0)
  })
})

describe('matching a row to the right check', () => {
  // HHH has two runs sharing one pay date — runs 7 and 9, both 20 Aug 2026 —
  // which is why the run id exists and the date is only a fallback.
  it('prefers the payroll run id over the date', () => {
    const otherRun = { ...stub, payroll_run_id: 7 }
    expect(paycheckDetail({ stub: otherRun, repCommissions: [comm()], jobLabel }).commissions).toHaveLength(0)
    expect(paycheckDetail({ stub, repCommissions: [comm()], jobLabel }).commissions).toHaveLength(1)
  })

  it('falls back to the pay date for rows paid before the id existed', () => {
    const old = comm({ paid_payroll_run_id: null, paid_at: '2026-09-20T18:30:00Z' })
    expect(paycheckDetail({ stub, repCommissions: [old], jobLabel }).commissions).toHaveLength(1)
  })

  it('does not drag an older check\'s rows into this one', () => {
    const older = comm({ paid_payroll_run_id: null, paid_at: '2026-08-20' })
    expect(paycheckDetail({ stub, repCommissions: [older], jobLabel }).commissions).toHaveLength(0)
  })

  it('never claims a tagged row for an untagged stub', () => {
    const noRun = { ...stub, payroll_run_id: null }
    expect(paycheckDetail({ stub: noRun, repCommissions: [comm()], jobLabel }).commissions).toHaveLength(0)
  })
})

describe('the payroll history list', () => {
  const runs = [
    { id: 13, period_start: '2026-09-01', period_end: '2026-09-15', pay_date: '2026-09-20' },
    { id: 9, period_start: '2026-07-01', period_end: '2026-07-15', pay_date: '2026-08-20' },
  ]
  const stubs = [
    { id: 1, payroll_run_id: 13, employee_id: 14, gross_pay: 3500, net_pay: 2800 },
    { id: 2, payroll_run_id: 13, employee_id: 17, gross_pay: 3500, net_pay: 2810 },
    { id: 3, payroll_run_id: 9, employee_id: 14, gross_pay: 3500, net_pay: 2800 },
    { id: 4, payroll_run_id: null, employee_id: 21, gross_pay: 900, net_pay: 760, pay_date: '2026-06-05' },
  ]

  it('groups the stubs under their run, newest first, with the totals', () => {
    const { groups } = runsWithStubs(runs, stubs)
    expect(groups.map(g => g.run.id)).toEqual([13, 9])
    expect(groups[0].stubs).toHaveLength(2)
    expect(groups[0].gross).toBe(7000)
    expect(groups[0].net).toBe(5610)
  })

  it('keeps a paycheck with no run rather than dropping it', () => {
    const { orphans } = runsWithStubs(runs, stubs)
    expect(orphans.map(s => s.id)).toEqual([4])
  })

  it('leaves out a run that paid nobody', () => {
    const { groups } = runsWithStubs([...runs, { id: 99, pay_date: '2026-10-05' }], stubs)
    expect(groups.map(g => g.run.id)).not.toContain(99)
  })

  it('sorts paychecks newest first', () => {
    const sorted = sortPaychecks([{ pay_date: '2026-05-05' }, { pay_date: '2026-09-20' }, { pay_date: '2026-08-20' }])
    expect(sorted.map(s => s.pay_date)).toEqual(['2026-09-20', '2026-08-20', '2026-05-05'])
  })
})

// Two statements in the run mark an ordinary employee's staged commissions
// paid. A line-range edit on 5 Oct deleted them, which would have left every
// non-greater-of rep's commission 'earned' and queued after its own run —
// ready for the next run to pay it again. Nobody had run payroll in between,
// so no money moved, but nothing in the suite noticed either.
describe('a run closes what it paid', () => {
  const payroll = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..', 'src/pages/Payroll.jsx'), 'utf8')

  it('marks queued rep commissions paid', () => {
    expect(payroll).toMatch(/from\('rep_commissions'\)[\s\S]{0,260}payment_status: 'paid'[\s\S]{0,200}queued_for_payroll', true\)/)
  })

  it('marks queued setter commissions paid', () => {
    expect(payroll).toMatch(/from\('lead_commissions'\)[\s\S]{0,260}payment_status: 'paid'[\s\S]{0,200}queued_for_payroll', true\)/)
  })

  it('tags every close with the run that did it, so history can group them', () => {
    const tagged = payroll.match(/paid_payroll_run_id: payrollRun\.id/g) || []
    expect(tagged.length).toBe(4)   // setter, rep, and both greater-of settle groups
  })
})

describe('both surfaces show the same history', () => {
  const read = (f) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../..', f), 'utf8')

  it('Payroll has a pay-history section built from the shared resolver', () => {
    const payroll = read('src/pages/Payroll.jsx')
    expect(payroll).toMatch(/runsWithStubs\(priorRuns, allPaystubs\)/)
    expect(payroll).toMatch(/Pay History/)
    expect(payroll).toMatch(/paycheckDetail\(\{/)
  })

  it('My Pay lists what each cheque paid for, from the same resolver', () => {
    const myPay = read('src/pages/MyPay.jsx')
    expect(myPay).toMatch(/paycheckDetailFor\(p\)/)
    expect(myPay).toMatch(/What this paid for/)
    expect(myPay).toMatch(/from '\.\.\/lib\/payHistory'/)
  })

  it('and both fetch the run id the resolver matches on', () => {
    expect(read('src/pages/MyPay.jsx')).toMatch(/select\('id, payroll_run_id/)
    expect(read('src/lib/repCommissions.js')).toMatch(/paid_payroll_run_id/)
  })
})

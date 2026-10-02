import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateEfficiencyBonus, bonusRowAmount } from './bonusCalc'

// The bonus verification gate is correct (bonusVerification.test.js proves the
// rule) and was still wrong on screen for months, because the two pages that
// FEED it left things out of their queries. Both failures are invisible to a
// unit test of the rule — the rule was never called with the truth — so they
// are pinned here against the source of the callers.
//
//   1. Payroll writes the job_bonuses ledger. Its jobs select had no
//      business_unit, so every job reached verificationRequiredFor() as
//      undefined ("unknown — stays gated") and the exemption HHH configured on
//      2026-09-18 never applied: 92 HHH Building Services bonuses ($17,321.04)
//      held for a photo check that unit does not do.
//   2. The same fetch bounded verification_reports to the current pay period,
//      while the ledger is computed per job over the job's whole life. A
//      completion check from an earlier period was invisible: 24 bonuses
//      ($5,812.20) read "no completion verification" on jobs Victor passed.
//   3. Field Scout's own bonus card made both mistakes and never passed the
//      exempt list at all.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf8')
const payroll = read('src/pages/Payroll.jsx')
const fieldScout = read('src/pages/FieldScout.jsx')

/** The `.from('<table>')` call and everything up to the next statement. */
const queryFor = (src, table) => {
  const at = src.indexOf(`.from('${table}')`)
  expect(at, `no .from('${table}') in this page`).toBeGreaterThan(-1)
  return src.slice(at, at + 1600)
}

describe('the ledger writer sees what the gate reads', () => {
  it('Payroll selects business_unit on the jobs it computes bonuses from', () => {
    const q = queryFor(payroll, 'jobs')
    expect(q).toMatch(/\.select\('[^']*business_unit[^']*'\)/)
  })

  it('Payroll does not bound Victor reports to the pay period', () => {
    const q = queryFor(payroll, 'verification_reports')
    // created_at is still SELECTED (the daily set is keyed by it); what must
    // not come back is a date FILTER on it.
    expect(q).not.toMatch(/\.(gte|lte|gt|lt)\(\s*'created_at'/)
    expect(q).toMatch(/voided/)
    expect(q).toMatch(/score/)
  })
})

describe("the tech's own bonus card sees it too", () => {
  it('Field Scout selects business_unit for the bonus card', () => {
    const q = queryFor(fieldScout, 'jobs')
    expect(q).toMatch(/\.select\('[^']*business_unit[^']*'\)/)
  })

  it('Field Scout passes the exemption into the bonus calc', () => {
    expect(fieldScout).toMatch(/verificationExemptUnits:\s*exemptUnitsFromPayrollConfig\(payrollConfig\)/)
  })

  it('the card headline is the ledger amount, not what daily coverage left', () => {
    // bonusRowAmount is the shared "what is this row worth" rule; the headline
    // has to go through it or the coverage ratio silently zeroes real money.
    expect(fieldScout).toMatch(/bonus:\s*earned/)
    expect(fieldScout).toMatch(/const earned = \(result\.details \|\| \[\]\)\.reduce/)
  })
})

describe('why the headline needed its own sum', () => {
  // A released, Victor-verified bonus on a job with no DAILY reports: the
  // Calvin Roy crew's current period, where three verified bonuses totalling
  // $2,656.33 showed as "$0.00 earned this pay period" on the phone.
  const JOB = { id: 7, job_id: 'JOB-7', job_title: 'Northwest standard corp', allotted_time_hours: 100, business_unit: 'Energy Scout' }
  const EMPLOYEES = [{ id: 1, name: 'Tech', skill_level: 'Scout' }]
  const SKILLS = [{ name: 'Scout', weight: 2 }]
  const CFG = { efficiency_bonus_enabled: true, efficiency_bonus_rate: 30, company_bonus_cut_percent: 20, bonus_min_hours_saved: 0.5 }
  // Four 10-hour days against a 100-hour allotment: 60 saved, and a 2.5x
  // allotted-to-actual ratio, under the 3x padded-estimate guard.
  const DAYS = ['2026-10-01', '2026-10-02', '2026-10-05', '2026-10-06']
  const ENTRIES = DAYS.map(date => ({ employee_id: 1, job_id: 7, hours: 10, date }))
  const CLOCK = DAYS.map(date => ({
    employee_id: 1, job_id: 7, total_hours: 10,
    clock_in: `${date}T14:00:00Z`, clock_out: `${date}T23:59:00Z`,
  }))

  const run = () => calculateEfficiencyBonus({
    employeeId: 1, timeLogEntries: ENTRIES, timeClockRows: CLOCK, jobs: [JOB],
    employees: EMPLOYEES, skillLevels: SKILLS, payrollConfig: CFG,
    verifiedJobIds: new Set([7]),        // completion check passed
    dailyVerifiedJobDays: new Set(),     // nobody ran a daily check
  })

  it('coverage zeroes the raw total while the row keeps the real money', () => {
    const { bonus, details } = run()
    expect(bonus).toBe(0)                            // what the headline used to show
    const row = bonusRowAmount(details[0])
    expect(row.held).toBe(false)                     // released — payroll pays it
    expect(row.amount).toBeCloseTo(1440, 2)          // 60 saved h x $30 x 80%
  })

  it('summing through bonusRowAmount gives the headline the ledger number', () => {
    const { details } = run()
    const earned = details.reduce((s, d) => {
      const { amount, held } = bonusRowAmount(d)
      return held ? s : s + amount
    }, 0)
    expect(earned).toBeCloseTo(1440, 2)
  })
})

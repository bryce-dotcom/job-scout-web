import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { calculateEfficiencyBonus, computeJobBonusRows, bonusRowAmount } from './bonusCalc'

// Backstops on a bonus computed from hours that are not all in, and a ceiling
// on what a job can hand back. Bryce, 2 Oct 2026, looking at Cameron's $5k:
// "how is cameron's bonus 5k?" and "if people forgot to clock into the job it
// really f***s it all up so need to have a backstop of some sort."
//
// The allotment on flat-priced work is the price over the default hourly rate
// (lib/allottedHours), so "saved hours" is really "labour money not spent".
// Three things inflate it, and each gets its own answer here:
//   job not finished      -> HELD (the rest of the hours have not happened)
//   unassigned crew time  -> HELD (the hours went to General, not the job)
//   a share of the price  -> CAPPED (the pool cannot exceed X% of what it sold for)
// The first two hold at full value — verification is a flag, not a wipe — so
// Payroll can still release them. Only the cap changes a number.

const EMPLOYEES = [{ id: 1, name: 'Lead' }, { id: 2, name: 'Hand' }]
const CFG = { efficiency_bonus_enabled: true, efficiency_bonus_rate: 30, company_bonus_cut_percent: 20, bonus_min_hours_saved: 0.5, bonus_verification_gate: 'off' }
// 100 allotted, 40 worked over four days: 60 saved, 2.5x, under the 3x guard.
const DAYS = ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24']
const JOB = { id: 7, job_id: 'JOB-7', job_title: 'Pressure wash', allotted_time_hours: 100, job_total: 4000, status: 'Invoiced' }
const ENTRIES = DAYS.map(date => ({ employee_id: 1, job_id: 7, hours: 10, date }))
const CLOCK = DAYS.map(date => ({ employee_id: 1, job_id: 7, total_hours: 10, clock_in: `${date}T14:00:00Z`, clock_out: `${date}T23:59:00Z` }))
const DELIVERED = new Set(['Completed', 'Invoiced', 'Closed'])

const run = (over = {}) => calculateEfficiencyBonus({
  employeeId: 1, timeLogEntries: ENTRIES, timeClockRows: CLOCK, jobs: [over.job || JOB],
  employees: EMPLOYEES, skillLevels: [], payrollConfig: over.payrollConfig || CFG,
  deliveredStatusIds: over.deliveredStatusIds, unassignedHoursByCrewDay: over.unassignedHoursByCrewDay,
})

describe('a bonus on a job that is not finished', () => {
  it('pays when the job is in a delivered status', () => {
    const { bonus, details } = run({ deliveredStatusIds: DELIVERED })
    expect(bonus).toBeCloseTo(1440, 2)                 // 60h x $30 x 80%
    expect(details[0].blockedReason).toBeUndefined()
  })

  it('is HELD while the job is still open, at its full value', () => {
    const job = { ...JOB, status: 'In Progress' }
    const { bonus, details } = run({ job, deliveredStatusIds: DELIVERED })
    expect(bonus).toBe(0)
    expect(details[0].blockedReason).toBe('job_not_finished')
    expect(bonusRowAmount(details[0])).toEqual({ amount: 1440, held: true })
  })

  it('does nothing at all when the caller passes no status set', () => {
    const job = { ...JOB, status: 'In Progress' }
    expect(run({ job }).bonus).toBeCloseTo(1440, 2)
  })

  it('an admin override still releases a job that is not finished', () => {
    const job = { ...JOB, status: 'In Progress' }
    const { bonus } = calculateEfficiencyBonus({
      employeeId: 1, timeLogEntries: ENTRIES, timeClockRows: CLOCK, jobs: [job],
      employees: EMPLOYEES, skillLevels: [], payrollConfig: CFG,
      deliveredStatusIds: DELIVERED, bonusOverrides: [{ job_id: 7, employee_id: 1 }],
    })
    expect(bonus).toBeCloseTo(1440, 2)
  })
})

describe('a crew member who clocked time with no job on it', () => {
  it('holds the bonus when the loose time lands on a day they worked the job', () => {
    const { bonus, details } = run({
      deliveredStatusIds: DELIVERED,
      // 12h loose against 40h on the job = 30%, over the 25% line.
      unassignedHoursByCrewDay: new Map([['1|2026-09-22', 12]]),
    })
    expect(bonus).toBe(0)
    expect(details[0].blockedReason).toBe('unassigned_crew_hours')
    expect(bonusRowAmount(details[0]).amount).toBeCloseTo(1440, 2)   // held, not wiped
  })

  it('ignores loose time on a day nobody worked this job', () => {
    const { bonus } = run({
      deliveredStatusIds: DELIVERED,
      unassignedHoursByCrewDay: new Map([['1|2026-08-01', 12], ['2|2026-09-22', 12]]),
    })
    expect(bonus).toBeCloseTo(1440, 2)
  })
})

describe('the cap: a share of what the job sold for', () => {
  // $4,000 job, $1,440 uncapped pool = 36% of the price.
  const capped = (pct) => run({
    deliveredStatusIds: DELIVERED,
    payrollConfig: { ...CFG, bonus_max_percent_of_job: pct },
  })

  it('is off unless the company sets a percentage', () => {
    expect(run({ deliveredStatusIds: DELIVERED }).bonus).toBeCloseTo(1440, 2)
    expect(capped('').bonus).toBeCloseTo(1440, 2)
    expect(capped(0).bonus).toBeCloseTo(1440, 2)
  })

  it('caps the crew pool at the percentage of the job price', () => {
    const { bonus, details } = capped(10)
    expect(bonus).toBeCloseTo(400, 2)                  // 10% of $4,000
    expect(details[0].cappedByPercentOfJob).toBe(10)
  })

  it('leaves a bonus already under the ceiling alone', () => {
    const { bonus, details } = capped(50)
    expect(bonus).toBeCloseTo(1440, 2)
    expect(details[0].cappedByPercentOfJob).toBeNull()
  })

  it('caps the POOL, so a bigger crew cannot multiply it', () => {
    const entries = [...ENTRIES, ...DAYS.map(date => ({ employee_id: 2, job_id: 7, hours: 5, date }))]
    const clock = [...CLOCK, ...DAYS.map(date => ({ employee_id: 2, job_id: 7, total_hours: 5, clock_in: `${date}T14:00:00Z`, clock_out: `${date}T19:00:00Z` }))]
    const forEmp = (employeeId) => calculateEfficiencyBonus({
      employeeId, timeLogEntries: entries, timeClockRows: clock, jobs: [JOB],
      employees: EMPLOYEES, skillLevels: [], payrollConfig: { ...CFG, bonus_max_percent_of_job: 10 },
      deliveredStatusIds: DELIVERED,
    }).bonus
    expect(forEmp(1) + forEmp(2)).toBeCloseTo(400, 2)
  })

  it('a held row shows the capped money, not the uncapped money', () => {
    const job = { ...JOB, status: 'In Progress' }
    const { details } = run({ job, deliveredStatusIds: DELIVERED, payrollConfig: { ...CFG, bonus_max_percent_of_job: 10 } })
    expect(details[0].blockedReason).toBe('job_not_finished')
    expect(bonusRowAmount(details[0]).amount).toBeCloseTo(400, 2)
  })

  it('a job with no price is left alone — nothing to take a share of', () => {
    const job = { ...JOB, job_total: 0 }
    expect(run({ job, deliveredStatusIds: DELIVERED, payrollConfig: { ...CFG, bonus_max_percent_of_job: 10 } }).bonus).toBeCloseTo(1440, 2)
  })
})

describe('what the ledger stores', () => {
  it('records a held row at full value with the reason, so Payroll can release it', () => {
    const rows = computeJobBonusRows({
      job: { ...JOB, status: 'In Progress' }, timeClockRows: CLOCK,
      employees: EMPLOYEES, skillLevels: [], payrollConfig: CFG,
      deliveredStatusIds: DELIVERED,
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].amount).toBeCloseTo(1440, 2)
    expect(rows[0].needs_verification).toBe(true)
    expect(rows[0].release_reason).toBe('job_not_finished')
  })
})

// Both callers have to hand the engine the inputs, and neither can be caught
// by a unit test of the engine — same lesson as bonusVerificationWiring.
const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf8')

describe('the callers pass the backstops', () => {
  for (const [page, file] of [['Payroll', 'src/pages/Payroll.jsx'], ['Field Scout', 'src/pages/FieldScout.jsx']]) {
    it(`${page} passes deliveredStatusIds and unassignedHoursByCrewDay`, () => {
      const src = read(file)
      expect(src).toMatch(/deliveredStatusIds[:,]/)
      expect(src).toMatch(/unassignedHoursByCrewDay[:,]/)
      expect(src).toMatch(/getDeliveredStatusIds/)
    })
  }

  it('both pages select job_total, which the cap is a share of', () => {
    for (const file of ['src/pages/Payroll.jsx', 'src/pages/FieldScout.jsx']) {
      const src = read(file)
      const at = src.indexOf(".from('jobs')")
      expect(src.slice(at, at + 1600)).toMatch(/\.select\('[^']*job_total[^']*'\)/)
    }
  })
})

describe('how much loose time is enough to hold a bonus', () => {
  // 40 hours recorded on the job. The line is a quarter of that.
  const withLoose = (hours) => calculateEfficiencyBonus({
    employeeId: 1, timeLogEntries: ENTRIES, timeClockRows: CLOCK, jobs: [JOB],
    employees: EMPLOYEES, skillLevels: [], payrollConfig: CFG,
    deliveredStatusIds: DELIVERED,
    unassignedHoursByCrewDay: new Map([['1|2026-09-22', hours]]),
  })

  it('ordinary shop and drive time does not hold anything', () => {
    expect(withLoose(2).bonus).toBeCloseTo(1440, 2)      // 5% — the HHH median
    expect(withLoose(9).bonus).toBeCloseTo(1440, 2)      // 22.5%, still under
  })

  it('holds once a quarter of the job time is unaccounted for', () => {
    const { bonus, details } = withLoose(10)             // 25% exactly
    expect(bonus).toBe(0)
    expect(details[0].blockedReason).toBe('unassigned_crew_hours')
    expect(details[0].unassignedHours).toBe(10)
    expect(details[0].unassignedRatio).toBe(0.25)
  })

  it('counts one person-day once, however many punches it took', () => {
    const clock = [...CLOCK, { employee_id: 1, job_id: 7, total_hours: 0, clock_in: '2026-09-22T20:00:00Z', clock_out: '2026-09-22T20:30:00Z' }]
    const { details } = calculateEfficiencyBonus({
      employeeId: 1, timeLogEntries: ENTRIES, timeClockRows: clock, jobs: [JOB],
      employees: EMPLOYEES, skillLevels: [], payrollConfig: CFG,
      deliveredStatusIds: DELIVERED,
      unassignedHoursByCrewDay: new Map([['1|2026-09-22', 10]]),
    })
    expect(details[0].unassignedHours).toBe(10)          // not 20
  })
})

describe('review, rather than a quiet cut', () => {
  // Bryce, 2 Oct 2026: "is the cap the way to go or if the bonus goes over
  // just a flag for doug london or managers to look at?" — review won. The
  // ceiling stays in the code, blank, for when nobody works the queue.
  const review = (pct, extra = {}) => calculateEfficiencyBonus({
    employeeId: 1, timeLogEntries: ENTRIES, timeClockRows: CLOCK, jobs: [JOB],
    employees: EMPLOYEES, skillLevels: [], deliveredStatusIds: DELIVERED,
    payrollConfig: { ...CFG, bonus_review_percent_of_job: pct, ...extra },
  })

  it('is off unless the company sets a percentage', () => {
    expect(review(undefined).bonus).toBeCloseTo(1440, 2)
    expect(review('').bonus).toBeCloseTo(1440, 2)
  })

  it('holds the whole amount for review, it does not shave it', () => {
    const { bonus, details } = review(10)              // pool is 36% of $4,000
    expect(bonus).toBe(0)
    expect(details[0].blockedReason).toBe('over_percent_of_job')
    expect(bonusRowAmount(details[0])).toEqual({ amount: 1440, held: true })
    expect(details[0].poolPercentOfJob).toBe(36)
    expect(details[0].reviewPercentOfJob).toBe(10)
  })

  it('leaves a bonus under the threshold alone', () => {
    const { bonus, details } = review(40)
    expect(bonus).toBeCloseTo(1440, 2)
    expect(details[0].poolPercentOfJob).toBe(36)
  })

  it('an admin override releases a reviewed bonus, like every other hold', () => {
    const { bonus } = calculateEfficiencyBonus({
      employeeId: 1, timeLogEntries: ENTRIES, timeClockRows: CLOCK, jobs: [JOB],
      employees: EMPLOYEES, skillLevels: [], deliveredStatusIds: DELIVERED,
      payrollConfig: { ...CFG, bonus_review_percent_of_job: 10 },
      bonusOverrides: [{ job_id: 7, employee_id: 1 }],
    })
    expect(bonus).toBeCloseTo(1440, 2)
  })

  it('review and the ceiling work together: held, at the capped figure', () => {
    const { bonus, details } = review(10, { bonus_max_percent_of_job: 20 })
    expect(bonus).toBe(0)
    expect(details[0].blockedReason).toBe('over_percent_of_job')
    expect(bonusRowAmount(details[0]).amount).toBeCloseTo(800, 2)   // 20% of $4,000
  })

  it('the ledger records it as a held row with the reason', () => {
    const rows = computeJobBonusRows({
      job: JOB, timeClockRows: CLOCK, employees: EMPLOYEES, skillLevels: [],
      payrollConfig: { ...CFG, bonus_review_percent_of_job: 10 },
      deliveredStatusIds: DELIVERED,
    })
    expect(rows[0].release_reason).toBe('over_percent_of_job')
    expect(rows[0].needs_verification).toBe(true)
    expect(rows[0].amount).toBeCloseTo(1440, 2)
  })
})

describe('nobody releases their own bonus', () => {
  const payroll = read('src/pages/Payroll.jsx')

  it('the handler refuses it', () => {
    expect(payroll).toMatch(/bonusRow\.employee_id === adminEmp\.id/)
    expect(payroll).toMatch(/This is your own bonus/)
  })

  it('and the button is not even offered', () => {
    expect(payroll).toMatch(/b\.employee_id !== signedInEmployeeId/)
  })
})

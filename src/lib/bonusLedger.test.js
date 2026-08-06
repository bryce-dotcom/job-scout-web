import { describe, it, expect } from 'vitest'
import { syncJobBonuses, bonusStatusLabel } from './bonusLedger'

// ─────────────────────────────────────────────────────────────────────────
// The ledger is what actually gets paid — bonusCalc only computes. Its whole
// job is remembering things a recompute must not undo:
//   - a PAID bonus is frozen forever (recomputing it is a double-pay or a
//     silent clawback, depending on which way the number moved)
//   - pending becomes accrued only once the customer's money lands
//   - accrued_at is the date it was earned, not the date of the last sync
//   - a human's verification override survives the next recompute
// None of that was tested.
// ─────────────────────────────────────────────────────────────────────────

// Minimal Supabase stand-in: serves `existing` to the select, captures upserts.
function fakeSupabase(existing = []) {
  const captured = []
  const client = {
    from() { return client },
    select() { return client },
    eq() { return Promise.resolve({ data: existing }) },
    upsert(rows) { captured.push(...rows); return Promise.resolve({ error: null }) },
  }
  return { client, captured }
}

const CFG = {
  efficiency_bonus_enabled: true,
  efficiency_bonus_rate: 30,
  company_bonus_cut_percent: 0,
  bonus_min_hours_saved: 0,
}
const EXEMPT = ['Test BU']   // bypass the Victor gate; the gate has its own tests
const JOB = { id: 900, business_unit: 'Test BU', allotted_time_hours: 10, status: 'Completed' }
const SHIFT = { id: 's1', employee_id: 7, job_id: 900, hours: 6, date: '2026-07-20', clock_in: '2026-07-20T14:00:00Z', clock_out: '2026-07-20T20:00:00Z' }
const EMPLOYEES = [{ id: 7, name: 'Tech', active: true }]

async function sync({ existing = [], paid = 0, overrides = [] } = {}) {
  const { client, captured } = fakeSupabase(existing)
  const result = await syncJobBonuses({
    supabase: client, companyId: 3,
    jobs: [JOB], timeClockRows: [SHIFT], employees: EMPLOYEES, skillLevels: [],
    payrollConfig: CFG,
    verifiedJobIds: new Set(),
    jobPaymentStatus: new Map([[900, { paid, total: 5000 }]]),
    bonusOverrides: overrides,
    verificationExemptUnits: EXEMPT,
  })
  return { result, captured }
}

describe('a bonus counts the whole job, not one pay period', () => {
  // Payroll used to hand this the period-scoped time_clock query, so a job
  // worked across two pay periods only counted the hours inside the selected
  // one. Actual hours came out low, saved hours came out high, and the bonus
  // overpaid. 63 of 142 unpaid ledger rows were wrong before the fix — worst
  // case 24.39 hours recorded against 85.28 worked, carrying $1,166.93. It is
  // also why "I changed the hours and the bonus didn't move" kept recurring:
  // the changed hours sat outside the window.
  const JULY = { id: 's-jul', employee_id: 7, job_id: 900, hours: 6, date: '2026-07-20', clock_in: '2026-07-20T14:00:00Z', clock_out: '2026-07-20T20:00:00Z' }
  const AUGUST = { id: 's-aug', employee_id: 7, job_id: 900, hours: 3, date: '2026-08-03', clock_in: '2026-08-03T14:00:00Z', clock_out: '2026-08-03T17:00:00Z' }

  const syncWith = async (rows) => {
    const { client, captured } = fakeSupabase([])
    await syncJobBonuses({
      supabase: client, companyId: 3,
      jobs: [JOB], timeClockRows: rows, employees: EMPLOYEES, skillLevels: [],
      payrollConfig: CFG,
      verifiedJobIds: new Set(),
      jobPaymentStatus: new Map([[900, { paid: 5000, total: 5000 }]]),
      bonusOverrides: [],
      verificationExemptUnits: EXEMPT,
    })
    return captured
  }

  it('sums every punch on the job, across periods', async () => {
    const both = await syncWith([JULY, AUGUST])
    expect(both).toHaveLength(1)
    expect(both[0].actual_hours).toBeCloseTo(9, 2)   // 6 + 3, not 6
  })

  it('pays less than the truncated view would have', async () => {
    // The old behaviour: only July's 6h visible against 10h allotted.
    const julyOnly = await syncWith([JULY])
    const whole = await syncWith([JULY, AUGUST])
    expect(julyOnly[0].actual_hours).toBeCloseTo(6, 2)
    expect(whole[0].saved_hours).toBeLessThan(julyOnly[0].saved_hours)
    expect(whole[0].amount).toBeLessThan(julyOnly[0].amount)
  })
})

describe('money-in flips pending to accrued', () => {
  it('is pending while the customer has not paid', async () => {
    const { result, captured } = await sync({ paid: 0 })
    expect(captured).toHaveLength(1)
    expect(captured[0].status).toBe('pending')
    expect(result.pendingTotal).toBeGreaterThan(0)
    expect(result.accruedTotal).toBe(0)
  })

  it('becomes accrued once money has landed', async () => {
    const { result, captured } = await sync({ paid: 2500 })
    expect(captured[0].status).toBe('accrued')
    expect(result.accruedTotal).toBeGreaterThan(0)
    expect(result.pendingTotal).toBe(0)
  })

  it('a trivial rounding payment does not count as money in', async () => {
    const { captured } = await sync({ paid: 0.001 })
    expect(captured[0].status).toBe('pending')
  })

  it('stamps accrued_at only when accrued', async () => {
    expect((await sync({ paid: 0 })).captured[0].accrued_at).toBeNull()
    expect((await sync({ paid: 2500 })).captured[0].accrued_at).toBeTruthy()
  })
})

describe('a paid bonus is frozen', () => {
  it('NEVER re-upserts a row already marked paid', async () => {
    // The whole point: recomputing a paid bonus either pays it twice or
    // silently claws it back when an estimate is edited afterwards.
    const { captured } = await sync({
      existing: [{ job_id: 900, employee_id: 7, status: 'paid', accrued_at: '2026-07-01T00:00:00Z' }],
    })
    expect(captured).toHaveLength(0)
  })

  it('a paid row contributes nothing to the accrued or pending totals', async () => {
    const { result } = await sync({
      existing: [{ job_id: 900, employee_id: 7, status: 'paid' }],
      paid: 2500,
    })
    expect(result.accruedTotal).toBe(0)
    expect(result.pendingTotal).toBe(0)
    expect(result.upserted).toBe(0)
  })

  it('still syncs an unpaid row for a different employee on the same job', async () => {
    const { captured } = await sync({
      existing: [{ job_id: 900, employee_id: 99, status: 'paid' }],
    })
    expect(captured).toHaveLength(1)
    expect(captured[0].employee_id).toBe(7)
  })
})

describe('a re-sync preserves what was already established', () => {
  it('keeps the ORIGINAL accrued_at instead of resetting it to now', async () => {
    // Otherwise every sync moves the earned date forward and the bonus
    // drifts into whatever pay period happens to be open.
    const earned = '2026-07-01T12:00:00Z'
    const { captured } = await sync({
      existing: [{ job_id: 900, employee_id: 7, status: 'accrued', accrued_at: earned }],
      paid: 2500,
    })
    expect(captured[0].accrued_at).toBe(earned)
  })

  it('keeps a human verification override rather than re-flagging it', async () => {
    const { captured } = await sync({
      existing: [{
        job_id: 900, employee_id: 7, status: 'pending',
        needs_verification: false,
        verification_overridden_by: 'admin-42',
        verification_overridden_at: '2026-07-02T00:00:00Z',
      }],
    })
    expect(captured[0].needs_verification).toBe(false)
    expect(captured[0].verification_overridden_by).toBe('admin-42')
    expect(captured[0].release_reason).toBe('admin_override')
  })

  it('does not invent an override that was never granted', async () => {
    const { captured } = await sync({
      existing: [{ job_id: 900, employee_id: 7, status: 'pending', needs_verification: false, verification_overridden_by: null }],
    })
    expect(captured[0].verification_overridden_by).toBeNull()
  })
})

describe('what the ledger refuses to write', () => {
  it('writes nothing without a company', async () => {
    const { client } = fakeSupabase()
    const r = await syncJobBonuses({ supabase: client, companyId: null })
    expect(r).toEqual({ upserted: 0, accruedTotal: 0, pendingTotal: 0 })
  })

  it('skips a job with no allotted estimate', async () => {
    const { client, captured } = fakeSupabase()
    await syncJobBonuses({
      supabase: client, companyId: 3,
      jobs: [{ ...JOB, allotted_time_hours: null }], timeClockRows: [SHIFT],
      employees: EMPLOYEES, payrollConfig: CFG, verificationExemptUnits: EXEMPT,
    })
    expect(captured).toHaveLength(0)
  })

  it('skips a job nobody clocked into', async () => {
    const { client, captured } = fakeSupabase()
    await syncJobBonuses({
      supabase: client, companyId: 3,
      jobs: [JOB], timeClockRows: [],
      employees: EMPLOYEES, payrollConfig: CFG, verificationExemptUnits: EXEMPT,
    })
    expect(captured).toHaveLength(0)
  })

  it('every written row carries the company and a finite amount', async () => {
    const { captured } = await sync({ paid: 2500 })
    for (const r of captured) {
      expect(r.company_id).toBe(3)
      expect(Number.isFinite(r.amount)).toBe(true)
      expect(r.amount).toBeGreaterThan(0)
    }
  })
})

describe('bonusStatusLabel', () => {
  it('names each state the way payroll reads it', () => {
    expect(bonusStatusLabel({ status: 'paid' }).label).toBe('Paid')
    expect(bonusStatusLabel({ status: 'accrued' }).label).toBe('Owed')
    expect(bonusStatusLabel({ status: 'pending' }).label).toBe('Upcoming')
    expect(bonusStatusLabel({ status: 'void' }).label).toBe('Void')
  })

  it('treats an unknown status as upcoming, never as paid', () => {
    expect(bonusStatusLabel({ status: 'weird' }).label).toBe('Upcoming')
    expect(bonusStatusLabel({}).label).toBe('Upcoming')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Removing a bonus that is no longer earned.
//
// Alayda, job 21004 "175 W Warehouse": the ledger claimed 172.53 hours saved
// and $4,140.72 of bonus, while the crew had clocked 1,249.3 hours against
// 808.18 allotted — 441 hours OVER. computeJobBonusRows correctly returns
// nothing once hours exceed allotted, but syncJobBonuses only ever upserted,
// so the stale rows sat there earning money no matter how many times the
// hours were corrected. That is why "we fixed it" three times and didn't.
// ─────────────────────────────────────────────────────────────────────────
describe('a bonus that is no longer earned', () => {
  const makeClient = (existing, log) => ({
    from: () => ({
      select: () => ({ eq: () => Promise.resolve({ data: existing }) }),
      upsert: (rows) => { log.upserted.push(...rows); return Promise.resolve({ error: null }) },
      delete: () => {
        const f = {}
        const chain = { eq: (col, val) => { f[col] = val; return chain }, neq: () => { log.deleted.push(f); return Promise.resolve({ error: null }) } }
        return chain
      },
    }),
  })

  const overworkedJob = { id: 21004, allotted_time_hours: 808.18, business_unit: 'Energy Scout' }
  // 1,249.3 hours clocked against 808.18 allotted — nothing saved.
  const timeClockRows = [
    { job_id: 21004, employee_id: 104, clock_in: '2026-06-01T12:00:00Z', clock_out: '2026-06-01T22:00:00Z', total_hours: 667.6 },
    { job_id: 21004, employee_id: 19, clock_in: '2026-06-01T12:00:00Z', clock_out: '2026-06-01T22:00:00Z', total_hours: 581.7 },
  ]

  it('deletes the stale unpaid rows instead of leaving them to pay out', async () => {
    const log = { upserted: [], deleted: [] }
    const existing = [
      { job_id: 21004, employee_id: 104, status: 'accrued' },
      { job_id: 21004, employee_id: 19, status: 'accrued' },
    ]
    const res = await syncJobBonuses({
      supabase: makeClient(existing, log), companyId: 3,
      jobs: [overworkedJob], timeClockRows, employees: [], skillLevels: [], payrollConfig: {},
    })
    expect(res.removed).toBe(2)
    expect(log.deleted.map(d => d.employee_id).sort((a, b) => a - b)).toEqual([19, 104])
  })

  it('never removes a bonus that was already paid', async () => {
    const log = { upserted: [], deleted: [] }
    const existing = [{ job_id: 21004, employee_id: 104, status: 'paid' }]
    const res = await syncJobBonuses({
      supabase: makeClient(existing, log), companyId: 3,
      jobs: [overworkedJob], timeClockRows, employees: [], skillLevels: [], payrollConfig: {},
    })
    expect(res.removed).toBe(0)
    expect(log.deleted).toEqual([])
  })

  it('leaves other jobs alone when syncing one job', async () => {
    // Scoping matters: a caller syncing a single job must not wipe the ledger.
    const log = { upserted: [], deleted: [] }
    const existing = [
      { job_id: 21004, employee_id: 104, status: 'accrued' },
      { job_id: 99999, employee_id: 104, status: 'accrued' },
    ]
    await syncJobBonuses({
      supabase: makeClient(existing, log), companyId: 3,
      jobs: [overworkedJob], timeClockRows, employees: [], skillLevels: [], payrollConfig: {},
    })
    expect(log.deleted.map(d => d.job_id)).toEqual([21004])
  })

  it('does not touch a job it never evaluated', async () => {
    // No time entries -> the job is skipped entirely, so its rows must stand.
    const log = { upserted: [], deleted: [] }
    const existing = [{ job_id: 21004, employee_id: 104, status: 'accrued' }]
    const res = await syncJobBonuses({
      supabase: makeClient(existing, log), companyId: 3,
      jobs: [overworkedJob], timeClockRows: [], employees: [], skillLevels: [], payrollConfig: {},
    })
    expect(res.removed).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// How a bonus is labelled. Alayda, twice: "the bonuses are labeled by what
// they are doing on the job not by customer, we need to be able to click into
// the job to see what they are referring to."
// ─────────────────────────────────────────────────────────────────────────
import { bonusJobLabel } from './bonusLedger'

describe('labelling a bonus', () => {
  it('shows the customer AND the site on one line', () => {
    // Neither alone is enough: of 54 customers behind live bonuses, 12 cover
    // more than one job.
    const row = {
      job_id: 23305,
      jobs: { job_title: 'Commercial Window Cleaning - Store Front', job_id: 'JOB-X', customer: { business_name: 'Costco' } },
    }
    expect(bonusJobLabel(row).heading).toBe('Costco — Commercial Window Cleaning - Store Front')
  })

  it('does not repeat the customer when the title already starts with it', () => {
    // Steve Auto has three sites. "Steve Auto — Steve Auto Clearfield" is noise.
    const row = { job_id: 1, jobs: { job_title: 'Steve Auto Clearfield', customer: { business_name: 'Steve Auto' } } }
    expect(bonusJobLabel(row).heading).toBe('Steve Auto — Clearfield')
  })

  it('collapses to one name when the site IS the account', () => {
    const row = { job_id: 1, jobs: { job_title: 'Green River Merc', customer: { business_name: 'Green River Merc.' } } }
    expect(bonusJobLabel(row).heading).toBe('Green River Merc.')
  })

  it('keeps a site belonging to a differently-named account', () => {
    // Dave's account is "Green River Merc." but job 23018 is at Drinkle — the
    // title is the real company, which is what made this row read oddly.
    const row = { job_id: 23018, jobs: { job_title: 'WY Drinkle Ins Agency', customer: { business_name: 'Green River Merc.' } } }
    expect(bonusJobLabel(row).heading).toBe('Green River Merc. — WY Drinkle Ins Agency')
  })

  it('prefers the business name over a contact name', () => {
    const row = { job_id: 1, jobs: { customer: { name: 'Dave', business_name: 'Green River Merc.' } } }
    expect(bonusJobLabel(row).heading).toBe('Green River Merc.')
  })

  it('falls back to jobs.customer_name when there is no linked customer', () => {
    const row = { job_id: 1, jobs: { customer_name: 'Kimball Investment Co', job_title: 'Power Wash' } }
    expect(bonusJobLabel(row).heading).toBe('Kimball Investment Co — Power Wash')
  })

  it('uses the title alone when nothing identifies the customer', () => {
    const row = { job_id: 23339, jobs: { job_title: 'Nicole Webster - Exterior Window Cleaning' } }
    expect(bonusJobLabel(row).heading).toBe('Nicole Webster - Exterior Window Cleaning')
  })

  it('never renders a blank row', () => {
    expect(bonusJobLabel({ job_id: 999, jobs: {} }).heading).toBe('Job 999')
    expect(bonusJobLabel({}).heading).toBe('Job')
    expect(bonusJobLabel(null).heading).toBe('Job')
  })

  it('carries the job number and the id needed to open the job', () => {
    const row = { job_id: 21004, jobs: { job_id: 'JOB-MNQHM69Z', customer: { name: 'X' } } }
    expect(bonusJobLabel(row).subtitle).toBe('JOB-MNQHM69Z')
    expect(bonusJobLabel(row).jobId).toBe(21004)
    expect(bonusJobLabel(null).jobId).toBeNull()
  })
})

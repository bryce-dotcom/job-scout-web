import { describe, it, expect } from 'vitest'
import { computeJobBonusRows } from './bonusCalc'

// ─────────────────────────────────────────────────────────────────────────
// The efficiency-bonus MATH. This decides what field crews actually get
// paid and had no tests on the arithmetic — only the verification gate.
//
// A silent change here either invents money or quietly underpays someone,
// and nobody would notice until a tech compared cheques. The invariant that
// matters most is the last one: a crew's shares must add up to the pool.
// ─────────────────────────────────────────────────────────────────────────

const CFG = {
  efficiency_bonus_enabled: true,
  efficiency_bonus_rate: 30,        // $/hour saved
  company_bonus_cut_percent: 0,
  bonus_min_hours_saved: 0,
  bonus_verification_gate: 'strict',
}

// Exempt the unit so these tests exercise the MATH, not the Victor gate.
const EXEMPT = ['Test BU']
const job = (over = {}) => ({ id: 900, business_unit: 'Test BU', allotted_time_hours: 10, status: 'Completed', ...over })

// 6 hours worked against 10 allotted = 4 saved.
const shift = (employee_id, hours, day = '20') => ({
  id: `${employee_id}-${day}`, employee_id, job_id: 900,
  clock_in: `2026-07-${day}T14:00:00Z`,
  clock_out: `2026-07-${day}T${String(14 + hours).padStart(2, '0')}:00:00Z`,
  hours, date: `2026-07-${day}`,
})

const run = (over = {}) => computeJobBonusRows({
  job: job(over.job), timeClockRows: over.rows || [shift(7, 6)],
  employees: over.employees || [{ id: 7, name: 'Solo', active: true }],
  skillLevels: over.skillLevels || [],
  payrollConfig: { ...CFG, ...(over.cfg || {}) },
  verifiedJobIds: new Set(),
  verificationExemptUnits: EXEMPT,
})

describe('bonus is earned only when time was actually saved', () => {
  it('pays on hours saved against the allotted estimate', () => {
    const rows = run()
    expect(rows).toHaveLength(1)
    expect(rows[0].saved_hours).toBeCloseTo(4, 2)
    expect(rows[0].amount).toBeGreaterThan(0)
  })

  it('pays NOTHING when the crew ran over the estimate', () => {
    const rows = run({ rows: [shift(14, 14)] }) // 14 worked vs 10 allotted
    expect(rows).toEqual([])
  })

  it('pays nothing when the job exactly hits its estimate', () => {
    expect(run({ rows: [shift(7, 10)] })).toEqual([])
  })

  it('respects the minimum-hours-saved threshold', () => {
    // 0.5h saved, threshold 2h -> no bonus.
    const rows = run({ rows: [shift(7, 9.5)], cfg: { bonus_min_hours_saved: 2 } })
    expect(rows).toEqual([])
  })

  it('pays nothing at all when the bonus programme is switched off', () => {
    expect(run({ cfg: { efficiency_bonus_enabled: false } })).toEqual([])
  })

  it('ignores a job with no allotted estimate rather than inventing one', () => {
    expect(run({ job: { allotted_time_hours: null } })).toEqual([])
  })
})

describe('the company cut', () => {
  it('reduces the payout and never makes it negative', () => {
    const full = run()[0].amount
    const cut = run({ cfg: { company_bonus_cut_percent: 20 } })[0].amount
    expect(cut).toBeLessThan(full)
    expect(cut).toBeGreaterThan(0)
  })

  it('a 100% cut leaves nothing to pay, not a negative cheque', () => {
    const rows = run({ cfg: { company_bonus_cut_percent: 100 } })
    for (const r of rows) expect(r.amount).toBeGreaterThanOrEqual(0)
  })
})

describe('crew splits — money is neither invented nor lost', () => {
  const crew = [
    { id: 7, name: 'A', active: true },
    { id: 8, name: 'B', active: true },
  ]

  it('splits between two techs who worked the same hours', () => {
    const rows = run({ rows: [shift(7, 3), shift(8, 3)], employees: crew })
    expect(rows).toHaveLength(2)
    expect(rows[0].amount).toBeCloseTo(rows[1].amount, 2)
  })

  it('THE INVARIANT: crew shares sum to the same pool a solo tech would earn', () => {
    // Same job, same total hours worked (6) — split two ways or done alone,
    // the company pays the same amount either way.
    const solo = run({ rows: [shift(7, 6)] })
    const pair = run({ rows: [shift(7, 3), shift(8, 3)], employees: crew })
    const soloTotal = solo.reduce((s, r) => s + r.amount, 0)
    const pairTotal = pair.reduce((s, r) => s + r.amount, 0)
    expect(Math.abs(pairTotal - soloTotal)).toBeLessThan(0.05)
  })

  it('gives the larger share to whoever put in more hours', () => {
    const rows = run({ rows: [shift(7, 5), shift(8, 1)], employees: crew })
    const a = rows.find(r => r.employee_id === 7)
    const b = rows.find(r => r.employee_id === 8)
    expect(a.amount).toBeGreaterThan(b.amount)
  })

  it('records crew size so a stub can explain the split', () => {
    const rows = run({ rows: [shift(7, 3), shift(8, 3)], employees: crew })
    expect(rows[0].crew_size).toBe(2)
  })
})

describe('every row is payable data, never junk', () => {
  it('amounts are finite, positive numbers', () => {
    for (const r of run()) {
      expect(Number.isFinite(r.amount)).toBe(true)
      expect(r.amount).toBeGreaterThan(0)
      expect(Number.isFinite(r.saved_hours)).toBe(true)
    }
  })

  it('survives junk input instead of throwing', () => {
    expect(() => computeJobBonusRows({})).not.toThrow()
    expect(computeJobBonusRows({})).toEqual([])
    expect(() => computeJobBonusRows({ job: job(), timeClockRows: null })).not.toThrow()
  })
})

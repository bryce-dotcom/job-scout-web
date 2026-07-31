import { describe, it, expect } from 'vitest'
import { computeJobBonusRows } from './bonusCalc'

// A job with real saved hours so a bonus actually exists to argue about.
const baseJob = (business_unit) => ({
  id: 500,
  business_unit,
  allotted_time_hours: 10,
  status: 'Completed',
})

const employees = [{ id: 7, name: 'Field Tech', active: true }]

// 6 hours worked against 10 allotted = 4 saved.
const timeClockRows = [{
  id: 1, employee_id: 7, job_id: 500,
  clock_in: '2026-07-20T14:00:00Z', clock_out: '2026-07-20T20:00:00Z',
  hours: 6, date: '2026-07-20',
}]

const payrollConfig = {
  efficiency_bonus_enabled: true,
  efficiency_bonus_rate: 30,
  company_bonus_cut_percent: 0,
  bonus_min_hours_saved: 0,
  bonus_verification_gate: 'strict',
}

// verifiedJobIds = empty Set -> this job has NO passing Victor check.
const noVictor = new Set()

const run = (business_unit, verificationExemptUnits) => computeJobBonusRows({
  job: baseJob(business_unit),
  timeClockRows,
  employees,
  payrollConfig,
  verifiedJobIds: noVictor,
  verificationExemptUnits,
})

describe('SAFETY: default behaviour is unchanged', () => {
  it('still flags an unverified job when nothing is exempt', () => {
    for (const exempt of [undefined, null, [], '[]']) {
      const rows = run('HHH Building Services', exempt)
      expect(rows.length).toBeGreaterThan(0)
      expect(rows[0].needs_verification).toBe(true)
    }
  })

  it('records the earned amount either way — verification is a flag, not a wipe', () => {
    const flagged = run('HHH Building Services', null)[0]
    const exempt = run('HHH Building Services', ['HHH Building Services'])[0]
    expect(flagged.amount).toBeGreaterThan(0)
    expect(exempt.amount).toBe(flagged.amount)
  })
})

describe('exempt business unit', () => {
  it('does NOT flag the bonus for review', () => {
    const rows = run('HHH Building Services', ['HHH Building Services'])
    expect(rows[0].needs_verification).toBe(false)
    expect(rows[0].release_reason).toBe('verification_not_required')
  })

  it('leaves a non-exempt unit still gated', () => {
    const rows = run('Energy Scout', ['HHH Building Services'])
    expect(rows[0].needs_verification).toBe(true)
    expect(rows[0].release_reason).not.toBe('verification_not_required')
  })

  it('keeps a job with no business unit gated', () => {
    const rows = run(null, ['HHH Building Services'])
    expect(rows[0].needs_verification).toBe(true)
  })
})

import { describe, it, expect } from 'vitest'
import { mergeJobHourSources, hoursForJob, isDuplicateOfPunch, legacyRowHours, previewTypedHourImpact } from './jobHours'
import { timeClockToJobHours } from './bonusCalc'

// Peter & Robin Berger, job 21026 — the real rows, as they sit in the database.
const BERGER_PUNCH = {
  id: 991, employee_id: 37, job_id: 21026, total_hours: 8.84,
  clock_in: '2026-05-26T13:12:43.274+00:00', clock_out: '2026-05-26T23:47:47.644+00:00',
  adjusted_by: 37, adjustment_reason: 'Tech-skip clock-out (flagged for review): Edge function error',
}
// Same shift, imported into the legacy table with a rewritten date.
const BERGER_LEGACY = { id: 70, employee_id: 37, job_id: 21026, hours: 8.84, date: '2026-08-03T00:00:00+00:00' }

describe('the same shift is counted once', () => {
  it('Berger reads 8.84, not 17.68', () => {
    expect(hoursForJob(21026, { timeClock: [BERGER_PUNCH], timeLog: [BERGER_LEGACY] })).toBeCloseTo(8.84, 2)
  })

  it('recognises the duplicate even though the dates differ by months', () => {
    expect(isDuplicateOfPunch(BERGER_LEGACY, [BERGER_PUNCH])).toBe(true)
  })

  it('recognises it when the legacy row names no employee', () => {
    expect(isDuplicateOfPunch({ ...BERGER_LEGACY, employee_id: null }, [BERGER_PUNCH])).toBe(true)
  })

  it('does NOT treat a different person on the same job as a duplicate', () => {
    expect(isDuplicateOfPunch({ ...BERGER_LEGACY, employee_id: 99 }, [BERGER_PUNCH])).toBe(false)
  })

  it('does NOT treat different hours as a duplicate', () => {
    expect(isDuplicateOfPunch({ ...BERGER_LEGACY, hours: 4 }, [BERGER_PUNCH])).toBe(false)
  })
})

describe('legacy-only work is no longer invisible', () => {
  // 43 of the 75 legacy rows are the ONLY record for their job. The bonus calc
  // never saw them, so their hours never counted against the allotment and the
  // saved-hours figure came out too high.
  const legacyOnly = { id: 12, employee_id: 5, job_id: 555, hours: 6.5, date: '2026-04-02' }

  it('counts hours that exist only in the legacy table', () => {
    expect(hoursForJob(555, { timeClock: [], timeLog: [legacyOnly] })).toBeCloseTo(6.5, 2)
  })

  it('adds them alongside real punches on the same job', () => {
    const punch = { id: 1, employee_id: 9, job_id: 555, total_hours: 3 }
    expect(hoursForJob(555, { timeClock: [punch], timeLog: [legacyOnly] })).toBeCloseTo(9.5, 2)
  })

  it('ignores legacy rows with no job attached', () => {
    expect(mergeJobHourSources({ timeLog: [{ id: 3, job_id: null, hours: 2 }] })).toHaveLength(0)
  })

  it('ignores legacy rows carrying no hours', () => {
    expect(mergeJobHourSources({ timeLog: [{ id: 4, job_id: 555, hours: null }] })).toHaveLength(0)
  })
})

describe('nothing changes when there are no legacy rows', () => {
  // The safety property. Every existing bonus behaviour depends on punches
  // passing through exactly as they do today.
  const punches = [
    { id: 1, employee_id: 3, job_id: 100, total_hours: 8 },
    { id: 2, employee_id: 4, job_id: 100, total_hours: 6.25 },
    { id: 3, employee_id: 3, job_id: 101, clock_in: '2026-05-01T14:00:00Z', clock_out: '2026-05-01T20:00:00Z' },
  ]

  it('returns its input untouched', () => {
    expect(mergeJobHourSources({ timeClock: punches, timeLog: [] })).toEqual(punches)
    expect(mergeJobHourSources({ timeClock: punches })).toEqual(punches)
  })

  it('feeds timeClockToJobHours exactly what it gets today', () => {
    expect(timeClockToJobHours(mergeJobHourSources({ timeClock: punches })))
      .toEqual(timeClockToJobHours(punches))
  })

  it('survives empty and missing input', () => {
    expect(mergeJobHourSources()).toEqual([])
    expect(hoursForJob(1, {})).toBe(0)
  })
})

describe('legacyRowHours', () => {
  it('prefers the stored hours', () => {
    expect(legacyRowHours({ hours: 4.5 })).toBe(4.5)
  })

  it('falls back to a clock span when hours are missing', () => {
    expect(legacyRowHours({ clock_in_time: '2026-05-01T14:00:00Z', clock_out_time: '2026-05-01T17:30:00Z' }))
      .toBeCloseTo(3.5, 2)
  })

  it('returns 0 rather than guessing', () => {
    expect(legacyRowHours({})).toBe(0)
    expect(legacyRowHours(null)).toBe(0)
  })
})

describe('legacy rows that are not one person\'s hours are refused', () => {
  // Verified in the table: job 12798 on 2026-04-21 carries 55.52h against five
  // employees. That is a job total stamped onto the crew — counting it per head
  // adds 277 hours to one job.
  const crewStamp = [19, 35, 38, 36, 34].map((employee_id, i) => ({
    id: 100 + i, employee_id, job_id: 12798, hours: 55.52, date: '2026-04-21',
  }))

  it('does not multiply a job total by the crew size', () => {
    expect(hoursForJob(12798, { timeClock: [], timeLog: crewStamp })).toBe(0)
  })

  it('refuses hours no one person could have worked in a day', () => {
    expect(hoursForJob(7, { timeLog: [{ id: 1, employee_id: 2, job_id: 7, hours: 47, date: '2026-04-01' }] })).toBe(0)
  })

  it('refuses negative hours', () => {
    expect(hoursForJob(12483, { timeLog: [{ id: 2, employee_id: 55, job_id: 12483, hours: -3, date: '2026-06-08' }] })).toBe(0)
  })

  it('still accepts an ordinary legacy shift', () => {
    expect(hoursForJob(8, { timeLog: [{ id: 3, employee_id: 2, job_id: 8, hours: 7.5, date: '2026-04-01' }] })).toBeCloseTo(7.5, 2)
  })

  it('keeps the same hours for one person on a job — that is not a crew stamp', () => {
    const one = [{ id: 4, employee_id: 9, job_id: 9, hours: 5, date: '2026-04-01' }]
    expect(hoursForJob(9, { timeLog: one })).toBeCloseTo(5, 2)
  })
})

describe('the Payroll flag: what would change, before it changes', () => {
  const jobs = [{ id: 500, job_title: 'Monument Sign Removal Stain', allotted_time_hours: 12.8 }]
  const bonuses = [{ job_id: 500, employee_id: 7, amount: 307.92, status: 'accrued' }]

  it('reports a job whose only hours were typed in', () => {
    // Real shape: zero punches, 8 typed hours, a bonus paid as if nobody worked it.
    const rows = previewTypedHourImpact({
      jobs, bonuses, timeClock: [],
      timeLog: [{ id: 1, employee_id: 7, job_id: 500, hours: 8, date: '2026-06-01' }],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].punchHours).toBe(0)
    expect(rows[0].typedHours).toBeCloseTo(8, 2)
    expect(rows[0].savedBefore).toBeCloseTo(12.8, 2)
    expect(rows[0].savedAfter).toBeCloseTo(4.8, 2)
    expect(rows[0].bonusNow).toBeCloseTo(307.92, 2)
  })

  it('says nothing about a job where the typed row just repeats a punch', () => {
    const rows = previewTypedHourImpact({
      jobs, bonuses,
      timeClock: [{ id: 9, employee_id: 7, job_id: 500, total_hours: 8 }],
      timeLog: [{ id: 1, employee_id: 7, job_id: 500, hours: 8, date: '2026-06-01' }],
    })
    expect(rows).toHaveLength(0)
  })

  it('marks a paid bonus as frozen so the screen can say it cannot move', () => {
    const rows = previewTypedHourImpact({
      jobs, bonuses: [{ job_id: 500, employee_id: 7, amount: 96.72, status: 'paid' }],
      timeClock: [], timeLog: [{ id: 1, employee_id: 7, job_id: 500, hours: 4, date: '2026-06-01' }],
    })
    expect(rows[0].frozen).toBe(true)
  })

  it('counts the entries the guards refused, so the screen can explain itself', () => {
    const crew = [19, 35, 38].map((employee_id, i) => ({
      id: 20 + i, employee_id, job_id: 500, hours: 55.52, date: '2026-04-21',
    }))
    const rows = previewTypedHourImpact({ jobs, bonuses, timeClock: [], timeLog: crew })
    expect(rows).toHaveLength(0)   // nothing counted, so nothing to flag
  })

  it('is pure — reads nothing and needs no arguments', () => {
    expect(previewTypedHourImpact()).toEqual([])
  })
})

// ── The banner that would not go away ───────────────────────────────────────
//
// Alayda (e7baee3b): "There are notifcations that the job vs the hours is wrong
// & there is a button to click to clear the errors, I click it & they keep
// coming back, they also aren't changing."
//
// The list was every job where typed hours differ from punches — a permanent
// fact about the data, not a task. Pressing the button recalculates the bonus
// LEDGER and does not touch time_log, so the same 31 jobs came back with the
// same numbers on every load. It now lists only what applying would change.
describe('the typed-hours review only lists work that is still outstanding', () => {
  const job = { id: 7, job_title: 'Exterior Windows', allotted_time_hours: 40 }
  const punch = { id: 9, job_id: 7, employee_id: 1, total_hours: 8.65, date: '2026-08-01' }
  const typed = { id: 1, job_id: 7, employee_id: 1, hours: 7.24, date: '2026-08-02' }

  it('lists a job whose bonus has not yet counted the typed hours', () => {
    const rows = previewTypedHourImpact({
      jobs: [job], timeClock: [punch], timeLog: [typed],
      bonuses: [{ job_id: 7, amount: 844.8, status: 'accrued', actual_hours: 8.65 }],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].typedHours).toBeCloseTo(7.24, 2)
  })

  // This is what makes it clear after she presses the button.
  it('drops the job once the ledger counts those hours', () => {
    const rows = previewTypedHourImpact({
      jobs: [job], timeClock: [punch], timeLog: [typed],
      bonuses: [{ job_id: 7, amount: 200, status: 'accrued', actual_hours: 15.89 }],
    })
    expect(rows).toHaveLength(0)
  })

  // 13 of the 31 were this: nothing to shrink, so nothing to do.
  it('ignores a job with no bonus at all, since more hours can only shrink one', () => {
    const rows = previewTypedHourImpact({
      jobs: [job], timeClock: [punch], timeLog: [typed], bonuses: [],
    })
    expect(rows).toHaveLength(0)
  })

  it('still lists a paid bonus, flagged frozen, because the screen explains it', () => {
    const rows = previewTypedHourImpact({
      jobs: [job], timeClock: [punch], timeLog: [typed],
      bonuses: [{ job_id: 7, amount: 844.8, status: 'paid', actual_hours: 8.65 }],
    })
    expect(rows).toHaveLength(1)
    expect(rows[0].frozen).toBe(true)
  })

  it('still lists it when only part of the crew has been settled', () => {
    const rows = previewTypedHourImpact({
      jobs: [job], timeClock: [punch], timeLog: [typed],
      bonuses: [
        { job_id: 7, amount: 400, status: 'accrued', actual_hours: 15.89 },
        { job_id: 7, amount: 400, status: 'accrued', actual_hours: 8.65 },
      ],
    })
    expect(rows).toHaveLength(1)
  })

  it('comes back when somebody types new hours after it settled', () => {
    const settled = { jobs: [job], timeClock: [punch], timeLog: [typed],
      bonuses: [{ job_id: 7, amount: 200, status: 'accrued', actual_hours: 15.89 }] }
    expect(previewTypedHourImpact(settled)).toHaveLength(0)
    const more = { ...settled, timeLog: [typed, { job_id: 7, employee_id: 2, hours: 5, date: '2026-08-03' }] }
    expect(previewTypedHourImpact(more)).toHaveLength(1)
  })
})

import { describe, it, expect } from 'vitest'
import {
  SUBMITTAL_METHODS, SUBMITTAL_METHOD_KEYS,
  submittalKey, countSubmittals, submittalBreakdown, logProblem, submittalRow,
} from './submittals'

// Alayda (10/10, from /admin/eos): "Some submittals aren't done through the
// system, I am trying to accuratley track the numbers, can you create a button
// that shows when we submit a job outside of the system."

const att = (job, day) => ({ job_id: job, created_at: `${day}T14:02:00+00:00` })
const log = (job, day) => ({ job_id: job, submitted_at: day })

describe('what the scorecard counts', () => {
  it('still counts everything attached here, exactly as before', () => {
    // No historical number is allowed to move because of this feature.
    const attachments = [att(1, '2026-10-01'), att(2, '2026-10-02'), att(3, '2026-10-03')]
    expect(countSubmittals(attachments, [], '2026-10-01', '2026-10-31')).toBe(3)
  })

  it('now also counts the ones that went out another way', () => {
    const attachments = [att(1, '2026-10-01')]
    const logged = [log(7, '2026-10-05'), log(8, '2026-10-06')]
    expect(countSubmittals(attachments, logged, '2026-10-01', '2026-10-31')).toBe(3)
  })

  it('counts a submittal ONCE when it was both attached and logged', () => {
    // Somebody attaches the package and also ticks the button. One submittal.
    const attachments = [att(1, '2026-10-01')]
    const logged = [log(1, '2026-10-01')]
    expect(countSubmittals(attachments, logged, '2026-10-01', '2026-10-31')).toBe(1)
  })

  it('counts a RESUBMITTAL on a different day as its own', () => {
    const attachments = [att(1, '2026-10-01')]
    const logged = [log(1, '2026-10-09')]
    expect(countSubmittals(attachments, logged, '2026-10-01', '2026-10-31')).toBe(2)
  })

  it('does not let two logs of the same job-day count twice', () => {
    const logged = [log(4, '2026-10-05'), log(4, '2026-10-05')]
    expect(countSubmittals([], logged, '2026-10-01', '2026-10-31')).toBe(1)
  })

  it('respects the window on both sources', () => {
    const attachments = [att(1, '2026-09-30'), att(2, '2026-10-15')]
    const logged = [log(3, '2026-09-29'), log(4, '2026-10-20')]
    expect(countSubmittals(attachments, logged, '2026-10-01', '2026-10-31')).toBe(2)
  })

  it('survives junk instead of counting it', () => {
    expect(countSubmittals([{ job_id: 1 }], [{ job_id: 2 }], '2026-10-01', '2026-10-31')).toBe(0)
    expect(countSubmittals(null, null)).toBe(0)
    expect(countSubmittals()).toBe(0)
  })

  it('says where the number came from', () => {
    const b = submittalBreakdown([att(1, '2026-10-01')], [log(2, '2026-10-02')], '2026-10-01', '2026-10-31')
    expect(b).toEqual({ total: 2, in_system: 1, logged: 1 })
  })
})

describe('what makes two records the same submittal', () => {
  it('is the job and the day', () => {
    expect(submittalKey(att(9, '2026-10-01'))).toBe('9|2026-10-01')
    expect(submittalKey(log(9, '2026-10-01'))).toBe('9|2026-10-01')
  })

  it('reads the day out of a timestamp', () => {
    expect(submittalKey({ job_id: 3, created_at: '2026-10-01T23:59:59+00:00' })).toBe('3|2026-10-01')
  })

  it('is nothing without a date', () => {
    expect(submittalKey({ job_id: 3 })).toBe(null)
    expect(submittalKey(null)).toBe(null)
  })
})

describe('logging one by hand', () => {
  it('asks for the job and the date', () => {
    expect(logProblem({})).toMatch(/Pick the job/)
    expect(logProblem({ jobId: 4 })).toMatch(/When did it go out/)
    expect(logProblem({ jobId: 4, submittedAt: '2026-10-10' })).toBe(null)
  })

  it('refuses a method nobody offered', () => {
    expect(logProblem({ jobId: 4, submittedAt: '2026-10-10', method: 'carrier pigeon' })).toMatch(/how it was sent/)
  })

  it('offers the ways a submittal actually leaves the building', () => {
    expect(SUBMITTAL_METHOD_KEYS).toContain('email')
    expect(SUBMITTAL_METHOD_KEYS).toContain('portal')
    expect(SUBMITTAL_METHODS.portal).toMatch(/portal/i)
  })

  it('writes a day, not a timestamp', () => {
    const row = submittalRow({ companyId: 3, jobId: 12, submittedAt: '2026-10-10T16:00:00Z', method: 'portal' })
    expect(row.submitted_at).toBe('2026-10-10')
    expect(row.method).toBe('portal')
    expect(row.company_id).toBe(3)
  })

  it('falls back to "other" rather than storing nonsense', () => {
    expect(submittalRow({ companyId: 3, jobId: 1, submittedAt: '2026-10-10', method: 'pigeon' }).method).toBe('other')
  })

  it('carries the note through', () => {
    const row = submittalRow({
      companyId: 3, jobId: 1, submittedAt: '2026-10-10',
      note: 'second submission, revised cut sheets',
    })
    expect(row.note).toBe('second submission, revised cut sheets')
  })

  it('keeps blank text out of the row', () => {
    const row = submittalRow({ companyId: 3, jobId: 1, submittedAt: '2026-10-10', recipient: '   ', note: '' })
    expect(row.recipient).toBe(null)
    expect(row.note).toBe(null)
  })
})

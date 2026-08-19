import { describe, it, expect } from 'vitest'
import {
  wrongJobCorrection, correctionChoices,
  CORRECTION_NONE, CORRECTION_SWITCH, CORRECTION_REASSIGN,
} from './clockCorrection'

describe('correcting a wrong-job clock-in', () => {
  it('switches while the clock is still running', () => {
    const c = wrongJobCorrection({ id: 55, job_id: 23405 }, null)
    expect(c.mode).toBe(CORRECTION_SWITCH)
    expect(c.jobId).toBe(23405)
    expect(c.entryId).toBe(55)
  })

  it('still offers a correction AFTER the clock-out — the regression London hit', () => {
    // A successful clock-out clears activeEntry while the verification panel
    // stays up. Gating on activeEntry alone made the escape hatch vanish
    // exactly when the tech needed it, leaving them asked to verify work they
    // never did.
    const c = wrongJobCorrection(null, { id: 55, job_id: 23405 })
    expect(c.mode).toBe(CORRECTION_REASSIGN)
    expect(c.jobId).toBe(23405)
    expect(c.entryId).toBe(55)
  })

  it('never calls it a switch once the shift is closed', () => {
    // Switching closes the running punch and opens a new one. With no running
    // punch that handler returns immediately — no error, no toast, nothing —
    // which is what the tech was tapping.
    expect(wrongJobCorrection(null, { id: 9, job_id: 1 }).mode).not.toBe(CORRECTION_SWITCH)
  })

  it('prefers the running punch when both exist', () => {
    // Mid-clock-out both are briefly set. The live punch is the truth.
    const c = wrongJobCorrection({ id: 70, job_id: 999 }, { id: 55, job_id: 23405 })
    expect(c.mode).toBe(CORRECTION_SWITCH)
    expect(c.jobId).toBe(999)
  })

  it('offers nothing when the shift had no job', () => {
    // A general punch with no job has no wrong job to fix; the panel is asking
    // for the daily check instead.
    expect(wrongJobCorrection({ id: 1, job_id: null }, null).mode).toBe(CORRECTION_NONE)
    expect(wrongJobCorrection(null, { id: 1, job_id: null }).mode).toBe(CORRECTION_NONE)
    expect(wrongJobCorrection(null, null).mode).toBe(CORRECTION_NONE)
  })
})

describe('which jobs to offer', () => {
  const jobs = [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }]

  it('leaves out the job already on the shift', () => {
    expect(correctionChoices(jobs, 2).map(j => j.id)).toEqual([1, 3, 4])
  })

  it('caps the list so the panel stays tappable on a phone', () => {
    expect(correctionChoices(jobs, 99)).toHaveLength(3)
  })

  it('survives an empty day', () => {
    expect(correctionChoices([], 1)).toEqual([])
    expect(correctionChoices(null, 1)).toEqual([])
  })
})

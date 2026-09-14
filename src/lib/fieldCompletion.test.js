import { describe, it, expect } from 'vitest'
import { verificationPassed, completionOptions, completionJobPatch, jobCustomerEmail, VICTOR_PASS_SCORE } from './fieldCompletion'

const pm = { field_send_invoice: true, field_collect_payment: true }
const tech = { field_send_invoice: false, field_collect_payment: true }
const nobody = { field_send_invoice: false, field_collect_payment: false }
const windowJob = { utility_incentive: 0, customer: { email: 'office@customer.com' } }
const lightingJob = { utility_incentive: 5680.28, customer: { email: 'office@customer.com' } }

describe('did Victor pass', () => {
  it('60 is the line, and an AI outage counts as a pass', () => {
    expect(verificationPassed({ score: VICTOR_PASS_SCORE })).toBe(true)
    expect(verificationPassed({ score: 59.9 })).toBe(false)
    expect(verificationPassed({ score: 12, status: 'complete_ai_skipped' })).toBe(true)
    expect(verificationPassed(null)).toBe(false)
  })
})

describe('what the sheet offers', () => {
  it('a project manager on a window job: send and collect', () => {
    expect(completionOptions({ employee: pm, job: windowJob })).toMatchObject({ canSend: true, canCollect: true, sendBlockedReason: null, email: 'office@customer.com' })
  })
  it('a tech: collect only, and no explanation owed', () => {
    expect(completionOptions({ employee: tech, job: windowJob })).toMatchObject({ canSend: false, canCollect: true, sendBlockedReason: 'not_permitted' })
  })
  it('a utility job never sends from the field, whoever you are', () => {
    expect(completionOptions({ employee: pm, job: lightingJob })).toMatchObject({ canSend: false, sendBlockedReason: 'utility_job' })
  })
  it('no email, no send — and says so', () => {
    expect(completionOptions({ employee: pm, job: { utility_incentive: 0, customer: {} } })).toMatchObject({ canSend: false, sendBlockedReason: 'no_email' })
  })
  it('nothing granted, nothing offered', () => {
    expect(completionOptions({ employee: nobody, job: windowJob })).toMatchObject({ canSend: false, canCollect: false })
  })
  it('the job snapshot email is a fallback for the embed', () => {
    expect(jobCustomerEmail({ email: ' snap@x.com ', customer: null })).toBe('snap@x.com')
    expect(jobCustomerEmail({ email: 'snap@x.com', customer: { email: 'embed@x.com' } })).toBe('embed@x.com')
  })
})

describe('the job update', () => {
  it('a pass completes cleanly', () => {
    const p = completionJobPatch({ score: 88, flagged: false, now: new Date('2026-09-14T20:00:00Z') })
    expect(p).toEqual({ status: 'Completed', updated_at: '2026-09-14T20:00:00.000Z' })
  })
  it('complete-anyway completes AND flags, with the score in the reason', () => {
    const p = completionJobPatch({ score: 41.6, flagged: true, now: new Date('2026-09-14T20:00:00Z') })
    expect(p.status).toBe('Completed')
    expect(p.completion_flagged_at).toBe('2026-09-14T20:00:00.000Z')
    expect(p.completion_flag_reason).toBe('Marked complete without a passing verification (Victor score 42).')
  })
})

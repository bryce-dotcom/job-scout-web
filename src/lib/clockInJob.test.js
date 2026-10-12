import { describe, it, expect } from 'vitest'
import { clockInChoice, isOverheadPunch, clockableJobs, OVERHEAD_NOTE } from './clockInJob'

describe('a punch needs a job or a deliberate no-job', () => {
  it('takes a job id as a number or a string', () => {
    expect(clockInChoice({ jobId: 23522 })).toEqual({ ok: true, job_id: 23522, notes: null })
    expect(clockInChoice({ jobId: '23522' })).toEqual({ ok: true, job_id: 23522, notes: null })
  })
  it('takes overhead, said out loud, and writes it on the row', () => {
    expect(clockInChoice({ overhead: true })).toEqual({ ok: true, job_id: null, notes: OVERHEAD_NOTE })
    expect(clockInChoice({ jobId: '', overhead: true }).job_id).toBeNull()
  })
  it('refuses the old silent nothing', () => {
    for (const input of [{}, { jobId: '' }, { jobId: null }, { jobId: 'abc' }, { jobId: 0 }]) {
      const r = clockInChoice(input)
      expect(r.ok).toBe(false)
      expect(r.reason).toMatch(/Pick the job/)
    }
  })
  it('prefers the job when both are given', () => {
    expect(clockInChoice({ jobId: 5, overhead: true })).toEqual({ ok: true, job_id: 5, notes: null })
  })
  it('tells a deliberate overhead punch from a forgotten one', () => {
    expect(isOverheadPunch({ job_id: null, notes: OVERHEAD_NOTE })).toBe(true)
    expect(isOverheadPunch({ job_id: null, notes: 'ran to the shop' })).toBe(false)
    expect(isOverheadPunch({ job_id: 9, notes: OVERHEAD_NOTE })).toBe(false)
  })
  it('offers only open jobs, newest first', () => {
    const jobs = [
      { id: 1, status: 'Scheduled', created_at: '2026-10-01' },
      { id: 2, status: 'Closed', created_at: '2026-10-05' },
      { id: 3, status: 'In Progress', created_at: '2026-10-09' },
      { id: 4, status: 'Cancelled', created_at: '2026-10-10' },
    ]
    expect(clockableJobs(jobs).map(j => j.id)).toEqual([3, 1])
  })
})

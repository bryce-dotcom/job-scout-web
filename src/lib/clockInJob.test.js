import { describe, it, expect } from 'vitest'
import { clockInChoice, mustClockToJob, isFieldRole, onBonus, isOverheadPunch, clockableJobs } from './clockInJob'

// HHH's roster, as the Employees page describes it.
const tech = { id: 37, name: 'Cameron', role: 'Field Tech', skill_level: 'First Class' }
const installer = { id: 35, name: 'Derrick', role: 'Installer', skill_level: 'Scout' }
const newTech = { id: 142, name: 'Kyle', role: 'Field Tech', skill_level: null }
const pmOnBonus = { id: 19, name: 'London', role: 'Project Manager', skill_level: 'Eagle' }
const pmOffBonus = { id: 14, name: 'Christopher', role: 'Project Manager', skill_level: 'Not on bonus' }
const salesOnBonus = { id: 34, name: 'Noah', role: 'Sales', skill_level: 'First Class' }
const office = { id: 18, name: 'Tracy', role: 'Office', skill_level: null }
const admin = { id: 15, name: 'Alayda', role: 'Admin', skill_level: null }
const owner = { id: 3, name: 'Bryce', role: 'Owner', skill_level: null }

describe('whose hours belong on a job', () => {
  it('is decided by the role, never by the person at the clock', () => {
    for (const e of [tech, installer, newTech]) expect(mustClockToJob(e), e.name).toBe(true)
    for (const e of [office, admin, owner, pmOffBonus]) expect(mustClockToJob(e), e.name).toBe(false)
  })
  it('anyone on the efficiency bonus must charge a job, whatever their title', () => {
    expect(mustClockToJob(pmOnBonus)).toBe(true)
    expect(mustClockToJob(salesOnBonus)).toBe(true)
    expect(onBonus(pmOffBonus)).toBe(false)
    expect(onBonus({ skill_level: '' })).toBe(false)
  })
  it('recognises the trade titles a company might use', () => {
    for (const r of ['Field Tech', 'Installer', 'Labor', 'Lead Tech', 'Crew Lead', 'Apprentice Electrician', 'Equipment Operator', 'Landscaper']) expect(isFieldRole(r), r).toBe(true)
    for (const r of ['Office', 'Admin', 'Owner', 'Sales', 'Setter', 'Project Manager', 'Manager', '', null]) expect(isFieldRole(r), String(r)).toBe(false)
  })
})

describe('what the punch carries', () => {
  it('a job, as a number or a string, for anyone', () => {
    expect(clockInChoice({ jobId: 23522, employee: tech })).toEqual({ ok: true, job_id: 23522, notes: null, overhead: false })
    expect(clockInChoice({ jobId: '23522', employee: office })).toEqual({ ok: true, job_id: 23522, notes: null, overhead: false })
  })
  it('refuses a field punch with no job — there is no overhead button for them', () => {
    for (const e of [tech, installer, newTech, pmOnBonus, salesOnBonus]) {
      const r = clockInChoice({ jobId: '', employee: e })
      expect(r.ok, e.name).toBe(false)
      expect(r.reason).toMatch(/no overhead clock-in for your role/)
    }
  })
  it('an office role with no job is overhead on its own, labelled with the role', () => {
    expect(clockInChoice({ employee: office })).toEqual({ ok: true, job_id: null, notes: 'Overhead — Office', overhead: true })
    expect(clockInChoice({ employee: pmOffBonus }).notes).toBe('Overhead — Project Manager')
    expect(clockInChoice({ employee: { role: '' } }).notes).toBe('Overhead — Office')
  })
  it('a bad job id is treated as no job', () => {
    expect(clockInChoice({ jobId: 'abc', employee: tech }).ok).toBe(false)
    expect(clockInChoice({ jobId: 0, employee: office }).overhead).toBe(true)
  })
  it('tells a deliberate overhead punch from a forgotten one', () => {
    expect(isOverheadPunch({ job_id: null, notes: 'Overhead — Office' })).toBe(true)
    expect(isOverheadPunch({ job_id: null, notes: 'ran to the shop' })).toBe(false)
    expect(isOverheadPunch({ job_id: 9, notes: 'Overhead — Office' })).toBe(false)
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

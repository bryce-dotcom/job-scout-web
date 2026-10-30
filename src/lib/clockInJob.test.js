import { describe, it, expect } from 'vitest'
import { clockInChoice, mustClockToJob, isOfficeRole, onBonus, isOverheadPunch, clockableJobs, clockInSettings, overheadCodeList, matchOverheadCode } from './clockInJob'

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
const hhhLevels = [{ name: 'Cub', weight: 1 }, { name: 'Scout', weight: 2 }, { name: 'First Class', weight: 3 }, { name: 'Eagle', weight: 4 }, { name: 'Not on bonus', weight: 0 }]

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
  it('reads the company\'s own skill levels when it has them — weight zero is off the bonus', () => {
    const s = { skillLevels: hhhLevels }
    expect(onBonus(pmOnBonus, s)).toBe(true)
    expect(onBonus(pmOffBonus, s)).toBe(false)
    // A level the company renamed: "Bench" at weight 0 is off the bonus even though the name says nothing.
    expect(onBonus({ role: 'Sales', skill_level: 'Bench' }, { skillLevels: [{ name: 'Bench', weight: 0 }] })).toBe(false)
    expect(mustClockToJob({ role: 'Sales', skill_level: 'Bench' }, { skillLevels: [{ name: 'Bench', weight: 0 }] })).toBe(false)
  })
  it('any title it does not recognise goes to the safe side: a job', () => {
    // Other tenants: a cleaning company, a painter, a lawn crew, a title typed yesterday.
    for (const r of ['Cleaner', 'Driver', 'Painter', 'Roofer', 'Lawn Crew', 'Technician', 'Labor', 'Helper', 'Window Washer', 'Guy']) {
      expect(mustClockToJob({ role: r }), r).toBe(true)
    }
  })
  it('recognises the office titles a company might use', () => {
    for (const r of ['Office', 'Admin', 'Owner', 'Sales', 'Setter', 'Project Manager', 'Manager', 'Estimator', 'Dispatcher', 'Bookkeeper', 'Marketing', 'HR', 'Office Manager', 'Sales Rep', 'Account Manager']) expect(isOfficeRole(r), r).toBe(true)
    for (const r of ['Field Tech', 'Installer', 'Labor', 'Lead Tech', 'Crew Lead', '', null]) expect(isOfficeRole(r), String(r)).toBe(false)
  })
  it('lets the company override a title either way', () => {
    const s = { overheadRoles: ['Shop Hand'], jobRoles: ['Estimator'] }
    expect(mustClockToJob({ role: 'Shop Hand' }, s)).toBe(false)
    expect(mustClockToJob({ role: 'estimator' }, s)).toBe(true)
    expect(mustClockToJob({ role: 'Shop Hand' })).toBe(true)
  })
  it('no title at all means a job — nobody clocks in as nothing', () => {
    expect(mustClockToJob({ role: '' })).toBe(true)
    expect(mustClockToJob(null)).toBe(true)
  })
})

describe('what the punch carries', () => {
  it('a job, as a number or a string, for anyone', () => {
    expect(clockInChoice({ jobId: 23522, employee: tech })).toEqual({ ok: true, job_id: 23522, overhead_code: null, notes: null, overhead: false })
    expect(clockInChoice({ jobId: '23522', employee: office })).toEqual({ ok: true, job_id: 23522, overhead_code: null, notes: null, overhead: false })
  })
  it('refuses a field punch with no job — there is no overhead button for them', () => {
    for (const e of [tech, installer, newTech, pmOnBonus, salesOnBonus, { role: 'Cleaner' }]) {
      const r = clockInChoice({ jobId: '', employee: e })
      expect(r.ok, e.name || e.role).toBe(false)
      expect(r.reason).toMatch(/no overhead clock-in for your role/)
    }
  })
  it('an office role with no job is overhead on its own, labelled with the role', () => {
    expect(clockInChoice({ employee: office })).toEqual({ ok: true, job_id: null, overhead_code: null, notes: 'Overhead — Office', overhead: true })
    expect(clockInChoice({ employee: pmOffBonus }).notes).toBe('Overhead — Project Manager')
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
  it('reads its settings off the store', () => {
    expect(clockInSettings({ timeClockOverheadRoles: ['A'], timeClockJobRoles: ['B'], skillLevels: hhhLevels, timeClockOverheadCodes: ['Shop'] }))
      .toEqual({ overheadRoles: ['A'], jobRoles: ['B'], skillLevels: hhhLevels, overheadCodes: ['Shop'] })
    expect(clockInSettings({})).toEqual({ overheadRoles: [], jobRoles: [], skillLevels: [], overheadCodes: [] })
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

describe('overhead codes — the named places non-job time can go', () => {
  // Cameron, 2026-10-30: "I am no longer able to clock into “General”, this is
  // helpful when working around the shop or mounds meetings." Requiring a job
  // closed a real leak, but left shop work and crew meetings nowhere to go.
  const codes = { overheadCodes: ['Shop', 'Training', 'Crew Meeting'], skillLevels: hhhLevels }

  it('is nothing at all for a company that has defined no codes', () => {
    const r = clockInChoice({ jobId: '', employee: tech, settings: { skillLevels: hhhLevels } })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/no overhead clock-in for your role/)
  })

  it('lets a field tech on the bonus punch to a code the company defined', () => {
    expect(clockInChoice({ code: 'Shop', employee: tech, settings: codes }))
      .toEqual({ ok: true, job_id: null, overhead_code: 'Shop', notes: 'Overhead — Shop', overhead: true })
  })

  it('keeps those hours off every job, which is why the rule can allow them', () => {
    // jobHoursFromPunches skips rows with no job_id, so a code punch can never
    // make a job come in under its allotment and inflate an efficiency bonus.
    for (const c of ['Shop', 'Training', 'Crew Meeting']) {
      expect(clockInChoice({ code: c, employee: tech, settings: codes }).job_id, c).toBe(null)
    }
  })

  it('matches the company spelling loosely but stores the company spelling', () => {
    expect(clockInChoice({ code: 'shop', employee: tech, settings: codes }).overhead_code).toBe('Shop')
    expect(clockInChoice({ code: '  CREW MEETING ', employee: tech, settings: codes }).overhead_code).toBe('Crew Meeting')
  })

  it('refuses a code nobody defined instead of writing an untagged punch', () => {
    const r = clockInChoice({ code: 'Sick Day', employee: tech, settings: codes })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/not one of this company's overhead codes/)
    expect(r.reason).toMatch(/Shop, Training, Crew Meeting/)
  })

  it('refuses a code when the company set none up, and says where to set them', () => {
    const r = clockInChoice({ code: 'Shop', employee: tech, settings: { skillLevels: hhhLevels } })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/has not set any up/)
  })

  it('a job always wins over a code', () => {
    const r = clockInChoice({ jobId: 23522, code: 'Shop', employee: tech, settings: codes })
    expect(r.job_id).toBe(23522)
    expect(r.overhead_code).toBe(null)
  })

  it('lists the codes when it asks for a job, so the message is usable', () => {
    const r = clockInChoice({ jobId: '', employee: tech, settings: codes })
    expect(r.ok).toBe(false)
    expect(r.reason).toMatch(/Shop, Training, Crew Meeting/)
  })

  it('reads a list of strings or of { name }, de-duped, blanks dropped', () => {
    expect(overheadCodeList({ overheadCodes: ['Shop', { name: 'Training' }, 'shop', '', null, '   '] }))
      .toEqual(['Shop', 'Training'])
    expect(overheadCodeList({})).toEqual([])
    expect(matchOverheadCode('training', { overheadCodes: [{ name: 'Training' }] })).toBe('Training')
    expect(matchOverheadCode('', { overheadCodes: ['Shop'] })).toBe(null)
    expect(matchOverheadCode('Shop', {})).toBe(null)
  })

  it('leaves an office role exactly as it was — role label, no code', () => {
    const r = clockInChoice({ employee: office, settings: codes })
    expect(r.overhead_code).toBe(null)
    expect(r.notes).toBe('Overhead — Office')
    expect(r.overhead).toBe(true)
  })

  it('still reads as deliberate when notes have been written over', () => {
    // notes is free text — other paths append to it and payroll can retype
    // it — so the column, not the prefix, is what a report may group by.
    expect(isOverheadPunch({ job_id: null, overhead_code: 'Shop', notes: 'went to the shop' })).toBe(true)
    expect(isOverheadPunch({ job_id: null, overhead_code: '   ' })).toBe(false)
    expect(isOverheadPunch({ job_id: 14, overhead_code: 'Shop' })).toBe(false)
  })
})

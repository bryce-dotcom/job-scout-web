import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

// "Schedule the Halifax job Thursday at 8 with Jordan and Mike" — the Job
// Board's Schedule modal by voice. These hold the rail to the page's write
// (PMJobSetter.handleScheduleJobSubmit), the day to the company's zone, a
// clash to being shown not decided, and rollback to exactly what apply did.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const src = read('../../supabase/functions/_shared/arnieSchedule.ts')
const page = read('../pages/PMJobSetter.jsx')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')

const load = (s, deps) => { const m = { exports: {} }; new Function('module', 'exports', 'require', transformSync(s, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, (p) => deps[p]); return m.exports }
const time = load(read('../../supabase/functions/_shared/arnieTime.ts'), {})
const conv = load(read('../../supabase/functions/_shared/estimateConvert.ts'), { './arnieRest.ts': { readRecordList: async () => [] } })

// A fake REST answering by path prefix; the job finder (arnieShift.findJob) reads through the same helper.
const makeRest = (answers) => ({ readRecordList: async (_r, path) => { for (const [k, v] of Object.entries(answers)) if (path.startsWith(k)) return typeof v === 'function' ? v(path) : v; return [] } })
const JOB = { id: 9, job_id: 'JOB-1', job_title: 'Halifax Flooring — shop lighting', customer_name: 'Ben Rowe', business_name: 'Halifax Flooring', status: 'Chillin', start_date: null, lead_id: '4', job_address: '12 Mill St', customer_id: 77 }
const base = (extra = {}) => makeRest({
  'jobs?select=id,job_id,job_title,customer_name,business_name,status,start_date': [JOB],
  'jobs?select=id,status,start_date,end_date,assigned_team': [{ ...JOB, end_date: null, assigned_team: null, job_lead_id: null }],
  'companies?select=timezone': [{ timezone: 'America/Denver' }],
  'employees?select=id,name,role': [{ id: 137, name: 'Jordan Lee', role: 'Field Tech' }, { id: 135, name: 'Carlos Rivera', role: 'Field Tech' }, { id: 140, name: 'Mike Sullivan' }, { id: 141, name: 'Mike Ortiz' }],
  'leads?select=id,status': [{ id: 4, status: 'Job Scheduled' }],
  'settings?select=value': [],
  ...extra,
})
const sched = (rest) => load(src, { './arnieRest.ts': rest, './arnieShift.ts': load(read('../../supabase/functions/_shared/arnieShift.ts'), { './arnieRest.ts': rest, './arnieTime.ts': time, './arnieConfig.ts': {}, './auth.ts': {} }), './arnieTime.ts': time, './estimateConvert.ts': conv })
const manager = { email: 'm@x', companyId: 25, employeeId: 1, role: 'manager', level: 2 }
const tech = { ...manager, level: 0 }
const field = (p, label) => p.display.find((d) => d.label === label)?.value

describe('the words', () => {
  const { splitPeople, parseDuration } = load(src, { './arnieRest.ts': {}, './arnieShift.ts': {}, './arnieTime.ts': time, './estimateConvert.ts': conv })
  it('crew: "Jordan and Mike", "Jordan, Carlos & Mike Sullivan"', () => {
    expect(splitPeople('Jordan and Mike')).toEqual(['Jordan', 'Mike'])
    expect(splitPeople('Jordan, Carlos & Mike Sullivan')).toEqual(['Jordan', 'Carlos', 'Mike Sullivan'])
    expect(splitPeople('')).toEqual([])
  })
  it('duration: hours, "all day" = 8, nothing = 4', () => {
    expect(parseDuration('6 hours')).toBe(6); expect(parseDuration('2h')).toBe(2); expect(parseDuration('all day')).toBe(4)
    expect(parseDuration('2 days')).toBe(16); expect(parseDuration(undefined)).toBe(4); expect(parseDuration('lots')).toBe(4)
  })
})

describe('prepare — the day in the company zone, the crew by name, the clash shown', () => {
  it('Thursday at 8 → the coming Thursday, 8 AM Denver, four hours; crew resolved; Jordan is job lead', async () => {
    const { prepareSchedule } = sched(base())
    const p = await prepareSchedule({}, manager, { job: 'Halifax', when: 'Thursday at 8', crew: 'Jordan and Carlos' })
    expect(p.ok).toBe(true)
    expect(p.columns.crew).toEqual([{ id: 137, name: 'Jordan Lee' }, { id: 135, name: 'Carlos Rivera' }])
    expect(p.columns.hours).toBe(4)
    const start = new Date(p.columns.start)
    expect(start.toLocaleTimeString('en-US', { timeZone: 'America/Denver', hour: 'numeric', minute: '2-digit' })).toBe('8:00 AM')
    expect(start.toLocaleDateString('en-US', { timeZone: 'America/Denver', weekday: 'long' })).toBe('Thursday')
    expect(new Date(p.columns.end) - start).toBe(4 * 3600000)
    expect(field(p, 'Crew')).toMatch(/Jordan Lee is the job lead/)
    expect(p.columns.status).toBe('Scheduled')
    expect(p.columns.before).toEqual({ status: 'Chillin', start_date: null, end_date: null, assigned_team: null, job_lead_id: null })
  })
  it('no time = 8 AM and the card says so; a past day is refused; a tech is refused', async () => {
    const { prepareSchedule } = sched(base())
    const p = await prepareSchedule({}, manager, { job: 'Halifax', when: 'tomorrow' })
    expect(field(p, 'When')).toMatch(/8:00 AM \(8 AM — the board's default/)
    expect(field(p, 'Crew')).toMatch(/nobody yet/)
    expect((await prepareSchedule({}, manager, { job: 'Halifax', when: '2020-01-01' })).error).toMatch(/in the past/)
    expect((await prepareSchedule({}, tech, { job: 'Halifax', when: 'Thursday' })).error).toMatch(/manager/)
  })
  it('an ambiguous name asks; an unknown name refuses; two Mikes is a question', async () => {
    const { prepareSchedule } = sched(base())
    const two = await prepareSchedule({}, manager, { job: 'Halifax', when: 'Thursday', crew: 'Mike' })
    expect(two.needs_choice.map((c) => c.id)).toEqual([140, 141])
    expect((await prepareSchedule({}, manager, { job: 'Halifax', when: 'Thursday', crew: 'Zelda' })).error).toMatch(/don't see "Zelda"/)
  })
  it('a clash is on the card, not decided: Jordan already has a section and an appointment that day', async () => {
    const { prepareSchedule } = sched(base({
      'job_sections?select=id,job_id,name': (path) => /assigned_to=eq\.137/.test(path) ? [{ id: 1, job_id: 50, name: 'Bays' }] : [],
      'jobs?select=id,job_id,job_title,customer_name&company_id=eq.25&id=in.(50)': [{ id: 50, job_id: 'JOB-50', job_title: 'Riverside', customer_name: 'Riverside Apts' }],
      'appointments?select=id,title,start_time,job_id': (path) => /employee_id=eq\.137/.test(path) ? [{ id: 2, title: 'Estimate visit', start_time: '2026-09-24T21:00:00Z', job_id: null }] : [],
    }))
    const p = await prepareSchedule({}, manager, { job: 'Halifax', when: 'Thursday at 8', crew: 'Jordan and Carlos' })
    expect(p.ok).toBe(true)
    expect(p.columns.crew.length).toBe(2)           // nobody dropped
    expect(field(p, 'Already that day')).toMatch(/^Jordan Lee: Bays on JOB-50 — Riverside — Riverside Apts; \d+:\d\d [AP]M Estimate visit — approve anyway/)
    expect(p.columns.clashes.length).toBe(1)
  })
  it('a finished job is not scheduled; the company\'s own Scheduled status id is used when configured', async () => {
    const done = sched(base({ 'jobs?select=id,job_id,job_title,customer_name,business_name,status,start_date': [{ ...JOB, status: 'Completed' }] }))
    expect((await done.prepareSchedule({}, manager, { job: 'Halifax', when: 'Thursday' })).error).toMatch(/Completed — nothing to schedule/)
    const own = sched(base({ 'settings?select=value': [{ value: JSON.stringify([{ id: 'Chillin', name: 'Chillin' }, { id: 'Scheduled', name: 'Scheduled' }, { id: 'Done', name: 'Done' }]) }] }))
    const p = await own.prepareSchedule({}, manager, { job: 'Halifax', when: 'Thursday' })
    expect(p.columns.status).toBe('Scheduled'); expect(p.columns.lead_status).toBe('Scheduled')
  })
})

describe('apply and rollback are the page\'s write and its undo', () => {
  it('writes what PMJobSetter writes: start/end, Scheduled, assigned_team names, job_lead_id = first person, one appointment per person with job_id and type Job', () => {
    expect(src).toMatch(/patch\.assigned_team = c\.crew\.map\(\(x: any\) => x\.name\)\.join\(', '\); patch\.job_lead_id = c\.crew\[0\]\.id/)
    expect(page).toMatch(/updateData\.assigned_team = teamNames/)
    expect(page).toMatch(/updateData\.job_lead_id = parseInt\(scheduleForm\.assigned_employee_ids\[0\]\)/)
    expect(src).toMatch(/employee_id: e\.id, customer_id: c\.customer_id \|\| null, job_id: c\.job_id, appointment_type: 'Job'/)
    expect(page).toMatch(/job_id: scheduleJob\.id,\n\s+appointment_type: \(scheduleForm\.recurrence && scheduleForm\.recurrence !== 'None'\) \? 'Recurring Job' : 'Job'/)
    expect(src).toMatch(/status: 'Scheduled',\n\s+employee_id/)
  })
  it('apply refuses if the board scheduled it meanwhile; rollback puts the job back and removes only its appointments, never once someone clocked in', () => {
    expect(src).toMatch(/if \(\(job\.start_date \|\| null\) !== \(c\.before\?\.start_date \|\| null\) \|\| job\.status !== c\.before\?\.status\) return \{ ok: false as const, stale: true/)
    expect(src).toMatch(/time_clock\?select=id&company_id=eq\.\$\{companyId\}&job_id=eq\.\$\{c\.job_id\}&clock_in=gte\.\$\{c\.start\}/)
    expect(src).toMatch(/appointments\?company_id=eq\.\$\{companyId\}&id=in\.\(\$\{ids\.join\(','\)\}\)`, \{ method: 'DELETE'/)
    expect(src).toMatch(/status: b\.status, start_date: b\.start_date, end_date: b\.end_date, assigned_team: b\.assigned_team, job_lead_id: b\.job_lead_id/)
  })
  it('registered: manager+, when taken as said, the prompt hands the day to the server', () => {
    expect(create).toMatch(/schedule: \{\n\s+label: 'schedule',\n\s+table: 'jobs',\n\s+minLevel: 2,\n\s+verb: 'Schedule',/)
    expect(chat).toMatch(/'price_book', 'won', 'schedule'\]/)
    expect(chat).toMatch(/when: \{ type: 'string', description: 'schedule: the day and time EXACTLY as said/)
    expect(engine).toMatch(/## Scheduling a job/)
    expect(engine).toMatch(/Never drop a person or move the day on your own/)
  })
})

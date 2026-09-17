import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const d = read('../../supabase/functions/_shared/arnieDispatch.ts')
const time = read('../../supabase/functions/_shared/arnieTime.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const records = read('../../supabase/functions/_shared/arnieRecords.ts')
const page = read('../pages/JobDetail.jsx')
const engine = read('../pages/agents/arnie/arnieEngine.js')

const propose = d.slice(d.indexOf('export async function proposeSectionAssign'), d.indexOf('export async function applySectionAssign'))
const apply = d.slice(d.indexOf('export async function applySectionAssign'), d.indexOf('export async function rollbackSectionAssign'))
const rollback = d.slice(d.indexOf('export async function rollbackSectionAssign'))

// resolveDayWord + tzOffsetMinutes, evaluated here.
// The real module, types stripped by esbuild.
const resolveDayWord = (() => { const m = { exports: {} }; new Function('module', 'exports', transformSync(time, { loader: 'ts', format: 'cjs' }).code)(m, m.exports); return m.exports.resolveDayWord })()

describe('the day as said, resolved by the server', () => {
  // Tue Sep 15 2026, 23:30 in Denver — already Wednesday in UTC. The trap.
  const now = new Date('2026-09-16T05:30:00Z')
  it.each([
    ['Thursday', '2026-09-17'], ['thu', '2026-09-17'], ['next Thursday', '2026-09-17'], ['on Friday', '2026-09-18'],
    ['Monday', '2026-09-21'], ['tomorrow', '2026-09-16'], ['today', '2026-09-15'], ['Tuesday', '2026-09-22'], ['2026-10-01', '2026-10-01'],
  ])('%s → %s', (said, want) => expect(resolveDayWord(said, 'America/Denver', now)).toBe(want))
  it('nonsense is null, not a guess', () => { expect(resolveDayWord('someday', 'America/Denver', now)).toBeNull(); expect(resolveDayWord('', 'America/Denver', now)).toBeNull() })
  it('the model is told to pass the word, and the dispatch resolves it', () => {
    expect(chat).toMatch(/the day EXACTLY as the user said it — "Thursday", "tomorrow", "next Monday"/)
    expect(propose).toMatch(/const date = dateSaid \? resolveDayWord\(dateSaid, tz\) : \(sec\.scheduled_date \|\| ''\)/)
    expect(engine).toMatch(/never convert a weekday to a date yourself, the server does that/)
  })
})

describe('the job page\'s write, nothing more', () => {
  it('assigned_to and scheduled_date — what handleSaveSection writes, and only those two', () => {
    expect(page).toMatch(/assigned_to: sectionForm\.assigned_to \? parseInt\(sectionForm\.assigned_to\) : null/)
    expect(page).toMatch(/scheduled_date: sectionForm\.scheduled_date \|\| null/)
    expect(apply).toMatch(/patchRow\(r, 'job_sections', companyId, sec\.id, \{ assigned_to: p\.employee_id, scheduled_date: p\.date, updated_at: new Date\(\)\.toISOString\(\) \}\)/)
    expect(apply).not.toMatch(/status:/)
  })
  it('refuses if the section moved since the draft; rollback refuses if reassigned since', () => {
    expect(apply).toMatch(/stale: true/)
    expect(rollback).toMatch(/has been reassigned since\. Change it on the job page\./)
  })
  it('clashes are shown on the card, never decided', () => {
    expect(propose).toMatch(/has approved \$\{off\[0\]\.request_type \|\| 'time off'\} that day/)
    expect(propose).toMatch(/const after = `\$\{emp\.name\} · \$\{day\(date\)\}\$\{clash \? ` — Clash: \$\{clash\}` : ''\}`/)
    expect(propose + apply).not.toMatch(/least|busiest|fewest|\.sort\(/)
  })
  it('a name that fits two people is a question; several sections is a needs_choice', () => {
    expect(propose).toMatch(/if \(person\.length > 1\) return \{ error: `More than one person matches/)
    expect(propose).toMatch(/needs_choice: secs\.slice\(0, 6\)/)
  })
  it('manager only', () => {
    expect(propose).toMatch(/if \(caller\.level < 2\) return \{ error: 'Putting someone on a job is a manager/)
    expect(records).toMatch(/section_assign: \{[\s\S]*?minLevel: 2/)
  })
})

describe('the roster read', () => {
  it('free means unbooked, and the tool says so', () => {
    expect(d).toMatch(/free: !mine\.length && !myAppts\.length && !myOff/)
    expect(d).toMatch(/free_means: 'no job section, no appointment, no approved time off that day — unbooked, not idle'/)
  })
  it('only approved time off counts, and the reason is never returned', () => {
    expect(d).toMatch(/time_off_requests\?select=employee_id,start_date,end_date,request_type&company_id=eq\.\$\{companyId\}&status=eq\.approved/)
    expect(d).not.toMatch(/reason/)
  })
  it('finished sections are not on anyone\'s day', () => {
    expect(d).toMatch(/status=not\.in\.\(Complete,Completed,Verified,Cancelled\)/)
  })
})

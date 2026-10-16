// Cole's daily rep goals (2026-10-15): the pure rules, run for real.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const load = (src) => {
  const m = { exports: {} }
  new Function('module', 'exports', 'require', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, () => ({ closeDateOf: (q, j) => j?.created_at || q?.approved_date || q?.created_at || null }))
  return m.exports
}
const G = load(read('../../supabase/functions/_shared/repGoals.ts'))
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const routines = read('../../supabase/functions/_shared/arnieRoutines.ts')

describe('workdays: not holidays, not the weekend', () => {
  it('US office holidays, observed off the weekend', () => {
    const h26 = G.usHolidays(2026)
    expect(h26['2026-11-26']).toBe('Thanksgiving')
    expect(h26['2026-11-27']).toBe('the day after Thanksgiving')
    expect(h26['2026-12-25']).toBe('Christmas')
    expect(h26['2026-07-03']).toBe('Independence Day')   // Jul 4 2026 is a Saturday
    expect(h26['2026-05-25']).toBe('Memorial Day')
    expect(h26['2026-09-07']).toBe('Labor Day')
    expect(G.usHolidays(2027)['2027-12-24']).toBe('Christmas') // Saturday → Friday
    expect(G.usHolidays(2027)['2027-12-31']).toBe("New Year's Day") // Jan 1 2028 is a Saturday
  })
  it('the routine runner skips holidays and approved time off for weekday routines, and says so', () => {
    expect(routines).toMatch(/if \(routine\.weekdays_only\) \{\n\s+const off = await offDayReason\(/)
    expect(routines).toMatch(/last_result: `Skipped — \$\{off\}\.`/)
    const src = read('../../supabase/functions/_shared/repGoals.ts')
    expect(src).toMatch(/time_off_requests\?select=id&company_id=eq\.\$\{companyId\}&employee_id=eq\.\$\{employeeId\}&status=eq\.approved&start_date=lte\.\$\{day\}&end_date=gte\.\$\{day\}/)
  })
})

describe('days are Cole\'s days, not UTC\'s', () => {
  it('a 7pm Utah sale is today, not tomorrow', () => {
    expect(G.localDay('2026-10-16T01:00:00Z', 'America/Denver')).toBe('2026-10-15')
  })
  it('a typed date stored at midnight UTC means the day it names', () => {
    expect(G.calendarDayOf('2026-10-15T00:00:00+00:00', 'America/Denver')).toBe('2026-10-15')
    expect(G.calendarDayOf('2026-10-15', 'America/Denver')).toBe('2026-10-15')
    expect(G.calendarDayOf('2026-10-15T20:30:00+00:00', 'America/Denver')).toBe('2026-10-15')
  })
  it('the day starts at local midnight, DST included', () => {
    expect(G.dayStartUtc('2026-10-15', 'America/Denver').toISOString()).toBe('2026-10-15T06:00:00.000Z') // MDT
    expect(G.dayStartUtc('2026-12-15', 'America/Denver').toISOString()).toBe('2026-12-15T07:00:00.000Z') // MST
  })
})

describe('names as Cole says them', () => {
  const reps = [{ id: 72, name: 'Damien Hargett' }, { id: 17, name: 'Doug Webb' }, { id: 34, name: 'Noah Free' }, { id: 120, name: 'Noah Sorensen' }, { id: 14, name: 'Christopher Lyman' }]
  it('first names, initials, full names', () => {
    expect(G.matchRep(reps, 'Doug').id).toBe(17)
    expect(G.matchRep(reps, 'noah f').id).toBe(34)
    expect(G.matchRep(reps, 'Noah S').id).toBe(120)
    expect(G.matchRep(reps, 'Christopher Lyman').id).toBe(14)
  })
  it('two Noahs is a question, not a guess', () => {
    expect(G.matchRep(reps, 'Noah').problem).toMatch(/Noah Free or Noah Sorensen/)
    expect(G.matchRep(reps, 'Tracy').problem).toMatch(/not one of/)
  })
})

describe('a routine that texts actually sends the text', () => {
  it('send-sms is given `message` (what it reads), not `body` — and a refusal is recorded, not thrown away', () => {
    const sms = read('../../supabase/functions/send-sms/index.ts')
    expect(sms).toMatch(/const \{ company_id, to, message,/)
    expect(routines).toMatch(/JSON\.stringify\(\{ to: employee\.phone, message: forSms\(/)
    expect(routines).not.toMatch(/body: forSms\(/)
    expect(routines).toMatch(/if \(!res\.ok\) smsError = `the text did not send/)
    expect(routines).toMatch(/last_error: sent\.smsError/)
  })
})

describe('wired into Jenny — managers only, no money', () => {
  it('both tools are offered and gated to managers', () => {
    expect(chat).toMatch(/name: 'set_rep_goals'/)
    expect(chat).toMatch(/name: 'query_rep_goals'/)
    expect(chat).toMatch(/if \(name === 'set_rep_goals' \|\| name === 'query_rep_goals'\) \{\n[\s\S]{0,200}if \(!isManager\) return \{ restricted:/)
  })
  it('a lead only ever sets goals for HIS board (owner = the caller)', () => {
    expect(chat).toMatch(/await setGoals\(rr, companyId, employeeId, day,/)
    expect(chat).toMatch(/await scoreboard\(rr, companyId, employeeId, day, tz\)/)
  })
})

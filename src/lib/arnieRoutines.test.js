// Standing work: the routines Arnie runs on a schedule.
//
// The scheduling half is where this kind of feature goes wrong — a routine that
// fires twice, or at 3am because the server is in UTC, is one somebody turns
// off. So the clock logic is tested directly rather than by reading the source.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const engine = read('../../supabase/functions/_shared/arnieRoutines.ts')
const target = read('../../supabase/functions/_shared/arnieRoutineTarget.ts')
const fn = read('../../supabase/functions/arnie-routines/index.ts')
const cron = read('../../api/cron/arnie-routines.js')
const migration = read('../../supabase/migrations/20261010202454_arnie_routines.sql')
const prompt = read('../../supabase/functions/_shared/arniePrompt.ts')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')

const load = (src) => {
  const m = { exports: {} }
  new Function('module', 'exports', 'require', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, () => ({}))
  return m.exports
}
const mod = load(engine)
const tgt = load(target)

// 2026-10-12 is a Monday; 2026-10-10 a Saturday.
const at = (iso) => new Date(iso)

describe('whose hour is it', () => {
  it('reads the local hour and day in the routine’s own zone, not the server’s', () => {
    // 14:00 UTC is 08:00 in Denver and 07:00 in Phoenix (no DST there).
    expect(mod.localNow('America/Denver', at('2026-10-12T14:00:00Z')).hour).toBe(8)
    expect(mod.localNow('America/Phoenix', at('2026-10-12T14:00:00Z')).hour).toBe(7)
    expect(mod.localNow('America/Denver', at('2026-10-12T14:00:00Z')).day).toBe('2026-10-12')
  })

  it('rolls the day over where the person is, not at UTC midnight', () => {
    // 03:00 UTC on the 13th is still the evening of the 12th in Denver.
    expect(mod.localNow('America/Denver', at('2026-10-13T03:00:00Z')).day).toBe('2026-10-12')
  })

  it('folds a midnight reported as 24 back to 0', () => {
    expect(mod.localNow('America/Denver', at('2026-10-12T06:00:00Z')).hour).toBe(0)
  })
})

describe('due, exactly once', () => {
  const base = { enabled: true, hour_local: 8, minute_local: 0, timezone: 'America/Denver', weekdays_only: true, last_run_on: null }

  it('is due at its hour on a weekday', () => {
    expect(mod.isDue(base, at('2026-10-12T14:00:00Z')).due).toBe(true)
  })

  it('is not due at any other hour', () => {
    expect(mod.isDue(base, at('2026-10-12T15:00:00Z')).due).toBe(false)
    expect(mod.isDue(base, at('2026-10-12T13:00:00Z')).due).toBe(false)
  })

  it('never runs EARLY, not even by a minute', () => {
    // A routine that goes off before its time is one people stop trusting.
    expect(mod.isDue(base, at('2026-10-12T13:59:00Z')).due).toBe(false)
  })

  it('still runs if a cron tick was missed, within the catch-up window', () => {
    // The old check was an exact hour match against an hourly cron: one
    // chance a day, and if that single invocation failed the routine simply
    // did not happen and nothing said so.
    expect(mod.isDue(base, at('2026-10-12T14:15:00Z')).due).toBe(true)
    expect(mod.isDue(base, at('2026-10-12T14:20:00Z')).due).toBe(true)
  })

  it('gives up rather than arriving at a time that feels random', () => {
    expect(mod.isDue(base, at('2026-10-12T14:25:00Z')).due).toBe(false)
  })

  it('runs at the MINUTE it was asked for', () => {
    // Alayda asked for 8:45 and was scheduled for 8:00, because the minutes
    // were parsed and then thrown away.
    const q = { ...base, minute_local: 45 }
    expect(mod.isDue(q, at('2026-10-12T14:00:00Z')).due).toBe(false)  // 8:00 — too early
    expect(mod.isDue(q, at('2026-10-12T14:44:00Z')).due).toBe(false)  // 8:44 — still early
    expect(mod.isDue(q, at('2026-10-12T14:45:00Z')).due).toBe(true)   // 8:45
    expect(mod.isDue(q, at('2026-10-12T14:50:00Z')).due).toBe(true)   // a missed tick
    expect(mod.isDue(q, at('2026-10-12T15:10:00Z')).due).toBe(false)  // far too late
  })

  it('a row written before minutes existed keeps the time it has now', () => {
    // minute_local defaults to 0 in the migration; an undefined one must
    // behave the same way rather than coming out NaN and never firing.
    const old = { ...base }
    delete old.minute_local
    expect(mod.isDue(old, at('2026-10-12T14:00:00Z')).due).toBe(true)
  })

  it('a missed day does not fire after midnight under yesterday’s name', () => {
    // Scheduled 23:50, now 00:05 the next day: that is early for today, not
    // late for yesterday.
    const night = { ...base, hour_local: 23, minute_local: 50 }
    expect(mod.isDue(night, at('2026-10-13T06:05:00Z')).due).toBe(false)
  })

  it('never runs twice in the same local day', () => {
    expect(mod.isDue({ ...base, last_run_on: '2026-10-12' }, at('2026-10-12T14:00:00Z')).due).toBe(false)
    // …but the next day it is due again.
    expect(mod.isDue({ ...base, last_run_on: '2026-10-12' }, at('2026-10-13T14:00:00Z')).due).toBe(true)
  })

  it('skips the weekend unless it was asked not to', () => {
    // Saturday 2026-10-10.
    expect(mod.isDue(base, at('2026-10-10T14:00:00Z')).due).toBe(false)
    expect(mod.isDue({ ...base, weekdays_only: false }, at('2026-10-10T14:00:00Z')).due).toBe(true)
  })

  it('a disabled routine never runs', () => {
    expect(mod.isDue({ ...base, enabled: false }, at('2026-10-12T14:00:00Z')).due).toBe(false)
  })

  it('a routine with no timezone is skipped rather than guessed at', () => {
    const out = mod.isDue({ ...base, timezone: '' }, at('2026-10-12T14:00:00Z'))
    expect(out.due).toBe(false)
    expect(out.why).toBe('no timezone')
  })
})

describe('what a TIME means when somebody says it', () => {
  const t = (s) => tgt.timeOf(s)

  it('keeps the minutes', () => {
    // The whole bug: these were matched by the regex and then dropped.
    expect(t('8:45')).toEqual({ hour: 8, minute: 45 })
    expect(t('8:45am')).toEqual({ hour: 8, minute: 45 })
    expect(t('4:05pm')).toEqual({ hour: 16, minute: 5 })
    expect(t('17:30')).toEqual({ hour: 17, minute: 30 })
  })

  it('reads the spoken fractions', () => {
    // "half past six" has a 6 in it and used to come out as six o'clock —
    // half an hour wrong, and invisible unless you read the card carefully.
    expect(t('half past six')).toEqual({ hour: 6, minute: 30 })
    expect(t('half past 6')).toEqual({ hour: 6, minute: 30 })
    expect(t('quarter past seven')).toEqual({ hour: 7, minute: 15 })
    expect(t('quarter to five')).toEqual({ hour: 4, minute: 45 })
    expect(t('half past five pm')).toEqual({ hour: 17, minute: 30 })
  })

  it('on the hour still means zero minutes', () => {
    expect(t('7am')).toEqual({ hour: 7, minute: 0 })
    expect(t('noon')).toEqual({ hour: 12, minute: 0 })
    expect(t('midnight')).toEqual({ hour: 0, minute: 0 })
  })

  it('refuses a minute that is not one', () => {
    expect(t('8:75')).toBeNull()
  })

  it('writes a time back the way a person reads it', () => {
    expect(tgt.timeLabel(8, 45)).toBe('8:45am')
    expect(tgt.timeLabel(8, 0)).toBe('8am')      // no pointless ":00"
    expect(tgt.timeLabel(17, 5)).toBe('5:05pm')
    expect(tgt.timeLabel(0, 0)).toBe('12am')
    expect(tgt.timeLabel(12, 30)).toBe('12:30pm')
  })
})

describe('what an hour means when somebody says it', () => {
  it('reads the obvious forms', () => {
    expect(tgt.hourOf('7am')).toBe(7)
    expect(tgt.hourOf('7')).toBe(7)
    expect(tgt.hourOf('07:00')).toBe(7)
    expect(tgt.hourOf('5pm')).toBe(17)
    expect(tgt.hourOf('noon')).toBe(12)
    expect(tgt.hourOf('midnight')).toBe(0)
    expect(tgt.hourOf('12am')).toBe(0)
    expect(tgt.hourOf('12pm')).toBe(12)
  })

  it('is null when it is not a time, so the rail asks instead of guessing', () => {
    expect(tgt.hourOf('')).toBeNull()
    expect(tgt.hourOf('soon')).toBeNull()
    expect(tgt.hourOf('99')).toBeNull()
  })
})

describe('a routine notices; it does not decide', () => {
  it('runs through the same Arnie, with the same rails', () => {
    expect(engine).toMatch(/runArnieTurn\(/)
    expect(engine).not.toMatch(/arnie_proposals/)
    expect(engine).not.toMatch(/action: 'apply'/)
    expect(prompt).toMatch(/a routine notices, it does not decide/)
  })

  it('runs as the person it belongs to, and stops when they leave', () => {
    expect(engine).toMatch(/active=eq\.true&id=eq\.\$\{routine\.employee_id\}/)
    expect(engine).toMatch(/the employee is no longer active/)
    expect(engine).toMatch(/enabled: false/)
  })

  it('records what happened either way, so a silent failure is visible', () => {
    expect(engine).toMatch(/last_error: turn\.error \|\| 'no answer'/)
    expect(engine).toMatch(/last_result:/)
  })

  it('only stamps last_run_on when it actually delivered', () => {
    // Stamping on failure would silently skip the person for the whole day.
    const fail = engine.slice(engine.indexOf('if (turn.error || !str(turn.text))'), engine.indexOf('await deliver('))
    expect(fail).toMatch(/last_error/)
    expect(fail).not.toMatch(/last_run_on/)
  })

  it('one routine failing does not stop the others', () => {
    expect(fn).toMatch(/try \{\s*\n?\s*const out = await runRoutine/)
    expect(fn).toMatch(/catch \(e\)/)
  })
})

describe('only our own scheduler may run other people’s routines', () => {
  it('the function refuses anyone else', () => {
    expect(fn).toMatch(/if \(!ours\) return json\(\{ error: 'not for callers' \}, 403\)/)
    expect(fn).toMatch(/x-arnie-internal/)
  })

  it('the cron carries the internal key, because the two service keys differ', () => {
    expect(cron).toMatch(/ARNIE_INTERNAL_KEY/)
    expect(cron).toMatch(/x-arnie-internal/)
    expect(cron).toMatch(/CRON_SECRET/)
  })

  it('wakes often enough for the minute to mean anything', () => {
    // It ran at :20 past, once an hour, which is why minute_local would have
    // been decoration. Every five minutes also gives isDue's catch-up window
    // four ticks of slack instead of none.
    const vercel = JSON.parse(read('../../vercel.json'))
    const mine = vercel.crons.find((c) => c.path === '/api/cron/arnie-routines')
    expect(mine).toBeTruthy()
    expect(mine.schedule).toBe('*/5 * * * *')
    const everyN = Number(/^\*\/(\d+) \* \* \* \*$/.exec(mine.schedule)?.[1])
    expect(everyN).toBeLessThanOrEqual(mod.CATCH_UP_MINUTES)
  })
})

describe('setting one up by asking', () => {
  it('is a create target anyone can use for themselves', () => {
    const block = create.slice(create.indexOf('routine: {'), create.indexOf('memory: {'))
    expect(block).toMatch(/minLevel: 0/)
    expect(block).toMatch(/prompt: \{ column: null, label: 'Asks',  required: true/)
    expect(block).toMatch(/rollbackCustom: rollbackRoutine/)
  })

  it('uses field names that do not collide with other targets', () => {
    // `name` already means the company name and `days` a day COUNT; reusing
    // either would have been the duplicate-key bug all over again.
    const block = create.slice(create.indexOf('routine: {'), create.indexOf('memory: {'))
    expect(block).toMatch(/routine_name:/)
    expect(block).toMatch(/every_day:/)
    expect(block).not.toMatch(/\bname:\s*\{/)
  })

  it('refuses a channel it cannot reach the person on', () => {
    expect(target).toMatch(/no mobile number on your employee record/)
    expect(target).toMatch(/no email on your employee record/)
  })

  it('asks for the hour rather than picking one', () => {
    expect(target).toMatch(/What time should I run/)
  })

  it('defaults to weekdays, because a Sunday surprise gets a feature turned off', () => {
    expect(target).toMatch(/const weekdaysOnly = !\/\^\(y\|yes\|true\|every \?day\|daily\)\//)
  })

  it('will not quietly give somebody the same routine twice', () => {
    expect(target).toMatch(/You already have a routine called/)
    expect(migration).toMatch(/arnie_routines_one_name_per_person_idx/)
  })
})

describe('the table', () => {
  it('is tenant-isolated like everything else', () => {
    expect(migration).toMatch(/alter table public\.arnie_routines enable row level security/)
    expect(migration).toMatch(/current_user_company_ids\(\)/)
  })

  it('has somewhere for the outside-tool half to go, unused today', () => {
    expect(migration).toMatch(/steps\s+jsonb/)
    expect(migration).toMatch(/deliberately null for every row today/)
  })

  it('keeps the know-how shareable while the access stays personal', () => {
    expect(migration).toMatch(/shared\s+boolean not null default false/)
    expect(migration).toMatch(/employee_id\s+integer not null/)
  })
})

describe('the minute is stored, and does not fire the moment it is made', () => {
  const minuteMigration = read('../../supabase/migrations/20261013193000_arnie_routine_minutes.sql')

  it('the column exists, defaulted so old routines keep their time', () => {
    expect(minuteMigration).toMatch(/add column if not exists minute_local integer not null default 0/)
    expect(minuteMigration).toMatch(/check \(minute_local between 0 and 59\)/)
  })

  it('the card and the row both carry the minute', () => {
    expect(target).toMatch(/minute_local: minute/)
    expect(target).toMatch(/timeLabel\(hour, minute\)/)
  })

  it('a time that has already gone today starts tomorrow', () => {
    // isDue has a catch-up window, so without this, approving an 8:45
    // routine at 8:50 would fire it on the spot — which reads as a bug, not
    // a schedule.
    expect(target).toMatch(/const alreadyGone = nowH \* 60 \+ nowM >= hour \* 60 \+ minute/)
    expect(target).toMatch(/\.\.\.\(alreadyGone \? \{ last_run_on: today \} : \{\}\)/)
    expect(target).toMatch(/starting tomorrow/)
  })

  it('Arnie is told minutes are kept, and to read the card', () => {
    expect(prompt).toMatch(/\*\*Minutes are kept\.\*\*/)
    expect(prompt).not.toMatch(/minutes are not kept/i)
    expect(prompt).toMatch(/never round it yourself/)
  })
})

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const time = read('../../supabase/functions/_shared/arnieTime.ts')
const appt = read('../../supabase/functions/_shared/arnieAppointment.ts')
const shift = read('../../supabase/functions/_shared/arnieShift.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')

// The real module, types stripped by esbuild — no regex surgery.
const mod = (() => { const m = { exports: {} }; new Function('module', 'exports', transformSync(time, { loader: 'ts', format: 'cjs' }).code)(m, m.exports); return m.exports })()
const tz = 'America/Denver'
// Tue Sep 15 2026, 23:30 in Denver — already Wednesday in UTC. The boundary every off-by-one hides behind.
const now = new Date('2026-09-16T05:30:00Z')

describe('a moment the way a person says it — booking looks forward', () => {
  it.each([
    ['Thursday at 2', '2026-09-17', '14:00'],
    ['tomorrow 9:30am', '2026-09-16', '09:30'],
    ['2pm Friday', '2026-09-18', '14:00'],
    ['next Monday at noon', '2026-09-21', '12:00'],
    ['2026-09-17 14:00', '2026-09-17', '14:00'],
    ['2026-09-17T14:00', '2026-09-17', '14:00'],
    ['9', '2026-09-15', '09:00'],       // morning hours stay morning
    ['12', '2026-09-15', '12:00'],
    ['tuesday', '2026-09-22', null],    // today's weekday means a week out; no time → caller asks
  ])('%s → %s %s', (said, date, t) => expect(mod.resolveWhenSaid(said, tz, 'forward', now)).toEqual({ date, time: t }))
})

describe('a clock-out looks back', () => {
  it.each([
    ['5:30 yesterday', '2026-09-14', '17:30'],
    ['yesterday at 5:30 pm', '2026-09-14', '17:30'],
    ['Thursday 6pm', '2026-09-10', '18:00'],
    ['last Thursday 6pm', '2026-09-10', '18:00'],
    ['Tuesday 5', '2026-09-15', '17:00'],  // today's weekday, looking back, is today
    ['5:30', '2026-09-15', '17:30'],       // 1–6 is afternoon
  ])('%s → %s %s', (said, date, t) => expect(mod.resolveWhenSaid(said, tz, 'back', now)).toEqual({ date, time: t }))
  it('nonsense is null, never a guess', () => {
    expect(mod.resolveWhenSaid('someday at 2', tz, 'forward', now)).toBeNull()
    expect(mod.resolveWhenSaid('25:00', tz, 'forward', now)).toBeNull()
  })
})

describe('the rails take the words, the model is told not to count', () => {
  it('appointment: when as said, forward; a day without a time is a question', () => {
    expect(appt).toMatch(/const said = resolveWhenSaid\(f\.when, tz, 'forward'\)/)
    expect(appt).toMatch(/if \(!said\.time\) return \{ ok: false, error: `What time on/)
    expect(chat).toMatch(/when: \{ type: 'string', description: 'EXACTLY as the user said it/)
    expect(engine).toMatch(/EXACTLY as they said it — "Thursday at 2"/)
  })
  it('shift close: value as said, back; "now" still means now', () => {
    expect(shift).toMatch(/resolveWhenSaid\(input\.value, tz, 'back'\)/)
    expect(shift).toMatch(/const out = said \? localToUtc\(`\$\{said\.date\} \$\{said\.time\}`, tz\) : new Date\(\)/)
    expect(chat).toMatch(/for shift_close the clock-out EXACTLY as the user said it/)
    expect(engine).toMatch(/value is the time EXACTLY as they said it/)
  })
})

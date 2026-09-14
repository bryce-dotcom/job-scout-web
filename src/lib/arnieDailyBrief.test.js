import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const brief = read('../../supabase/functions/_shared/arnieBrief.ts')
const chatTs = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')
const chatJsx = read('../pages/agents/arnie/ArnieChat.jsx')

describe('the brief is one call, and "today" is the user\'s day', () => {
  it('query_daily_brief exists and requires the date and timezone', () => {
    const i = chatTs.indexOf("name: 'query_daily_brief'")
    expect(i).toBeGreaterThan(-1)
    const def = chatTs.slice(i, chatTs.indexOf('\n  },\n', i))
    expect(def).toMatch(/required: \['date', 'timezone'\]/)
  })

  it('the prompt tells Arnie what day it is — he has no clock', () => {
    expect(engine).toMatch(/const localDate = new Date\(\)\.toLocaleDateString\('en-CA'\)/)
    expect(engine).toMatch(/Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/)
    expect(engine).toMatch(/- Today: \$\{localDate\} \(\$\{localTz\}\)/)
  })

  it('day bounds are computed in the given zone, not the server\'s', () => {
    expect(brief).toMatch(/export function dayBounds\(date: string, tz: string\)/)
    expect(brief).toMatch(/tzOffsetMinutes\(tz, guess\)/)
    // A bad or missing zone falls back to UTC rather than throwing.
    expect(brief).toMatch(/: 'UTC'/)
  })
})

describe('scope widens with the login, never with the question', () => {
  it('the team section is behind manager level', () => {
    expect(brief).toMatch(/const manager = caller\.level >= 2/)
    expect(brief).toMatch(/if \(manager\) \{[\s\S]*out\.team_day = /)
  })

  it('the money section is behind admin, via the same moneyAccess the money tools use', () => {
    expect(brief).toMatch(/const access = await moneyAccess\(r, caller\)/)
    expect(brief).toMatch(/const admin = access\.isAdmin/)
    expect(brief).toMatch(/if \(admin\) \{[\s\S]*out\.money = /)
  })

  it('"mine" is decided from the caller\'s employee id on every row it touches', () => {
    expect(brief).toMatch(/String\(a\.employee_id\) === String\(me\)/)
    expect(brief).toMatch(/String\(s\.assigned_to\) === String\(me\)/)
    expect(brief).toMatch(/employee_id=eq\.\$\{me\}&clock_out=is\.null/)
    expect(brief).toMatch(/setter_owner_id=eq\.\$\{me\}/)
  })

  it('own pay in the brief comes from myPay(), so it cannot disagree with My Pay', () => {
    expect(brief).toMatch(/await myPay\(r, caller, \{\}\)/)
    expect(brief).not.toMatch(/hourly_rate|salary/)
  })
})

describe('it is reachable in one tap and reads like a brief', () => {
  it('a chip in field mode and at every desk role', () => {
    expect((chatJsx.match(/icon: Sun/g) || []).length).toBeGreaterThanOrEqual(4)
    expect(chatJsx).toMatch(/Wrench, Sun \} from 'lucide-react'/)
  })

  it('the prompt orders by action and skips empty sections', () => {
    const b = engine.slice(engine.indexOf('## The daily brief'), engine.indexOf('## Money — who may see what'))
    expect(b).toMatch(/a job today with nobody on it/)
    expect(b).toMatch(/Skip sections that are empty/)
  })

  it('no emojis — JobScout draws its own icons', () => {
    expect(engine).toMatch(/\*\*No emojis\. Ever\.\*\*/)
  })
})

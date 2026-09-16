import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const rules = read('../../supabase/functions/_shared/arnieNudge.ts')
const fn = read('../../supabase/functions/arnie-nudge/index.ts')
const brief = read('../../supabase/functions/arnie-brief-push/index.ts')
const send = read('../../supabase/functions/_shared/arnieSend.ts')
const cron = read('../../api/cron/arnie-nudge.js')
const vercel = JSON.parse(read('../../vercel.json'))
const deploy = read('../../scripts/arnie-deploy.mjs')
const settings = read('../pages/agents/arnie/MorningBriefSettings.jsx')
const migration = read('../../supabase/migrations/20260915190000_arnie_nudges.sql')

// composeNudge, evaluated here: the text a person reads is worth a real assertion.
const compose = (() => {
  const src = rules.slice(rules.indexOf('export function composeNudge'))
    .replace('export function', 'function').replace(/: Nudge\[\]/g, '').replace(/: string/g, '')
  return new Function(`const MAX_ITEMS = 6; ${src}; return composeNudge`)()
})()
const item = (kind, line) => ({ kind, ref_key: 'x', employee_id: null, subject: 's', line })

describe('what earns a nudge', () => {
  it('a quote quiet 10 days — but only for the four days after, so a backlog is the brief\'s list, not a wall of texts', () => {
    expect(rules).toMatch(/QUIET_QUOTE_DAYS = 10/)
    expect(rules).toMatch(/QUIET_QUOTE_WINDOW = 4/)
    expect(rules).toMatch(/if \(last > cutoff \|\| last < floor\) continue/)
  })
  it('the last touch counts the follow-ups, and a quote that goes quiet again after one is a new item', () => {
    expect(rules).toMatch(/\[q\.last_sent_at, q\.sent_date, q\.follow_up_1, q\.follow_up_2, q\.follow_up_3\]/)
    expect(rules).toMatch(/ref_key: `\$\{q\.id\}:\$\{n\}`/)
  })
  it('an invoice that tipped overdue in the last three days, with a customer balance the utility has not covered', () => {
    expect(rules).toMatch(/OVERDUE_WINDOW_DAYS = 3/)
    expect(rules).toMatch(/due_date=lt\.\$\{today\}&due_date=gte\.\$\{since\}/)
    expect(rules).toMatch(/p\.paid_by !== 'utility'/)
    expect(rules).toMatch(/if \(bal <= 0\.01\) continue/)
  })
  it('a shift open twelve hours — nudged to its own employee only', () => {
    expect(rules).toMatch(/OPEN_SHIFT_HOURS = 12/)
    expect(fn).toMatch(/if \(n\.kind === 'open_shift'\) return String\(n\.employee_id\) === String\(emp\.id\)/)
  })
})

describe('who hears what', () => {
  it('money to admins, quotes to managers or the quote\'s own rep', () => {
    expect(fn).toMatch(/if \(n\.kind === 'overdue_invoice'\) return level >= 3/)
    expect(fn).toMatch(/if \(n\.kind === 'quiet_quote'\) return level >= 2 \|\| String\(n\.employee_id \?\? ''\) === String\(emp\.id\)/)
  })
  it('quiet hours 7am–9pm local; weekdays-only respected for quotes and money, never for your own open shift', () => {
    expect(fn).toMatch(/QUIET_FROM = 7, QUIET_TO = 21/)
    expect(fn).toMatch(/if \(!only && \(hour < QUIET_FROM \|\| hour > QUIET_TO\)\) continue/)
    const filter = fn.slice(fn.indexOf('all.filter((n) =>'), fn.indexOf('// Never the same item twice'))
    expect(filter.indexOf("open_shift")).toBeLessThan(filter.indexOf('weekdays_only && weekend'))
  })
  it('never the same item twice: recorded only when actually sent, unique per person+kind+ref', () => {
    expect(fn).toMatch(/if \(sent\.sent\) \{/)
    expect(fn).toMatch(/seen\.has\(`\$\{n\.kind\}\|\$\{n\.ref_key\}`\)/)
    expect(migration).toMatch(/unique \(employee_id, kind, ref_key\)/)
  })
  it('a text carries three, an email six; what is recorded as sent was said', () => {
    expect(fn).toMatch(/slice\(0, s\.channel === 'sms' \? 3 : MAX_ITEMS\)/)
    expect(rules).toMatch(/MAX_ITEMS = 6/)
  })
  it('opt-out is the brief subscription\'s nudges flag, on the same screen', () => {
    expect(fn).toMatch(/enabled=eq\.true&nudges=eq\.true/)
    expect(migration).toMatch(/add column if not exists nudges boolean not null default true/)
    expect(settings).toMatch(/nudges: next\.nudges !== false/)
    expect(settings).toMatch(/Nudges between briefs/)
  })
})

describe('the words', () => {
  it('shift first, then money, then quotes — and a text stays under 480', () => {
    const items = [item('quiet_quote', 'Q line'), item('open_shift', 'S line'), item('overdue_invoice', 'I line')]
    const email = compose(items, 'Mike Sullivan', 'email')
    expect(email.indexOf('S line')).toBeLessThan(email.indexOf('I line'))
    expect(email.indexOf('I line')).toBeLessThan(email.indexOf('Q line'))
    expect(email).toMatch(/^Mike — 3 things that shouldn't wait for the morning brief:/)
    const sms = compose(Array.from({ length: 5 }, (_, i) => item('quiet_quote', 'A quiet quote line number ' + i + ' that is fairly long so five of them would overflow a text.')), 'Jordan Lee', 'sms')
    expect(sms.length).toBeLessThanOrEqual(480)
    expect(sms).toMatch(/^Arnie here, Jordan\./)
    expect(sms).toMatch(/And 2 more — open Arnie in JobScout\./)
  })
  it('no model writes a nudge — names come from rows, never from a prompt', () => {
    expect(fn).not.toMatch(/callAnthropic/)
    expect(rules).not.toMatch(/callAnthropic/)
  })
})

describe('one sender for the brief and the nudge, one cron pattern', () => {
  it('the brief and the nudge send through _shared/arnieSend.ts', () => {
    expect(brief).toMatch(/import \{ isServiceRole, sendArnieEmail, sendArnieSms \} from '\.\.\/_shared\/arnieSend\.ts'/)
    expect(brief).not.toMatch(/api\.resend\.com/)
    expect(send).toMatch(/from: 'OG Arnie <invoices@appsannex\.com>'/)
    expect(send).toMatch(/role \|\| ''\) === 'service_role'/)
  })
  it('the cron carries the service key, runs at :35 (the brief is :05), and is in the deploy list', () => {
    expect(cron).toMatch(/Authorization: `Bearer \$\{key\}`/)
    expect(cron).toMatch(/x-vercel-cron-signature/)
    const entry = vercel.crons.find((c) => c.path === '/api/cron/arnie-nudge')
    expect(entry?.schedule).toBe('35 * * * *')
    expect(vercel.crons.find((c) => c.path === '/api/cron/arnie-brief-push')?.schedule).toBe('5 * * * *')
    expect(deploy).toMatch(/'arnie-brief-push', 'arnie-nudge'\]/)
  })
})

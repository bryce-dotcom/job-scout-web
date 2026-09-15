import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const fn = read('../../supabase/functions/arnie-brief-push/index.ts')
const cron = read('../../api/cron/arnie-brief-push.js')
const vercel = JSON.parse(read('../../vercel.json'))
const migration = read('../../supabase/migrations/20260914160000_arnie_brief_subscriptions.sql')
const brief = read('../../supabase/functions/_shared/arnieBrief.ts')
const settings = read('../pages/agents/arnie/MorningBriefSettings.jsx')
const setup = read('../pages/agents/arnie/ArnieSetup.jsx')

describe('the schedule lives where a failure is visible', () => {
  it('is a Vercel cron, hourly, not pg_cron', () => {
    const c = vercel.crons.find((x) => x.path === '/api/cron/arnie-brief-push')
    expect(c, 'cron not registered').toBeTruthy()
    expect(c.schedule).toBe('5 * * * *')
    expect(migration).not.toMatch(/cron\.schedule/)
  })

  it('the handler calls the function WITH the service role key — the failure 20260821120000 records', () => {
    expect(cron).toMatch(/Authorization: `Bearer \$\{key\}`/)
    expect(cron).toMatch(/process\.env\.SUPABASE_SERVICE_ROLE_KEY/)
    expect(cron).toMatch(/x-vercel-cron-signature/)
  })

  it('the function accepts only a service-role JWT, judged by its claims, not by comparing the raw key', () => {
    expect(fn).toMatch(/if \(role !== 'service_role'\) return json\(\{ error: 'service role only' \}, 401\)/)
    expect(fn).not.toMatch(/bearer !== SERVICE_KEY/)
  })
})

describe('who gets what, when', () => {
  it('the brief is built as THAT employee — the same role mapping the JWT path uses', () => {
    expect(fn).toMatch(/function callerFor\(emp: any\): Caller/)
    expect(fn).toMatch(/Math\.max\(accessLevel\(emp\), emp\.is_admin === true \? 3 : 0\)/)
    expect(fn).toMatch(/dailyBrief\(r, caller, \{ date, timezone: s\.timezone \}\)/)
  })

  it("due = their hour, in their zone, not yet sent today, and not a weekend when they said weekdays", () => {
    expect(fn).toMatch(/hour === s\.hour_local && s\.last_sent_on !== date && !\(s\.weekdays_only && \(dow === 0 \|\| dow === 6\)\)/)
  })

  it('a send marks the day; a failure records the error and leaves the day open to retry', () => {
    expect(fn).toMatch(/sent\.sent \? \{ last_sent_on: date, last_error: null/)
    expect(fn).toMatch(/: \{ last_error: sent\.error \|\| 'send failed'/)
  })

  it('a person edits only their own subscription; the DB refuses the rest below admin', () => {
    expect(migration).toMatch(/create trigger guard_brief_subscription_owner/)
    expect(migration).toMatch(/You can change your own morning-brief settings; someone else''s needs an admin/)
    expect(migration).toMatch(/unique \(employee_id\)/)
  })
})

describe('what goes out', () => {
  it('in Arnie\'s voice when the model answers, as a plain list when it does not', () => {
    expect(fn).toMatch(/if \(text\) return \{ text, byModel: true \}/)
    expect(fn).toMatch(/return \{ text: plainBrief\(brief, first\), byModel: false \}/)
  })

  it('never a third person for the recipient\'s own shift — the "Danny" fix', () => {
    // The model once turned an unnamed open shift in my_day into a person
    // who does not exist. The row now says whose it is, and the writer is
    // told any name must appear in the brief.
    expect(brief).toMatch(/who: `\$\{name\(me\) \|\| 'you'\} \(you — the person reading this\)`/)
    expect(brief).toMatch(/about: `\$\{name\(me\) \|\| caller\.email\} — the person reading this brief/)
    expect(fn).toMatch(/Any person you name must appear by name in the brief; if no name is there, there is no person\./)
  })

  it('SMS is capped and plain; email gets the shell with an Ask Arnie link', () => {
    expect(fn).toMatch(/Under 400 characters total\. Plain text\. No headings\./)
    expect(fn).toMatch(/appLink\('\/agents\/arnie'\)/)
    expect(fn).toMatch(/No emojis\. No tool names\./)
  })
})

describe('the settings live where every role can reach them', () => {
  it('render above the manager gate on the Arnie settings page', () => {
    const gate = setup.indexOf('if (!canSeeHistory) {')
    const inGate = setup.indexOf('<MorningBriefSettings />', gate)
    expect(inGate).toBeGreaterThan(gate)
    expect(setup.indexOf('<ShieldAlert', gate)).toBeGreaterThan(inGate)
  })

  it('upsert the person\'s own row keyed by employee, with the browser\'s zone', () => {
    expect(settings).toMatch(/\.upsert\(row, \{ onConflict: 'employee_id' \}\)/)
    expect(settings).toMatch(/Intl\.DateTimeFormat\(\)\.resolvedOptions\(\)\.timeZone/)
    expect(settings).toMatch(/employee_id: user\.id/)
  })

  it('offer text only when there is a mobile number to send to', () => {
    expect(settings).toMatch(/const off = ch === 'sms' && !hasPhone/)
  })
})

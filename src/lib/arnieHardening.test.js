import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const sms = read('../../supabase/functions/send-sms/index.ts')
const send = read('../../supabase/functions/_shared/arnieSend.ts')
const notify = read('../../supabase/functions/_shared/notifyRep.ts')
const followup = read('../../supabase/functions/_shared/arnieFollowup.ts')
const brief = read('../../supabase/functions/arnie-brief-push/index.ts')
const nudge = read('../../supabase/functions/arnie-nudge/index.ts')
const workflow = read('../../.github/workflows/arnie-eval.yml')

// communications_log as it actually is (information_schema, 2026-09-17).
const COLUMNS = ['id', 'company_id', 'communication_id', 'business_unit', 'type', 'trigger', 'customer_id', 'recipient', 'sent_date', 'status', 'response', 'employee_id', 'created_at', 'updated_at']

describe('a text Arnie sends is a record', () => {
  it('send-sms logs with columns the table has, and says so when it cannot', () => {
    const insert = sms.slice(sms.indexOf("from('communications_log').insert({"), sms.indexOf('if (logErr)'))
    const keys = [...insert.matchAll(/^\s+(\w+)(?::| ,|,)/gm)].map((m) => m[1]).filter((k) => k !== 'company_id' || true)
    for (const k of keys) expect(COLUMNS).toContain(k)
    expect(insert).not.toMatch(/direction|to_address|from_address|external_id|sent_at|body:/)
    expect(sms).toMatch(/if \(logErr\) console\.error\('\[send-sms\] communications_log insert failed:'/)
    expect(sms).not.toMatch(/Table might not exist yet/)
  })
  it('a caller that writes its own richer row opts out, so a follow-up is logged once', () => {
    expect(sms).toMatch(/if \(log !== false\) \{/)
    expect(followup).toMatch(/message: body, log: false/)
  })
  it('the brief and the nudge name their trigger and the person', () => {
    expect(brief).toMatch(/sendArnieSms\(r, emp\.company_id, to, text, \{ trigger: 'arnie_brief', employee_id: emp\.id \}\)/)
    expect(nudge).toMatch(/sendArnieSms\(r, emp\.company_id, to, text, \{ trigger: 'arnie_nudge', employee_id: emp\.id \}\)/)
  })
})

describe('every text ends with the way back into the app', () => {
  it('the link is appended once, never twice', () => {
    expect(send).toMatch(/const link = appLink\('\/agents\/arnie'\)/)
    expect(send).toContain('text.includes(link) ? text : `${text}\\n${link}`')
  })
  it('appLink can no longer come back empty — SITE_URL was never set and every button vanished', () => {
    expect(notify).toMatch(/export const APP_URL = 'https:\/\/jobscout\.appsannex\.com'/)
    expect(notify).toMatch(/Deno\.env\.get\('SITE_URL'\) \|\| APP_URL/)
    expect(notify).not.toMatch(/return base \? `\$\{base\}\$\{path\}` : ''/)
  })
})

describe('the eval runs on its own', () => {
  it('nightly, before Denver wakes, and inert without the secrets', () => {
    expect(workflow).toMatch(/cron: '17 11 \* \* \*'/)
    expect(workflow).toMatch(/workflow_dispatch/)
    expect(workflow).toMatch(/if \[ -z "\$SUPABASE_SERVICE_ROLE_KEY" \]; then/)
    expect(workflow).toMatch(/npm run arnie:eval/)
    expect(workflow).toMatch(/exit \$rc/)
  })
})

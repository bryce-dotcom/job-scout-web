import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const fu = read('../../supabase/functions/_shared/arnieFollowup.ts')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const chatJsx = read('../pages/agents/arnie/ArnieChat.jsx')
const engine = read('../pages/agents/arnie/arnieEngine.js')
const auto = read('../../supabase/functions/estimate-followup/index.ts')
const deploy = read('../../scripts/arnie-deploy.mjs')
const pkg = JSON.parse(read('../../package.json'))

const prepare = fu.slice(fu.indexOf('export async function prepareFollowup'), fu.indexOf('export async function applyFollowup'))
const apply = fu.slice(fu.indexOf('export async function applyFollowup'), fu.indexOf('export async function rollbackFollowup'))
const rollback = fu.slice(fu.indexOf('export async function rollbackFollowup'))

describe('the recipient comes from the record, never from the model', () => {
  it('quote.sent_to_email, then the lead, then the customer — or nothing', () => {
    expect(fu).toMatch(/\[q\.sent_to_email, lead\?\.email, cust\?\.email\]/)
    expect(prepare).toMatch(/if \(!to\) return \{ ok: false, error: `There is no/)
  })

  it('the tool schema has no address field for the model to fill', () => {
    const chatTs = read('../../supabase/functions/arnie-chat/index.ts')
    const i = chatTs.indexOf("name: 'propose_create'")
    const def = chatTs.slice(i, chatTs.indexOf('\n  },\n', i))
    expect(def).toMatch(/you never supply an address/)
    // the shared schema carries email/phone/address for LEAD creation; the follow-up target must accept none of them
    const start = create.indexOf('  followup: {')
    const entry = create.slice(start, create.indexOf('labelOf', start))
    const keys = [...entry.matchAll(/^\s+(\w+):\s+\{ column/gm)].map((m) => m[1]).sort()
    expect(keys).toEqual(['channel', 'message', 'quote', 'subject'])
  })
})

describe('who may chase whose quote', () => {
  it('a rep chases their own; anyone else\'s needs a manager', () => {
    expect(prepare).toMatch(/String\(q\.salesperson_id\) !== String\(caller\.employeeId\) && caller\.level < 2/)
  })

  it('only open quotes — approved, rejected and won are left alone, at draft and at send', () => {
    expect(fu).toMatch(/const OPEN = \['Sent', 'Draft', 'Pending'\]/)
    expect(apply).toMatch(/if \(q\.approved_date \|\| q\.rejected_date \|\| !OPEN\.includes\(q\.status\)\) return \{ ok: false, stale: true/)
  })
})

describe('the note is the rep\'s, not Arnie\'s', () => {
  it('the prompt asks for first person, one ask, nothing invented', () => {
    const p = engine.slice(engine.indexOf('## Chasing a quote'), engine.indexOf('## Filing a ticket'))
    expect(p).toMatch(/first person/)
    expect(p).toMatch(/one clear ask/)
    expect(p).toMatch(/No invented discounts, deadlines or prices/)
    expect(p).toMatch(/cannot be unsent/)
  })

  it('too short or too long for a text is refused before the card', () => {
    expect(prepare).toMatch(/message\.length < 20\) return/)
    expect(prepare).toMatch(/channel === 'sms' && message\.length > 480\) return/)
  })

  it('replies go to the rep, and the email is signed by them and the company', () => {
    expect(apply).toMatch(/reply_to: c\.rep_email/)
    expect(apply).toMatch(/esc\(c\.rep_name \|\| ''\)/)
  })
})

describe('booked the same way the automatic follow-up books itself', () => {
  it('followup_count + 1 and follow_up_N, so the two count together', () => {
    expect(apply).toMatch(/const n = \(Number\(q\.followup_count\) \|\| 0\) \+ 1/)
    expect(apply).toMatch(/patch\[`follow_up_\$\{n\}`\]/)
    expect(auto).toMatch(/followup_count: nextFollowup \+ 1/)
    expect(auto).toMatch(/const followupField = `follow_up_\$\{nextFollowup \+ 1\}`/)
  })

  it('logs to communications_log with the columns that table actually has', () => {
    for (const col of ['type', 'trigger', 'customer_id', 'recipient', 'sent_date', 'status', 'response', 'employee_id']) expect(apply).toContain(`${col}:`)
    const logInsert = apply.slice(apply.indexOf('rest/v1/communications_log'), apply.indexOf('logId ='))
    expect(logInsert).not.toMatch(/direction:|to_address:|from_address:/)
  })
})

describe('the card says Send, and a send cannot be undone', () => {
  it('the target carries verb and done, and the card draws them', () => {
    expect(create).toMatch(/followup: \{[\s\S]*verb: 'Send'/)
    expect(create).toMatch(/\.\.\.\(target\.verb \? \{ verb: target\.verb \} : \{\}\)/)
    expect(chatJsx).toMatch(/\$\{pv\.verb \|\| 'Create'\} \$\{pv\.label\}/)
    expect(chatJsx).toMatch(/pv\.done \|\| 'Created/)
    expect(chatJsx).toMatch(/m\.proposal\?\.preview\?\.done \|\|/)
  })

  it('rollback refuses and says why', () => {
    expect(rollback).toMatch(/cannot be unsent/)
    expect(rollback).not.toMatch(/DELETE/)
  })
})

describe('deploying only what bundles', () => {
  it('npm run arnie:deploy bundles each function before any deploy', () => {
    expect(pkg.scripts['arnie:deploy']).toBe('node scripts/arnie-deploy.mjs')
    expect(deploy).toMatch(/await build\(\{ entryPoints: \[entry\], bundle: true, write: false/)
    // both loops exist, and the bundle loop comes first
    expect(deploy.indexOf('bundles  ${fn}')).toBeLessThan(deploy.indexOf('deploying ${fn}'))
    expect(deploy).toMatch(/Nothing was deployed/)
  })
})

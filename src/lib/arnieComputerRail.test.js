import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const rail = read('../../supabase/functions/arnie-computer/index.ts')
// The CODE, with the prose taken out. The comments in this file discuss
// passwords and as_employee_id at length — explaining why neither belongs
// here — so an assertion about the code that reads the comments too fails on
// its own documentation. Same trap the migration test fell into.
const code = rail
  .split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n')
const config = read('../../supabase/config.toml')
const plan = read('../../ARNIE_ON_YOUR_COMPUTER_PLAN.md')

// This feature puts a cloud brain's hands on a customer's own computer. These
// are not style assertions — each one is a property that, if it quietly
// stopped being true, would turn the feature into the thing we promised it
// would never be.

describe('nothing can drive somebody else’s computer, including us', () => {
  it('identity comes from the caller’s own session, and there is no service-key path', () => {
    expect(rail).toMatch(/const caller = await resolveCaller\(req, SUPABASE_URL, SERVICE_KEY\)/)
    // internalCaller is how the brief, a text and a routine run with no JWT.
    // It must NOT be reachable here: a routine may ASK for an action through
    // the person's own agent, but nothing may assume a person's machine.
    expect(code).not.toMatch(/internalCaller/)
    expect(code).not.toMatch(/as_employee_id/)
  })

  it('refuses a caller with no employee row', () => {
    expect(rail).toMatch(/if \(!caller\?\.companyId \|\| !caller\.employeeId\)/)
    expect(rail).toMatch(/'Sign in to use this\.' \}, 401\)/)
  })

  it('company_id is never taken from the request body', () => {
    expect(rail).toMatch(/const company = caller\.companyId/)
    expect(rail).not.toMatch(/body\.company_id/)
  })

  it('a session only resolves when it is this employee’s own', () => {
    expect(rail).toMatch(/arnie_computer_sessions\?select=[^`]*&id=eq\.\$\{n\}&employee_id=eq\.\$\{me\}/)
  })

  it('grants are only ever this employee’s own', () => {
    expect(rail).toMatch(/arnie_computer_grants\?select=[^`]*&employee_id=eq\.\$\{me\}/)
  })

  it('the function is not public — a real signed-in session is required', () => {
    // Pinning it verify_jwt = false would hand the whole feature to anyone
    // holding the anon key.
    expect(config).not.toMatch(/\[functions\.arnie-computer\]/)
  })
})

describe('the leash is consulted, not re-implemented', () => {
  it('imports the one decision module', () => {
    expect(rail).toMatch(/import \{ decideAction, type Grant \} from '\.\.\/_shared\/computerGrants\.ts'/)
  })

  it('every queued action is decided by it', () => {
    expect(rail).toMatch(/const verdict = decideAction\(want, await myGrants\(\)\)/)
  })

  it('does not carry its own copy of the rules', () => {
    for (const leak of ['password', 'CREDENTIAL_HINTS', 'IRREVERSIBLE_HINTS', 'TIER_ALLOWS']) {
      expect(code).not.toContain(leak)
    }
  })

  it('reads grants fresh for every decision, so revoking takes effect at once', () => {
    // Caching grants on the session would make "I took that back" a lie until
    // the agent reconnected.
    expect(rail).toMatch(/const myGrants = async \(\)/)
    expect(rail).toMatch(/never\s*\n\s*\/\/ cached on the session|never cached on the session/)
  })
})

describe('a refusal is a record, not a dropped request', () => {
  it('refused and awaiting-human are written to the audit table', () => {
    expect(rail).toMatch(/decision: verdict\.ok \? 'queued' : \('refuse' in verdict \? 'refused' : 'awaiting_human'\)/)
    expect(rail).toMatch(/reason: verdict\.ok \? null :/)
  })

  it('the row is written before the agent can see it', () => {
    const queue = rail.slice(rail.indexOf("if (action === 'queue')"), rail.indexOf("if (action === 'stop')"))
    expect(queue.indexOf('decideAction')).toBeLessThan(queue.indexOf("rest('arnie_computer_actions'"))
    expect(queue).toMatch(/if \(!verdict\.ok\) \{[\s\S]*?return json\(\{\s*ok: false/)
  })

  it('the agent cannot promote its own action to allowed', () => {
    // report only ever writes one of two values, and only for a row the
    // server itself queued.
    expect(rail).toMatch(/decision: body\.ok === true \? 'allowed' : 'failed'/)
    expect(rail).toMatch(/arnie_computer_actions\?id=eq\.\$\{id\}&session_id=eq\.\$\{session\.id\}&decision=eq\.queued/)
  })

  it('what was typed is never stored — only how long it was', () => {
    expect(rail).toMatch(/value: undefined/)
    expect(rail).toMatch(/text_length: typeof body\.value === 'string' \? body\.value\.length : undefined/)
  })
})

describe('stop means stopped', () => {
  it('the session is marked stopped and the queue is emptied', () => {
    const stop = rail.slice(rail.indexOf("if (action === 'stop')"), rail.indexOf("if (action === 'grants')"))
    expect(stop).toMatch(/status: 'stopped'/)
    // Anything still waiting must not run when the agent next polls.
    expect(stop).toMatch(/decision=eq\.queued/)
    expect(stop).toMatch(/decision: 'refused', reason: 'You stopped Arnie on this computer\.'/)
  })

  it('a session that is not live hands out no work', () => {
    expect(rail).toMatch(/if \(session\.status !== 'live'\) return json\(\{ ok: true, stopped: true, action: null \}\)/)
  })

  it('a dead agent is told about, not queued into', () => {
    expect(rail).toMatch(/STALE_SECONDS/)
    expect(rail).toMatch(/Arnie is not on that computer right now/)
  })
})

describe('the agent connects outward', () => {
  it('it polls — nothing listens on the machine', () => {
    expect(rail).toMatch(/the agent connects OUTWARD and polls/i)
    expect(rail).toMatch(/action === 'next'/)
    expect(rail).toMatch(/poll_seconds/)
  })

  it('the plan says so too, because it is the answer to every IT question', () => {
    expect(plan).toMatch(/outbound|outward/i)
    expect(plan).toMatch(/no open port|nothing listening/i)
  })
})

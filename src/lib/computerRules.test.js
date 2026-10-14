import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decideWithRules, approvalExpiry, hasExpired, BACKGROUND_APPROVAL_SECONDS,
} from '../../supabase/functions/_shared/computerGrants.ts'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const migration = read('../../supabase/migrations/20261010213000_arnie_skills_rules_expiry.sql')
const rail = read('../../supabase/functions/arnie-computer/index.ts')
const strip = read('../pages/agents/arnie/ArnieComputerStrip.jsx')

const grant = (over = {}) => ({ app: 'chrome', host: '*', tier: 'full', duration: 'always', ...over })
const GRANTS = [grant({ host: 'traksmart.test' })]

describe('rules add friction and can never remove it', () => {
  it('the leash is still the floor — a credential is refused whatever the rules say', () => {
    const d = decideWithRules(
      { kind: 'type', app: 'chrome', host: 'traksmart.test', target: { type: 'password' } },
      GRANTS,
      [{ kind: 'allow_auto', app: 'chrome' }],
    )
    expect(d.ok).toBe(false)
    expect(d.refuse).toMatch(/credential/i)
  })

  it('an allow_auto cannot conjure a grant that does not exist', () => {
    const d = decideWithRules({ kind: 'click', app: 'excel' }, [], [{ kind: 'allow_auto', app: 'excel' }])
    expect(d.ok).toBe(false)
    // It becomes an offer for a PERSON to accept — never something a rule can
    // answer on their behalf.
    expect(d.needsGrant.app).toBe('excel')
    expect(d.needsGrant.why).toMatch(/I need excel.*have not given me/i)
  })

  it('an allow_auto cannot widen a tier', () => {
    // The property this guards is unchanged and is the important one: a rule
    // that says "do this without asking" must never turn a level somebody did
    // not grant into one they did. What changed is the SHAPE of the no — a
    // too-narrow tier is now a question put to a person rather than a dead
    // end, and decideWithRules hands a failed floor straight back, so no rule
    // can accept that question on their behalf.
    const d = decideWithRules(
      { kind: 'type', app: 'terminal', target: { label: 'prompt' } },
      [grant({ app: 'terminal', tier: 'click' })],
      [{ kind: 'allow_auto', app: 'terminal' }],
    )
    expect(d.ok).toBe(false)
    expect(d.needsGrant?.tier).toBe('full')
    // Still waiting on a human — an offer is not an approval.
    expect(d.needsGrant.why).toMatch(/does not stretch to type/i)
  })

  it('an allow_auto cannot hand Arnie a Submit button', () => {
    const d = decideWithRules(
      { kind: 'click', app: 'chrome', host: 'traksmart.test', target: { label: 'Submit application' } },
      GRANTS,
      [{ kind: 'allow_auto', app: 'chrome', host: 'traksmart.test' }],
    )
    expect(d.ok).toBe(false)
    expect(d.needsHuman).toBeTruthy()
  })
})

describe('ask first', () => {
  const action = { kind: 'type', app: 'chrome', host: 'traksmart.test', target: { label: 'Premise / Meter #' } }

  it('without a rule the grant is the consent and it goes through', () => {
    expect(decideWithRules(action, GRANTS, []).ok).toBe(true)
  })

  it('an ask_first stops an action the grant allows', () => {
    const d = decideWithRules(action, GRANTS, [{ kind: 'ask_first', app: 'chrome' }])
    expect(d.ok).toBe(false)
    expect(d.needsApproval).toBeTruthy()
    // and it is NOT the never-do-this verdict
    expect(d.needsHuman).toBeUndefined()
  })

  it('ask first wins when both match — so a personal rule can only tighten', () => {
    const rules = [
      { kind: 'allow_auto', employee_id: null, app: 'chrome' },   // the company's
      { kind: 'ask_first', employee_id: 7, app: 'chrome' },       // the person's own
    ]
    expect(decideWithRules(action, GRANTS, rules).ok).toBe(false)
    // and the other way round, which is the case that must NOT loosen
    const reversed = [
      { kind: 'ask_first', employee_id: null, app: 'chrome' },
      { kind: 'allow_auto', employee_id: 7, app: 'chrome' },
    ]
    expect(decideWithRules(action, GRANTS, reversed).ok).toBe(false)
  })

  it('a rule matches on any of app, host or action kind, and absent means any', () => {
    expect(decideWithRules(action, GRANTS, [{ kind: 'ask_first', action_kind: 'type' }]).ok).toBe(false)
    expect(decideWithRules(action, GRANTS, [{ kind: 'ask_first', action_kind: 'click' }]).ok).toBe(true)
    expect(decideWithRules(action, GRANTS, [{ kind: 'ask_first', host: 'traksmart.test' }]).ok).toBe(false)
    expect(decideWithRules(action, GRANTS, [{ kind: 'ask_first', host: 'elsewhere.test' }]).ok).toBe(true)
    expect(decideWithRules(action, GRANTS, [{ kind: 'ask_first' }]).ok).toBe(false)
  })

  it('the person’s own words come back to them when he asks', () => {
    const d = decideWithRules(action, GRANTS, [{ kind: 'ask_first', app: 'chrome', note: 'Never touch a live application twice' }])
    expect(d.needsApproval).toBe('Never touch a live application twice')
  })
})

describe('an approval nobody answers', () => {
  it('standing work expires, a person asking does not', () => {
    const now = new Date('2026-10-10T07:00:00Z')
    expect(approvalExpiry({ background: false, now })).toBeNull()
    expect(approvalExpiry({ background: true, now })).toBe('2026-10-10T07:10:00.000Z')
    expect(BACKGROUND_APPROVAL_SECONDS).toBe(600)
  })

  it('an unanswered background approval is dead, not merely late', () => {
    const row = { decision: 'needs_approval', expires_at: '2026-10-10T07:10:00.000Z' }
    expect(hasExpired(row, new Date('2026-10-10T07:09:59Z'))).toBe(false)
    expect(hasExpired(row, new Date('2026-10-10T18:00:00Z'))).toBe(true)
  })

  it('a finished action cannot expire out from under itself', () => {
    for (const decision of ['allowed', 'refused', 'failed', 'expired']) {
      expect(hasExpired({ decision, expires_at: '2020-01-01T00:00:00Z' })).toBe(false)
    }
  })

  it('the rail sweeps them on every poll, so nothing is missed without a cron', () => {
    expect(rail).toMatch(/await expireStale\(session\.id\)/)
    expect(rail).toMatch(/decision=eq\.needs_approval&expires_at=lt\./)
    expect(rail).toMatch(/decision: 'expired'/)
  })
})

describe('“approve” must never become a button that types a password', () => {
  it('the two waiting states are different values in the database', () => {
    expect(migration).toMatch(/'awaiting_human', 'needs_approval'/)
    expect(migration).toMatch(/Collapsing the first two into one value/)
  })

  it('approve answers an approval and nothing else, and says why', () => {
    const block = rail.slice(rail.indexOf("action === 'approve'"), rail.indexOf("if (action === 'stop')"))
    // Approving is only ever about needs_approval. Declining is the same act
    // whichever kind of question it was, so deny answers an offer too — but
    // an offer's YES has to WRITE a permission, which is accept_offer's job.
    expect(block).toMatch(/const answerable = action === 'deny'\s*\n\s*\? \['needs_approval', 'needs_grant'\]\s*\n\s*: \['needs_approval'\]/)
    expect(block).toMatch(/Arnie will not do it however it is approved/)
    expect(block).toMatch(/waiting on a permission, not an approval/)
  })

  it('approving puts it back in the queue and stops the clock', () => {
    const block = rail.slice(rail.indexOf("action === 'approve'"), rail.indexOf("if (action === 'stop')"))
    expect(block).toMatch(/decision: 'queued', expires_at: null/)
  })

  it('an approval can only be answered by the person it belongs to', () => {
    const block = rail.slice(rail.indexOf("action === 'approve'"), rail.indexOf("if (action === 'stop')"))
    expect(block).toMatch(/id=eq\.\$\{id\}&employee_id=eq\.\$\{me\}/)
  })
})

describe('“Always allow” cannot write a broad rule', () => {
  it('it grants exactly the app and host that was asked about', () => {
    expect(strip).toMatch(/addGrant\(\{ app: a\.app, host: a\.host \|\| '\*', tier:/)
  })

  it('and it says out loud what it covers', () => {
    expect(strip).toMatch(/only — nothing else/)
  })

  it('the tier is the one the action needed, not the widest', () => {
    // typing needs full; a click does not, and must not quietly get it
    expect(strip).toMatch(/a\.kind === 'type' \|\| a\.kind === 'key' \? 'full' : 'click'/)
  })
})

describe('skill is not routine', () => {
  it('a skill holds the steps and a routine points at one', () => {
    expect(migration).toMatch(/create table if not exists public\.arnie_skills/)
    expect(migration).toMatch(/add column if not exists skill_id bigint references public\.arnie_skills/)
  })

  it('the old column is deprecated in place, not dropped under a live deploy', () => {
    expect(migration).not.toMatch(/drop column .*steps/)
    expect(migration).toMatch(/comment on column public\.arnie_routines\.steps is\s*\n?\s*'DEPRECATED/)
  })

  it('a taught skill starts as a recording and only a person publishes it', () => {
    expect(migration).toMatch(/status\s+text not null default 'recording'/)
    expect(migration).toMatch(/'recording', 'draft', 'published', 'archived'/)
    expect(migration).toMatch(/shared\s+boolean not null default false/)
  })

  it('a skill has nowhere to put a credential', () => {
    const block = migration.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n')
      .match(/create table if not exists public\.arnie_skills \(([\s\S]*?)\n\);/)[1]
    expect(block).not.toMatch(/password|credential|secret|token/i)
  })

  it('two recordings at once would interleave, so only one is allowed', () => {
    expect(migration).toMatch(/arnie_skills_one_recording_idx[\s\S]*?where status = 'recording'/)
  })

  it('both new tables carry RLS and a tenant policy', () => {
    for (const t of ['arnie_skills', 'arnie_computer_rules']) {
      expect(migration).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
      expect(migration).toMatch(new RegExp(`create policy tenant_isolation on public\\.${t}`))
    }
  })
})

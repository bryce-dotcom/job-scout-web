import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  decideAction, grantFor, isCredentialTarget, isIrreversibleTarget, TIER_ALLOWS,
} from '../../supabase/functions/_shared/computerGrants.ts'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const migration = read('../../supabase/migrations/20261010205500_arnie_computer.sql')
const rule = read('../../supabase/functions/_shared/computerGrants.ts')

const grant = (over = {}) => ({ app: 'chrome', host: '*', tier: 'full', duration: 'always', ...over })

describe('a credential is refused before anything else is even considered', () => {
  // The feature needs no vault BECAUSE of this. Weaken it and "per user"
  // stops being free and starts being a promise we have to keep by hand.
  it('refuses a password field even with full access to the app', () => {
    const d = decideAction({ kind: 'type', app: 'chrome', host: 'srp.example', target: { type: 'password' } }, [grant({ host: 'srp.example' })])
    expect(d.ok).toBe(false)
    expect(d.refuse).toMatch(/credential field/i)
    // and it tells the person what to do instead, rather than just failing
    expect(d.refuse).toMatch(/sign in yourself/i)
  })

  it.each([
    ['a label', { label: 'Password' }],
    ['a placeholder', { placeholder: 'Enter your passcode' }],
    ['a 2FA box', { label: 'Verification code' }],
    ['an authenticator prompt', { aria_label: 'One-time code' }],
    ['a card CVV', { name: 'cvv' }],
    ['a card number', { label: 'Card number' }],
    ['a bank routing number', { label: 'Routing' }],
    ['an SSN', { label: 'SSN' }],
    ['an API key', { placeholder: 'API key' }],
  ])('refuses %s', (_what, target) => {
    expect(isCredentialTarget({ kind: 'type', target })).toBe(true)
    expect(decideAction({ kind: 'type', app: 'chrome', target }, [grant()]).ok).toBe(false)
  })

  it('does not cry credential over an ordinary field', () => {
    for (const target of [{ label: 'Premise / Meter #' }, { label: 'Business name' }, { name: 'quantity' }]) {
      expect(isCredentialTarget({ kind: 'type', target })).toBe(false)
    }
  })

  it('the rule holds for key presses too — a password can be typed with keys', () => {
    expect(decideAction({ kind: 'key', app: 'chrome', target: { label: 'Password' } }, [grant()]).ok).toBe(false)
  })
})

describe('no grant means no', () => {
  it('refuses when nothing was granted, and names what to grant', () => {
    const d = decideAction({ kind: 'click', app: 'excel' }, [])
    expect(d.ok).toBe(false)
    expect(d.refuse).toMatch(/excel/)
  })

  it('a grant for one app is not a grant for another', () => {
    expect(decideAction({ kind: 'click', app: 'outlook' }, [grant({ app: 'chrome' })]).ok).toBe(false)
  })

  it('a revoked, expired or spent grant is not a grant', () => {
    const now = new Date('2026-10-10T12:00:00Z')
    expect(grantFor([grant({ revoked_at: '2026-10-09T00:00:00Z' })], { kind: 'click', app: 'chrome' }, now)).toBeNull()
    expect(grantFor([grant({ expires_at: '2026-10-10T11:00:00Z' })], { kind: 'click', app: 'chrome' }, now)).toBeNull()
    expect(grantFor([grant({ duration: 'once', consumed_at: '2026-10-10T11:00:00Z' })], { kind: 'click', app: 'chrome' }, now)).toBeNull()
  })

  it('an unknown action kind is dead, not wide open', () => {
    // A kind added to the agent and forgotten here must fail closed.
    expect(decideAction({ kind: 'exfiltrate', app: 'chrome' }, [grant({ tier: 'full' })]).ok).toBe(false)
  })
})

describe('tiers mean what they say', () => {
  it('watch can look and nothing else', () => {
    expect(decideAction({ kind: 'screenshot', app: 'chrome' }, [grant({ tier: 'watch' })]).ok).toBe(true)
    expect(decideAction({ kind: 'click', app: 'chrome' }, [grant({ tier: 'watch' })]).ok).toBe(false)
    expect(decideAction({ kind: 'type', app: 'chrome', target: { label: 'Notes' } }, [grant({ tier: 'watch' })]).ok).toBe(false)
  })

  it('click can click but never type — this is what a terminal gets', () => {
    const g = [grant({ app: 'terminal', tier: 'click' })]
    expect(decideAction({ kind: 'click', app: 'terminal' }, g).ok).toBe(true)
    expect(decideAction({ kind: 'type', app: 'terminal', target: { label: 'prompt' } }, g).ok).toBe(false)
    // right-click holds Paste, so it is not in 'click' either
    expect(decideAction({ kind: 'right_click', app: 'terminal' }, g).ok).toBe(false)
    expect(TIER_ALLOWS.click).not.toContain('type')
    expect(TIER_ALLOWS.click).not.toContain('right_click')
  })

  it('the narrowest grant wins, so a stale broad one cannot re-widen a narrowing', () => {
    const picked = grantFor([grant({ tier: 'full' }), grant({ tier: 'watch' })], { kind: 'click', app: 'chrome' })
    expect(picked.tier).toBe('watch')
  })

  it('a host-specific grant beats the app-wide one', () => {
    const grants = [grant({ host: '*', tier: 'watch' }), grant({ host: 'traksmart.example', tier: 'full' })]
    expect(grantFor(grants, { kind: 'type', app: 'chrome', host: 'traksmart.example' }).tier).toBe('full')
    // and a different site on the same browser still only gets the wide one
    expect(grantFor(grants, { kind: 'type', app: 'chrome', host: 'mail.example' }).tier).toBe('watch')
  })
})

describe('an irreversible click belongs to the person', () => {
  it.each(['Submit', 'Send', 'Pay now', 'Delete', 'Place order', 'Sign', 'Transfer'])(
    'hands %s back even at full access', (label) => {
      const d = decideAction({ kind: 'click', app: 'chrome', target: { label } }, [grant()])
      expect(d.ok).toBe(false)
      expect(d.needsHuman).toBeTruthy()
      // it is not a failure — it says the work is done and ready to read
      expect(d.needsHuman).toMatch(/you click it|ready/i)
    })

  it('an ordinary control is not frozen just because the page mentions Submit', () => {
    const d = decideAction(
      { kind: 'click', app: 'chrome', target: { label: 'Add a line', text: 'Add a line' } },
      [grant()],
    )
    expect(d.ok).toBe(true)
  })

  it('filling the form is allowed — only the last click is held', () => {
    expect(decideAction({ kind: 'type', app: 'chrome', target: { label: 'Premise / Meter #' } }, [grant()]).ok).toBe(true)
  })

  it('looking at a Submit button is not clicking it', () => {
    expect(decideAction({ kind: 'screenshot', app: 'chrome', target: { label: 'Submit' } }, [grant()]).ok).toBe(true)
  })

  it('a credential beats an irreversible — the refusal is the credential one', () => {
    const d = decideAction({ kind: 'type', app: 'chrome', target: { label: 'Password', text: 'Sign in' } }, [grant()])
    expect(d.refuse).toMatch(/credential/i)
  })
})

describe('the shape is per-user by construction, not by policy', () => {
  it('a grant has no company-wide form: employee_id is NOT NULL', () => {
    expect(migration).toMatch(/create table if not exists public\.arnie_computer_grants[\s\S]*?employee_id\s+integer not null references public\.employees/)
  })

  it('nothing in these tables stores a secret', () => {
    // COLUMNS only. The prose around them talks about credentials constantly —
    // that is the point of the prose — so a naive slice of the file would
    // flag the explanation for saying what the schema must never do.
    const columns = migration
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .match(/create table if not exists public\.arnie_computer_\w+ \(([\s\S]*?)\n\);/g)
    expect(columns).toHaveLength(3)
    for (const block of columns) {
      expect(block).not.toMatch(/password|credential|secret|token|encrypted/i)
    }
  })

  it('the leash is one module, and the agent is told to enforce it locally too', () => {
    expect(rule).toMatch(/enforces this LOCALLY/)
    // the server copy must not be described as the only check
    expect(rule).toMatch(/compromised server/)
  })

  it('every action is a row before it runs, refusals included', () => {
    expect(migration).toMatch(/decision\s+text not null default 'queued'/)
    for (const d of ['queued', 'allowed', 'refused', 'awaiting_human', 'failed']) {
      expect(migration).toContain(`'${d}'`)
    }
  })

  it('all three tables carry RLS and a tenant policy', () => {
    for (const t of ['arnie_computer_sessions', 'arnie_computer_grants', 'arnie_computer_actions']) {
      expect(migration).toMatch(new RegExp(`alter table public\\.${t}\\s+enable row level security`))
      expect(migration).toMatch(new RegExp(`create policy tenant_isolation on public\\.${t}`))
    }
  })

  it('a session can be stopped dead — the kill switch is a state, not a request', () => {
    expect(migration).toMatch(/status\s+text not null default 'live' check \(status in \('live', 'ended', 'stopped'\)\)/)
    expect(migration).toMatch(/kill switch/)
  })
})

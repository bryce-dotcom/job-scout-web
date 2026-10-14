// "Instead of saying I cant do it bring up a permission box."
//
// Bryce asked Jenny to read his Gmail. He had allowed Chrome on
// mail.google.com at "watch"; she needed to click; and all she could say was
// "I only have watch access to Chrome". True, useless, and with no way out of
// it from where he was standing — the only route was to work out which of two
// Chrome permissions governed that site, revoke it, and allow it again wider,
// in that order.
//
// A level too narrow is now a QUESTION, like having no permission at all.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const load = (src) => {
  const m = { exports: {} }
  new Function('module', 'exports', 'require', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, () => ({}))
  return m.exports
}
const G = load(read('../../supabase/functions/_shared/computerGrants.ts'))
const fn = read('../../supabase/functions/arnie-computer/index.ts')

const grant = (over = {}) => ({
  app: 'chrome', host: '*', tier: 'watch', duration: 'always',
  granted_at: '2026-10-01T00:00:00Z', expires_at: null, revoked_at: null, consumed_at: null,
  ...over,
})
const act = (over = {}) => ({ id: 1, kind: 'click', app: 'chrome', host: 'mail.google.com', target: { why: 'open the tab' }, ...over })

describe('a level too narrow asks instead of refusing', () => {
  it('his exact case: watch on that site, needs to click', () => {
    const d = G.decideAction(act(), [grant({ host: 'mail.google.com' })])
    expect(d.ok).toBe(false)
    expect(d.needsGrant).toBeTruthy()
    expect(d.needsGrant.app).toBe('chrome')
    expect(d.needsGrant.host).toBe('mail.google.com')
    // It asks for the NARROWEST level that can do the job, not for everything.
    expect(d.needsGrant.tier).toBe('click')
  })

  it('it says what is in the way, in the words of the thing itself', () => {
    const d = G.decideAction(act(), [grant({ host: 'mail.google.com' })])
    expect(d.needsGrant.why).toMatch(/watch on chrome/)
    expect(d.needsGrant.why).toMatch(/does not stretch to click/)
  })

  it('it asks for no more than the job needs', () => {
    // Typing needs full; clicking must not quietly ask for it too.
    const typing = G.decideAction(act({ kind: 'type', target: { why: 'x' } }), [grant({ host: 'mail.google.com' })])
    expect(typing.needsGrant.tier).toBe('full')
  })
})

describe('what it must not loosen', () => {
  it('a credential field is still refused outright, never offered', () => {
    const d = G.decideAction(
      { id: 2, kind: 'type', app: 'chrome', host: 'mail.google.com', target: { name: 'Password' } },
      [grant({ host: 'mail.google.com', tier: 'full' })],
    )
    expect(d.ok).toBe(false)
    expect(d.needsGrant).toBeUndefined()
    expect(d.refuse).toMatch(/credential field/)
  })

  it('an irreversible control still goes to a person, even at full', () => {
    const d = G.decideAction(
      { id: 3, kind: 'click', app: 'chrome', host: '*', target: { name: 'Send' } },
      [grant({ tier: 'full' })],
    )
    expect(d.ok).toBe(false)
    expect(d.needsHuman).toBeTruthy()
  })

  it('an allowed action is still simply allowed', () => {
    expect(G.decideAction(act(), [grant({ host: 'mail.google.com', tier: 'full' })]).ok).toBe(true)
  })
})

describe('saying yes has to actually change something', () => {
  it('accepting replaces the narrower permission rather than adding beside it', () => {
    // THE trap. The narrowest grant in force wins, so allowing "click" while
    // the old "watch" stayed would leave watch in charge and refuse the very
    // action just approved — an Allow button that visibly does nothing.
    expect(fn).toMatch(/Retire anything NARROWER on the same program and site first/)
    expect(fn).toMatch(/if \(TIER_RANK\[old\.tier\] >= TIER_RANK\[tier as Grant\['tier'\]\]\) continue/)
  })

  it('and changing a level from the list is a replace, not an add', () => {
    expect(fn).toMatch(/action === 'set_tier'/)
    expect(fn).toMatch(/host=eq\.\$\{encodeURIComponent\(host\)\}&revoked_at=is\.null/)
  })

  it('the narrowest still wins, because that rule is the safety', () => {
    // Changing how an offer is accepted must not change what governs.
    const d = G.decideAction(act({ host: '*' }), [grant({ tier: 'full' }), grant({ tier: 'watch' })])
    expect(d.ok).toBe(false)
  })
})

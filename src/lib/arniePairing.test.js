import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')

const stripProse = (src) => src
  .split('\n')
  .filter((l) => {
    const t = l.trim()
    return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*') && !t.startsWith('--')
  })
  .join('\n')

const pairFn = read('../../supabase/functions/arnie-pair/index.ts')
const railFn = read('../../supabase/functions/arnie-computer/index.ts')
const agentSrc = read('../../scripts/jobscout-agent.mjs')
const migration = read('../../supabase/migrations/20261012051000_arnie_pairing.sql')
const config = read('../../supabase/config.toml')
const connectPage = read('../pages/ConnectComputer.jsx')

// Every one of these files EXPLAINS the claim split at length in prose, so an
// assertion that reads the comments fails on its own documentation. Strip
// first — the trap the migration, rail and selector tests each fell into.
const pair = stripProse(pairFn)
const rail = stripProse(railFn)
const agent = stripProse(agentSrc)
const sql = stripProse(migration)

// Pairing is the one route into this feature that runs with NO caller
// identity, because the thing being paired has no account yet. That makes it
// the softest surface Arnie has. Each assertion below is a property that, if
// it quietly stopped holding, would let somebody attach their own agent to
// another person's account — or leave a live credential sitting in a table.

describe('the public pairing routes are safe without a caller', () => {
  it('only start, poll and describe are public', () => {
    const actions = [...pair.matchAll(/action === '([a-z_]+)'/g)].map((m) => m[1]).sort()
    expect(actions).toEqual(['describe', 'poll', 'start'])
  })

  it('claiming is NOT reachable here — a public function cannot prove who you are', () => {
    // resolveCaller only DECODES a JWT; the gateway's verify_jwt is what
    // verifies it. On a public function, "who are you" is whatever the caller
    // claims, so the one route that attaches a token must not live here.
    expect(pair).not.toMatch(/resolveCaller/)
    expect(pair).not.toMatch(/action === 'claim'/)
    expect(pair).not.toMatch(/action === 'pair_claim'/)
  })

  it('the claim runs on the authenticated rail instead', () => {
    expect(rail).toMatch(/action === 'pair_claim'/)
    expect(rail).toMatch(/const caller = await resolveCaller\(/)
    expect(connectPage).toMatch(/invoke\('arnie-computer',[\s\S]*?pair_claim/)
    // And the page must not reach for the public function to claim.
    expect(connectPage).not.toMatch(/invoke\('arnie-pair',[\s\S]{0,200}action: 'claim'/)
  })

  it('a claim cannot be applied twice', () => {
    // The PATCH is filtered on claimed_at being null, so the second press
    // updates no row at all rather than overwriting whose token is waiting.
    expect(rail).toMatch(/arnie_pairings\?code=eq\.\$\{[^}]+\}&claimed_at=is\.null/)
    expect(rail).toMatch(/already connected/)
  })
})

describe('knowing the code is not enough', () => {
  it('poll demands the second secret, which never travels in the URL', () => {
    expect(pair).toMatch(/poll_secret/)
    expect(pair).toMatch(/if \(row\.poll_secret !== secret\) return json\(\{ ok: true, status: 'expired' \}\)/)
  })

  it('a wrong secret and a dead code give the same answer', () => {
    // Anything that distinguishes them turns this into a code oracle: call
    // poll with a guess and learn whether a code is real. Both the
    // missing/expired branch and the wrong-secret branch say 'expired', and
    // the test counts them inside poll so the other routes cannot pad it.
    const poll = pair.slice(pair.indexOf("action === 'poll'"), pair.indexOf("action === 'describe'"))
    expect(poll).toMatch(/new Date\(row\.expires_at\) <= new Date\(\)\) return json\(\{ ok: true, status: 'expired' \}\)/)
    expect(poll).toMatch(/row\.poll_secret !== secret\) return json\(\{ ok: true, status: 'expired' \}\)/)
  })

  it('describe names the computer and nothing else', () => {
    const describe_ = pair.slice(pair.indexOf("action === 'describe'"))
    const select = describe_.match(/arnie_pairings\?select=([a-z_,]+)/)
    expect(select, 'describe should select an explicit column list').toBeTruthy()
    expect(select[1]).not.toMatch(/poll_secret|refresh_token/)
    // And it must not hand back the whole row either.
    expect(describe_).not.toMatch(/\.\.\.row/)
  })
})

describe('a token in flight does not linger', () => {
  it('is deleted in the same request that hands it over', () => {
    const poll = pair.slice(pair.indexOf("action === 'poll'"))
    const del = poll.indexOf('method: \'DELETE\'')
    const give = poll.indexOf("status: 'connected'")
    expect(del).toBeGreaterThan(-1)
    expect(give).toBeGreaterThan(-1)
    expect(del, 'the delete must happen BEFORE the token is returned').toBeLessThan(give)
  })

  it('lives two minutes at most, and uncollected rows are swept', () => {
    expect(sql).toMatch(/expires_at\s+timestamptz not null default \(now\(\) \+ interval '2 minutes'\)/)
    expect(sql).toMatch(/create or replace function public\.arnie_sweep_pairings/)
    expect(pair).toMatch(/rpc\/arnie_sweep_pairings/)
  })

  it('cannot be read through the API by anybody signed in', () => {
    expect(sql).toMatch(/alter table public\.arnie_pairings enable row level security/)
    // service_role only. A policy granting `authenticated` anything would put
    // a live refresh token one API call away from every user in the tenant.
    expect(sql).toMatch(/for all to service_role/)
    expect(sql).not.toMatch(/to authenticated/)
  })
})

describe('the gateway settings this depends on are pinned', () => {
  it('arnie-pair is pinned public, because a deploy resets verify_jwt to true', () => {
    expect(config).toMatch(/\[functions\.arnie-pair\]\nverify_jwt = false/)
  })

  it('and arnie-computer is still left alone, so it stays authenticated', () => {
    expect(config).not.toMatch(/\[functions\.arnie-computer\]/)
  })
})

describe('nobody is asked to copy anything', () => {
  it('the agent connects itself when it has no token', () => {
    expect(agent).toMatch(/if \(!TOKEN\) TOKEN = readSavedToken\(\)/)
    expect(agent).toMatch(/if \(!TOKEN\) TOKEN = await pair\(\)/)
    expect(agent).toMatch(/openBrowser\(url\)/)
  })

  it('and saves the token as a key, not a config value', () => {
    expect(agent).toMatch(/writeFileSync\(TOKEN_FILE, t, \{ mode: 0o600 \}\)/)
  })

  it('a refused token reconnects once, instead of sending anyone to a settings page', () => {
    expect(agent).toMatch(/if \(repaired\) die\(/)
    expect(agent).toMatch(/TOKEN = await pair\(\)[\s\S]{0,80}return freshAccess\(\)/)
  })
})

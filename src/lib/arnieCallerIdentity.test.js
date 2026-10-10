import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAccessLevel, ACCESS_LEVELS } from './accessControl'

// The access ladder is written twice on purpose: once in JS for the browser
// (accessControl.js) and once in TS for the edge runtime (_shared/auth.ts),
// because a Deno function cannot import from the Vite bundle. Two copies of
// one rule is this codebase's oldest bug shape, so the copies are pinned here.
//
// The edge copy decides which tenant's data Arnie may read, so drift is not a
// style problem — it is a data-isolation problem.

const here = dirname(fileURLToPath(import.meta.url))
const shared = (p) => readFileSync(resolve(here, '../../supabase/functions', p), 'utf8')
const authTs = shared('_shared/auth.ts')
const chatTs = shared('arnie-chat/index.ts')

/** Pull `const ROLE_LEVEL: Record<string, number> = { ... }` out of the TS source. */
function edgeRoleLevels() {
  const body = authTs.match(/const ROLE_LEVEL[^=]*=\s*\{([\s\S]*?)\}/)?.[1]
  if (!body) throw new Error('ROLE_LEVEL table not found in _shared/auth.ts')
  const out = {}
  for (const [, name, lvl] of body.matchAll(/'([^']+)'\s*:\s*(\d+)/g)) out[name] = Number(lvl)
  return out
}

describe('the edge runtime grades roles the same way the browser does', () => {
  const edge = edgeRoleLevels()

  it('knows every role the browser knows', () => {
    // A role missing from the edge table silently grades as User (0). That
    // reads as "Arnie forgot I am the owner", not as a permissions bug.
    const browserRoles = ['User', 'Team Lead', 'Manager', 'Admin', 'Super Admin', 'Developer', 'Owner']
    expect(Object.keys(edge).sort()).toEqual(browserRoles.sort())
  })

  it.each([
    ['User', ACCESS_LEVELS.USER],
    ['Team Lead', ACCESS_LEVELS.TEAM_LEAD],
    ['Manager', ACCESS_LEVELS.MANAGER],
    ['Admin', ACCESS_LEVELS.ADMIN],
    ['Super Admin', ACCESS_LEVELS.SUPER_ADMIN],
    ['Developer', ACCESS_LEVELS.DEVELOPER],
    ['Owner', ACCESS_LEVELS.SUPER_ADMIN],
  ])('grades %s identically on both sides', (userRole, expected) => {
    expect(getAccessLevel({ user_role: userRole })).toBe(expected)
    expect(edge[userRole]).toBe(expected)
  })

  it('still lets is_developer trump the role string on both sides', () => {
    expect(getAccessLevel({ user_role: 'User', is_developer: true })).toBe(ACCESS_LEVELS.DEVELOPER)
    expect(authTs).toMatch(/is_developer === true\) return 5/)
  })

  it('only honours a job-title role when it is admin-or-above', () => {
    // `role` is a job title ("Field Tech"), not an access level. Reading it as
    // one would promote every tech whose title happens to match.
    expect(getAccessLevel({ role: 'Manager' })).toBe(ACCESS_LEVELS.USER)
    expect(getAccessLevel({ role: 'Admin' })).toBe(ACCESS_LEVELS.ADMIN)
    expect(authTs).toMatch(/ROLE_LEVEL\[r\] >= 3/)
  })
})

describe('arnie-chat takes identity from the token, not from the caller', () => {
  it('does not destructure companyId or role out of the request body', () => {
    // This is the regression that matters: the body is attacker-controlled and
    // execTool runs on the service-role key, so a body-supplied company_id is
    // a cross-tenant read of invoices, leads and payroll.
    const destructure = chatTs.match(/const \{[^}]*\} = await req\.json\(\)/)?.[0] || ''
    expect(destructure).not.toMatch(/\bcompanyId\b/)
    expect(destructure).not.toMatch(/\brole\b/)
  })

  it('resolves the caller and refuses when there is no user token at all', () => {
    expect(chatTs).toMatch(/caller = await resolveCaller\(req,/)
  })

  // Since 2026-10-10 Arnie also runs headless — a text, an email, a routine —
  // where there IS no JWT and the server says who it is running as. That is a
  // hole unless the guard is exact, so pin the guard itself.
  it('only lets the SERVICE KEY name an employee, and only an active one', () => {
    // The guard is written ONCE, in _shared/auth.ts, because three entry
    // points need it (chat, config, and anything else headless) and a
    // security check copied is a security check that drifts.
    const auth = readFileSync(resolve(here, '../../supabase/functions/_shared/auth.ts'), 'utf8')
    // Two credentials can be "us" — the key Supabase injects into a function
    // and the one scripts and crons hold are different strings — and the
    // explicit secret rides in its OWN header, because a gateway checks the
    // bearer is a real JWT before our code is ever reached.
    expect(auth).toMatch(/const isUs = \(!!serviceKey && token === serviceKey\) \|\| \(!!internal && presented === internal\)/)
    expect(auth).toMatch(/req\.headers\.get\('x-arnie-internal'\)/)
    expect(auth).toMatch(/if \(!token \|\| !isUs\) return null/)
    // The employee must be active — a leaver's bot stops being a bot.
    expect(auth).toMatch(/active=eq\.true&id=eq\.\$\{id\}/)
    expect(auth).toMatch(/if \(!emp \|\| emp\.company_id == null\) return null/)
    // It narrows the service key rather than granting anything: the level is
    // the employee's own, through the one shared mapping.
    expect(auth).toMatch(/return callerFor\(emp\)/)
    // And it is reached only where resolveCaller found nobody — it can never
    // widen a real session, only fill the gap where there was none.
    expect(chatTs).toMatch(/if \(!caller\) caller = await internalCaller\(req, body, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY\)/)
    const configTs = readFileSync(resolve(here, '../../supabase/functions/arnie-config/index.ts'), 'utf8')
    expect(configTs).toMatch(/if \(!caller\) caller = await internalCaller\(req, body, SUPABASE_URL, SERVICE_KEY\)/)
    expect(chatTs).toMatch(/if \(!caller\) return jsonError\([^)]*401\)/)
    expect(chatTs).toMatch(/const companyId = caller\.companyId/)
    expect(chatTs).toMatch(/const role = caller\.role/)
  })

  it('gates the service-role tools on a resolved tenant, not on merely being signed in', () => {
    // Both the streaming and non-streaming paths carry their own copy of this
    // gate. If either stops keying on companyId, an unscoped caller reaches
    // execTool and its service-role key.
    expect(chatTs.match(/const includeTools = !!companyId/g) || []).toHaveLength(2)
  })
})

describe('a signed-in user with no employee row degrades instead of being locked out', () => {
  it('resolves to a caller with a null company rather than to null', () => {
    // A fresh invite, a deactivated account or a support login is not an
    // attacker. Refusing them outright would be a worse bug than the one
    // being fixed — they lose tools, not Arnie.
    expect(authTs).toMatch(/companyId: number \| null/)
    expect(authTs).toMatch(/return \{ email, companyId: null, employeeId: null, role: 'user', level: 0 \}/)
  })
})

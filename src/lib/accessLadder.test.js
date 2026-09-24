import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getAccessLevel, ACCESS_LEVELS } from './accessControl'

// The access ladder is now written THREE times:
//
//   1. src/lib/accessControl.js          — the browser
//   2. supabase/functions/_shared/auth.ts — the edge runtime (Deno cannot
//                                            import from the Vite bundle)
//   3. current_user_access_level()        — Postgres, so RLS and triggers
//                                            can enforce it at the source
//
// Nobody wanted three. Each exists because the one before it cannot run
// where the next one has to. But "one rule written down twice" is this
// codebase's oldest bug shape — invoice lines five times, job ownership four
// — and this particular rule decides who may change their own pay rate.
//
// So the three copies are pinned to each other here. If they drift, the
// symptom is not a wrong screen: it is somebody the database thinks is an
// Admin and the app thinks is a tech, or the reverse.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf8')
const authTs = read('supabase/functions/_shared/auth.ts')
// Two files: the original defines current_user_access_level(), the follow-up
// replaces the trigger function. Assertions run against both so they track the
// definition that is actually live rather than the one first written.
const sql = [
  read('supabase/migrations/20260826120000_block_privilege_escalation.sql'),
  read('supabase/migrations/20260826130000_escalation_message_fix.sql'),
].join('\n')

/** The CASE arms of current_user_access_level(), as {role: level}. */
function sqlLadder() {
  const body = sql.match(/create or replace function public\.current_user_access_level[\s\S]*?\$\$([\s\S]*?)\$\$/)?.[1]
  if (!body) throw new Error('current_user_access_level() not found in the migration')
  const out = {}
  for (const [, roles, lvl] of body.matchAll(/when e\.user_role (?:=|in) \(?([^)]*?)\)? then (\d)/g)) {
    for (const [, name] of roles.matchAll(/'([^']+)'/g)) out[name] = Number(lvl)
  }
  return { ladder: out, body }
}

/** The ROLE_LEVEL table in _shared/auth.ts. */
function tsLadder() {
  const body = authTs.match(/const ROLE_LEVEL[^=]*=\s*\{([\s\S]*?)\}/)?.[1]
  if (!body) throw new Error('ROLE_LEVEL not found in _shared/auth.ts')
  const out = {}
  for (const [, name, lvl] of body.matchAll(/'([^']+)'\s*:\s*(\d+)/g)) out[name] = Number(lvl)
  return out
}

describe('all three copies of the access ladder agree', () => {
  const { ladder: pg, body: pgBody } = sqlLadder()
  const ts = tsLadder()

  it.each([
    ['User', ACCESS_LEVELS.USER],
    ['Team Lead', ACCESS_LEVELS.TEAM_LEAD],
    ['Manager', ACCESS_LEVELS.MANAGER],
    ['Admin', ACCESS_LEVELS.ADMIN],
    ['Super Admin', ACCESS_LEVELS.SUPER_ADMIN],
    ['Developer', ACCESS_LEVELS.DEVELOPER],
    ['Owner', ACCESS_LEVELS.SUPER_ADMIN],
  ])('grades %s the same in the browser, the edge runtime and Postgres', (role, expected) => {
    expect(getAccessLevel({ user_role: role }), 'browser').toBe(expected)
    expect(ts[role], 'edge runtime').toBe(expected)
    expect(pg[role], 'postgres').toBe(expected)
  })

  it('covers exactly the same set of roles in all three', () => {
    const browser = ['User', 'Team Lead', 'Manager', 'Admin', 'Super Admin', 'Developer', 'Owner']
    expect(Object.keys(ts).sort()).toEqual(browser.slice().sort())
    expect(Object.keys(pg).sort()).toEqual(browser.slice().sort())
  })

  it('honours the is_developer and is_admin booleans everywhere', () => {
    // Both are legacy flags some tenants still set on their own, and both
    // outrank the role string.
    expect(getAccessLevel({ user_role: 'User', is_developer: true })).toBe(ACCESS_LEVELS.DEVELOPER)
    expect(authTs).toMatch(/is_developer === true\) return 5/)
    expect(pgBody).toMatch(/when e\.is_developer then 5/)
    expect(pgBody).toMatch(/when e\.is_admin then 3/)
  })

  it('only counts an active employee', () => {
    // An offboarded person keeping their level would be the whole point of
    // deactivating them, undone.
    expect(pgBody).toMatch(/e\.active = true/)
    expect(authTs).toMatch(/active=eq\.true/)
  })
})

describe('the escalation trigger guards what actually confers privilege', () => {
  it('covers every column that grants access', () => {
    for (const col of ['user_role', 'is_admin', 'is_developer', 'has_hr_access', 'active']) {
      expect(sql, `${col} must be guarded`).toMatch(new RegExp(`new\\.${col}\\s+is distinct from old\\.${col}`))
    }
  })

  it('covers every column that decides what someone is paid', () => {
    for (const col of [
      'hourly_rate', 'salary', 'annual_salary', 'pay_type',
      'commission_goods_rate', 'commission_services_rate', 'commission_leads_rate',
      'commission_setter_rate', 'commission_processor_rate',
    ]) {
      expect(sql, `${col} must be guarded`).toMatch(new RegExp(`new\\.${col}\\s+is distinct from old\\.${col}`))
    }
  })

  it('lets admins through and lets service-role callers through', () => {
    // Edge functions authorise their own callers via resolveCaller(); they
    // carry no JWT email and must not be caught by this.
    expect(sql).toMatch(/current_user_access_level\(\) >= 3/)
    expect(sql).toMatch(/if jwt_email is null then\s*\n\s*return new;/)
  })

  it('refuses rather than silently ignoring the change', () => {
    // A trigger that dropped the change instead of raising would leave the
    // UI showing success while nothing happened — the silent-failure mode
    // this codebase already knows too well.
    expect(sql).toMatch(/raise exception/)
    expect(sql).toMatch(/errcode = '42501'/)
  })

  it('is reversible, and says so', () => {
    expect(sql).toMatch(/drop trigger if exists employees_no_privilege_escalation/i)
  })
})

describe('Developer is a platform role, not a tenant role', () => {
  // 20260924180000: an employee of company 9 carried user_role = 'Developer'
  // and could open the platform's Data Console. The guard now refuses
  // Developer (either column) outside the platform company, requires a
  // platform developer to grant or revoke it, and fires on INSERT too so it
  // cannot be bypassed by creating the employee already promoted.
  const dev = read('supabase/migrations/20260924180000_developer_role_platform_only.sql')

  it('ties the role to companies.is_platform, not a hard-coded id', () => {
    expect(dev).toMatch(/add column if not exists is_platform boolean/)
    expect(dev).toMatch(/if wants_developer and not public\.is_platform_company\(new\.company_id\)/)
  })

  it('checks the platform company BEFORE the service-role exemption', () => {
    const platformCheck = dev.indexOf('not public.is_platform_company(new.company_id)')
    const serviceExempt = dev.indexOf('if jwt_email is null then')
    expect(platformCheck).toBeGreaterThan(0)
    expect(platformCheck).toBeLessThan(serviceExempt)
  })

  it('only a platform developer may grant or revoke it', () => {
    expect(dev).toMatch(/\(wants_developer <> had_developer\) and not public\.is_platform_developer\(\)/)
  })

  it('covers INSERT as well as UPDATE', () => {
    expect(dev).toMatch(/create trigger employees_no_privilege_escalation_insert\s*\n\s*before insert on public\.employees/)
    expect(dev).toMatch(/if tg_op = 'INSERT' then\s*\n\s*return new;/)
  })

  it('keeps every column the original guard covered', () => {
    for (const col of ['user_role', 'is_admin', 'is_developer', 'has_hr_access', 'active', 'hourly_rate', 'salary', 'commission_setter_rate']) {
      expect(dev, `${col} must still be guarded`).toMatch(new RegExp(`new\\.${col}\\s+is distinct from old\\.${col}`))
    }
    expect(dev).toMatch(/current_user_access_level\(\) >= 3/)
    expect(dev).toMatch(/errcode = '42501'/)
  })

  it('downgrades a stray tenant Developer to Super Admin rather than deleting access', () => {
    expect(dev).toMatch(/set user_role = 'Super Admin',\s*\n\s*is_developer = false/)
    expect(dev).toMatch(/and not public\.is_platform_company\(e\.company_id\)/)
  })
})

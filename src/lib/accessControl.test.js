import { describe, it, expect } from 'vitest'
import { getAllowedNavSections, canViewHR, isAdmin } from './accessControl'

// The menu reorganisation moved Jobs into the WORK group and split purchasing
// out into SUPPLY. The dangerous part is not the labels — it is that a field
// tech's entire sidebar is selected by SECTION KEY. Get that wrong and every
// tech opens the app to an empty menu.
//
// The WORK group deliberately kept the key 'OPERATIONS'. It is stored data:
// ai_modules rows carry default_menu_section / user_menu_section, and Victor is
// parented under 'Field Scout' inside OPERATIONS for company 3. Renaming the key
// would strand live agents across every tenant.

const tech = { role: 'Field Tech', user_role: 'User' }
const owner = { role: 'Owner', user_role: 'Owner' }
const admin = { role: 'Admin', user_role: 'Admin' }

describe('a field tech still has a menu', () => {
  const sections = getAllowedNavSections(tech)

  it('keeps the WORK group, which is still keyed OPERATIONS', () => {
    // Renaming this key empties every field tech's sidebar.
    expect(sections).toContain('OPERATIONS')
  })

  it('does not get SUPPLY — purchasing was never theirs', () => {
    // They only ever saw Field Scout and Job Board inside Operations, so
    // withholding the catalogue and purchasing takes nothing away.
    expect(sections).not.toContain('SUPPLY')
  })

  it('still has TEAM for My Pay', () => {
    expect(sections).toContain('TEAM')
  })

  it('is not shown the sales flow', () => {
    expect(sections).not.toContain('SALES_FLOW')
    expect(sections).not.toContain('CUSTOMERS')
  })
})

describe('office roles see the full shape', () => {
  it('an owner gets both WORK and SUPPLY', () => {
    const s = getAllowedNavSections(owner)
    expect(s).toContain('OPERATIONS')
    expect(s).toContain('SUPPLY')
    expect(s).toContain('SALES_FLOW')
  })

  it('an admin gets SUPPLY too — they order the parts', () => {
    expect(getAllowedNavSections(admin)).toContain('SUPPLY')
  })

  it('every role keeps a work section, whatever else is filtered', () => {
    for (const u of [tech, admin, owner]) {
      expect(getAllowedNavSections(u)).toContain('OPERATIONS')
    }
  })
})

// ── Who may open payroll ───────────────────────────────────────────────────
//
// Reported 2026-09-30: "regular employees can see the payroll information...
// only an HR person should be seeing that, specifically London Miller."
// London is user_role 'Manager' (level 2), job title Project Manager,
// has_hr_access false — and the Payroll Inbox showed SSN last-4,
// direct-deposit last-4 and every employee's gross pay with no check at all,
// while Layout left its nav link in place for every non-field-tech.
//
// Both payroll surfaces gate on canViewHR(user) && isAdmin(user). These pin
// that pair, because the nav is decoration and the page guard is the rule.

describe('payroll is HR-only, whatever the job title says', () => {
  const london = { role: 'Project Manager', user_role: 'Manager', has_hr_access: false }
  const mayOpenPayroll = (u) => canViewHR(u) && isAdmin(u)

  it('keeps a Manager out, HR flag or not', () => {
    expect(mayOpenPayroll(london)).toBe(false)
    // Even if someone grants HR to a Manager, payroll still needs Admin.
    expect(mayOpenPayroll({ ...london, has_hr_access: true })).toBe(false)
  })

  it('keeps a plain user and a field tech out', () => {
    expect(mayOpenPayroll({ role: 'Field Tech', user_role: 'User' })).toBe(false)
    expect(mayOpenPayroll({ user_role: 'User', has_hr_access: true })).toBe(false)
    expect(mayOpenPayroll({ user_role: 'Team Lead', has_hr_access: true })).toBe(false)
  })

  it('keeps an Admin out until HR is granted — an office admin is not HR', () => {
    expect(mayOpenPayroll({ user_role: 'Admin', has_hr_access: false })).toBe(false)
    expect(mayOpenPayroll({ user_role: 'Admin', has_hr_access: true })).toBe(true)
  })

  it('lets the bookkeeper and the owner in', () => {
    expect(mayOpenPayroll({ user_role: 'Super Admin', has_hr_access: true })).toBe(true)
    expect(mayOpenPayroll({ is_developer: true })).toBe(true)
  })

  it('treats a missing user as not allowed', () => {
    expect(mayOpenPayroll(null)).toBe(false)
    expect(mayOpenPayroll({})).toBe(false)
  })
})

// ── Signing out must not sign you out everywhere ──────────────────────────
//
// supabase-js signOut() defaults to scope 'global', which revokes EVERY
// session the user has. Logging out on a phone then killed the desktop:
// PostgREST kept working (it accepts an unexpired JWT on its signature) while
// every edge function answered 401 session_not_found. That is what Alayda hit
// as "Invalid auth token" sending an onboarding link (ticket 1d846306), and
// what broke a peer session's demo script. Every signOut in the app passes
// scope 'local'; this fails the build if one goes back to the default.
import { readFileSync } from 'node:fs'

describe('every signOut is scoped to this browser', () => {
  const files = ['src/lib/store.js', 'src/pages/Login.jsx']
  for (const f of files) {
    it(`${f} never calls a bare signOut()`, () => {
      const src = readFileSync(f, 'utf8')
      const calls = src.match(/signOut\([^)]*\)/g) || []
      expect(calls.length).toBeGreaterThan(0)
      for (const c of calls) expect(c).toMatch(/scope:\s*'local'/)
    })
  }
})

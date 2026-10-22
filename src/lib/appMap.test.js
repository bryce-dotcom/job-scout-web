import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MENU_PAGES, visiblePages, pageVisible, whoFromEmployee, appMapBlock,
} from '../../supabase/functions/_shared/appMap.ts'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const layout = read('../components/Layout.jsx')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const setup = read('../pages/PayrollSetup.jsx')

const routes = (who) => visiblePages(who).map((p) => p.route)
const fieldTech = whoFromEmployee({ role: 'Field Tech', user_role: 'User' })
const rep = whoFromEmployee({ role: 'Sales', user_role: 'User' })
const manager = whoFromEmployee({ role: 'Project Manager', user_role: 'Manager' })
const officeAdmin = whoFromEmployee({ role: 'Office', user_role: 'Admin', has_hr_access: false })
const hrAdmin = whoFromEmployee({ role: 'Office', user_role: 'Admin', has_hr_access: true })
const dev = whoFromEmployee({ role: 'Owner', user_role: 'Super Admin', is_developer: true })

describe('who sees which page — the menu as it always was', () => {
  it('a field tech gets the short menu', () => {
    expect(routes(fieldTech).sort()).toEqual([
      '/', '/admin/help', '/admin/videos', '/base-camp', '/company-calendar', '/company-map',
      '/field-scout', '/job-board', '/my-crew', '/my-pay', '/rooms',
    ].sort())
  })
  it('a rep: sales, work, supply, team — no money, no admin', () => {
    const r = routes(rep)
    for (const p of ['/leads', '/estimates', '/jobs', '/products', '/employees', '/my-pay', '/customers']) expect(r).toContain(p)
    for (const p of ['/invoices', '/books', '/payroll', '/payroll/setup', '/settings', '/reports']) expect(r).not.toContain(p)
  })
  it('a manager adds Management, still no money', () => {
    expect(routes(manager)).toContain('/reports')
    expect(routes(manager)).toContain('/admin/eos')
    expect(routes(manager)).not.toContain('/invoices')
  })
  it('payroll — all three pages — needs Admin AND the HR flag', () => {
    for (const p of ['/payroll', '/payroll/inbox', '/payroll/setup']) {
      expect(pageVisible(p, officeAdmin)).toBe(false)
      expect(pageVisible(p, manager)).toBe(false)
      expect(pageVisible(p, hrAdmin)).toBe(true)
      expect(pageVisible(p, dev)).toBe(true)
    }
    expect(routes(officeAdmin)).toContain('/invoices')
  })
  it('developer tools are developer only', () => {
    expect(pageVisible('/admin/data-console', hrAdmin)).toBe(false)
    expect(pageVisible('/admin/data-console', dev)).toBe(true)
  })
})

describe('one rule: the sidebar reads the map', () => {
  it('Layout filters through pageVisible and keeps no blocklist of its own', () => {
    expect(layout).toMatch(/from '\.\.\/\.\.\/supabase\/functions\/_shared\/appMap\.ts'/)
    expect(layout).toMatch(/baseItems: section\.baseItems\.filter\(i => pageVisible\(i\.to, navWho\)\)/)
    expect(layout).not.toMatch(/const hrOnly/)
    expect(layout).toMatch(/const adminSection = pageVisible\('\/settings', navWho\)/)
    expect(layout).toMatch(/const managementSection = pageVisible\('\/reports', navWho\)/)
    expect(layout).toMatch(/const devSection = pageVisible\('\/admin\/data-console', navWho\)/)
  })
  it('every menu item in Layout is a page in the map, with the same label', () => {
    const items = [...layout.matchAll(/\{ to: '(\/[^']*)', icon: \w+, label: '([^']+)'/g)]
    expect(items.length).toBeGreaterThan(35)
    const map = new Map(MENU_PAGES.map((p) => [p.route, p]))
    for (const [, route, label] of items) {
      expect(map.has(route), route).toBe(true)
      // The map may add a word ("Estimates (Quotes)") but never rename.
      if (route !== '/company-calendar' && route !== '/company-map') expect(map.get(route).label).toContain(label)
    }
  })
})

describe('Payroll setup refuses on its own', () => {
  it('Admin + HR, checked before the query and after every hook', () => {
    expect(setup).toMatch(/const allowed = canViewHR\(user\) && isAdmin\(user\)/)
    expect(setup).toMatch(/if \(!companyId \|\| !allowed\) return/)
    const refuse = setup.indexOf('if (user && !allowed)')
    expect(refuse).toBeGreaterThan(setup.lastIndexOf('useMemo('))
    expect(refuse).toBeGreaterThan(setup.lastIndexOf('useEffect('))
  })
})

describe('what Arnie is told', () => {
  it('built server-side from the caller\'s own row, every turn', () => {
    expect(chat).toMatch(/\+ await appMapFor\(caller\.employeeId\)/)
    expect(chat).toMatch(/employees\?select=name,role,user_role,is_developer,has_hr_access&id=eq\.\$\{employeeId\}/)
  })
  it('says yes, there is a feedback button — and where', () => {
    const b = appMapBlock(rep, 'Alayda')
    expect(b).toMatch(/Feedback — YES, there is one, on every page/)
    expect(b).toMatch(/My Feedback/)
    expect(b).toMatch(/never say you do not know whether something exists/)
  })
  it('lists their pages, names the ones they lack without walking them there', () => {
    const b = appMapBlock(rep, 'Alayda')
    expect(b).toMatch(/- Leads \(\/leads\)/)
    expect(b).not.toMatch(/- Payroll \(\/payroll\)/)
    expect(b).toMatch(/NOT in Alayda's menu[^\n]*Payroll setup/)
    expect(b).toMatch(/never walk them toward it/)
  })
  it('an HR admin is told about payroll as theirs', () => {
    expect(appMapBlock(hrAdmin, 'Bryce')).toMatch(/- Payroll setup \(\/payroll\/setup\)/)
  })
})

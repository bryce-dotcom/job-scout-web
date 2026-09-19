import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

// Day two of a new company: the first employee by voice, and the price
// book from a document. Both are the page's write made from a
// conversation, and both carry money — so these hold the gates: who may
// set pay, what a card may grant, that no price is ever invented on the
// server side, and that rollback takes away exactly what apply made.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const empSrc = read('../../supabase/functions/_shared/arnieEmployee.ts')
const bookSrc = read('../../supabase/functions/_shared/arniePriceBook.ts')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')
const employeesPage = read('../pages/Employees.jsx')
const productsPage = read('../pages/ProductsServices.jsx')

const load = (src, deps) => { const m = { exports: {} }; new Function('module', 'exports', 'require', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, (p) => deps[p]); return m.exports }

// ── the employee rail, run against a fake REST that answers the four reads it makes ──
const makeRest = ({ roster = [], me = { has_hr_access: false }, company = { timezone: 'America/Phoenix' } } = {}) => ({
  readRecordList: async (_r, path) => {
    if (path.startsWith('employees?select=id,name,email,active')) return roster
    if (path.startsWith('employees?select=has_hr_access')) return [me]
    if (path.startsWith('companies?select=timezone')) return [company]
    return []
  },
})
const emp = (rest) => load(empSrc, { './arnieRest.ts': rest, './arnieTime.ts': load(read('../../supabase/functions/_shared/arnieTime.ts'), {}) })
const owner = { email: 'demo@jobscout.app', companyId: 25, employeeId: 133, role: 'super_admin', level: 4 }
const admin = { ...owner, level: 3, role: 'admin' }
const tech = { ...owner, level: 0, role: 'user', employeeId: 137 }
const field = (p, label) => p.display.find((d) => d.label === label)?.value

describe('adding a person: the page\'s gates, held on the server', () => {
  it('a tech is refused; an admin may add', async () => {
    const { prepareEmployee } = emp(makeRest())
    const no = await prepareEmployee({}, tech, { name: 'Casey Morgan' })
    expect(no.ok).toBe(false); expect(no.error).toMatch(/admin/)
    const yes = await prepareEmployee({}, admin, { name: 'Casey Morgan' })
    expect(yes.ok).toBe(true)
  })
  it('an owner sets pay; an admin without HR access gets the row and a line saying pay waits on the page — never a rate written', async () => {
    const { prepareEmployee } = emp(makeRest())
    const o = await prepareEmployee({}, owner, { name: 'Casey Morgan', hourly_rate: '$28/hr' })
    expect(o.columns.row.hourly_rate).toBe(28); expect(o.columns.row.is_hourly).toBe(true)
    expect(field(o, 'Pay')).toBe('$28.00 an hour')
    const a = await prepareEmployee({}, admin, { name: 'Casey Morgan', hourly_rate: '28' })
    expect(a.ok).toBe(true)
    expect(a.columns.row.hourly_rate).toBe(0); expect(a.columns.row.is_hourly).toBe(false)
    expect(field(a, 'Pay')).toMatch(/needs HR access/)
    const hr = emp(makeRest({ me: { has_hr_access: true } }))
    const h = await hr.prepareEmployee({}, admin, { name: 'Casey Morgan', annual_salary: '62,000' })
    expect(h.columns.row.annual_salary).toBe(62000); expect(h.columns.row.is_salary).toBe(true)
  })
  it('access never above the caller, never Super Admin; the default is User', async () => {
    const { prepareEmployee } = emp(makeRest())
    expect((await prepareEmployee({}, admin, { name: 'Casey Morgan' })).columns.row.user_role).toBe('User')
    expect((await prepareEmployee({}, admin, { name: 'Casey Morgan', user_role: 'Admin' })).columns.row.user_role).toBe('Admin')
    const sa = await prepareEmployee({}, owner, { name: 'Casey Morgan', user_role: 'Super Admin' })
    expect(sa.ok).toBe(false); expect(sa.error).toMatch(/Super Admin is set from Settings/)
    expect(create).toMatch(/user_role:\s+\{ column: null, label: 'Access',\s+max: 20, oneOf: \['User', 'Team Lead', 'Manager', 'Admin'\] \}/)
    expect(empSrc).toMatch(/const GRANTABLE: Record<string, number> = \{ 'User': 0, 'Team Lead': 1, 'Manager': 2, 'Admin': 3 \}/)
  })
  it('already on the roster → refused, by email or by name; an inactive namesake does not block', async () => {
    const { prepareEmployee } = emp(makeRest({ roster: [{ id: 1, name: 'Casey Morgan', email: 'casey@x.com', active: true }, { id: 2, name: 'Old Timer', email: 'old@x.com', active: false }] }))
    expect((await prepareEmployee({}, owner, { name: 'Casey Morgan' })).error).toMatch(/already on the team/)
    expect((await prepareEmployee({}, owner, { name: 'Someone New', email: 'CASEY@x.com' })).error).toMatch(/already has that email/)
    expect((await prepareEmployee({}, owner, { name: 'Old Timer' })).ok).toBe(true)
  })
  it('the start day is taken as said in the company zone; the title files as the page spells it; a lone first name is not enough', async () => {
    const { prepareEmployee } = emp(makeRest())
    const p = await prepareEmployee({}, owner, { name: 'Casey Morgan', role: 'field tech', hire_date: 'October 1' })
    expect(p.columns.row.role).toBe('Field Tech')
    expect(p.columns.row.hire_date).toMatch(/^\d{4}-10-01$/)
    expect((await prepareEmployee({}, owner, { name: 'Casey' })).error).toMatch(/full name/)
    expect((await prepareEmployee({}, owner, { name: 'Casey Morgan', hourly_rate: '28', annual_salary: '60000' })).error).toMatch(/Hourly or salary/)
    expect((await prepareEmployee({}, owner, { name: 'Casey Morgan', hourly_rate: '2800' })).error).toMatch(/an hour\?/)
  })
  it('the invite is the page\'s (invite-employee), sent only when there is an email and they did not say no', async () => {
    const { prepareEmployee } = emp(makeRest())
    expect((await prepareEmployee({}, owner, { name: 'Casey Morgan', email: 'c@x.com' })).columns.invite).toBe(true)
    expect((await prepareEmployee({}, owner, { name: 'Casey Morgan', email: 'c@x.com', invite: 'no' })).columns.invite).toBe(false)
    expect((await prepareEmployee({}, owner, { name: 'Casey Morgan' })).columns.invite).toBe(false)
    expect(empSrc).toMatch(/functions\/v1\/invite-employee/)
    expect(employeesPage).toMatch(/supabase\.functions\.invoke\('invite-employee'/)
  })
  it('rollback removes the row, the invitation and an unused login; a person who has clocked in is deactivated instead', () => {
    expect(empSrc).toMatch(/time_clock\?select=id&company_id=eq\.\$\{companyId\}&employee_id=eq\.\$\{id\}&limit=1/)
    expect(empSrc).toMatch(/if \(shifts\.length\) \{[\s\S]*active: false/)
    expect(empSrc).toMatch(/employee_invitations\?id=eq\.\$\{inv\}/)
    expect(empSrc).toMatch(/if \(u && !u\.last_sign_in_at\) await fetch\(`\$\{r\.url\}\/auth\/v1\/admin\/users\/\$\{u\.id\}`, \{ method: 'DELETE'/)
  })
})

// ── the price book: pure row checking, no REST ──
const { normalizeItems, MAX_ITEMS } = load(bookSrc, { './arnieRest.ts': { readRecordList: async () => [] } })

describe('the price book from a document: rows checked, never invented', () => {
  it('priced rows in; no price, already in the book, listed twice, absurd → skipped with the reason', () => {
    const { items, skipped } = normalizeItems([
      { name: 'Spring Cleanup', unit_price: 185, type: 'Service', sku: 'SVC-101' },
      { name: 'Fertilizer 24-0-6', unit_price: '$72.00', cost: '38.50' },
      { name: 'Sod - fescue', cost: 165 },
      { name: 'Emergency Service', unit_price: 150 },
      { name: 'spring cleanup', unit_price: 185 },
      { name: 'Excavator', unit_price: 300000 },
      { unit_price: 5 },
    ], new Set(['emergency service']))
    expect(items.map((i) => i.name)).toEqual(['Spring Cleanup', 'Fertilizer 24-0-6'])
    expect(items[0]).toMatchObject({ type: 'Service', unit_price: 185, cost: null, vendor_sku: 'SVC-101' })
    expect(items[1]).toMatchObject({ type: 'Product', unit_price: 72, cost: 38.5 })
    expect(skipped).toEqual([
      { name: 'Sod - fescue', why: 'no price' },
      { name: 'Emergency Service', why: 'already in the book' },
      { name: 'spring cleanup', why: 'listed twice' },
      { name: 'Excavator', why: '$300,000 does not read like a unit price' },
      { name: '(no name)', why: 'no name' },
    ])
  })
  it('labor and hourly rows are services; the cap is 80 a card', () => {
    const { items } = normalizeItems([{ name: 'Tech labor', unit_price: 95, unit: 'hr' }, { name: 'Visit', unit_price: 60, kind: 'service' }, { name: 'Widget', unit_price: 1 }], new Set())
    expect(items.map((i) => i.type)).toEqual(['Service', 'Service', 'Product'])
    expect(MAX_ITEMS).toBe(80)
  })
  it('a cost that equals the price is shown on the card as something to check', () => {
    expect(bookSrc).toMatch(/i\.cost != null && i\.cost === i\.unit_price \? ' · cost equals price — check this one' : ''/)
  })
  it('the rows are the page\'s: type Product|Service, taxable per the sales-tax setting for services, ungrouped, active', () => {
    expect(bookSrc).toMatch(/taxable: i\.type === 'Product' \? true : c\.services_taxable === true/)
    expect(bookSrc).toMatch(/servicesTaxable = JSON\.parse\(tax\?\.value \|\| '\{\}'\)\?\.apply_to === 'all'/)
    expect(bookSrc).toMatch(/active: true, group_id: null/)
    expect(productsPage).toMatch(/result = await supabase\.from\('products_services'\)\.insert\(\[payload\]\)/)
  })
  it('apply re-checks the book and skips what the page added meanwhile; rollback refuses once a quote or job line uses one', () => {
    expect(bookSrc).toMatch(/const fresh = items\.filter\(\(i\) => !names\.has\(i\.name\.toLowerCase\(\)\)\)/)
    expect(bookSrc).toMatch(/quote_lines\?select=item_id&item_id=\$\{inList\}&limit=1/)
    expect(bookSrc).toMatch(/job_lines\?select=item_id&item_id=\$\{inList\}&limit=1/)
    expect(productsPage).toMatch(/from\('quote_lines'\)\.select\('id', \{ count: 'exact', head: true \}\)\.eq\('item_id'/)
    expect(bookSrc).toMatch(/products_services\?company_id=eq\.\$\{companyId\}&id=\$\{inList\}`, \{ method: 'DELETE'/)
  })
  it('manager and up', () => {
    expect(bookSrc).toMatch(/if \(caller\.level < 2\) return \{ ok: false/)
    expect(create).toMatch(/price_book: \{\n\s+label: 'price book',\n\s+table: 'products_services',\n\s+minLevel: 2,/)
  })
})

describe('the tool and the prompt agree with the rails', () => {
  it('propose_create knows both; items is the one structured field; every employee field is column:null', () => {
    expect(chat).toMatch(/enum: \['lead', 'diagnosis', 'ticket', 'appointment', 'quote', 'followup', 'payment', 'memory', 'expense', 'company_setup', 'employee', 'price_book'\]/)
    expect(chat).toMatch(/items: \{ type: 'array', description: 'price_book: one row per item/)
    const start = create.indexOf('  employee: {')
    const entry = create.slice(start, create.indexOf('\n  },\n', start))
    const cols = [...entry.matchAll(/\{ column: (null|'[^']*')/g)].map((m) => m[1])
    expect(cols.length).toBe(11)
    expect(cols.every((c) => c === 'null')).toBe(true)
    expect(create).toMatch(/items:\s+\{ column: null, label: 'Items',\s+required: true, max: 60000, raw: true \}/)
  })
  it('the prompt: never invent a price, a blank price cell is a skipped line, the cost column is never the price; pay lands only if the card says so', () => {
    expect(engine).toMatch(/## Adding a person to the team/)
    expect(engine).toMatch(/## The price book from a document/)
    expect(engine).toMatch(/A blank PRICE cell means the line is LEFT OUT/)
    expect(engine).toMatch(/The COST column is never the price/)
    expect(engine).toMatch(/Do not read a rate back that the card did not accept/)
  })
})

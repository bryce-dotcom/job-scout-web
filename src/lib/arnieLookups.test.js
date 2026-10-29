// Eight pages Arnie could not read (permission parity, Bryce 2026-10-27/28):
// recurring jobs, service visits, the time log, communications, and the
// lighting pages. Each lookup reads what its page shows, with the page's
// filters, and only for a person the page is open to.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { runLookup, LOOKUP_TOOLS, LOOKUP_NAMES } from '../../supabase/functions/_shared/arnieLookups.ts'
import { PARITY } from '../../supabase/functions/_shared/arnieParity.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const r = { url: 'https://db', key: 'k' }
const ctx = (over = {}) => ({ companyId: 3, employeeId: 7, level: 3, email: 'bryce@hhh.services', today: '2026-10-28', ...over })

// A tiny PostgREST: answers by table, records every path asked for.
let tables, asked
beforeEach(() => {
  asked = []
  tables = { employees: [{ id: 7, role: 'Owner', user_role: 'Admin' }], company_agents: [{ subscription_status: 'active', agent: { slug: 'lenard-lighting' } }] }
  vi.stubGlobal('fetch', async (url) => {
    const path = decodeURIComponent(String(url).replace('https://db/rest/v1/', ''))
    asked.push(path)
    const t = path.split('?')[0]
    const rows = typeof tables[t] === 'function' ? tables[t](path) : (tables[t] || [])
    return { ok: true, status: 200, json: async () => rows, headers: new Map() }
  })
})
afterEach(() => vi.unstubAllGlobals())

describe('each lookup is open to exactly who its page is open to', () => {
  it('a field tech cannot read the office pages', async () => {
    tables.employees = [{ id: 9, role: 'Field Tech', user_role: 'User' }]
    for (const name of ['query_time_log', 'query_communications', 'query_recurring_jobs']) {
      expect(await runLookup(r, name, {}, ctx({ employeeId: 9, level: 0 }))).toHaveProperty('restricted')
    }
  })
  it('the lighting pages need Lenard, as the pages do', async () => {
    tables.company_agents = []
    expect((await runLookup(r, 'query_lighting_audits', {}, ctx())).restricted).toMatch(/Lenard/)
    expect((await runLookup(r, 'query_utility_programs', { utility: 'Rocky' }, ctx())).restricted).toMatch(/Lenard/)
  })
  it('below manager, the time log is only your own hours', async () => {
    tables.employees = (p) => p.includes('select=role') ? [{ id: 7, role: 'Installer', user_role: 'Team Lead' }] : []
    await runLookup(r, 'query_time_log', {}, ctx({ level: 1 }))
    expect(asked.find((p) => p.startsWith('time_log?'))).toMatch(/&employee_id=eq\.7/)
  })
})

describe('recurring jobs read the way the page reads them', () => {
  it('one line per series, the open occurrence, next visit and how often', async () => {
    tables.jobs = [
      { id: 1, job_id: 'J-1', status: 'Closed', recurrence: 'Monthly', start_date: '2026-09-15', business_name: 'Intercon' },
      { id: 2, job_id: 'J-2', status: 'Scheduled', recurrence: 'Monthly', recurrence_parent_id: 1, start_date: '2026-11-15', business_name: 'Intercon' },
      { id: 3, job_id: 'J-3', status: 'Paid', recurrence: 'Quarterly', start_date: '2026-08-01', customer_name: 'Done Series' },
      { id: 4, job_id: 'J-4', status: 'Scheduled', recurrence: 'Quarterly', service_due_date: '2026-11-02', customer_name: 'Kelley' },
    ]
    const out = await runLookup(r, 'query_recurring_jobs', {}, ctx())
    expect(out.series).toBe(2)
    expect(out.list.map((s) => [s.job, s.how_often, s.next_visit])).toEqual([['J-4', 'quarterly', '2026-11-02'], ['J-2', 'monthly', '2026-11-15']])
    expect((await runLookup(r, 'query_recurring_jobs', { due_within_days: 7 }, ctx())).series).toBe(1)
  })
})

describe('service visits', () => {
  it('done visits are left out; the window holds overdue and due-soon', async () => {
    tables.jobs = [
      { id: 1, status: 'Scheduled', service_kind: 'warranty', service_due_date: '2026-10-20', customer_name: 'A' },
      { id: 2, status: 'Chillin', service_kind: 'annual', service_due_date: '2026-11-20', customer_name: 'B' },
      { id: 3, status: 'Closed', service_kind: 'annual', service_due_date: '2026-11-01', customer_name: 'C' },
      { id: 4, status: 'Chillin', service_kind: 'repair', service_due_date: '2027-06-01', customer_name: 'D' },
    ]
    const out = await runLookup(r, 'query_service_visits', {}, ctx())
    expect(out.list.map((s) => [s.customer, s.days_until])).toEqual([['A', -8], ['B', 23]])
    expect([out.overdue, out.later]).toEqual([1, 1])
  })
})

describe('communications', () => {
  it('says what was sent, without the carrier id on the end', async () => {
    tables.communications_log = [{ sent_date: '2026-10-28', type: 'sms', direction: 'out', trigger: 'invoice_sent', status: 'delivered', response: 'Invoice INV-1073 for $185.00 [SMd2b55244bbbfe97a60b5c3a8d241c3e2]', customer: { name: 'Kelley' } }]
    const out = await runLookup(r, 'query_communications', {}, ctx())
    expect(out.list[0]).toMatchObject({ customer: 'Kelley', why: 'invoice_sent', said: 'Invoice INV-1073 for $185.00' })
  })
})

describe('rebate rates come back only for a named utility or state', () => {
  it('names the programs; rates once narrowed', async () => {
    tables.utility_programs = [{ id: 11, program_name: 'Wattsmart Business', utility_name: 'Rocky Mountain Power', state: 'UT' }, { id: 12, program_name: 'SRP Business', utility_name: 'Salt River Project', state: 'AZ' }]
    tables.incentive_measures = [{ program_id: 11, fixture_category: 'High Bay', rate_value: 0.5, rate_unit: 'per watt reduced', per_unit_cap: 150 }]
    expect(typeof (await runLookup(r, 'query_utility_programs', {}, ctx())).rates).toBe('string')
    const out = await runLookup(r, 'query_utility_programs', { utility: 'rocky' }, ctx())
    expect(out.programs.map((p) => p.name)).toEqual(['Wattsmart Business'])
    expect(out.rates[0]).toMatchObject({ program: 'Wattsmart Business', fixture: 'High Bay', rate: 0.5, caps: '$150/unit' })
  })
})

describe('wired into Arnie', () => {
  const chat = read('supabase/functions/arnie-chat/index.ts')
  it('offered to everyone, gated when run', () => {
    expect(chat).toMatch(/offered\.push\(\.\.\.LOOKUP_TOOLS\)/)
    expect(chat).toMatch(/if \(LOOKUP_NAMES\.has\(name\)\) \{[\s\S]{0,400}return await runLookup\(/)
  })
  it('every tool is look-up only, named query_, and listed against its page', () => {
    const reads = new Set(Object.values(PARITY).flatMap((p) => p.reads || []))
    for (const t of LOOKUP_TOOLS) {
      expect(t.name).toMatch(/^query_[a-z_]+$/)
      expect(LOOKUP_NAMES.has(t.name)).toBe(true)
      expect(reads.has(t.name), `${t.name} is not on a page in arnieParity.ts`).toBe(true)
    }
    expect(read('supabase/functions/_shared/arnieLookups.ts')).not.toMatch(/method: '(POST|PATCH|DELETE)'/)
  })
})

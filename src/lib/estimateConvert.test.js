import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'
import { leadStatusForJob as clientLeadStatus } from './leadDeliveryStatus.js'
import { classifyType as clientClassifyType, classifyText as clientClassifyText, deriveBusinessUnit as clientDeriveBU } from './businessUnitForWork.js'
import { contactGapPatch as clientGapPatch } from './customerMatch.js'

// One conversion. Until 2026-09-20 the estimate page and the customer portal
// each carried their own, and the portal's had drifted (it dropped
// in_utility_scope on every line). Now _shared/estimateConvert.ts is the one
// place, and these tests hold three things: the server's ports of the
// client rules are the client rules; the plan makes the decisions the page
// made; and nobody has written a second conversion since.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const convSrc = read('../../supabase/functions/_shared/estimateConvert.ts')
const wonSrc = read('../../supabase/functions/_shared/arnieWon.ts')
const fnSrc = read('../../supabase/functions/convert-estimate/index.ts')
const portalSrc = read('../../supabase/functions/approve-document/index.ts')
const pageSrc = read('../pages/EstimateDetail.jsx')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')

const load = (src, deps) => { const m = { exports: {} }; new Function('module', 'exports', 'require', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, (p) => deps[p]); return m.exports }
const conv = load(convSrc, { './arnieRest.ts': { readRecordList: async () => [] } })

describe('the server ports are the client rules', () => {
  it('leadStatusForJob', () => {
    const tables = [[], ['Chillin', 'Scheduled', 'In Progress', 'Completed'], [{ name: 'New' }, { name: 'Booked' }, { name: 'Done' }], ['Open', 'Finished']]
    for (const t of tables) for (const js of ['Chillin', 'Scheduled', 'On Hold', 'In Progress', 'Completed', 'Legacy', null]) expect(conv.leadStatusForJob(js, t)).toBe(clientLeadStatus(js, t))
  })
  it('business unit from the work', () => {
    for (const t of ['Electrical', 'Window Cleaning', 'LED Retrofit', 'Janitorial', 'Plumbing', null]) expect(conv.classifyType(t)).toBe(clientClassifyType(t))
    for (const t of ['Highbay swap', 'Gutter cleaning', 'Kelvin change', 'Remodel', '']) expect(conv.classifyText(t)).toBe(clientClassifyText(t))
    const sets = [[{ type: 'Electrical' }, { name: 'Window wash' }, { suggest_in_lenard: true }], [{ type: 'Window Cleaning' }], [{ name: 'Widget' }]]
    for (const s of sets) expect(conv.deriveBusinessUnit({ products: s, text: 'Shop lighting' })).toBe(clientDeriveBU({ products: s, text: 'Shop lighting' }))
  })
  it('contactGapPatch fills blanks only', () => {
    const cases = [[{ phone: '', email: 'a@b.c', address: null }, { phone: '801', email: 'x@y.z', address: '1 Main' }], [{ phone: '1' }, { phone: '2' }], [null, { phone: '1' }], [{ phone: '1', email: '2', address: '3' }, { phone: '9', email: '9', address: '9' }]]
    for (const [c, s] of cases) expect(conv.contactGapPatch(c, s)).toEqual(clientGapPatch(c, s))
  })
  it('findMatchingCustomer asks email, then phone, then a non-conflicting name — the same order, the same conflict rule', () => {
    expect(convSrc).toMatch(/if \(e\) \{[\s\S]*email=ilike[\s\S]*if \(p && p\.length >= 7\) \{[\s\S]*phone=ilike[\s\S]*if \(n\) \{[\s\S]*name=ilike/)
    expect(convSrc).toMatch(/const emailConflict = c\.email && e && String\(c\.email\)\.trim\(\)\.toLowerCase\(\) !== e/)
    expect(convSrc).toMatch(/const phoneConflict = digits\(c\.phone\) && p && digits\(c\.phone\) !== p/)
  })
})

const base = () => ({
  quote: { id: 1, quote_id: 'EST-1', estimate_name: null, service_type: 'Lighting Retrofit', quote_amount: 3300, discount: 200, utility_incentive: 0, summary: 'Twelve highbays.', notes: null, estimate_message: null, service_date: null, business_unit: null, settings_overrides: { formal_proposal: { down_payment_amount: 10, down_payment_is_percent: true, down_payment_label: 'Deposit' } } },
  lead: { id: 9, customer_name: 'Ben Rowe', business_name: 'Halifax Flooring', phone: '801-555-0177', email: 'ben@x.example', address: '12 Mill St', status: 'Quote Sent' },
  customer: null,
  lines: [
    { id: 11, item_id: 101, item_name: 'LED Highbay 150W', quantity: 12, price: 200, line_total: 2400, in_utility_scope: true },
    { id: 12, item_id: 102, item_name: 'Install labor', quantity: 1, price: 600, line_total: 600, labor_cost: 400, in_utility_scope: true },
    { id: 13, item_id: null, item_name: 'Extended warranty', quantity: 1, price: 500, line_total: 500, in_utility_scope: false },
  ],
  products: [{ id: 101, name: 'LED Highbay 150W', type: 'Lighting', labor_coverage_months_added: 0, parts_coverage_months_added: 0 }, { id: 102, name: 'Install labor', type: 'Electrical' }],
  jobStatuses: [],
  laborWarrantyMonths: 12, partsWarrantyMonths: 60,
  today: new Date('2026-09-20T18:00:00Z'),
})

describe('planConversion — the decisions the page made, from rows', () => {
  it('who, then what; never the bare service type; the business name first', () => {
    expect(conv.planConversion(base()).jobTitle).toBe('Halifax Flooring - Lighting Retrofit')
    const named = base(); named.quote.estimate_name = 'Halifax Flooring — shop lighting'
    expect(conv.planConversion(named).jobTitle).toBe('Halifax Flooring — shop lighting')
    const noBiz = base(); noBiz.lead.business_name = null
    expect(conv.planConversion(noBiz).jobTitle).toBe('Ben Rowe - Lighting Retrofit')
  })
  it('the lines keep in_utility_scope, description and labor; the total is the lines\' when they produced it', () => {
    const p = conv.planConversion(base())
    expect(p.lines.map((l) => l.in_utility_scope)).toEqual([true, true, false])
    expect(p.lines[1]).toMatchObject({ labor_cost: 400, description: 'Install labor', total: 600, totals: 600, job_line_id: 'JL-2' })
    expect(p.jobTotal).toBe(3300); expect(p.jobTotalSource).toBe('lines')   // 3500 - 200
    const manual = base(); manual.quote.quote_amount = 2999
    expect(conv.planConversion(manual).jobTotalSource).toBe('manual')
  })
  it('business unit from the estimate, else the products; Chillin; a start date only from a real service date', () => {
    const p = conv.planConversion(base())
    expect(p.businessUnit).toBe('Energy Scout'); expect(p.status).toBe('Chillin'); expect(p.startDate).toBeNull()
    const dated = base(); dated.quote.service_date = '2026-10-01'; dated.quote.business_unit = 'NPT'
    const d = conv.planConversion(dated); expect(d.startDate).toBe('2026-10-01'); expect(d.businessUnit).toBe('NPT')
  })
  it('the deposit: a percent of the contract (lines less discount) or a fixed amount, or none', () => {
    expect(conv.planConversion(base()).deposit).toEqual({ label: 'Deposit', amount: 330 })
    const fixed = base(); fixed.quote.settings_overrides.formal_proposal = { down_payment_amount: 500, down_payment_label: 'Retainer' }
    expect(conv.planConversion(fixed).deposit).toEqual({ label: 'Retainer', amount: 500 })
    const none = base(); none.quote.settings_overrides = {}
    expect(conv.planConversion(none).deposit).toBeNull()
  })
  it('coverage: company defaults plus what an Extended Service Coverage upsell added, per quantity', () => {
    expect(conv.planConversion(base()).coverage).toEqual({ laborUntil: '2027-09-20', partsUntil: '2031-09-20' })
    const up = base(); up.products[0].labor_coverage_months_added = 1; up.products[0].parts_coverage_months_added = 2  // × 12 highbays
    expect(conv.planConversion(up).coverage).toEqual({ laborUntil: '2028-09-20', partsUntil: '2033-09-20' })
  })
  it('the lead lands in the delivery column, in the company\'s vocabulary; no lead, no status', () => {
    expect(conv.planConversion(base()).leadStatus).toBe('Job Scheduled')
    const own = base(); own.jobStatuses = [{ name: 'Chillin' }, { name: 'Scheduled' }]
    expect(conv.planConversion(own).leadStatus).toBe('Chillin')
    const noLead = base(); noLead.lead = null; noLead.customer = { name: 'Ben Rowe', business_name: 'Halifax Flooring' }
    expect(conv.planConversion(noLead).leadStatus).toBeNull()
  })
  it('details and notes carry the summary, notes and message', () => {
    const p = conv.planConversion(base())
    expect(p.details).toBe('Twelve highbays.'); expect(p.notes).toBe('Twelve highbays.')
  })
})

describe('one conversion, three callers', () => {
  it('the estimate page no longer inserts a job or copies lines itself — it calls convert-estimate', () => {
    expect(pageSrc).not.toMatch(/from\('jobs'\)\s*\n\s*\.insert/)
    expect(pageSrc).not.toMatch(/from\('job_lines'\)\s*\n\s*\.insert/)
    expect(pageSrc).toMatch(/supabase\.functions\.invoke\('convert-estimate', \{ body: \{ quote_id: parseInt\(id\), approve: true, deposit, convert: !estimate\.job_id \} \}\)/)
    expect(pageSrc).toMatch(/supabase\.functions\.invoke\('convert-estimate', \{ body: \{ quote_id: parseInt\(id\), convert: true \} \}\)/)
  })
  it('the portal no longer carries its own copy', () => {
    expect(portalSrc).toMatch(/import \{ convertEstimate \} from "\.\.\/_shared\/estimateConvert\.ts"/)
    expect(portalSrc).toMatch(/await convertEstimate\(\{ url: SUPABASE_URL, key: SERVICE_ROLE_KEY \}, tokenRow\.company_id, estimate\.id/)
    expect(portalSrc).not.toMatch(/from\('jobs'\)\s*\n\s*\.insert/)
    expect(portalSrc).not.toMatch(/from\('job_lines'\)\.insert/)
  })
  it('convert-estimate is a person\'s action on their own company\'s estimate', () => {
    expect(fnSrc).toMatch(/const caller = await resolveCaller\(req, SUPABASE_URL, SERVICE_KEY\)/)
    expect(fnSrc).toMatch(/if \(!quote \|\| quote\.company_id !== caller\.companyId\) return json\(\{ error: 'No such estimate\.' \}, 404\)/)
  })
  it('Arnie\'s won target runs approveEstimate + convertEstimate, and undo refuses once the job has moved', () => {
    expect(wonSrc).toMatch(/const a = await approveEstimate\(r, companyId, c\.quote_id/)
    expect(wonSrc).toMatch(/const conv = await convertEstimate\(r, companyId, c\.quote_id/)
    expect(wonSrc).toMatch(/return await undoConversion\(r, companyId, created\)/)
    expect(convSrc).toMatch(/if \(job\.status !== 'Chillin' \|\| job\.start_date\) return \{ ok: false as const/)
    expect(convSrc).toMatch(/if \(clocked\) return \{ ok: false as const/)
    expect(convSrc).toMatch(/if \(invs\.some\(\(i: any\) => i\.invoice_type !== 'deposit'\)\) return \{ ok: false as const/)
  })
  it('the rep\'s own estimate or a manager\'s; already-a-job and rejected estimates are not winnable', () => {
    expect(wonSrc).toMatch(/if \(q\.salesperson_id && String\(q\.salesperson_id\) !== String\(caller\.employeeId\) && caller\.level < 2\)/)
    expect(wonSrc).toMatch(/const WINNABLE = `status=in\.\(Sent,Draft,Pending,Approved\)&rejected_date=is\.null&job_id=is\.null`/)
    expect(create).toMatch(/won: \{\n\s+label: 'won estimate',\n\s+table: 'jobs',\n\s+minLevel: 0,\n\s+verb: 'Mark won',/)
    expect(chat).toMatch(/'company_setup', 'employee', 'price_book', 'won', 'schedule'\]/)
    expect(engine).toMatch(/## An estimate is won/)
    expect(engine).toMatch(/Approving is not scheduling/)
  })
})

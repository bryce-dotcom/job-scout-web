import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { transformSync } from 'esbuild'

// Arnie sets a new company up from four answers — name, address, trade,
// entity — and the address does the rest. These tests hold the derivation
// to the truth it claims: every derived line names its source, the
// estimates are flagged, nothing is invented, and what the rail writes is
// the shape Settings and Onboarding already write.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const statesSrc = read('../../supabase/functions/_shared/stateProfiles.ts')
const setupSrc = read('../../supabase/functions/_shared/companySetup.ts')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const chat = read('../../supabase/functions/arnie-chat/index.ts')
const engine = read('../pages/agents/arnie/arnieEngine.js')
const onboarding = read('../pages/Onboarding.jsx')
const arnieChat = read('../pages/agents/arnie/ArnieChat.jsx')

// The real modules, types stripped by esbuild; the REST helper stubbed.
const load = (src, deps) => { const m = { exports: {} }; new Function('module', 'exports', 'require', transformSync(src, { loader: 'ts', format: 'cjs' }).code)(m, m.exports, (p) => deps[p]); return m.exports }
const states = load(statesSrc, {})
const setup = load(setupSrc, { './stateProfiles.ts': states, './arnieRest.ts': { readRecordList: async () => [] } })
const { STATE_PROFILES, tradeFor, entityFor } = states
const { derive, MODULE_TEMPLATES } = setup

const place = (over) => ({ formatted: '1600 E Main St, Mesa, AZ 85203, USA', street: '1600 E Main St', city: 'Mesa', county: 'Maricopa County', state: 'AZ', zip: '85203', lat: 33.4, lng: -111.8, source: 'google', ...over })
const az = (over = {}) => derive({ name: 'Summit Field Co', place: place(), trade: tradeFor('lawn care and landscaping'), entity: entityFor('S corp'), ein: '12-3456789', pay_frequency: 'every two weeks', ...over })
const line = (d, label) => d.lines.find((l) => l.label === label)

describe('every state has a profile, and the profile says what it knows', () => {
  it('50 states + DC, each with a zone, an income-tax rule and a sales-tax floor', () => {
    const codes = Object.keys(STATE_PROFILES)
    expect(codes.length).toBe(51)
    expect(codes).toContain('DC')
    for (const c of codes) {
      const s = STATE_PROFILES[c]
      expect(s.code).toBe(c)
      expect(s.tz).toMatch(/^(America|Pacific)\//)
      expect(['none', 'flat', 'graduated']).toContain(s.incomeTax.kind)
      if (s.incomeTax.kind === 'flat') expect(s.incomeTax.ratePct).toBeGreaterThan(0)
      expect(s.salesTax.stateRatePct).toBeGreaterThanOrEqual(0)
      expect(typeof s.salesTax.servicesTaxable).toBe('boolean')
    }
  })
  it('the no-income-tax states and the no-sales-tax states are the real ones', () => {
    const noIncome = Object.values(STATE_PROFILES).filter((s) => s.incomeTax.kind === 'none').map((s) => s.code).sort()
    expect(noIncome).toEqual(['AK', 'FL', 'NH', 'NV', 'SD', 'TN', 'TX', 'WA', 'WY'])
    const noSales = Object.values(STATE_PROFILES).filter((s) => s.salesTax.stateRatePct === 0).map((s) => s.code).sort()
    expect(noSales).toEqual(['AK', 'DE', 'MT', 'NH', 'OR'])
  })
  it('Arizona has no daylight saving; UT, AZ and the big four carry a SUI new-employer estimate', () => {
    expect(STATE_PROFILES.AZ.noDst).toBe(true)
    expect(STATE_PROFILES.AZ.tz).toBe('America/Phoenix')
    for (const c of ['UT', 'AZ', 'TX', 'FL', 'CA', 'NV']) { expect(STATE_PROFILES[c].sui?.wageBase).toBeGreaterThan(0); expect(STATE_PROFILES[c].sui?.newEmployerRatePct).toBeGreaterThan(0) }
  })
})

describe("the trade and the entity from the owner's words", () => {
  it('lighting words → lighting (Lenard, 60-month parts); lawn words → landscaping (Zach); nothing → other', () => {
    expect(tradeFor('we do LED retrofits and commercial lighting').key).toBe('lighting')
    expect(tradeFor('commercial lighting').agents).toEqual(['arnie-og', 'lenard-lighting'])
    expect(tradeFor('lighting').partsWarrantyMonths).toBe(60)
    expect(tradeFor('lawn care and landscaping').agents).toContain('zach-yard-yeti')
    expect(tradeFor('window cleaning').agents).toContain('walter-windows')
    expect(tradeFor('we fix furnaces').key).toBe('hvac')
    expect(tradeFor('').key).toBe('other')
  })
  it('entity words → the row values + the tax form; nonsense → null (the rail asks, never guesses)', () => {
    expect(entityFor('S corp').taxForm).toBe('1120-S')
    expect(entityFor('s-corporation').entity_type).toBe('S-Corp')
    expect(entityFor('C corp').taxForm).toBe('1120')
    expect(entityFor('LLC').entity_type).toBe('LLC')
    expect(entityFor('just me').entity_type).toBe('Sole Proprietor')
    expect(entityFor('partnership').taxForm).toBe('1065')
    expect(entityFor('a business')).toBeNull()
    expect(setupSrc).toMatch(/if \(String\(f\.entity \|\| ''\)\.trim\(\) && !entity\) return \{ ok: false/)
  })
})

describe('derive — the address does the rest, and every line says where it came from', () => {
  it('Arizona lawn-care S-corp: zone, NAICS, flat withholding, SUI estimate, TPT floor, Zach', () => {
    const d = az()
    expect(d.company.timezone).toBe('America/Phoenix')
    expect(d.company.naics_code).toBe('561730')
    expect(d.company.entity_type).toBe('S-Corp')
    expect(d.company.ein).toBe('12-3456789')
    expect(d.company.pay_frequency).toBe('bi-weekly')
    expect(d.company.state_employer_id_state).toBe('AZ')
    expect(d.company.sui_rate_pct).toBe(2)
    expect(d.company.sui_wage_base).toBe(8000)
    expect(d.company.sui_rate_source).toBe('estimate') // the companies check constraint: notice|provider|estimate|manual
    expect(d.company.federal_deposit_schedule).toBe('monthly')
    expect(d.settings.sales_tax).toEqual({ enabled: true, rate: 5.6, jurisdiction: 'Mesa, AZ', apply_to: 'materials' })
    expect(d.settings.service_types).toEqual(['Mowing', 'Fertilization', 'Cleanup', 'Landscaping', 'Irrigation'])
    expect(d.settings.business_units).toEqual([{ name: 'Summit Field Co', address: '1600 E Main St, Mesa, AZ 85203, USA', phone: '', email: '' }])
    expect(d.agents).toEqual(['arnie-og', 'zach-yard-yeti'])
    expect(line(d, 'Time zone').source).toBe('derived')
    expect(line(d, 'Unemployment insurance (SUI)').source).toBe('estimate')
    expect(line(d, 'Sales tax').source).toBe('estimate')
    expect(line(d, 'EIN').source).toBe('you')
    expect(d.needsYou).toEqual(['the local sales-tax add-on for Mesa (the card uses the state rate as a floor)'])
  })
  it('a local rate given makes the sales-tax line theirs and the add-on stops being owed', () => {
    const d = az({ local_sales_tax_pct: 2.7 })
    expect(d.settings.sales_tax.rate).toBe(8.3)
    expect(line(d, 'Sales tax').source).toBe('you')
    expect(d.needsYou).toEqual([])
  })
  it('a state with no income tax and no sales tax says so, and services-taxable states apply to all', () => {
    const or = derive({ name: 'Rose City Roofing', place: place({ formatted: '1 SW Main St, Portland, OR 97204', city: 'Portland', state: 'OR', zip: '97204' }), trade: tradeFor('roofing'), entity: entityFor('LLC') })
    expect(or.settings.sales_tax.enabled).toBe(false)
    expect(line(or, 'Sales tax').value).toMatch(/no state sales tax/)
    const tx = derive({ name: 'Lone Star HVAC', place: place({ formatted: '1 Main St, Austin, TX 78701', city: 'Austin', state: 'TX', zip: '78701' }), trade: tradeFor('hvac'), entity: entityFor('LLC') })
    expect(line(tx, 'Texas income tax').value).toMatch(/none/)
    expect(tx.settings.sales_tax.apply_to).toBe('all')
    expect(tx.company.sui_rate_source).toBe('estimate')
  })
  it('what it does not know it asks for — never a made-up EIN, entity, or SUI rate', () => {
    const d = derive({ name: 'Anon Co', place: place({ formatted: '1 Main St, Boise, ID 83702', city: 'Boise', state: 'ID', zip: '83702' }), trade: tradeFor('painting'), entity: null })
    expect(d.company.ein).toBeUndefined()
    expect(d.company.entity_type).toBeUndefined()
    expect(d.company.sui_rate_pct).toBeUndefined()
    expect(d.needsYou.join(' ')).toMatch(/entity type/)
    expect(d.needsYou.join(' ')).toMatch(/EIN/)
    expect(d.needsYou.join(' ')).toMatch(/Idaho unemployment-insurance rate/)
    expect(line(d, 'Payroll').source).toBe('derived') // the semi-monthly default, labelled as a default
    expect(line(d, 'Payroll').value).toMatch(/the default/)
  })
  it('a bad EIN is not kept', () => {
    expect(az({ ein: '12345' }).company.ein).toBeUndefined()
    expect(az({ ein: '123456789' }).company.ein).toBe('12-3456789')
  })
})

describe('what the rail writes is what the app writes', () => {
  it("MODULE_TEMPLATES is Onboarding's map, key for key", () => {
    const block = onboarding.slice(onboarding.indexOf('const MODULE_TEMPLATES = {'))
    const theirs = new Function('return ' + block.slice(block.indexOf('{'), block.indexOf('\n        }') + '\n        }'.length))()
    expect(MODULE_TEMPLATES).toEqual(theirs)
  })
  it('the settings rows are upserted on (company_id, key) as JSON strings, like Settings does', () => {
    expect(setupSrc).toMatch(/settings\?on_conflict=company_id,key/)
    expect(setupSrc).toMatch(/value: JSON\.stringify\(value\)/)
  })
  it('the company row is patched by id (companies has no company_id), and rollback restores the snapshot', () => {
    expect(setupSrc).toMatch(/companies\?id=eq\.\$\{companyId\}/)
    expect(setupSrc).toMatch(/before: \{ company: Object\.fromEntries\(Object\.keys\(d\.company\)\.map\(\(k\) => \[k, company\?\.\[k\] \?\? null\]\)\), settings: prior, agent_ids/)
    expect(setupSrc).toMatch(/if \(priorByKey\.has\(key\)\) await fetch\([^)]*method: 'PATCH'/)
    expect(setupSrc).toMatch(/else await fetch\([^)]*method: 'DELETE'/)
  })
  it('owner or admin only; techs are refused at prepare', () => {
    expect(setupSrc).toMatch(/if \(caller\.level < 3\) return \{ ok: false/)
    expect(create).toMatch(/company_setup: \{\n\s+label: 'company',\n\s+table: 'companies',\n\s+minLevel: 3,/)
  })
})

describe('the tool, the prompt and the page agree', () => {
  it('propose_create knows company_setup; every field is column:null; name and address required', () => {
    expect(chat).toMatch(/enum: \['lead', 'diagnosis', 'ticket', 'appointment', 'quote', 'followup', 'payment', 'memory', 'expense', 'company_setup', 'employee', 'price_book']/)
    const start = create.indexOf('  company_setup: {')
    const entry = create.slice(start, create.indexOf('\n  },\n', start))
    const cols = [...entry.matchAll(/\{ column: (null|'[^']*')/g)].map((m) => m[1])
    expect(cols.length).toBe(12)
    expect(cols.every((c) => c === 'null')).toBe(true)
    expect(entry).toMatch(/name:\s+\{ column: null, label: 'Company',\s+required: true/)
    expect(entry).toMatch(/address:\s+\{ column: null, label: 'Address',\s+required: true/)
  })
  it('the prompt asks exactly four things and never invents an EIN or a rate', () => {
    expect(engine).toMatch(/## Setting up a new company/)
    expect(engine).toMatch(/propose_create with target=company_setup/)
    expect(engine).toMatch(/never invent/i)
  })
  it('Onboarding offers Arnie, kicks off once, and only counts a company card as done', () => {
    expect(onboarding).toMatch(/kickoff="Set up my company\."/)
    expect(onboarding).toMatch(/card\?\.preview\?\.label === 'company'/)
    expect(arnieChat).toMatch(/if \(!fired\) kickoffSent\.current = false/)
    expect(arnieChat).toMatch(/onApplied\?\.\(card\)/)
  })
})

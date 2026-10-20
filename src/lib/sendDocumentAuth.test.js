import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import {
  authorizeDocumentSend, mayAttachPath, senderName, restrictFrom,
} from '../../supabase/functions/_shared/emailSender.ts'

// send-invoice and send-estimate checked no caller until 2026-10-20. The anon
// key (a valid JWT, so verify_jwt let it through) plus an invoice or quote id
// mailed that document to any address under any display name, and
// pdf_storage_path — downloaded with the service role — attached ANY file in
// project-documents. These pin the rule: servers or an active employee of the
// document's company; the company is the document's, not the body's; a person
// sends under the company's names and attaches only the company's files.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const invoiceFn = read('../../supabase/functions/send-invoice/index.ts')
const estimateFn = read('../../supabase/functions/send-estimate/index.ts')

const URL_ = 'https://proj.supabase.co'
const RUNTIME_KEY = 'sb_secret_runtime_key'
const INTERNAL = 'internal-secret'
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const jwt = (payload) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`

const ANON = jwt({ role: 'anon', iss: 'supabase' })
const LEGACY_SERVICE = jwt({ role: 'service_role', iss: 'supabase' })
const REP = jwt({ role: 'authenticated', email: 'rep@demo.test' })          // company 25 only
const TWO_CO = jwt({ role: 'authenticated', email: 'both@demo.test' })      // 25, and active in 3
const DEV = jwt({ role: 'authenticated', email: 'dev@platform.test' })      // developer, company 1
const FORGED_REP = jwt({ role: 'authenticated', email: 'rep@demo.test', forged: true })

// Documents: invoice 501 / quote 601 are company 25's, invoice 502 / quote 602 company 3's.
const DOCS = {
  invoices: { 501: { company_id: 25, business_unit: 'Summit Windows' }, 502: { company_id: 3, business_unit: 'Energy Scout' } },
  quotes: { 601: { company_id: 25, business_unit: null }, 602: { company_id: 3, business_unit: 'Energy Scout' } },
}
// Primary rows (what resolveCaller reads) and every active membership.
const PRIMARY = {
  'rep@demo.test': { id: 7, company_id: 25, user_role: 'User' },
  'both@demo.test': { id: 8, company_id: 25, user_role: 'Manager' },
  'dev@platform.test': { id: 9, company_id: 1, user_role: 'User', is_developer: true },
}
const MEMBER = { 'rep@demo.test': [25], 'both@demo.test': [25, 3], 'dev@platform.test': [1] }

function fakeSupabase() {
  return vi.fn(async (url, init = {}) => {
    const h = init.headers || {}
    const bearer = String(h.Authorization || '').replace(/^Bearer\s+/, '')
    const u = decodeURIComponent(url)
    if (u.includes('/rest/v1/companies?select=id') && init.method === 'HEAD') {
      return new Response(null, { status: bearer === LEGACY_SERVICE ? 200 : 401 })
    }
    if (u.endsWith('/auth/v1/user')) {
      return new Response('{}', { status: [REP, TWO_CO, DEV].includes(bearer) ? 200 : 401 })
    }
    if (u.includes('/rest/v1/rpc/project_doc_company')) {
      const p = JSON.parse(init.body).p_name
      const m = p.match(/^(?:invoices|estimates)\/(\d+)\/[^/]+$/)
      return new Response(JSON.stringify(m ? Number(m[1]) : null), { status: 200 })
    }
    const email = (u.match(/email=ilike\.([^&]+)/) || [])[1]
    if (u.includes('/rest/v1/employees?select=id,company_id')) {
      return new Response(JSON.stringify(PRIMARY[email] ? [PRIMARY[email]] : []), { status: 200 })
    }
    if (u.includes('/rest/v1/employees?select=id&')) {
      const co = Number((u.match(/company_id=eq\.(\d+)/) || [])[1])
      return new Response(JSON.stringify((MEMBER[email] || []).includes(co) ? [{ id: 1 }] : []), { status: 200 })
    }
    const doc = u.match(/\/rest\/v1\/(invoices|quotes)\?select=company_id,business_unit&id=eq\.(\d+)/)
    if (doc) {
      const row = DOCS[doc[1]][doc[2]]
      return new Response(JSON.stringify(row ? [row] : []), { status: 200 })
    }
    if (u.includes('/rest/v1/companies?select=company_name')) {
      const co = Number((u.match(/id=eq\.(\d+)/) || [])[1])
      return new Response(JSON.stringify([{ company_name: co === 3 ? 'HHH Services, LLC' : 'Summit Field Co' }]), { status: 200 })
    }
    if (u.includes('key=eq.business_units')) {
      const co = Number((u.match(/company_id=eq\.(\d+)/) || [])[1])
      const units = co === 3 ? [{ name: 'Energy Scout' }] : [{ name: 'Summit Lighting' }]
      return new Response(JSON.stringify([{ value: JSON.stringify(units) }]), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  })
}

const req = (bearer, extra = {}) =>
  new Request(`${URL_}/functions/v1/send-invoice`, {
    method: 'POST', headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...extra },
  })
const env = { supabaseUrl: URL_, serviceKey: RUNTIME_KEY, internalKey: INTERNAL }
const inv = (id) => ({ table: 'invoices', id })
const est = (id) => ({ table: 'quotes', id })

describe('send-invoice / send-estimate: who may send which document', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => { globalThis.fetch = fakeSupabase() })
  afterEach(() => { globalThis.fetch = realFetch })

  it('refuses the anon key with 401 for an invoice and an estimate — the hole this closes', async () => {
    for (const d of [inv(502), est(602), inv(undefined)]) {
      expect(await authorizeDocumentSend(req(ANON), env, d)).toEqual({ ok: false, status: 401, error: expect.any(String) })
    }
  })

  it('refuses no token and a forged employee token', async () => {
    for (const t of [null, FORGED_REP]) expect((await authorizeDocumentSend(req(t), env, inv(501))).ok).toBe(false)
  })

  it("refuses an employee another company's invoice or estimate with 403", async () => {
    expect(await authorizeDocumentSend(req(REP), env, inv(502))).toEqual({ ok: false, status: 403, error: expect.stringMatching(/another company/) })
    expect((await authorizeDocumentSend(req(REP), env, est(602))).status).toBe(403)
  })

  it("lets an employee send their own company's document, under the company's names", async () => {
    const r = await authorizeDocumentSend(req(REP), env, inv(501))
    expect(r).toMatchObject({ ok: true, kind: 'employee', companyId: 25 })
    // company, its units, and the invoice's own business unit
    expect(r.names).toEqual(['Summit Field Co', 'Summit Lighting', 'Summit Windows'])
    expect(await authorizeDocumentSend(req(REP), env, est(601))).toMatchObject({ ok: true, companyId: 25 })
  })

  it('lets a person who is an active employee of two companies send for either', async () => {
    expect(await authorizeDocumentSend(req(TWO_CO), env, inv(502))).toMatchObject({ ok: true, kind: 'employee', companyId: 3 })
    expect(await authorizeDocumentSend(req(TWO_CO), env, est(601))).toMatchObject({ ok: true, companyId: 25 })
  })

  it('lets a developer (level 5) act for any company', async () => {
    expect(await authorizeDocumentSend(req(DEV), env, inv(502))).toMatchObject({ ok: true, kind: 'employee', companyId: 3 })
  })

  it("lets our servers send, and the company is the document's — not the body's", async () => {
    expect(await authorizeDocumentSend(req(RUNTIME_KEY), env, est(602))).toEqual({ ok: true, kind: 'service', companyId: 3, caller: null, names: null })
    expect(await authorizeDocumentSend(req(LEGACY_SERVICE), env, inv(501))).toMatchObject({ ok: true, kind: 'service', companyId: 25 })
    expect(await authorizeDocumentSend(req(ANON, { 'x-arnie-internal': INTERNAL }), env, inv(502))).toMatchObject({ ok: true, kind: 'service', companyId: 3 })
  })

  it('answers a missing document 404 and a missing id 400', async () => {
    expect((await authorizeDocumentSend(req(REP), env, inv(999))).status).toBe(404)
    expect((await authorizeDocumentSend(req(REP), env, est('abc'))).status).toBe(400)
  })

  it("attaches only the document company's own files for a person; servers as before", async () => {
    const mine = await authorizeDocumentSend(req(REP), env, inv(501))
    expect(await mayAttachPath(mine, 'invoices/25/INV-1062_1792452279681.pdf', URL_, RUNTIME_KEY)).toBe(true)
    expect(await mayAttachPath(mine, 'invoices/3/INV-1036_1792436052010.pdf', URL_, RUNTIME_KEY)).toBe(false)
    expect(await mayAttachPath(mine, 'paystubs/3/2026-10-17/stub.pdf', URL_, RUNTIME_KEY)).toBe(false)
    expect(await mayAttachPath(mine, undefined, URL_, RUNTIME_KEY)).toBe(true)
    const server = await authorizeDocumentSend(req(RUNTIME_KEY), env, inv(501))
    expect(await mayAttachPath(server, 'paystubs/3/2026-10-17/stub.pdf', URL_, RUNTIME_KEY)).toBe(true)
  })
})

describe('the display name a person may send a document under', () => {
  const names = ['HHH Services, LLC', 'Energy Scout']
  it('keeps the company, a business unit or JobScout, in any case', () => {
    expect(senderName('Energy Scout', names)).toBe('Energy Scout')
    expect(senderName('hhh services, llc', names)).toBe('HHH Services, LLC')
    expect(senderName('JobScout', names)).toBe('JobScout')
  })
  it('replaces anything else with the company name', () => {
    expect(senderName('Wells Fargo Security', names)).toBe('HHH Services, LLC')
    expect(senderName('Our Company', names)).toBe('HHH Services, LLC')
    expect(senderName('Anyone', [])).toBe('JobScout')
  })
  it("is the same rule send-email's from uses", () => {
    expect(restrictFrom('Wells Fargo Security <invoices@appsannex.com>', names)).toBe(`${senderName('Wells Fargo Security', names)} <invoices@appsannex.com>`)
  })
})

describe('both functions are wired to the rule', () => {
  for (const [name, src, table] of [['send-invoice', invoiceFn, 'invoices'], ['send-estimate', estimateFn, 'quotes']]) {
    it(`${name}: authorizes before it downloads a PDF, reads settings or touches Resend`, () => {
      const at = src.indexOf('await authorizeDocumentSend(req')
      expect(at).toBeGreaterThan(-1)
      expect(src.slice(at, at + 300)).toContain(`table: '${table}'`)
      expect(at).toBeLessThan(src.indexOf(".from('project-documents')"))
      expect(at).toBeLessThan(src.indexOf(".from('settings')"))
      expect(at).toBeLessThan(src.indexOf('api.resend.com'))
      expect(src).toMatch(/if \(!send\.ok\) \{[\s\S]{0,200}status: send\.status/)
    })
    it(`${name}: checks the PDF path before the download`, () => {
      const chk = src.indexOf('await mayAttachPath(send, pdf_storage_path')
      expect(chk).toBeGreaterThan(-1)
      expect(chk).toBeLessThan(src.indexOf(".from('project-documents')"))
    })
    it(`${name}: a person's display name goes through senderName`, () => {
      expect(src).toMatch(/const displayName = send\.kind === 'employee' \? senderName\(askedName, send\.names\) : askedName;/)
    })
    it(`${name}: no read is scoped by the body's company_id`, () => {
      expect(src).not.toMatch(/\.eq\('company_id', _?company_id\)/)
    })
  }

  it('no browser caller sends the bare anon key as the bearer', () => {
    for (const [p, slug] of [['lib/invoiceSend.js', 'send-invoice'], ['pages/EstimateDetail.jsx', 'send-estimate']]) {
      const src = read(`../${p}`)
      const i = src.indexOf(`/functions/v1/${slug}`)
      const call = src.slice(i, i + 300)
      expect(call, p).toMatch(/Bearer \$\{userToken\}/)
      expect(call, p).not.toMatch(/Bearer \$\{ANON_KEY\}/)
      expect(src.slice(Math.max(0, i - 700), i), p).toMatch(/refreshSession\(\)/)
    }
  })
})

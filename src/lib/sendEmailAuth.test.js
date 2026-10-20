import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Buffer } from 'node:buffer'
import {
  authorizeEmailCaller, restrictFrom, businessUnitNames, companySenderNames,
} from '../../supabase/functions/_shared/emailSender.ts'

// send-email was an open relay until 2026-10-20: the gateway's verify_jwt only
// checks "is this a JWT", and the public anon key is one, so anyone holding the
// browser bundle could send any HTML under any display name from appsannex.com.
// These pin who may send (servers, active employees — never anon) and as whom
// (a signed-in person sends as their own company, from one of our mailboxes).

const here = dirname(fileURLToPath(import.meta.url))
const fnSrc = readFileSync(resolve(here, '../../supabase/functions/send-email/index.ts'), 'utf8')

const URL_ = 'https://proj.supabase.co'
const RUNTIME_KEY = 'sb_secret_runtime_key'
const INTERNAL = 'internal-secret'
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
const jwt = (payload) => `${b64url({ alg: 'HS256' })}.${b64url(payload)}.sig`

const ANON = jwt({ role: 'anon', iss: 'supabase' })
const LEGACY_SERVICE = jwt({ role: 'service_role', iss: 'supabase' })
const FORGED_SERVICE = jwt({ role: 'service_role', iss: 'attacker' })
const EMPLOYEE = jwt({ role: 'authenticated', email: 'rep@demo.test' })
const LEAVER = jwt({ role: 'authenticated', email: 'gone@demo.test' })
const FORGED_EMPLOYEE = jwt({ role: 'authenticated', email: 'rep@demo.test', forged: true })

// A fake Supabase: PostgREST accepts only the genuine legacy service JWT; Auth
// accepts only real sessions; employees has one active row.
function fakeSupabase() {
  return vi.fn(async (url, init = {}) => {
    const h = init.headers || {}
    const bearer = String(h.Authorization || '').replace(/^Bearer\s+/, '')
    if (url.includes('/rest/v1/companies?select=id') && init.method === 'HEAD') {
      return new Response(null, { status: bearer === LEGACY_SERVICE ? 200 : 401 })
    }
    if (url.endsWith('/auth/v1/user')) {
      return new Response('{}', { status: [EMPLOYEE, LEAVER].includes(bearer) ? 200 : 401 })
    }
    if (url.includes('/rest/v1/employees')) {
      const rows = url.includes(encodeURIComponent('rep@demo.test'))
        ? [{ id: 7, company_id: 25, user_role: 'User' }] : []
      return new Response(JSON.stringify(rows), { status: 200 })
    }
    if (url.includes('/rest/v1/companies?select=company_name')) {
      return new Response(JSON.stringify([{ company_name: 'Summit Field Co' }]), { status: 200 })
    }
    if (url.includes('key=eq.business_units')) {
      return new Response(JSON.stringify([{ value: JSON.stringify([{ name: 'Summit Lighting' }, 'Summit HVAC']) }]), { status: 200 })
    }
    return new Response('not found', { status: 404 })
  })
}

const req = (bearer, extra = {}) =>
  new Request(`${URL_}/functions/v1/send-email`, {
    method: 'POST', headers: { ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}), ...extra },
  })
const env = { supabaseUrl: URL_, serviceKey: RUNTIME_KEY, internalKey: INTERNAL }

describe('send-email: who may send', () => {
  const realFetch = globalThis.fetch
  beforeEach(() => { globalThis.fetch = fakeSupabase() })
  afterEach(() => { globalThis.fetch = realFetch })

  it('refuses the anon key with 401 — the hole this closes', async () => {
    expect(await authorizeEmailCaller(req(ANON), env)).toEqual({ ok: false, status: 401, error: expect.any(String) })
  })

  it('refuses no token, a forged service_role claim, a forged employee token and a leaver', async () => {
    for (const t of [null, FORGED_SERVICE, FORGED_EMPLOYEE, LEAVER]) {
      const r = await authorizeEmailCaller(req(t), env)
      expect(r.ok, `token ${t}`).toBe(false)
    }
  })

  it('refuses a wrong x-arnie-internal, and an internal header when no key is configured', async () => {
    expect((await authorizeEmailCaller(req(ANON, { 'x-arnie-internal': 'guess' }), env)).ok).toBe(false)
    expect((await authorizeEmailCaller(req(ANON, { 'x-arnie-internal': '' }), { ...env, internalKey: '' })).ok).toBe(false)
  })

  it('accepts another edge function (the runtime service key)', async () => {
    expect(await authorizeEmailCaller(req(RUNTIME_KEY), env)).toEqual({ ok: true, kind: 'service' })
  })

  it('accepts a Vercel cron or script (the legacy service JWT, which is a DIFFERENT string)', async () => {
    expect(await authorizeEmailCaller(req(LEGACY_SERVICE), env)).toEqual({ ok: true, kind: 'service' })
  })

  it('accepts a valid x-arnie-internal whatever the bearer', async () => {
    expect(await authorizeEmailCaller(req(ANON, { 'x-arnie-internal': INTERNAL }), env)).toEqual({ ok: true, kind: 'service' })
  })

  it('accepts a signed-in active employee, with their company', async () => {
    const r = await authorizeEmailCaller(req(EMPLOYEE), env)
    expect(r.ok && r.kind).toBe('employee')
    expect(r.caller.companyId).toBe(25)
  })

  it("reads the company's sending names: company first, then business units", async () => {
    expect(await companySenderNames(25, URL_, RUNTIME_KEY)).toEqual(['Summit Field Co', 'Summit Lighting', 'Summit HVAC'])
  })
})

describe('send-email: as whom a signed-in person may send', () => {
  const names = ['HHH Services, LLC', 'HHH Building Services']

  it('keeps what the app already sends', () => {
    expect(restrictFrom('HHH Services, LLC <invoices@appsannex.com>', names)).toBe('HHH Services, LLC <invoices@appsannex.com>')
    expect(restrictFrom('HHH Building Services <invoices@appsannex.com>', names)).toBe('HHH Building Services <invoices@appsannex.com>')
    expect(restrictFrom('HHH Services, LLC <payroll@appsannex.com>', names)).toBe('HHH Services, LLC <payroll@appsannex.com>')
    expect(restrictFrom('JobScout <invoices@appsannex.com>', names)).toBe('JobScout <invoices@appsannex.com>')
  })

  it('leaves an empty from empty, so the JobScout default applies', () => {
    expect(restrictFrom('', names)).toBe('')
    expect(restrictFrom(undefined, names)).toBe('')
  })

  it('replaces a forged display name with the company name', () => {
    expect(restrictFrom('Wells Fargo Security <invoices@appsannex.com>', names)).toBe('HHH Services, LLC <invoices@appsannex.com>')
  })

  it('replaces a foreign domain or an unknown mailbox with invoices@appsannex.com', () => {
    expect(restrictFrom('HHH Services, LLC <ceo@hhh.services>', names)).toBe('HHH Services, LLC <invoices@appsannex.com>')
    expect(restrictFrom('HHH Services, LLC <bryce@appsannex.com>', names)).toBe('HHH Services, LLC <invoices@appsannex.com>')
    expect(restrictFrom('attacker@evil.example', names)).toBe('HHH Services, LLC <invoices@appsannex.com>')
  })

  it('falls back to JobScout when the company has no name on file', () => {
    expect(restrictFrom('Anybody <invoices@appsannex.com>', [])).toBe('JobScout <invoices@appsannex.com>')
  })

  it('reads business units stored either way', () => {
    expect(businessUnitNames('["Commercial","Residential"]')).toEqual(['Commercial', 'Residential'])
    expect(businessUnitNames([{ name: 'HHH Building Services' }])).toEqual(['HHH Building Services'])
    expect(businessUnitNames('not json')).toEqual([])
  })
})

describe('send-email/index.ts is wired to the rule', () => {
  it('authorizes before it reads the body or touches Resend', () => {
    const authAt = fnSrc.indexOf('authorizeEmailCaller(req')
    expect(authAt).toBeGreaterThan(-1)
    expect(authAt).toBeLessThan(fnSrc.indexOf('await req.json()'))
    expect(authAt).toBeLessThan(fnSrc.indexOf('api.resend.com'))
  })

  it('answers a refused caller with its 401 status, not the usual 200', () => {
    expect(fnSrc).toMatch(/if \(!auth\.ok\)[\s\S]{0,200}return json\(\{ success: false, error: auth\.error \}, auth\.status\)/)
  })

  it('passes the internal key, and restricts from only for employees', () => {
    expect(fnSrc).toMatch(/internalKey:\s*Deno\.env\.get\('ARNIE_INTERNAL_KEY'\)/)
    expect(fnSrc).toMatch(/if \(auth\.kind === 'employee'\)[\s\S]{0,300}restrictFrom\(/)
  })

  it('no browser page calls send-email with the bare anon key as the bearer', () => {
    for (const p of ['pages/JobDetail.jsx', 'pages/PurchaseOrderDetail.jsx']) {
      const src = readFileSync(resolve(here, '..', p), 'utf8')
      const call = src.slice(src.indexOf('/functions/v1/send-email'), src.indexOf('/functions/v1/send-email') + 300)
      expect(call, p).toMatch(/Bearer \$\{userToken\}/)
      expect(call, p).not.toMatch(/Bearer \$\{ANON_KEY\}/)
    }
  })
})

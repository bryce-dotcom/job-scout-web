// HHH's SMS campaign was rejected (Twilio 30882 terms, 30908 privacy policy
// "can not be verified", 2026-10-16): the pages it pointed at were React
// routes — a carrier's crawler got an empty shell. These are server-rendered.
import { describe, it, expect, vi } from 'vitest'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const handler = require('../../api/legal.js')
const run = (query) => new Promise((resolve) => {
  const res = { code: 200, headers: {}, status(c) { this.code = c; return this }, setHeader(k, v) { this.headers[k] = v; return this }, send(b) { resolve({ code: this.code, body: String(b), headers: this.headers }); return this } }
  handler({ query }, res)
})

describe('a carrier can read the privacy policy and SMS terms without JavaScript', () => {
  vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co')
  vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
  globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ company_name: 'HHH Services, LLC', legal_name: 'HHH Services LLC', phone: '(801) 999-8430', website: 'https://hhh.services/' }) }))

  it('privacy: real HTML with the company named and the carrier language on mobile data', async () => {
    const r = await run({ slug: 'hhh-services-llc', doc: 'privacy' })
    expect(r.code).toBe(200)
    expect(r.headers['Content-Type']).toMatch(/text\/html/)
    expect(r.body).toMatch(/<h1>Privacy Policy<\/h1>/)
    expect(r.body).toMatch(/HHH Services, LLC/)
    expect(r.body).toMatch(/No mobile information will be shared with third parties or affiliates for marketing or promotional purposes/)
    expect(r.body).toMatch(/text-messaging originator opt-in data and consent: this information will not be shared with any third parties/)
    expect(r.body).not.toMatch(/lighting/i)   // nothing tenant-specific is hard-coded
  })
  it('sms-terms: program, opt-in, frequency, rates, STOP/HELP, carriers, privacy link', async () => {
    const r = await run({ slug: 'hhh-services-llc', doc: 'sms-terms' })
    for (const w of ['HHH Services, LLC Notifications', 'How you opt in', 'Message frequency varies', 'data rates may apply', 'STOP', 'HELP', 'Carriers are not liable', '/legal/hhh-services-llc/privacy'])
      expect(r.body, w).toContain(w)
  })
  it('company values are escaped, unknown documents 404', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ company_name: '<script>x</script>' }) }))
    expect((await run({ slug: 'a', doc: 'privacy' })).body).not.toMatch(/<script>x/)
    expect((await run({ slug: 'a', doc: 'secrets' })).code).toBe(404)
  })
  it('routed before the app catch-all', () => {
    const v = require('../../vercel.json')
    expect(v.rewrites[0]).toEqual({ source: '/legal/:slug/:doc', destination: '/api/legal?slug=:slug&doc=:doc' })
  })
})

describe('the text sign-up page — a call to action a carrier can verify (2026-10-21, Twilio 30909)', () => {
  const runAs = (query, method = 'GET', body) => new Promise((resolve) => {
    const res = { code: 200, headers: {}, status(c) { this.code = c; return this }, setHeader(k, v) { this.headers[k] = v; return this }, send(b) { resolve({ code: this.code, body: String(b), headers: this.headers }); return this } }
    handler({ query, method, body, headers: { 'x-forwarded-for': '1.2.3.4', 'user-agent': 'test' } }, res)
  })
  it('renders without JavaScript: the company, an UNTICKED box, the registered sentence, terms and privacy', async () => {
    vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co'); vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon')
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ company_name: 'HHH Services, LLC', phone: '(801) 999-8430' }) }))
    const r = await runAs({ slug: 'hhh-services-llc', doc: 'text-signup' })
    expect(r.code).toBe(200)
    expect(r.body).toMatch(/<h1>Get text updates from HHH Services, LLC<\/h1>/)
    expect(r.body).toMatch(/<form method="post" action="\/legal\/hhh-services-llc\/text-signup"/)
    expect(r.body).toMatch(/<input type="checkbox" name="agree" value="yes"/)
    expect(r.body).not.toMatch(/checked/)
    expect(r.body).toContain('HHH Services, LLC may text me about my estimates, appointments, jobs and invoices. Message frequency varies, and message and data rates may apply. Reply STOP to stop, HELP for help.')
    expect(r.body).toContain('/legal/hhh-services-llc/sms-terms')
    expect(r.body).toContain('/legal/hhh-services-llc/privacy')
    expect(r.body).not.toMatch(/<script/)
  })
  it('a post without the box ticked is refused; a ticked one is kept with the sentence agreed to', async () => {
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'svc')
    const inserted = []
    globalThis.fetch = vi.fn(async (url, init = {}) => {
      const u = String(url)
      if (u.includes('public-company-card')) return { ok: true, json: async () => ({ company_name: 'HHH Services, LLC' }) }
      if (u.includes('/rest/v1/companies')) return { ok: true, json: async () => ([{ id: 3, company_name: 'HHH Services, LLC' }]) }
      if (u.includes('/rest/v1/sms_opt_ins') && init.method === 'POST') { inserted.push(JSON.parse(init.body)); return { ok: true, json: async () => ([]) } }
      return { ok: true, json: async () => ([]) }
    })
    const no = await runAs({ slug: 'hhh-services-llc', doc: 'text-signup' }, 'POST', { phone: '801-555-0100' })
    expect(no.code).toBe(400)
    expect(no.body).toMatch(/Tick the box/)
    expect(inserted).toEqual([])
    const yes = await runAs({ slug: 'hhh-services-llc', doc: 'text-signup' }, 'POST', { phone: '(801) 555-0100', name: 'Sam', agree: 'yes' })
    expect(yes.body).toMatch(/You're signed up/)
    expect(inserted[0]).toMatchObject({ company_id: 3, phone: '8015550100', source: 'web_form', ip: '1.2.3.4' })
    expect(inserted[0].disclosure).toMatch(/^HHH Services, LLC may text me/)
  })
  it('only real US mobile numbers', () => {
    expect(handler.usMobile('1 (801) 555-0100')).toBe('8015550100')
    expect(handler.usMobile('555-0100')).toBeNull()
    expect(handler.usMobile('0015550100')).toBeNull()
  })
  it('the terms say how people opt in, and link the sign-up page', async () => {
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ company_name: 'HHH Services, LLC' }) }))
    const r = await runAs({ slug: 'hhh-services-llc', doc: 'sms-terms' })
    expect(r.body).toContain('/legal/hhh-services-llc/text-signup')
    expect(r.body).toMatch(/never ticked for them/)
  })
})

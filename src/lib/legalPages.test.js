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

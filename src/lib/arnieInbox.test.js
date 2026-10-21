// Christopher's email (2026-10-13): checks at 7, 12 and 4, a recap at 5, and a
// lead's email turned into a lead and an appointment — all on cards. Arnie
// promised it with no way to read his mail. The mail now comes to a private
// inbox+<token>@ address, filed against him, never answered.
import { describe, it, expect, afterEach, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { inboxTokenIn, gmailForwardingCode, nextOpening } from '../../supabase/functions/_shared/arnieInbox.ts'
import { prepareBooking } from '../../supabase/functions/_shared/arnieBooking.ts'
import { prepareEmailReply, rollbackEmailReply } from '../../supabase/functions/_shared/arnieEmailReply.ts'
const createSrc = readFileSync(new URL('../../supabase/functions/_shared/arnieCreate.ts', import.meta.url), 'utf8')
import { isNextOpening } from '../../supabase/functions/_shared/arnieAppointment.ts'

const R = { url: 'https://proj.supabase.co', key: 'svc' }
const CHRIS = { email: 'christopher@hhh.services', companyId: 3, employeeId: 14, role: 'manager', level: 2 }
const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

function fakeDb(db) {
  return vi.fn(async (url, init = {}) => {
    const u = decodeURIComponent(String(url))
    const m = u.match(/\/rest\/v1\/([a-z_]+)(?:\?(.*))?$/)
    if (!m) return new Response('[]', { status: 200 })
    const [, table, qs = ''] = m
    if (init.method && init.method !== 'GET') return new Response('[]', { status: 201 })
    let rows = db[table] || []
    for (const k of ['id', 'employee_id', 'company_id']) {
      const v = (qs.match(new RegExp(`(?:^|&)${k}=eq\\.([^&]+)`)) || [])[1]
      if (v != null) rows = rows.filter((r) => r[k] == null || String(r[k]) === v)
    }
    const or = qs.match(/or=\(([^)]*)\)/)
    if (or && /ilike/.test(or[1])) {
      const terms = [...or[1].matchAll(/([a-z_]+)\.ilike\.\*?([^*,]+)\*?/g)]
      rows = rows.filter((r) => terms.some(([, col, t]) => String(r[col] ?? '').toLowerCase().includes(t.toLowerCase())))
    }
    return new Response(JSON.stringify(rows), { status: 200 })
  })
}
const realFetch = globalThis.fetch
afterEach(() => { globalThis.fetch = realFetch })

describe('which inbox a forwarded email belongs to', () => {
  it('Gmail keeps the original To — the token is found in the forwarding headers', () => {
    expect(inboxTokenIn(['christopher@hhh.services'], { 'X-Forwarded-To': 'inbox+abc123def456ghi@appsannex.com' })).toBe('abc123def456ghi')
    expect(inboxTokenIn(['inbox+abc123def456ghi@appsannex.com'])).toBe('abc123def456ghi')
    expect(inboxTokenIn(['christopher@hhh.services'], { 'Delivered-To': ['inbox+abc123def456ghi@appsannex.com'] })).toBe('abc123def456ghi')
  })
  it('anything else is not an inbox', () => {
    expect(inboxTokenIn(['arnie@appsannex.com'], {})).toBeNull()
    expect(inboxTokenIn(['inbox+short@appsannex.com'], {})).toBeNull()
  })
  it('reads Gmail\'s forwarding confirmation code, from Google only', () => {
    expect(gmailForwardingCode('forwarding-noreply@google.com', '(#839201745) Gmail Forwarding Confirmation - Receive Mail from christopher@hhh.services')).toBe('839201745')
    expect(gmailForwardingCode('someone@else.com', '(#839201745) Gmail Forwarding Confirmation')).toBeNull()
  })
  it('the inbox branch files before the auto-reply filter and never answers', () => {
    const e = read('supabase/functions/inbound-email/index.ts')
    const branch = e.slice(e.indexOf('const inboxToken = inboxTokenIn('), e.indexOf("if (kindEarly === 'arnie')"))
    expect(e.indexOf('const inboxToken = inboxTokenIn(')).toBeLessThan(e.indexOf("kindEarly !== 'bids' && isAutoReply(mail.subject"))
    expect(branch).toMatch(/await fileInboxMail\(/)
    expect(branch).not.toMatch(/send-email|arnieByEmail/)
  })
})

describe('next opening — their first free hour tomorrow, 8 to 5', () => {
  it('skips the hours they are booked', async () => {
    // Tue 2026-10-20, 10am Denver. Tomorrow (Wed 21st) is booked 8:00–9:30.
    const now = new Date('2026-10-20T16:00:00Z')
    globalThis.fetch = fakeDb({ appointments: [{ start_time: '2026-10-21T14:00:00Z', end_time: '2026-10-21T15:30:00Z' }] })
    const slot = await nextOpening(R, 3, 14, 'America/Denver', { now })
    expect(slot.day).toBe('2026-10-21')
    expect(slot.start.toISOString()).toBe('2026-10-21T15:30:00.000Z')   // 9:30 MT
  })
  it('Sunday rolls to Monday', async () => {
    const now = new Date('2026-10-24T16:00:00Z') // Saturday
    globalThis.fetch = fakeDb({ appointments: [] })
    const slot = await nextOpening(R, 3, 14, 'America/Denver', { now })
    expect(slot.day).toBe('2026-10-26')
    expect(slot.start.toISOString()).toBe('2026-10-26T14:00:00.000Z')   // 8:00 MT
  })
  it('"next opening" is recognised however it is said', () => {
    for (const s of ['next opening', 'my next available', 'first free slot', 'next open']) expect(isNextOpening(s), s).toBe(true)
    for (const s of ['Thursday at 2', 'tomorrow 9am']) expect(isNextOpening(s), s).toBe(false)
  })
})

describe('booking from an email', () => {
  it('is registered with its own apply and undo', () => {
    expect(createSrc).toMatch(/prepare: prepareBooking,\s+applyCustom: applyBooking,\s+rollbackCustom: rollbackBooking,/)
  })
  it('a "new" lead whose email is already a lead is refused — book that one', async () => {
    globalThis.fetch = fakeDb({ leads: [{ id: 77, customer_name: 'Ana Rivera', business_name: 'Rivera Dental', email: 'ana@riveradental.com', company_id: 3 }] })
    const r = await prepareBooking(R, CHRIS, { customer_name: 'Ana Rivera', email: 'ana@riveradental.com' })
    expect(r.error).toMatch(/already a lead: Rivera Dental/)
  })
  it('the same person already on a waiting card is not drafted twice (the noon check after the 7am one)', async () => {
    globalThis.fetch = fakeDb({ leads: [], customers: [], arnie_proposals: [{ id: 2011, company_id: 3, payload: { columns: { new_lead: { email: 'sam@ortiz.com', phone: '801-555-0199' } } } }] })
    const r = await prepareBooking(R, CHRIS, { customer_name: 'Sam Ortiz', email: 'SAM@ortiz.com' })
    expect(r.error).toMatch(/already waiting for approval \(#2011\)/)
    expect(read('supabase/functions/_shared/arniePrompt.ts')).toMatch(/A drafted card IS the handling/)
  })
  it('a new lead goes under the person drafting it, at their next opening, with no setter fee', async () => {
    globalThis.fetch = fakeDb({ leads: [], customers: [], appointments: [], employees: [{ id: 14, name: 'Christopher Lyman' }] })
    const r = await prepareBooking(R, CHRIS, { customer_name: 'Sam Ortiz', business_name: 'Ortiz Dental', email: 'sam@ortiz.com', service_type: 'Window cleaning' })
    expect(r.ok).toBe(true)
    expect(r.columns.salesperson_id).toBe(14)
    expect(r.columns.new_lead).toMatchObject({ customer_name: 'Sam Ortiz', lead_source: 'Email' })
    expect(r.display.find((d) => d.label === 'When').value).toMatch(/next opening/)
    expect(read('supabase/functions/_shared/arnieBooking.ts')).toMatch(/setter_id: null/)
  })
})

describe('an email reply', () => {
  it('goes to the stored email\'s sender — the model never names the address', async () => {
    globalThis.fetch = fakeDb({
      arnie_inbox: [{ id: 5, employee_id: 14, company_id: 3, from_name: 'Sam Ortiz', from_email: 'sam@ortiz.com', subject: 'Window quote', bulk: false }],
      employees: [{ id: 14, name: 'Christopher Lyman', email: 'christopher@hhh.services' }],
    })
    const r = await prepareEmailReply(R, CHRIS, { inbox_email: '5', body: 'Thursday at 10 is taken — could you do 1pm or Friday at 9?' })
    expect(r.columns).toMatchObject({ to: 'sam@ortiz.com', subject: 'Re: Window quote', reply_to: 'christopher@hhh.services' })
    const fields = createSrc.slice(createSrc.indexOf('  email_reply: {'), createSrc.indexOf('prepare: prepareEmailReply'))
    expect(fields).not.toMatch(/\bto:\s*\{/)   // the address is never a field the model fills
    expect(fields).toMatch(/inbox_email: \{ column: null/)
  })
  it('not someone else\'s inbox, not automated mail', async () => {
    globalThis.fetch = fakeDb({ arnie_inbox: [{ id: 6, employee_id: 99, company_id: 3, from_email: 'x@y.com', bulk: false }] })
    expect((await prepareEmailReply(R, CHRIS, { inbox_email: '6', body: 'hello there' })).error).toMatch(/not in your inbox/)
    globalThis.fetch = fakeDb({ arnie_inbox: [{ id: 7, employee_id: 14, company_id: 3, from_email: 'news@shop.com', bulk: true }] })
    expect((await prepareEmailReply(R, CHRIS, { inbox_email: '7', body: 'hello there' })).error).toMatch(/automated/)
  })
  it('cannot be unsent', async () => {
    expect(await rollbackEmailReply()).toMatchObject({ ok: false })
  })
})

describe('Arnie\'s side', () => {
  const chat = read('supabase/functions/arnie-chat/index.ts')
  it('reads only the signed-in person\'s inbox', () => {
    expect(chat).toMatch(/const rows = await readInbox\(r, companyId, employeeId,/)
    expect(chat).toMatch(/offered\.push\(\.\.\.INBOX_TOOLS\)/)
  })
  it('he is told how to work it: search first, card for everything, mark it done', () => {
    const p = read('supabase/functions/_shared/arniePrompt.ts')
    expect(p).toMatch(/An existing LEAD → \\`appointment\\` card; an existing CUSTOMER → \\`booking\\` card/)
    expect(p).toMatch(/never decline/)
    expect(p).toMatch(/\\`inbox_done\\` on EVERY email you looked at/)
  })
})

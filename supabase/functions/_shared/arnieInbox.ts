// A person's inbox, forwarded to JobScout (see migration 20261021110000).
//
// Christopher asked Arnie to read his three inboxes at 7, 12 and 4 and recap
// at 5, and to turn a lead's email into a lead and an appointment. Arnie said
// yes and could do none of it: a routine runs on the server, and the only way
// onto someone's Gmail is their own signed-in session. So the mail comes here:
// inbox+<token>@appsannex.com, auto-forwarded from each of their inboxes, filed
// against them — NEVER answered (arnie@ answers; this address only files).
//
// What is filed is someone else's words. It reaches Arnie as data, and nothing
// in it can do more than suggest a card a person still has to approve.

import type { Rest } from './arnieConfig.ts'
import { readRecordList } from './arnieRest.ts'
import { localToUtc } from './arnieTime.ts'

const DOMAIN = () => (globalThis as any).Deno?.env?.get?.('INBOUND_EMAIL_DOMAIN') || 'appsannex.com'
const H = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })

/** The private address, from its token. */
export const inboxAddress = (token: string) => `inbox+${token}@${DOMAIN()}`

/** Their address — made the first time it is asked for. */
export async function inboxAddressFor(r: Rest, companyId: number, employeeId: number): Promise<string> {
  const [have] = await readRecordList(r, `arnie_inbox_addresses?select=token&employee_id=eq.${employeeId}&company_id=eq.${companyId}&limit=1`)
  if (have?.token) return inboxAddress(have.token)
  const bytes = crypto.getRandomValues(new Uint8Array(15))
  const token = Array.from(bytes, (b) => (b % 36).toString(36)).join('')
  const res = await fetch(`${r.url}/rest/v1/arnie_inbox_addresses`, {
    method: 'POST', headers: { ...H(r), Prefer: 'return=minimal' },
    body: JSON.stringify({ employee_id: employeeId, company_id: companyId, token }),
  })
  if (!res.ok) {
    // Two requests at once: the other one won; read it back.
    const [again] = await readRecordList(r, `arnie_inbox_addresses?select=token&employee_id=eq.${employeeId}&limit=1`)
    if (again?.token) return inboxAddress(again.token)
    throw new Error(`could not make an inbox address: ${res.status}`)
  }
  return inboxAddress(token)
}

/**
 * Which inbox this mail was forwarded to. Gmail's automatic forwarding keeps
 * the ORIGINAL To (christopher@hhh.services); the forwarding address only
 * shows in X-Forwarded-To / Delivered-To / the envelope. So every recipient
 * and every forwarding header is searched.
 */
export function inboxTokenIn(recipients: string[], headers: Record<string, unknown> = {}): string | null {
  const lower: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(headers || {})) lower[k.toLowerCase()] = v
  const pool = [
    ...recipients,
    ...['x-forwarded-to', 'delivered-to', 'x-original-to', 'x-forwarded-for', 'envelope-to', 'to', 'cc']
      .flatMap((k) => Array.isArray(lower[k]) ? lower[k] as unknown[] : [lower[k]]),
  ].map((x) => String(x ?? '').toLowerCase())
  for (const s of pool) {
    const m = s.match(/\binbox\+([a-z0-9]{12,64})@/)
    if (m) return m[1]
  }
  return null
}

/** Gmail's "confirm you want to forward" mail carries the code in the subject: "(#123456789) Gmail Forwarding Confirmation". */
export function gmailForwardingCode(from: string, subject: string): string | null {
  if (!/forwarding-noreply@google\.com/i.test(from)) return null
  return String(subject).match(/\(#(\d{6,12})\)/)?.[1] || null
}

const BULK_SUBJECT = /\b(unsubscribe|newsletter|webinar|% off|sale ends|digest|no-?reply|out of office|automatic reply|auto-?reply)\b/i

/** File one forwarded email against its person. Returns what happened, for the webhook log. */
export async function fileInboxMail(r: Rest, token: string, mail: {
  from: string; fromName?: string; to: string; subject: string; body: string; emailId?: string; autoReply?: boolean
}): Promise<{ filed: boolean; employee_id?: number; code?: string | null; reason?: string }> {
  const [addr] = await readRecordList(r, `arnie_inbox_addresses?select=employee_id,company_id&token=eq.${encodeURIComponent(token)}&limit=1`)
  if (!addr) return { filed: false, reason: 'unknown inbox address' }
  const [emp] = await readRecordList(r, `employees?select=id,active&id=eq.${addr.employee_id}&company_id=eq.${addr.company_id}&limit=1`)
  if (!emp || emp.active === false) return { filed: false, reason: 'that person is no longer active' }

  const code = gmailForwardingCode(mail.from, mail.subject)
  const res = await fetch(`${r.url}/rest/v1/arnie_inbox`, {
    method: 'POST', headers: { ...H(r), Prefer: 'return=minimal' },
    body: JSON.stringify({
      company_id: addr.company_id, employee_id: addr.employee_id,
      from_name: mail.fromName || null, from_email: mail.from || null, to_email: mail.to || null,
      subject: String(mail.subject || '').slice(0, 500), body: String(mail.body || '').slice(0, 12000),
      bulk: !!mail.autoReply || BULK_SUBJECT.test(String(mail.subject || '')) || !!code,
      email_id: mail.emailId || null,
    }),
  })
  // 23505 = the same email_id twice (a webhook retry): already filed, fine.
  if (!res.ok && !/23505/.test(await res.text())) return { filed: false, reason: `insert failed ${res.status}` }

  // Their email routines wait, switched off, until mail actually arrives —
  // four "nothing has arrived" messages a day would be noise. The first real
  // email turns on the ones that have never run (a routine they switched off
  // themselves has run, and stays off).
  if (!code) {
    await fetch(`${r.url}/rest/v1/arnie_routines?employee_id=eq.${addr.employee_id}&company_id=eq.${addr.company_id}&enabled=eq.false&last_run_on=is.null&name=like.Email*`, {
      method: 'PATCH', headers: { ...H(r), Prefer: 'return=minimal' }, body: JSON.stringify({ enabled: true }),
    }).catch(() => {})
  }

  // The forwarding has to be confirmed with a code Google mails to THIS
  // address — so put it where they will see it.
  if (code) {
    await fetch(`${r.url}/rest/v1/employee_notifications`, {
      method: 'POST', headers: { ...H(r), Prefer: 'return=minimal' },
      body: JSON.stringify({
        company_id: addr.company_id, employee_id: addr.employee_id, type: 'inbox_forwarding_code',
        title: `Gmail forwarding code: ${code}`,
        message: `Enter ${code} in Gmail (Settings → Forwarding and POP/IMAP) to finish forwarding ${mail.to || 'that inbox'} to Arnie.`,
        dedupe_key: `gmail-forward-${code}`,
      }),
    }).catch(() => {})
  }
  return { filed: true, employee_id: addr.employee_id, code }
}

/** Their inbox, newest first. */
export async function readInbox(r: Rest, companyId: number, employeeId: number, opts: { since?: string; unhandled?: boolean; includeBulk?: boolean; limit?: number } = {}) {
  const q = new URLSearchParams({
    select: 'id,received_at,from_name,from_email,to_email,subject,body,bulk,handled_at,handled_note',
    company_id: `eq.${companyId}`, employee_id: `eq.${employeeId}`, order: 'received_at.desc', limit: String(Math.min(opts.limit || 40, 100)),
  })
  if (opts.since) q.append('received_at', `gte.${opts.since}`)
  if (opts.unhandled) q.append('handled_at', 'is.null')
  if (!opts.includeBulk) q.append('bulk', 'eq.false')
  return await readRecordList(r, `arnie_inbox?${q}`)
}

/** Mark emails as looked at, with what was done — their own rows only. */
export async function markHandled(r: Rest, companyId: number, employeeId: number, ids: number[], note: string) {
  const clean = ids.map(Number).filter((n) => Number.isFinite(n) && n > 0)
  if (!clean.length) return 0
  const res = await fetch(`${r.url}/rest/v1/arnie_inbox?company_id=eq.${companyId}&employee_id=eq.${employeeId}&id=in.(${clean.join(',')})`, {
    method: 'PATCH', headers: { ...H(r), Prefer: 'return=representation' },
    body: JSON.stringify({ handled_at: new Date().toISOString(), handled_note: String(note || '').slice(0, 300) }),
  })
  return res.ok ? (await res.json()).length : 0
}

/**
 * Their next free hour on a day (default: tomorrow, their time), between 8 and
 * 5, from the appointments they are on — Lead Setter's and the calendar's are
 * the same table. Sunday rolls to Monday. "Default the time to my next
 * available opening the following day" (Christopher, 2026-10-13).
 */
export async function nextOpening(r: Rest, companyId: number, repId: number, tz: string, opts: { day?: string; minutes?: number; now?: Date } = {}): Promise<{ day: string; start: Date; end: Date } | null> {
  const minutes = opts.minutes || 60
  const now = opts.now || new Date()
  const localDay = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: tz })
  let day = opts.day || localDay(new Date(now.getTime() + 86400000))
  for (let tries = 0; tries < 7; tries++) {
    const weekday = new Date(`${day}T12:00:00Z`).getUTCDay()
    if (weekday !== 0) {
      const open = localToUtc(`${day} 08:00`, tz), close = localToUtc(`${day} 17:00`, tz)
      if (open && close) {
        const busy = await readRecordList(r,
          `appointments?select=start_time,end_time&company_id=eq.${companyId}&status=neq.Cancelled`
          + `&or=(salesperson_id.eq.${repId},salesperson_ids.cs.{${repId}})`
          + `&start_time=lt.${close.toISOString()}&end_time=gt.${open.toISOString()}&order=start_time&limit=200`)
        for (let t = open.getTime(); t + minutes * 60000 <= close.getTime(); t += 30 * 60000) {
          const s = t, e = t + minutes * 60000
          if (s < now.getTime()) continue
          const clash = busy.some((b: any) => Date.parse(b.start_time) < e && Date.parse(b.end_time) > s)
          if (!clash) return { day, start: new Date(s), end: new Date(e) }
        }
      }
    }
    day = new Date(Date.parse(`${day}T12:00:00Z`) + 86400000).toISOString().slice(0, 10)
  }
  return null
}

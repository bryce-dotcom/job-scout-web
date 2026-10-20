// Who may send mail through send-email, and as whom.
//
// Found 2026-10-20: send-email checked nobody. The gateway's verify_jwt only
// asks "is this a JWT?", and the public anon key — shipped in every browser
// bundle — is one. So anyone could send any HTML, under any display name, to
// any address, from appsannex.com: a phishing relay on our own domain.
//
// Two kinds of caller are ours:
//   • our servers — another edge function (the runtime service key), a Vercel
//     cron or script (the legacy service JWT; see isServiceCaller for why those
//     are different strings), or anything carrying x-arnie-internal.
//   • a signed-in person who is an ACTIVE employee — the submittal, PO and
//     payroll pages. Their token is checked with Auth, not just decoded.
// Everything else — the anon key, a stranger's token, a leaver — is refused.
//
// A signed-in person also cannot choose who the mail is FROM. Every sender in
// this app writes "<company or business unit> <mailbox@appsannex.com>"; that
// is the company's sending identity, so it is the only one a person may use.
// Servers are trusted with `from` as before (payroll, alerts, onboarding).

import { isServiceCaller, resolveCaller, type Caller } from './auth.ts'

export const SENDING_DOMAIN = 'appsannex.com'
/** Mailboxes a signed-in person may send from. The first is the fallback. */
export const USER_MAILBOXES = ['invoices', 'estimates', 'payroll']
export const DEFAULT_NAME = 'JobScout'

export type EmailCaller =
  | { ok: true; kind: 'service' }
  | { ok: true; kind: 'employee'; caller: Caller }
  | { ok: false; status: 401; error: string }

export async function authorizeEmailCaller(
  req: Request,
  env: { supabaseUrl: string; serviceKey: string; internalKey?: string | null },
): Promise<EmailCaller> {
  const internal = (env.internalKey || '').trim()
  const presented = (req.headers.get('x-arnie-internal') || '').trim()
  if (internal && presented === internal) return { ok: true, kind: 'service' }
  if (await isServiceCaller(req, env.supabaseUrl, env.serviceKey)) return { ok: true, kind: 'service' }
  // verify: true — the token's signature and session are checked by Auth, so
  // a hand-written JWT naming an employee's email is not that employee.
  const caller = await resolveCaller(req, env.supabaseUrl, env.serviceKey, { verify: true })
  if (caller?.companyId != null) return { ok: true, kind: 'employee', caller }
  return { ok: false, status: 401, error: 'Sign in to send email.' }
}

/** Same cleaning send-email applies to a display name before quoting it. */
const cleanName = (s: unknown) =>
  String(s ?? '').replace(/["\\]/g, '').replace(/[^\x20-\x7E]/g, '').trim()

/** Names from a stored business_units value — ["A", …] or [{ name }, …], as a string or parsed. */
export function businessUnitNames(value: unknown): string[] {
  let v = value
  if (typeof v === 'string') { try { v = JSON.parse(v) } catch { return [] } }
  if (!Array.isArray(v)) return []
  return v.map((b) => cleanName(typeof b === 'string' ? b : (b as { name?: unknown })?.name)).filter(Boolean)
}

/**
 * The `from` a signed-in person may use: a USER_MAILBOXES address at
 * SENDING_DOMAIN, under the company's name, one of its business units, or
 * JobScout. Anything else is rewritten, not refused — the mail still goes,
 * just as the company rather than as whoever the request claimed to be.
 * `names[0]` must be the company's own name. An empty `from` stays empty:
 * send-email's default (JobScout <invoices@appsannex.com>) is already ours.
 */
export function restrictFrom(from: unknown, names: string[]): string {
  const raw = String(from ?? '').trim()
  if (!raw) return ''
  const m = raw.match(/^(.*)<([^>]+)>\s*$/)
  const name = cleanName(m ? m[1] : '')
  const addr = (m ? m[2] : raw).trim().toLowerCase()
  const [local, domain] = addr.split('@')
  const mailbox = domain === SENDING_DOMAIN && USER_MAILBOXES.includes(local) ? local : USER_MAILBOXES[0]
  const allowed = [...names.map(cleanName), DEFAULT_NAME].filter(Boolean)
  const own = allowed.find((n) => n.toLowerCase() === name.toLowerCase())
  return `${own || allowed[0]} <${mailbox}@${SENDING_DOMAIN}>`
}

/** The company's name first, then its business units — the names restrictFrom accepts. */
export async function companySenderNames(companyId: number, supabaseUrl: string, serviceKey: string): Promise<string[]> {
  const H = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
  const get = async (path: string) => {
    try {
      const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: H })
      return r.ok ? await r.json() : []
    } catch { return [] }
  }
  const [co, bu] = await Promise.all([
    get(`companies?select=company_name&id=eq.${companyId}&limit=1`),
    get(`settings?select=value&company_id=eq.${companyId}&key=eq.business_units&limit=1`),
  ])
  const name = cleanName(co?.[0]?.company_name)
  return [name, ...businessUnitNames(bu?.[0]?.value)].filter(Boolean)
}

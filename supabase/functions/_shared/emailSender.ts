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
  const addr = (m ? m[2] : raw).trim().toLowerCase()
  const [local, domain] = addr.split('@')
  const mailbox = domain === SENDING_DOMAIN && USER_MAILBOXES.includes(local) ? local : USER_MAILBOXES[0]
  return `${senderName(m ? m[1] : '', names)} <${mailbox}@${SENDING_DOMAIN}>`
}

/**
 * The display name a signed-in person may send under: the one asked for when
 * it is the company's, one of its business units' or JobScout's (any case),
 * otherwise the company's own name (`names[0]`), otherwise JobScout.
 */
export function senderName(asked: unknown, names: string[]): string {
  const name = cleanName(asked)
  const allowed = [...names.map(cleanName), DEFAULT_NAME].filter(Boolean)
  const own = allowed.find((n) => n.toLowerCase() === name.toLowerCase())
  return own || allowed[0]
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

// ── send-invoice / send-estimate ─────────────────────────────────────────────
//
// Found the same day: both took the anon key, a recipient of the caller's
// choosing and a display name from the body, and neither looked the document
// up — so anyone could mail any tenant's invoice or estimate, under any name,
// and attach ANY file in project-documents (pdf_storage_path is downloaded
// with the service role: payroll stubs, tax filings) to an address of their
// choosing. The rule below is send-email's caller rule plus three more:
//   • the document is read from the DB, and its company is THE company — the
//     body's company_id no longer decides which company's gate or settings apply
//   • a signed-in person must work for that company (an active employee row
//     there); a developer (level 5) may act for any
//   • a signed-in person's display name is the company's, a business unit's
//     or the document's own business unit — never one the body made up — and
//     the PDF they attach must be a file that company owns.
// Servers keep sending exactly what they ask for.

export type DocumentTable = 'invoices' | 'quotes'

export type DocumentSend =
  | { ok: true; kind: 'service'; companyId: number; caller: null; names: null }
  | { ok: true; kind: 'employee'; companyId: number; caller: Caller; names: string[] }
  | { ok: false; status: 400 | 401 | 403 | 404; error: string }

const restGet = async (supabaseUrl: string, serviceKey: string, path: string) => {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/${path}`, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } })
    return r.ok ? await r.json() : null
  } catch { return null }
}

/** Does this signed-in person act for `companyId`? Their company, any company they are an active employee of, or any for a developer. */
export async function callerActsFor(caller: Caller, companyId: number, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  if (caller.companyId == null) return false
  if (caller.level >= 5) return true
  if (Number(caller.companyId) === Number(companyId)) return true
  const rows = await restGet(supabaseUrl, serviceKey,
    `employees?select=id&active=eq.true&company_id=eq.${Number(companyId)}&email=ilike.${encodeURIComponent(caller.email)}&limit=1`)
  return Array.isArray(rows) && rows.length > 0
}

/** The company that owns a project-documents path — public.project_doc_company, the same resolver storage RLS uses. Null when none does. */
export async function storagePathCompany(path: string, supabaseUrl: string, serviceKey: string): Promise<number | null> {
  try {
    const r = await fetch(`${supabaseUrl}/rest/v1/rpc/project_doc_company`, {
      method: 'POST',
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_name: String(path) }),
    })
    if (!r.ok) return null
    const v = await r.json()
    return v == null ? null : Number(v)
  } catch { return null }
}

/**
 * Who is sending this invoice (table 'invoices') or estimate ('quotes'), for
 * which company, and under which names. Call before anything is downloaded
 * or sent; answer a refusal with its status.
 */
export async function authorizeDocumentSend(
  req: Request,
  env: { supabaseUrl: string; serviceKey: string; internalKey?: string | null },
  doc: { table: DocumentTable; id: unknown },
): Promise<DocumentSend> {
  const auth = await authorizeEmailCaller(req, env)
  if (!auth.ok) return auth
  const id = Number(doc.id)
  if (!Number.isInteger(id) || id <= 0) return { ok: false, status: 400, error: 'A document id is required.' }
  const rows = await restGet(env.supabaseUrl, env.serviceKey, `${doc.table}?select=company_id,business_unit&id=eq.${id}&limit=1`)
  const row = Array.isArray(rows) ? rows[0] : null
  const word = doc.table === 'invoices' ? 'invoice' : 'estimate'
  if (!row || row.company_id == null) return { ok: false, status: 404, error: `That ${word} was not found.` }
  const companyId = Number(row.company_id)
  if (auth.kind === 'service') return { ok: true, kind: 'service', companyId, caller: null, names: null }
  if (!(await callerActsFor(auth.caller, companyId, env.supabaseUrl, env.serviceKey))) {
    return { ok: false, status: 403, error: `That ${word} belongs to another company.` }
  }
  const names = await companySenderNames(companyId, env.supabaseUrl, env.serviceKey)
  const own = cleanName(row.business_unit)
  if (own && !names.some((n) => n.toLowerCase() === own.toLowerCase())) names.push(own)
  return { ok: true, kind: 'employee', companyId, caller: auth.caller, names }
}

/** May this sender attach `path`? Servers may attach anything; a signed-in person only a file the document's company owns. */
export async function mayAttachPath(send: Extract<DocumentSend, { ok: true }>, path: unknown, supabaseUrl: string, serviceKey: string): Promise<boolean> {
  if (!path) return true
  if (send.kind === 'service') return true
  return (await storagePathCompany(String(path), supabaseUrl, serviceKey)) === send.companyId
}

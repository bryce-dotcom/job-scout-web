// Shared by the inbound-email receiver and its tests.
//
// Two things a webhook receiver has to get right before it reads a single
// field: was this request really sent by the provider, and can a person read
// what arrived. Both live here so the receiver stays about matching replies to
// estimates, and so the signature check can be tested against a known key
// without standing up the function.

import { normalizeEmail } from './inboundMatch.ts'

export type SvixHeaders = { id: string | null; timestamp: string | null; signature: string | null }
export type SvixVerdict = { ok: boolean; reason?: string }

// Five minutes either way. Wide enough for clock drift between Resend and
// Supabase, narrow enough that a captured request cannot be replayed later.
export const SVIX_TOLERANCE_SEC = 300

// Resend signs every webhook in the Svix format:
//   signed content  =  `${svix-id}.${svix-timestamp}.${raw body}`
//   signature       =  base64( HMAC-SHA256( base64decode(secret minus "whsec_"), signed content ) )
//   header          =  "v1,<sig>" — possibly several, space separated, during key rotation
// The raw body must be the exact bytes received; re-serialised JSON will not
// verify.
export async function verifySvixSignature(
  headers: SvixHeaders,
  rawBody: string,
  secret: string,
  nowMs: number = Date.now(),
): Promise<SvixVerdict> {
  const id = headers.id || ''
  const ts = headers.timestamp || ''
  const sigHeader = headers.signature || ''
  if (!id || !ts || !sigHeader) return { ok: false, reason: 'missing svix headers' }

  const age = Math.abs(nowMs / 1000 - Number(ts))
  if (!Number.isFinite(age) || age > SVIX_TOLERANCE_SEC) return { ok: false, reason: 'timestamp outside tolerance' }

  // Tolerant of how a secret actually arrives after a copy, a paste and a
  // shell: surrounding quotes, whitespace, a url-safe alphabet, missing
  // padding — and the prefix typed once and then pasted again, which is what
  // "whsec_PASTE_HERE" in a setup note produces. Both happened on 2026-09-11:
  // "secret is not base64" until the decoder bent, then "signature mismatch"
  // from the doubled prefix. The bytes are only ever what follows the prefix.
  const b64 = secret.trim().replace(/^["']|["']$/g, '').replace(/^(whsec_)+/i, '').replace(/\s+/g, '')
    .replace(/-/g, '+').replace(/_/g, '/')
  const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
  let raw: string
  try {
    raw = atob(padded)
  } catch {
    return { ok: false, reason: 'secret is not base64' }
  }
  const keyBytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) keyBytes[i] = raw.charCodeAt(i)
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${ts}.${rawBody}`))
  const expected = btoa(String.fromCharCode(...new Uint8Array(mac)))

  const presented = sigHeader.split(' ').map(s => s.split(',')[1] || '').filter(Boolean)
  const matches = presented.some(sig => sig.length === expected.length && timingSafeEqual(sig, expected))
  return matches ? { ok: true } : { ok: false, reason: 'signature mismatch' }
}

function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// Mail clients that send HTML only (Outlook does, when the reply is rich text)
// arrive with text=null. Enough of a conversion to read the reply; not a parser.
export function htmlToText(html: string): string {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// Mail that no person wrote. Out-of-office bounces and delivery reports are
// the bulk of what an inbound address receives once real customers are on it,
// and every one of them would otherwise land on an estimate as "the customer
// replied" — lighting up the pipeline card for a message that says "I am away
// until Monday". RFC 3834 headers first, then the subject lines the clients
// that ignore RFC 3834 use instead.
export function isAutoReply(subject: string | null | undefined, headers: Record<string, unknown> | null | undefined): boolean {
  const h: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers || {})) h[k.toLowerCase()] = String(v ?? '').toLowerCase()

  if (h['auto-submitted'] && h['auto-submitted'] !== 'no') return true
  if (h['x-auto-response-suppress']) return true
  if (h['x-autoreply'] || h['x-autorespond'] || h['x-autoresponder']) return true
  if (/^(bulk|auto_reply|junk|list)$/.test(h['precedence'] || '')) return true
  if ((h['content-type'] || '').startsWith('multipart/report')) return true

  const s = String(subject || '').trim()
  return /^(re:\s*)?(automatic reply|auto(matic)?[ -]?reply|auto:|autoreply|out of (the )?office|ooo:|undeliverable|delivery (status notification|failure|has failed)|mail delivery (failed|failure|subsystem)|returned mail|failure notice)/i.test(s)
}

// Which of our addresses the mail was sent to decides what may be done with it.
//   token      reply+<signed>@…   — names the estimate; the only fully trusted route
//   estimates  estimates@…        — where estimate emails come FROM; a reply here
//                                   may be matched to the sender's estimate
//   other      invoices@, receipts@, noreply@, anything else — never an estimate
//                                   reply, so never filed on one
export type RecipientKind = 'token' | 'estimates' | 'other'
export function recipientKind(to: string | null | undefined): RecipientKind {
  const local = String(to || '').toLowerCase().split('@')[0]
  if (/^reply\+/.test(local)) return 'token'
  if (local === 'estimates') return 'estimates'
  return 'other'
}

// Pull from/subject/body/recipients out of whatever the provider sent.
//
// Resend's email.received: data.from is a string ("Name <a@b>" or bare), data.to
// and data.cc are arrays of STRINGS, no body. Cloudflare Email Routing and
// SendGrid Inbound Parse put objects ({address}/{email}) in those arrays and
// carry the body inline. A forwarder posts flat fields. The first real Resend
// event exposed the string-array case: `to` came out empty, so the reply was
// routed as "not an estimate address" and never reached the estimate.
export type InboundMail = { from: string; subject: string; body: string; to: string; allRecipients: string[] }
export function readEmail(payload: Record<string, any> | null | undefined): InboundMail {
  const d = payload?.data ?? payload ?? {}
  const addr = (x: any): string => normalizeEmail(x?.address ?? x?.email ?? (typeof x === 'string' ? x : ''))
  const from = addr(d.from) || addr(d.sender) || addr(d.envelope?.from) || addr(payload?.from)
  const subject = d.subject ?? payload?.subject ?? ''
  const body =
    d.text ?? d['body-plain'] ?? d.plain ?? d.textBody ?? d.body ??
    d.html ?? d['body-html'] ?? d.htmlBody ?? ''
  const allRecipients = [
    ...(Array.isArray(d.to) ? d.to : d.to ? [d.to] : []),
    ...(Array.isArray(d.cc) ? d.cc : d.cc ? [d.cc] : []),
  ].map(addr).filter(Boolean)
  const to = allRecipients[0] || addr(d.recipient) || addr(payload?.to) || ''
  return { from, subject: String(subject || ''), body: String(body || ''), to, allRecipients }
}

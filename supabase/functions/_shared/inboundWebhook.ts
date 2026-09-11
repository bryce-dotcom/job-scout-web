// Shared by the inbound-email receiver and its tests.
//
// Two things a webhook receiver has to get right before it reads a single
// field: was this request really sent by the provider, and can a person read
// what arrived. Both live here so the receiver stays about matching replies to
// estimates, and so the signature check can be tested against a known key
// without standing up the function.

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

  let raw: string
  try {
    raw = atob(secret.replace(/^whsec_/, ''))
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

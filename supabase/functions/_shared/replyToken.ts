// The token in a reply-to address: reply+<token>@<platform inbound domain>
//
// WHY A PLATFORM ADDRESS, NOT THE TENANT'S OWN DOMAIN.
// Every tenant already sends through one Resend account on one domain —
// estimates@appsannex.com, invoices@appsannex.com — supplying only a display
// name. A tenant configures no DNS to send, so requiring MX records on their
// own domain before REPLIES work would mean every new customer has a broken
// week and a support ticket. Inbound is set up once, by the platform, and every
// tenant has it the day they sign up.
//
// WHY NOT REUSE portal_token.
// That token grants access to the customer portal. A reply-to address is
// visible in the recipient's mail client, in their reply headers, and in every
// forward of that thread. Putting portal access there would hand it to anyone
// the email is passed to. This token carries no privilege at all: the worst it
// can do is identify which estimate a message belongs to.
//
// WHY IT IS SIGNED.
// The From address on an email is trivially forged, so the token is the only
// thing standing between a stranger and a message appearing in a customer
// conversation. An unsigned id would let anyone write into any estimate's
// thread by counting upwards. The signature is an HMAC over the id with a
// server-side secret, truncated — it does not need to resist an offline attack,
// only to make the space unguessable.

const enc = new TextEncoder()

async function hmacHex(message: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  )
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message))
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('')
}

// 10 hex chars = 40 bits. Guessing one is ~10^12 attempts against a rate-limited
// mail path, and the prize is writing one message into one estimate.
const SIG_LEN = 10

/** Estimate id -> the local-part suffix used in reply+<token>@… */
export async function replyToken(quoteId: number | string, secret: string): Promise<string> {
  const id = String(quoteId)
  const sig = (await hmacHex(id, secret)).slice(0, SIG_LEN)
  // Base36 keeps it short and case-insensitive, which matters because mail
  // systems may not preserve the case of a local part.
  return `${Number(id).toString(36)}${sig}`
}

/** The full address to hand Resend as reply_to. */
export async function replyAddress(quoteId: number | string, secret: string, domain: string): Promise<string> {
  return `reply+${await replyToken(quoteId, secret)}@${domain}`
}

/**
 * Recover the estimate id from a token, or null if it does not verify.
 *
 * Returns null rather than throwing: a malformed address is an ordinary event
 * (someone mails the inbound domain directly, a bot probes it), and the caller
 * falls back to matching on the sender.
 */
export async function parseReplyToken(token: string | null | undefined, secret: string): Promise<number | null> {
  const t = String(token || '').trim().toLowerCase()
  if (t.length <= SIG_LEN) return null
  const idPart = t.slice(0, t.length - SIG_LEN)
  const sig = t.slice(-SIG_LEN)
  const id = parseInt(idPart, 36)
  if (!Number.isFinite(id) || id <= 0) return null
  const expected = (await hmacHex(String(id), secret)).slice(0, SIG_LEN)
  // Length-equal compare; these are short public values, not password material.
  if (sig.length !== expected.length) return null
  let diff = 0
  for (let i = 0; i < sig.length; i++) diff |= sig.charCodeAt(i) ^ expected.charCodeAt(i)
  return diff === 0 ? id : null
}

/** Pull the token out of any of the To/Cc addresses on an inbound email. */
export function tokenFromAddresses(addresses: (string | null | undefined)[]): string | null {
  for (const raw of addresses || []) {
    const s = String(raw || '').toLowerCase()
    const m = s.match(/reply\+([a-z0-9]+)@/)
    if (m) return m[1]
  }
  return null
}

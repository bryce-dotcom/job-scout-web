// Who must not be emailed, and by which kind of mail.
//
// email_suppressions (per company) is written by the campaign unsubscribe
// link, by Resend's bounce and complaint webhooks, and by hand. Until
// 2026-10-20 only campaign sends read it; an address that had bounced or
// asked to be left alone could still get an estimate chase or a receipt
// from the other senders. Now every sender asks here first.
//
// The rule has two halves, because the two reasons mean different things:
//   bounced / complained  → the address is dead or hostile. Nothing goes,
//                           transactional or not; sending again only hurts
//                           deliverability for every tenant on the domain.
//   unsubscribed / manual → "stop marketing to me". Campaigns and automated
//                           chases stop; an invoice, receipt or estimate the
//                           person asked for still goes.

export type SendKind = 'marketing' | 'transactional'
export interface Suppression { email: string; reason: string; source: string | null; created_at: string }

const H = (key: string) => ({ apikey: key, Authorization: `Bearer ${key}` })

/** The suppression row for this address at this company, or null. */
export async function emailSuppression(env: { url: string; key: string }, companyId: number, email: unknown): Promise<Suppression | null> {
  const addr = String(email || '').trim().toLowerCase()
  if (!addr || !companyId) return null
  try {
    const r = await fetch(`${env.url}/rest/v1/email_suppressions?select=email,reason,source,created_at&company_id=eq.${companyId}&email=eq.${encodeURIComponent(addr)}&limit=1`, { headers: H(env.key) })
    if (!r.ok) return null
    const rows = await r.json()
    return rows?.[0] || null
  } catch {
    return null
  }
}

/** Does this suppression stop this kind of send? */
export function blocksSend(s: Suppression | null, kind: SendKind): boolean {
  if (!s) return false
  if (s.reason === 'bounced' || s.reason === 'complained') return true
  return kind === 'marketing'
}

/** One sentence for the person who pressed Send. */
export function blockedMessage(s: Suppression, email: string): string {
  const when = s.created_at ? new Date(s.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''
  if (s.reason === 'bounced') return `${email} bounced${when ? ' on ' + when : ''}. Fix the address (or remove it from the suppression list under Marketing) before sending again.`
  if (s.reason === 'complained') return `${email} reported our mail as spam${when ? ' on ' + when : ''}. Nothing more goes to that address unless they ask for it.`
  return `${email} asked not to hear from us${when ? ' on ' + when : ''}. Marketing mail stays stopped; an invoice or receipt still goes.`
}

/**
 * The check every sender runs: null when the send may go, otherwise the
 * message to return. A send with no company context (a server mailing a
 * platform address) is not checked — there is no list to check it against.
 */
export async function sendBlockedBy(env: { url: string; key: string }, companyId: number | null | undefined, email: unknown, kind: SendKind): Promise<string | null> {
  if (!companyId) return null
  const s = await emailSuppression(env, Number(companyId), email)
  return blocksSend(s, kind) ? blockedMessage(s!, String(email || '').trim().toLowerCase()) : null
}

/** Record a bounce or complaint (or a request to stop) for this address. Idempotent. */
export async function suppressEmail(env: { url: string; key: string }, companyId: number, email: unknown, reason: 'bounced' | 'complained' | 'unsubscribed' | 'manual', source: string): Promise<void> {
  const addr = String(email || '').trim().toLowerCase()
  if (!addr || !companyId) return
  try {
    await fetch(`${env.url}/rest/v1/email_suppressions?on_conflict=company_id,email`, {
      method: 'POST',
      headers: { ...H(env.key), 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({ company_id: companyId, email: addr, reason, source }),
    })
  } catch { /* a missed suppression is logged by the next bounce */ }
}

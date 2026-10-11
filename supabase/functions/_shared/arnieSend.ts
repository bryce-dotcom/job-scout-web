// How Arnie reaches a person who is not in the chat: email via Resend, or
// a text via the tenant's Twilio (send-sms). One module, used by the
// morning brief (arnie-brief-push) and the nudges (arnie-nudge), so a
// change to the sender name, the shell or the SMS route lands in both.

import { appLink, repEmailShell } from './notifyRep.ts'

export type Sent = { sent: boolean; error?: string }

const esc = (s: string) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')

export async function sendArnieEmail(to: string, subject: string, heading: string, text: string): Promise<Sent> {
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return { sent: false, error: 'no RESEND_API_KEY' }
  const html = repEmailShell(heading,
    `<div style="white-space:pre-wrap;font-size:15px;line-height:1.5">${esc(text)}</div><div style="margin-top:14px;font-size:13px;color:#7d8a7f">${esc(REPLY_HINT_EMAIL)}</div>`,
    appLink('/agents/arnie') || undefined, 'Ask Arnie')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    // From arnie@ so a REPLY reaches him: recipientKind routes arnie@ into the
    // conversation branch in inbound-email. A reply to invoices@ went nowhere.
    body: JSON.stringify({ from: 'OG Arnie <arnie@appsannex.com>', reply_to: 'arnie@appsannex.com', to: [to], subject, html }),
  })
  if (!res.ok) return { sent: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 120)}` }
  return { sent: true }
}

/**
 * A text from Arnie, and an invitation to text back.
 *
 * This used to say "the reply to a text is a tap, never a text back (there is
 * no inbound SMS)". As of 2026-10-10 there is: a text from a known employee
 * reaches Arnie, keeps its thread, and "YES" approves the card he drafts.
 *
 * Which makes every brief and every nudge the best discovery there is. The
 * capability was live and nobody could have known — these messages already
 * land in the one place where replying now works, so they are the place to say
 * so. One short line, not a pitch.
 *
 * `trigger` and `employee_id` go on the communications log so the text is a
 * record.
 */
export const REPLY_HINT_SMS = 'Reply to this and I’ll answer.'
export const REPLY_HINT_EMAIL = 'Reply to this email and I’ll answer — I can look things up or draft a change for you to approve.'
export async function sendArnieSms(r: { url: string; key: string }, companyId: number, to: string, text: string, opts: { trigger?: string; employee_id?: number | null } = {}): Promise<Sent> {
  const link = appLink('/agents/arnie')
  const withHint = text.includes(REPLY_HINT_SMS) ? text : `${text}\n\n${REPLY_HINT_SMS}`
  const message = withHint.includes(link) ? withHint : `${withHint}\n${link}`
  const res = await fetch(`${r.url}/functions/v1/send-sms`, {
    method: 'POST', headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ company_id: companyId, to, message, trigger: opts.trigger || 'arnie', employee_id: opts.employee_id ?? null }),
  })
  if (!res.ok) return { sent: false, error: `send-sms ${res.status}: ${(await res.text()).slice(0, 160)}` }
  return { sent: true }
}

/** Only the cron may call a push function: the JWT's role claim, not the raw key (rotation). */
export function isServiceRole(req: Request): boolean {
  const bearer = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim()
  try { return String(JSON.parse(atob(bearer.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))?.role || '') === 'service_role' } catch { return false }
}

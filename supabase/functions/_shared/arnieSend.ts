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
    `<div style="white-space:pre-wrap;font-size:15px;line-height:1.5">${esc(text)}</div>`,
    appLink('/agents/arnie') || undefined, 'Ask Arnie')
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'OG Arnie <invoices@appsannex.com>', to: [to], subject, html }),
  })
  if (!res.ok) return { sent: false, error: `Resend ${res.status}: ${(await res.text()).slice(0, 120)}` }
  return { sent: true }
}

/**
 * A text from Arnie. Every one ends with the link into the app — the reply
 * to a text is a tap, never a text back (there is no inbound SMS, and the
 * card that makes a change safe cannot fit in one). `trigger` and
 * `employee_id` go on the communications log so the text is a record.
 */
export async function sendArnieSms(r: { url: string; key: string }, companyId: number, to: string, text: string, opts: { trigger?: string; employee_id?: number | null } = {}): Promise<Sent> {
  const link = appLink('/agents/arnie')
  const message = text.includes(link) ? text : `${text}\n${link}`
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

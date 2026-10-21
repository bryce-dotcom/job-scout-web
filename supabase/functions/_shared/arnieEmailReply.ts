// A reply to an email in the person's forwarded inbox (arnie_inbox) — drafted
// on a card, sent only when they approve. Christopher, 2026-10-13: "if they
// give a specific time and it conflicts … give me options", "never decline,
// offer", "never send an email without my approval".
//
// The address is the email's own sender, read from the stored row — never one
// the model names — and it goes out under the person's name with replies to
// their real address, so the answer lands in their own inbox.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import type { Prepared } from './arnieCreate.ts'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const OK_ADDR = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/

export async function prepareEmailReply(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  const id = Number(f.inbox_email)
  if (!Number.isFinite(id) || id <= 0) return { ok: false, error: 'Which email? Give the id from query_inbox.' }
  const [mail] = await readRecordList(r, `arnie_inbox?select=id,from_name,from_email,subject,bulk&company_id=eq.${companyId}&employee_id=eq.${caller.employeeId}&id=eq.${id}&limit=1`)
  if (!mail) return { ok: false, error: 'That email is not in your inbox.' }
  const to = String(mail.from_email || '').trim().toLowerCase()
  if (!OK_ADDR.test(to)) return { ok: false, error: 'That email has no address to reply to.' }
  if (mail.bulk) return { ok: false, error: 'That is automated mail — there is nobody to reply to.' }
  if (to === String(caller.email || '').toLowerCase()) return { ok: false, error: 'That email is from you.' }
  const body = String(f.body || '').trim()
  if (body.length < 5) return { ok: false, error: 'What should the reply say? Write it in full.' }
  if (body.length > 5000) return { ok: false, error: 'That reply is too long for a card — keep it to a few paragraphs.' }
  const subject = (/^re:/i.test(mail.subject || '') ? mail.subject : `Re: ${mail.subject || 'your email'}`).slice(0, 200)
  const [me] = await readRecordList(r, `employees?select=name,email&id=eq.${caller.employeeId}&limit=1`)
  return {
    ok: true,
    columns: { inbox_id: mail.id, to, subject, body, from_name: me?.name || 'JobScout', reply_to: me?.email || caller.email || null },
    display: [
      { label: 'To', value: mail.from_name ? `${mail.from_name} <${to}>` : to },
      { label: 'Subject', value: subject },
      { label: 'Says', value: body },
      { label: 'Sends', value: 'when you approve — it cannot be unsent' },
    ],
  }
}

export async function applyEmailReply(r: Rest, companyId: number, prop: any): Promise<{ ok: true; id: number; label: string; created: Record<string, unknown> } | { ok: false; error: string }> {
  const c = prop.payload?.columns || {}
  // Re-read the email: the card's address must still be that email's sender.
  const [mail] = await readRecordList(r, `arnie_inbox?select=id,from_email&company_id=eq.${companyId}&id=eq.${Number(c.inbox_id)}&limit=1`)
  if (!mail || String(mail.from_email || '').toLowerCase() !== String(c.to || '').toLowerCase()) return { ok: false, error: 'That email is no longer in the inbox.' }
  const key = (globalThis as any).Deno?.env?.get?.('RESEND_API_KEY')
  if (!key) return { ok: false, error: 'Email is not set up (no RESEND_API_KEY).' }
  const fromName = String(c.from_name || 'JobScout').replace(/[<>"\r\n]/g, '').slice(0, 60)
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: `${fromName} <team@appsannex.com>`, to: [c.to], subject: c.subject,
      ...(c.reply_to && OK_ADDR.test(c.reply_to) ? { reply_to: c.reply_to } : {}),
      html: `<div style="font:15px/1.55 -apple-system,Segoe UI,Arial,sans-serif;color:#2c3530;white-space:pre-wrap">${esc(String(c.body || ''))}</div>`,
    }),
  })
  if (!res.ok) return { ok: false, error: `The email did not send (${res.status}).` }
  const sent = await res.json().catch(() => ({}))
  await fetch(`${r.url}/rest/v1/arnie_inbox?company_id=eq.${companyId}&id=eq.${Number(c.inbox_id)}`, {
    method: 'PATCH', headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ handled_at: new Date().toISOString(), handled_note: 'replied' }),
  }).catch(() => {})
  return { ok: true, id: Number(c.inbox_id), label: `reply to ${c.to}`, created: { email_id: sent?.id || null } }
}

/** A sent email cannot be unsent. */
export async function rollbackEmailReply(): Promise<{ ok: false; error: string }> {
  return { ok: false, error: 'An email that has gone cannot be taken back.' }
}

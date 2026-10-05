// Sending the L10 itinerary — ONE sender, two callers.
//
// Arnie sends it when somebody asks him to (_shared/arnieEos.ts applyAgenda)
// and the EOS page sends it when somebody presses the button (the
// send-l10-agenda function). Both land here, because "email the team" that
// behaves differently depending on which button you pressed is the kind of
// difference nobody notices until a customer does.
//
// Email goes through send-email (Resend). In-app goes to employee_notifications
// — per person, persistent, read in Field Scout and in the notifications bell —
// deduped per person per meeting so asking twice does not stack two rows on the
// same morning.

import type { Agenda } from './l10Agenda.ts'
import { agendaHtml, agendaSubject, agendaText } from './l10AgendaRender.ts'

// deno-lint-ignore-file no-explicit-any
type Any = any

export type Channel = 'email' | 'app' | 'both'
export const CHANNELS: Channel[] = ['email', 'app', 'both']

export interface Recipient { employee_id?: number | null; name: string; email: string | null }

export interface SendResult {
  emailed: number
  emailed_to: string[]
  notified: number
  channel: Channel
  email_failed?: string
}

const str = (v: unknown) => (v == null ? '' : String(v)).trim()

export async function sendAgenda(
  r: { url: string; key: string },
  companyId: number,
  o: { agenda: Agenda; recipients: Recipient[]; channel: Channel; company?: Any },
): Promise<{ ok: true; result: SendResult } | { ok: false; error: string }> {
  const { agenda, recipients, channel } = o
  if (!agenda || !recipients?.length) return { ok: false, error: 'There is no agenda or nobody to send it to.' }

  const html = agendaHtml(agenda, o.company || null)
  const text = agendaText(agenda, o.company || null)
  const subject = agendaSubject(agenda)
  const H = { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' }

  let emailed: string[] = []
  let emailError: string | null = null

  if (channel === 'email' || channel === 'both') {
    const to = recipients.map((p) => str(p.email)).filter(Boolean)
    if (to.length) {
      try {
        const res = await fetch(`${r.url}/functions/v1/send-email`, { method: 'POST', headers: H, body: JSON.stringify({ to, subject, html }) })
        const body = await res.json().catch(() => ({}))
        // send-email answers 200 with success:false on purpose, so the body is
        // the truth and the status is not. Trusting the status would report a
        // send that never happened.
        if (body?.success === false) emailError = str(body.error) || 'the mailer refused it'
        else emailed = to
      } catch (e) {
        emailError = (e as Error)?.message || 'the mailer could not be reached'
      }
    }
  }

  let notified = 0
  if (channel === 'app' || channel === 'both') {
    const rows = recipients.filter((p) => p.employee_id).map((p) => ({
      company_id: companyId,
      employee_id: p.employee_id,
      type: 'l10_agenda',
      title: `L10 agenda — ${agenda.when_label}`,
      message: text.slice(0, 1800),
      route: '/admin/eos',
      metadata: { meeting_on: agenda.meeting_on, minutes: agenda.minutes, counts: agenda.counts },
      dedupe_key: `l10:${agenda.meeting_on}${agenda.entity ? ':' + agenda.entity : ''}`,
    }))
    if (rows.length) {
      const res = await fetch(`${r.url}/rest/v1/employee_notifications?on_conflict=employee_id,dedupe_key`, {
        method: 'POST',
        headers: { ...H, Prefer: 'return=representation,resolution=merge-duplicates' },
        body: JSON.stringify(rows),
      })
      const body = await res.json().catch(() => [])
      if (!res.ok) {
        return { ok: false, error: `The agenda could not be put in the app: ${str((body as Any)?.message) || res.status}.${emailed.length ? ` The email did go to ${emailed.length}.` : ''}` }
      }
      notified = Array.isArray(body) ? body.length : 0
    }
  }

  // Nothing landed anywhere: that is a failure, not a quiet success.
  if (!emailed.length && !notified) {
    return { ok: false, error: emailError ? `The agenda was not sent: ${emailError}.` : 'The agenda reached nobody — none of them has an email address or an employee record.' }
  }

  return { ok: true, result: { emailed: emailed.length, emailed_to: emailed, notified, channel, ...(emailError ? { email_failed: emailError } : {}) } }
}

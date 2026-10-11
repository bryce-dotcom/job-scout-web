// Releasing a held bonus: who has to be told, and what has to be said.
//
// A bonus is held when the hours on record do not support it. Clearing that
// hold used to be one click that recorded who and when, and nothing about
// why. HHH job 8747 was allotted 181.2 hours, has zero hours clocked against
// it, and paid $4,235 on that click; 67 bonuses have been released the same
// way. The money may well have been owed — nobody can tell from the record.
//
// So an override now needs a sentence, and HR gets told it happened. Both are
// pure functions here so the wording and the recipient list are testable
// without a payroll screen or a mail server.

import { canViewHR } from './accessControl'

/** The shortest reason that says anything. "ok", "yes", "approved" do not. */
export const MIN_REASON_LENGTH = 15

const EMPTY_WORDS = new Set([
  'ok', 'okay', 'yes', 'fine', 'approved', 'approve', 'verified', 'verify',
  'done', 'good', 'n/a', 'na', 'none', 'test', 'confirmed', 'correct',
])

/**
 * Is this a reason someone could act on later?
 *
 * The bar is deliberately low — the point is a sentence a person can read in
 * six months, not a form to fight. A bare "approved" is the thing it refuses,
 * because that is what the click already said.
 */
export function isUsableOverrideReason(text) {
  const t = String(text ?? '').trim()
  if (t.length < MIN_REASON_LENGTH) return false
  const words = t.toLowerCase().replace(/[^a-z0-9/\s]/g, ' ').split(/\s+/).filter(Boolean)
  if (words.length < 3) return false
  return words.some(w => !EMPTY_WORDS.has(w))
}

/**
 * Everyone who should hear that a hold was cleared.
 *
 * HR is the explicit `has_hr_access` flag, not an access level — an office
 * admin can run payroll without being HR, and a developer always counts.
 * Inactive people and anyone with no address are dropped. The person doing
 * the override is kept if they are HR: the mail is a receipt, not an alert.
 */
export function hrRecipients(employees = []) {
  return (employees || [])
    .filter(e => e && e.active !== false && canViewHR(e))
    .map(e => String(e.email || '').trim())
    .filter(Boolean)
    .filter((email, i, all) => all.indexOf(email) === i)
}

const money = (n) => '$' + (Math.round(Number(n) || 0)).toLocaleString()
// Reject empties BEFORE coercing: Number(null) is 0, and "0 hours allotted"
// is a very different claim from "nobody recorded the allotment".
const hours = (n) => {
  if (n === null || n === undefined || n === '') return null
  const v = Number(n)
  return Number.isFinite(v) ? Math.round(v * 10) / 10 : null
}

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/**
 * The note HR receives. Carries the numbers that caused the hold, so the
 * reader can judge the release without opening the app.
 */
export function overrideEmail({ bonus, jobLabel, crewName, actorName, reason, companyName } = {}) {
  const amount = money(bonus?.amount)
  const allotted = hours(bonus?.allotted_hours)
  const actual = hours(bonus?.actual_hours)
  const job = jobLabel || `Job ${bonus?.job_id ?? ''}`.trim()
  const who = crewName || `Employee ${bonus?.employee_id ?? ''}`.trim()
  const by = actorName || 'An administrator'

  const subject = `Bonus hold released: ${amount} on ${job}`
  const rows = [
    ['Job', job],
    ['Crew member', who],
    ['Amount', amount],
    ['Hours allotted', allotted == null ? 'not recorded' : String(allotted)],
    ['Hours actually clocked', actual == null ? 'not recorded' : String(actual)],
    ['Released by', by],
    ['Reason given', reason || ''],
  ]
  const html = `<!doctype html><html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#2c3530;background:#f7f5ef;padding:24px">
  <div style="max-width:560px;margin:0 auto;background:#fff;border:1px solid #d6cdb8;border-radius:12px;padding:24px">
    <h2 style="margin:0 0 4px;font-size:17px">Bonus hold released</h2>
    <p style="margin:0 0 16px;font-size:13px;color:#7d8a7f">
      This bonus was held because the hours on record did not support it. An administrator cleared the hold.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      ${rows.map(([k, v]) => `<tr>
        <td style="padding:6px 0;color:#7d8a7f;white-space:nowrap;vertical-align:top">${esc(k)}</td>
        <td style="padding:6px 0 6px 16px;font-weight:600">${esc(v)}</td>
      </tr>`).join('')}
    </table>
    <p style="margin:16px 0 0;font-size:12px;color:#7d8a7f">
      Sent automatically by ${esc(companyName || 'Job Scout')} when a payroll bonus hold is cleared.
    </p>
  </div></body></html>`
  return { subject, html }
}

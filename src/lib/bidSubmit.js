// Submitting a bid — the rules the page and the reminder cron share
// (SAL_SCOUT_PLAN.md §5.8–5.9). Sending itself is bid-submit (server).

export const RESEND_CAP_BYTES = 40 * 1024 * 1024

/**
 * What an email submission attaches and what it links (Resend's 40 MB cap).
 * All the files when they fit; only the combined PDF when that alone fits;
 * links for everything otherwise. Mirrors bid-submit, which decides for real.
 */
export function emailPacketPlan(packet, cap = RESEND_CAP_BYTES) {
  const files = (packet || []).filter((p) => p.storage_path)
  const combined = files.find((p) => p.kind === 'combined')
  const parts = files.filter((p) => p.kind !== 'combined')
  const total = parts.reduce((t, p) => t + (Number(p.bytes) || 0), 0)
  if (total <= cap) return { attach: parts, link: [], total }
  if (combined && Number(combined.bytes) <= cap) return { attach: [combined], link: parts, total }
  return { attach: [], link: files, total }
}

/** The reminder windows before a due date, in hours. */
export const REMINDER_HOURS = [24, 4]

/**
 * Which reminders are due right now for a submission that is not in yet:
 * a window is due once the due date is within it and it has not been sent.
 */
export function remindersDue(dueAt, sent = [], now = new Date()) {
  const due = new Date(dueAt)
  if (Number.isNaN(due.getTime()) || due <= now) return []
  const hoursLeft = (due - now) / 3600e3
  return REMINDER_HOURS.filter((h) => hoursLeft <= h && !(sent || []).includes(h))
}

/** A submission still needs the person's hands: nothing sent or confirmed yet. */
export function needsReminder(submission) {
  return ['draft', 'approved', 'bounced'].includes(submission?.status)
}

/**
 * Ship-by date for a sealed bid: two business days before it is due, so a
 * carrier's slip still lands it on time.
 */
export function shipByDate(dueAt, businessDays = 2) {
  const d = new Date(dueAt)
  if (Number.isNaN(d.getTime())) return null
  let left = businessDays
  while (left > 0) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) left-- }
  return d
}

/** The lines on a sealed-bid label, as the notice words them. */
export function labelLines({ opportunity, intake, company, requirements }) {
  const req = requirements || opportunity?.requirements || intake?.requirements || {}
  const to = opportunity?.submit_to?.address || req.submit_to?.address || intake?.submit_to || ''
  const buyer = opportunity?.buyer || intake?.buyer || ''
  const number = opportunity?.solicitation_number || intake?.bid_number || ''
  const title = opportunity?.title || intake?.project || intake?.title || ''
  const notice = req.label_text || (number ? `SEALED BID — ${number} — DO NOT OPEN` : 'SEALED BID — DO NOT OPEN')
  const from = [company?.legal_name || company?.company_name, company?.address, [company?.city, company?.state, company?.zip].filter(Boolean).join(', ')].filter(Boolean)
  return { to: [buyer, ...String(to).split(/\n|, or /).map((s) => s.trim())].filter(Boolean), notice, number, title, from }
}

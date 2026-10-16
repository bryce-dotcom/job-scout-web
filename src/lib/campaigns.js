// Campaigns: the rules the Campaigns tab and the server both lean on.
// A campaign is ONE object — who, what, and where results land. These
// helpers keep the vocabulary in one place so the tab, the card and the
// edge function say the same thing.

export const MAX_TOUCHES = 4
export const TOUCH_DAY_DEFAULTS = [0, 3, 7, 14]
export const LEAD_STATUSES = ['New', 'Contacted', 'Callback', 'Appointment Set', 'Qualified', 'Quote Sent']
export const TEXT_MAX = 320

/** The three kinds of touch, in the words the sheet uses. */
export const TOUCH_KINDS = [
  { id: 'email', label: 'Email', body: 'Subject and a short note.' },
  { id: 'text', label: 'Text', body: 'Only to people who said yes to texts.' },
  { id: 'call', label: 'Call', body: 'A Callback card on the board, with a script.' },
]
export const kindLabel = (kind) => (TOUCH_KINDS.find((k) => k.id === kind) || TOUCH_KINDS[0]).label

/** A fresh touch for position `index`: the next sensible day, email, empty. */
export function newTouch(touches = [], kind = 'email') {
  const index = touches.length
  const lastDay = touches.length ? Number(touches[touches.length - 1].day) || 0 : -1
  const day = TOUCH_DAY_DEFAULTS[index] != null && TOUCH_DAY_DEFAULTS[index] > lastDay ? TOUCH_DAY_DEFAULTS[index] : lastDay + 3
  return { day: index === 0 ? 0 : day, kind, subject: '', body: '' }
}

/** What the audience picker says about an audience, in words. */
export function audienceLabel(a = {}) {
  switch (a?.kind) {
    case 'leads': return `${(a.ids || []).length} ${(a.ids || []).length === 1 ? 'person' : 'people'} you picked`
    case 'prospects': return 'Prospects Prospect Scout found'
    case 'lead_status': return `Leads marked ${a.status || 'New'}`
    case 'customers': return a.months ? `Customers with no job in ${a.months} months` : 'Customers who said yes to marketing'
    default: return 'Nobody yet'
  }
}

/** "2 emails, a text and a call over 7 days" — the card's one-line summary of the touches. */
export function touchesSummary(touches = []) {
  const n = { email: 0, text: 0, call: 0 }
  for (const t of touches) n[t.kind in n ? t.kind : 'email'] += 1
  const parts = []
  if (n.email) parts.push(`${n.email} ${n.email === 1 ? 'email' : 'emails'}`)
  if (n.text) parts.push(`${n.text} ${n.text === 1 ? 'text' : 'texts'}`)
  if (n.call) parts.push(`${n.call} ${n.call === 1 ? 'call' : 'calls'}`)
  const words = parts.length <= 1 ? parts.join('') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
  const span = touches.length > 1 ? Number(touches[touches.length - 1]?.day) || 0 : 0
  return words ? `${words}${span ? ` over ${span} days` : ''}` : 'no touches'
}

/**
 * Why a campaign cannot start, or '' when it can. One sentence, the first
 * problem only — the person fixes it and presses again.
 */
export function campaignProblem(c = {}) {
  if (!String(c.name || '').trim()) return 'Give the campaign a name.'
  if (!c.audience?.kind) return 'Pick who it goes to.'
  if (c.audience.kind === 'leads' && !(c.audience.ids || []).length) return 'Pick who it goes to.'
  const touches = Array.isArray(c.touches) ? c.touches : []
  if (!touches.length) return 'Add at least one touch.'
  for (let i = 0; i < touches.length; i++) {
    const t = touches[i]
    const kind = t.kind || 'email'
    if (!['email', 'text', 'call'].includes(kind)) return `Touch ${i + 1}: that kind of touch does not exist.`
    if (kind === 'email' && !String(t.subject || '').trim()) return `Touch ${i + 1} needs a subject line.`
    if (!String(t.body || '').trim()) return kind === 'call' ? `Touch ${i + 1} needs a line or two for the caller.` : `Touch ${i + 1} needs something to say.`
    if (kind === 'text' && String(t.body).length > TEXT_MAX) return `Touch ${i + 1} is over ${TEXT_MAX} characters for a text.`
    if (i > 0 && Number(t.day) <= Number(touches[i - 1].day)) return `Touch ${i + 1} has to come after touch ${i}.`
  }
  return ''
}

/** Member rows → the numbers a campaign card shows. */
export function campaignNumbers(members = []) {
  const n = { people: members.length, sent: 0, replied: 0, unsubscribed: 0, bounced: 0, waiting: 0, done: 0 }
  for (const m of members) {
    if (m.touch_index > 0 || m.state === 'sent' || m.state === 'done') n.sent += 1
    if (m.replied_at || m.state === 'replied') n.replied += 1
    if (m.state === 'unsubscribed') n.unsubscribed += 1
    if (m.state === 'bounced') n.bounced += 1
    if (m.state === 'queued') n.waiting += 1
    if (m.state === 'done') n.done += 1
  }
  return n
}

/** A lead counts as booked once it has an appointment or has moved past the board. */
export const BOOKED_STATUSES = ['Appointment Set', 'Qualified', 'Quote Sent', 'Negotiation', 'Won']
export function bookedCount(members = [], leadsById = {}) {
  let n = 0
  for (const m of members) {
    const l = m.lead_id ? leadsById[m.lead_id] : null
    if (l && (l.appointment_id || BOOKED_STATUSES.includes(l.status) || l.converted_at)) n += 1
  }
  return n
}

/** Merge fields, the same four the server fills. */
export const MERGE_FIELDS = ['{{first_name}}', '{{name}}', '{{company}}', '{{our_company}}']
export function mergeText(text = '', vars = {}) {
  const first = String(vars.name || '').trim().split(/\s+/)[0] || 'there'
  return String(text || '')
    .replace(/\{\{\s*first_name\s*\}\}/gi, first)
    .replace(/\{\{\s*name\s*\}\}/gi, String(vars.name || 'there'))
    .replace(/\{\{\s*company\s*\}\}/gi, String(vars.company || 'your company'))
    .replace(/\{\{\s*our_company\s*\}\}/gi, String(vars.our_company || 'us'))
}

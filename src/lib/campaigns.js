// Campaigns: the rules the Campaigns tab and the server both lean on.
// A campaign is ONE object — who, what, and where results land. These
// helpers keep the vocabulary in one place so the tab, the card and the
// edge function say the same thing.

export const MAX_TOUCHES = 4
export const TOUCH_DAY_DEFAULTS = [0, 3, 7, 14]
export const LEAD_STATUSES = ['New', 'Contacted', 'Callback', 'Appointment Set', 'Qualified', 'Quote Sent']

/** A fresh touch for position `index`: the next sensible day, email, empty. */
export function newTouch(touches = []) {
  const index = touches.length
  const lastDay = touches.length ? Number(touches[touches.length - 1].day) || 0 : -1
  const day = TOUCH_DAY_DEFAULTS[index] != null && TOUCH_DAY_DEFAULTS[index] > lastDay ? TOUCH_DAY_DEFAULTS[index] : lastDay + 3
  return { day: index === 0 ? 0 : day, kind: 'email', subject: '', body: '' }
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

/**
 * Why a campaign cannot start, or '' when it can. One sentence, the first
 * problem only — the person fixes it and presses again.
 */
export function campaignProblem(c = {}) {
  if (!String(c.name || '').trim()) return 'Give the campaign a name.'
  if (!c.audience?.kind) return 'Pick who it goes to.'
  if (c.audience.kind === 'leads' && !(c.audience.ids || []).length) return 'Pick who it goes to.'
  const touches = Array.isArray(c.touches) ? c.touches : []
  if (!touches.length) return 'Add at least one email.'
  for (let i = 0; i < touches.length; i++) {
    const t = touches[i]
    if (t.kind !== 'email') return `Touch ${i + 1}: only email goes out this week.`
    if (!String(t.subject || '').trim()) return `Touch ${i + 1} needs a subject line.`
    if (!String(t.body || '').trim()) return `Touch ${i + 1} needs something to say.`
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

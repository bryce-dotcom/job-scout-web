// One message to the whole crew.
//
// Bryce (d6a848b5): "Tried to send all 14 field crew a note about clocking in/out
// and leaving location on. There is no way to do it from the app."
//
// There was no way because nothing composed one — but the delivery surface has
// existed for a while. employee_notifications rows are addressed to one person
// and wait until read, and MyNotifications already lists the unread ones at the
// top of Field Scout, which is the screen a tech actually opens. So a broadcast
// is not a new channel; it is a writer for the channel that is already there.
//
// Deliberately NOT SMS. send-sms needs a per-company twilio_config and there is
// not one in any tenant, so every text would fail silently at the Twilio call.
// In-app lands today, for free, on the screen they already use. If SMS is wanted
// later it is another delivery for the same composed message.

/** The notification type. MyNotifications styles it; nothing else branches on it. */
export const BROADCAST_TYPE = 'crew_broadcast'

const MAX_TITLE = 80
const MAX_MESSAGE = 1000

/** Job titles present on the roster, for the recipient picker. Taken from the
 *  DATA rather than a hardcoded list of trades, so it fits any company. */
export function rosterTitles(employees = []) {
  const seen = new Map()
  for (const e of employees || []) {
    if (!e || e.active === false) continue
    const t = String(e.role || '').trim()
    if (!t) continue
    const key = t.toLowerCase()
    if (!seen.has(key)) seen.set(key, t)
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b))
}

/**
 * Who gets it: active employees, optionally narrowed to chosen job titles.
 *
 * An empty `titles` means everyone — "send to all" is the common case and must
 * not require ticking every box. Someone with no job title set still counts as
 * everyone, because leaving them out of a message about clocking in is exactly
 * the kind of silent omission that makes people stop trusting the tool.
 */
export function broadcastRecipients(employees = [], { titles = [] } = {}) {
  const wanted = new Set((titles || []).map((t) => String(t).trim().toLowerCase()).filter(Boolean))
  return (employees || []).filter((e) => {
    if (!e || e.active === false || e.id == null) return false
    if (wanted.size === 0) return true
    return wanted.has(String(e.role || '').trim().toLowerCase())
  })
}

/** Why this cannot be sent yet, as a sentence for the sender — or null. */
export function broadcastProblem({ title, message, recipients = [] } = {}) {
  if (!String(title || '').trim()) return 'Give it a subject so people can see what it is about.'
  if (String(title).trim().length > MAX_TITLE) return `Keep the subject under ${MAX_TITLE} characters.`
  if (!String(message || '').trim()) return 'Write the message.'
  if (String(message).trim().length > MAX_MESSAGE) return `Keep the message under ${MAX_MESSAGE} characters.`
  if (!recipients.length) return 'Nobody matches that selection.'
  return null
}

/**
 * The rows to insert — one per recipient, all sharing one dedupe_key.
 *
 * (employee_id, dedupe_key) is UNIQUE, so the shared key means each person gets
 * exactly one copy and a double-tap on Send is refused by the database rather
 * than sending the crew two of everything.
 */
export function broadcastRows({ companyId, recipients = [], title, message, route = null, key, senderName = null }) {
  const t = String(title || '').trim()
  const m = String(message || '').trim()
  return recipients.map((e) => ({
    company_id: companyId,
    employee_id: e.id,
    type: BROADCAST_TYPE,
    title: t,
    message: m,
    route: route || null,
    metadata: { from: senderName || null, recipients: recipients.length },
    dedupe_key: key,
  }))
}

/** A dedupe key for one send. Distinct per send, identical across its rows. */
export function broadcastKey(now = new Date()) {
  return `${BROADCAST_TYPE}:${now.toISOString()}`
}

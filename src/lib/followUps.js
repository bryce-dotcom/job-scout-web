// The Follow-up overlay.
//
// This is an OVERLAY, not a stage: a deal in Negotiation that needs a call is
// still in Negotiation. Moving it into a "Follow-up" column would cost it its
// pipeline position and skew every stage total. So the column surfaces deals
// that need a touch while they stay exactly where they are.
//
// The old leads.last_contact_at / callback_notes fields died of two causes —
// they held ONE value instead of a history, and logging was too much work
// (populated on 6 and 0 of 1,716 leads). lead_follow_ups fixes the first;
// one-tap logging in the UI fixes the second. If logging ever gets harder
// than one tap, this column will empty out the same way.

export const COLD = 'cold'         // long overdue — top of the list
export const DUE = 'due'           // a scheduled follow-up has come round
export const AGING = 'aging'       // drifting, not urgent yet
export const FRESH = 'fresh'       // recently worked, leave it alone
export const UNTOUCHED = 'untouched' // never followed up at all

// Days without contact before a deal starts looking neglected. Deliberately
// generous — nagging a rep about a deal they touched on Friday is how a
// feature like this gets ignored.
export const AGING_AFTER_DAYS = 7
export const COLD_AFTER_DAYS = 14

const dayMs = 86400000

/** Most recent follow-up per lead. Rows may arrive in any order. */
export function latestByLead(rows = []) {
  const out = new Map()
  for (const r of rows || []) {
    if (!r?.lead_id) continue
    const key = String(r.lead_id)
    const prev = out.get(key)
    if (!prev || new Date(r.contacted_at) > new Date(prev.contacted_at)) out.set(key, r)
  }
  return out
}

export function daysSince(iso, now = Date.now()) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return null
  return Math.floor((now - t) / dayMs)
}

/**
 * How a deal should read in the column.
 * A scheduled next_follow_up_at that has come round beats the day count —
 * a rep who said "call back Tuesday" wants to see it on Tuesday, whether
 * that is 2 days or 20 since the last touch.
 */
export function followUpState(latest, now = Date.now()) {
  if (!latest) return { state: UNTOUCHED, days: null, label: 'Never followed up' }

  const days = daysSince(latest.contacted_at, now)
  const next = latest.next_follow_up_at ? new Date(latest.next_follow_up_at).getTime() : null
  if (next && Number.isFinite(next) && next <= now) {
    const overdueDays = Math.floor((now - next) / dayMs)
    return {
      state: DUE, days,
      label: overdueDays <= 0 ? 'Due today' : `Due ${overdueDays}d ago`,
    }
  }
  if (days == null) return { state: UNTOUCHED, days: null, label: 'Never followed up' }
  if (days >= COLD_AFTER_DAYS) return { state: COLD, days, label: `${days} days cold` }
  if (days >= AGING_AFTER_DAYS) return { state: AGING, days, label: `${days} days ago` }
  return { state: FRESH, days, label: days <= 0 ? 'Today' : `${days}d ago` }
}

// Worst first, so the column reads as a worklist rather than a bucket.
const ORDER = { [COLD]: 0, [DUE]: 1, [UNTOUCHED]: 2, [AGING]: 3, [FRESH]: 4 }

/**
 * Which deals belong in the column.
 *
 * `needsAttentionOnly` is what the column uses day to day; passing false
 * gives every open deal, for a "show all" toggle.
 *
 * A deal qualifies while it is still winnable — closed, won and lost deals
 * are nobody's follow-up. That check is passed in rather than hardcoded so a
 * tenant with custom stages still works.
 */
export function followUpQueue(cards = [], latestMap = new Map(), {
  isOpenStage = () => true,
  now = Date.now(),
  needsAttentionOnly = true,
} = {}) {
  const out = []
  for (const card of cards || []) {
    if (!card || !isOpenStage(card.status)) continue
    const latest = latestMap.get(String(card.id)) || null
    const info = followUpState(latest, now)
    if (needsAttentionOnly && (info.state === FRESH || info.state === AGING)) continue
    out.push({ ...card, _followUp: { ...info, latest } })
  }
  return out.sort((a, b) => {
    const d = ORDER[a._followUp.state] - ORDER[b._followUp.state]
    if (d !== 0) return d
    return (b._followUp.days ?? 0) - (a._followUp.days ?? 0)
  })
}

/** The row to insert when a rep taps Call / Email / Text. */
export function buildFollowUpRow({ companyId, leadId, jobId, employeeId, method, note, nextFollowUpAt }) {
  if (!companyId || (!leadId && !jobId)) return null
  // Refuse a synthetic card id rather than letting Postgres reject the insert
  // with 'invalid input syntax for type bigint'. The caller should have used
  // resolveFollowUpTarget.
  if (leadId != null && !isStorableId(leadId)) return null
  if (jobId != null && !isStorableId(jobId)) return null
  return {
    company_id: companyId,
    lead_id: leadId ?? null,
    job_id: jobId ?? null,
    employee_id: employeeId ?? null,
    method: method || 'call',
    note: note?.trim() || null,
    next_follow_up_at: nextFollowUpAt || null,
    contacted_at: new Date().toISOString(),
  }
}

export const METHODS = [
  { id: 'call', label: 'Call', icon: 'Phone' },
  { id: 'email', label: 'Email', icon: 'Mail' },
  { id: 'text', label: 'Text', icon: 'MessageSquare' },
  { id: 'voicemail', label: 'Left VM', icon: 'PhoneMissed' },
  { id: 'visit', label: 'Visit', icon: 'MapPin' },
]

// ── The card strip ──────────────────────────────────────────────────────
//
// Setting a date must be ONE tap. A rep finishing a call will not open a date
// picker, so the presets are the primary control and the calendar is the
// escape hatch. 2 weeks is the default because that is what Bryce asked for
// and it matches how these deals actually move.

export const SNOOZE_PRESETS = [
  { id: '3d', label: '3d', days: 3 },
  { id: '1wk', label: '1wk', days: 7 },
  { id: '2wk', label: '2wk', days: 14, isDefault: true },
]

export function snoozeToIso(days, from = Date.now()) {
  const n = Number(days)
  if (!Number.isFinite(n)) return null
  return new Date(from + n * 86400000).toISOString()
}

/** Short date for "Chase 18 Aug". Local, not UTC — a follow-up set for the
 *  18th must not read as the 17th for a Mountain-time rep. */
export function shortDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (!Number.isFinite(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
}

/**
 * What the collapsed strip says, and how loudly.
 *   tone   'danger' | 'warning' | 'ok' | 'idle'  — drives the colour
 *   pulse  only when genuinely OVERDUE. A scheduled-but-not-due follow-up
 *          stays calm; if everything pulses, nothing means anything.
 */
export function stripSummary(latest, now = Date.now()) {
  const info = followUpState(latest, now)
  const next = latest?.next_follow_up_at || null

  if (info.state === DUE) {
    return { tone: 'danger', pulse: true, text: info.label }
  }
  if (info.state === COLD) {
    return { tone: 'warning', pulse: false, text: `${info.days} days quiet` }
  }
  if (info.state === UNTOUCHED) {
    return { tone: 'idle', pulse: false, text: 'No follow-up yet' }
  }
  // Worked recently or aging. A scheduled date is the useful thing to show.
  if (next) return { tone: 'ok', pulse: false, text: `Chase ${shortDate(next)}` }
  return { tone: 'idle', pulse: false, text: info.label }
}

/** How many times this deal has been chased. Pattern beats the last note —
 *  three unanswered calls is a different deal from three good conversations. */
export function attemptCount(rows = [], leadId) {
  return (rows || []).filter(r => r && String(r.lead_id) === String(leadId)).length
}

/** Most recent touches for one deal, newest first. */
export function historyFor(rows = [], leadId, limit = 2) {
  return (rows || [])
    .filter(r => r && String(r.lead_id) === String(leadId))
    .sort((a, b) => new Date(b.contacted_at) - new Date(a.contacted_at))
    .slice(0, limit)
}

/**
 * Which record a follow-up actually attaches to.
 *
 * Pipeline cards carry SYNTHETIC ids — `quote-4533`, `job-12785`, `custom_...`
 * — because one lead can produce several cards. Passing a card id straight
 * into lead_id gave Postgres:
 *     invalid input syntax for type bigint: "quote-4533"
 *
 * An estimate card belongs to the lead it came from (_originalLeadId); a job
 * card attaches to its job; a plain lead card is itself. Never the card id.
 */
export function resolveFollowUpTarget(card) {
  if (!card) return { leadId: null, jobId: null }
  if (card._isJob) return { leadId: null, jobId: card._jobId ?? null }
  if (card._isEstimate) return { leadId: card._originalLeadId ?? null, jobId: null }
  return { leadId: card.id ?? null, jobId: null }
}

/** Only a real numeric id may reach a bigint column. */
export function isStorableId(v) {
  if (v === null || v === undefined || v === '') return false
  return Number.isFinite(Number(v)) && !/^[a-z]/i.test(String(v))
}

// What this company calls the thing it sends a customer before the work.
//
// Some companies write estimates. A construction crew bidding public work
// writes bids, in a format the buyer dictates. A consultant writes proposals.
// Plenty do all three, and the word is not cosmetic: a government buyer who
// asked for a bid and receives a document headed "Estimate" has been given a
// reason to doubt you before reading a number.
//
// So the type belongs to the DOCUMENT, and the company says which types it
// produces and which one it leads with. One rule, read by the nav, the page,
// the customer's copy and the email, so they cannot drift apart.
//
// settings key `document_types`:  { enabled: ['estimate','bid'], primary: 'bid' }
// quotes.document_type:           'estimate' | 'bid' | 'proposal' | null
//                                 null = whatever the company leads with, so a
//                                 company that renames does not have to
//                                 relabel ten thousand old rows.

/** The settings key this lives under. */
export const DOCUMENT_TYPES_KEY = 'document_types'

/**
 * Pull the config straight out of the store's settings array — the shape
 * every page already has (`[{ key, value }]`). One place, so four callers do
 * not each write their own find().
 */
export function configFromSettings(settings) {
  const row = (settings || []).find(s => s && s.key === DOCUMENT_TYPES_KEY)
  return documentConfig(row?.value)
}

export const DOCUMENT_TYPES = ['estimate', 'bid', 'proposal']

const LABELS = {
  estimate: { one: 'Estimate', many: 'Estimates', article: 'an estimate' },
  bid: { one: 'Bid', many: 'Bids', article: 'a bid' },
  proposal: { one: 'Proposal', many: 'Proposals', article: 'a proposal' },
}

const DEFAULT_PRIMARY = 'estimate'

/** The labels for one type. Unknown types fall back to Estimate rather than rendering blank. */
export function labelsFor(type) {
  return LABELS[String(type || '').toLowerCase()] || LABELS[DEFAULT_PRIMARY]
}

/**
 * Read the company's setting into something safe to render.
 *
 * Accepts the raw settings value (object, JSON string, or missing) and always
 * returns at least one enabled type with a primary that is in the list — a
 * half-saved setting must never leave the nav with no word on it.
 */
export function documentConfig(raw) {
  let value = raw
  if (typeof value === 'string') {
    try { value = JSON.parse(value) } catch { value = null }
  }
  const asked = Array.isArray(value?.enabled) ? value.enabled : []
  // Keep DOCUMENT_TYPES' order rather than the order they were ticked, so the
  // secondary line reads the same for everyone.
  const enabled = DOCUMENT_TYPES.filter(t => asked.map(x => String(x).toLowerCase()).includes(t))
  if (enabled.length === 0) enabled.push(DEFAULT_PRIMARY)
  const wanted = String(value?.primary || '').toLowerCase()
  const primary = enabled.includes(wanted) ? wanted : enabled[0]
  return { enabled, primary }
}

/**
 * The nav entry. The second line only appears when the company actually
 * produces more than one kind — a permanent "bids/proposals" under Estimates
 * is clutter for the company that only ever writes estimates.
 */
export function navLabel(raw) {
  const { enabled, primary } = documentConfig(raw)
  const others = enabled.filter(t => t !== primary)
  return {
    primary: labelsFor(primary).many,
    secondary: others.length ? others.map(t => labelsFor(t).many).join(' · ') : null,
  }
}

/** What to call one document: its own type, else whatever the company leads with. */
export function documentType(doc, raw) {
  const own = String(doc?.document_type || '').toLowerCase()
  if (DOCUMENT_TYPES.includes(own)) return own
  return documentConfig(raw).primary
}

/** Convenience: the labels for one document. */
export function documentLabels(doc, raw) {
  return labelsFor(documentType(doc, raw))
}

/**
 * A bid is a document you are bound by, so an unverified sourced price stops
 * it going out; an estimate warns and lets you send (Bryce, 2026-09-25).
 * Field Scout blocks a send on failed verification and the clock-out flow
 * deliberately flags instead of trapping people — this is the same choice,
 * made per document type.
 */
export function unverifiedSendRule(type) {
  return type === 'bid' ? 'block' : 'warn'
}

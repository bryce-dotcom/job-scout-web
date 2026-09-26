// Sourced prices and the send gate — the BROWSER half.
//
// The rule lives in one sentence: an AI-sourced price is redlined until a
// human verifies it with a source link; a bid cannot go out with one, an
// estimate or proposal can once the rep has said they know. The server
// enforces it in send-estimate (_shared/sourcedPricing.ts is the twin); this
// file exists so the page can say the same thing BEFORE the call and draw the
// redline on the row. Keep the two in step — every branch is named below in
// sourcedPricing.test.js.

import { unverifiedSendRule } from './documentVocabulary'

export const PRICE_SOURCES = ['catalog', 'manual', 'ai_sourced']
export const MATCH_KINDS = ['exact', 'equivalent', 'must_source']

export function isSourced(line) {
  return line?.price_source === 'ai_sourced'
}

export function isUnverifiedSourced(line) {
  return isSourced(line) && !line?.price_verified_at
}

export function unverifiedSourcedLines(lines) {
  return (lines || []).filter(isUnverifiedSourced)
}

/** ok | warn | block, and the lines that caused it. */
export function sendGate(documentType, lines) {
  const unverified = unverifiedSourcedLines(lines)
  if (unverified.length === 0) return { gate: 'ok', unverified }
  return { gate: unverifiedSendRule(documentType), unverified }
}

/** The sentence the rep reads. Same words as the server sends back. */
export function sendGateMessage(gate, unverified, documentWord = 'Estimate') {
  if (gate === 'ok') return null
  const n = unverified.length
  const names = unverified.slice(0, 3).map((l) => l.item_name || l.item?.name || 'a line').join(', ') + (n > 3 ? ` and ${n - 3} more` : '')
  if (gate === 'block') {
    return `This bid has ${n} AI-sourced price${n === 1 ? '' : 's'} nobody has verified (${names}). A bid binds you to its numbers — verify each one with a source link before it goes out.`
  }
  return `${n} price${n === 1 ? '' : 's'} on this ${documentWord.toLowerCase()} came from Dougie and ${n === 1 ? 'has' : 'have'} not been verified (${names}). Send anyway?`
}

/**
 * What the row's badge says. Null for a line with nothing to say (a catalog
 * or typed price), so the page does not sprout a badge on every line.
 */
export function priceBadge(line) {
  if (!isSourced(line)) return null
  // `short` is for the row (the name column is narrow); `text` is the tooltip.
  return line.price_verified_at
    ? { text: 'Sourced · verified', short: 'Verified', tone: 'ok' }
    : { text: 'AI-sourced · unverified', short: 'Unverified', tone: 'redline' }
}

/** The match badge, when Dougie matched the line: exact needs no badge. */
export function matchBadge(line) {
  const k = String(line?.match_kind || '').toLowerCase()
  if (k === 'equivalent') return { text: 'Equivalent', tone: 'info' }
  if (k === 'must_source') return { text: 'Must source', tone: 'warn' }
  return null
}

/**
 * A verification needs a link. "Ticks verified with a source link" was the
 * whole point: the tick without the link is the thing this replaces.
 */
export function canVerify(sourceUrl) {
  const s = String(sourceUrl || '').trim()
  return /^https?:\/\/\S+\.\S+/i.test(s)
}

/** The row patch that verifies a line. Keeps the price the human left there. */
export function verifiedPatch({ sourceUrl, by, now = new Date() }) {
  if (!canVerify(sourceUrl)) throw new Error('A source link is required to verify a price')
  return {
    source_url: String(sourceUrl).trim(),
    price_verified_at: now.toISOString(),
    price_verified_by: by || null,
  }
}

/** Undo a verification — the row goes back to redlined. */
export const unverifiedPatch = { price_verified_at: null, price_verified_by: null }

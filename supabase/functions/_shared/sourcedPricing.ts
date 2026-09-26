// Sourced prices and the send gate — the SERVER half.
//
// A quote line's price is either from the catalog, typed by a person, or
// estimated by Benny from market knowledge ("ai_sourced"). An AI-sourced
// price is redlined until a human sets price_verified_at against a source
// link. Bryce's rule (2026-09-25): a bid is a document you are bound by, so
// an unverified sourced price BLOCKS the send; an estimate or proposal WARNS
// and lets the rep send once they have said they know.
//
// send-estimate enforces this. The browser shows the same words before it
// calls (src/lib/sourcedPricing.js is the twin; keep the two in step — the
// tests there name every branch).

export interface PricedLine {
  id?: number | string
  item_name?: string | null
  price_source?: string | null
  price_verified_at?: string | null
}

export type SendGate = 'ok' | 'warn' | 'block'

export function isUnverifiedSourced(line: PricedLine): boolean {
  return line?.price_source === 'ai_sourced' && !line?.price_verified_at
}

export function unverifiedSourcedLines<T extends PricedLine>(lines: T[] | null | undefined): T[] {
  return (lines || []).filter(isUnverifiedSourced)
}

/** Mirrors lib/documentVocabulary.unverifiedSendRule: bid blocks, the rest warn. */
export function unverifiedSendRule(documentType: string | null | undefined): 'block' | 'warn' {
  return String(documentType || '').toLowerCase() === 'bid' ? 'block' : 'warn'
}

export function sendGate(documentType: string | null | undefined, lines: PricedLine[] | null | undefined): { gate: SendGate; unverified: PricedLine[] } {
  const unverified = unverifiedSourcedLines(lines)
  if (unverified.length === 0) return { gate: 'ok', unverified }
  return { gate: unverifiedSendRule(documentType), unverified }
}

/** The sentence the rep reads, on either side. */
export function sendGateMessage(gate: SendGate, unverified: PricedLine[], documentWord = 'Estimate'): string | null {
  if (gate === 'ok') return null
  const n = unverified.length
  const names = unverified.slice(0, 3).map((l) => l.item_name || 'a line').join(', ') + (n > 3 ? ` and ${n - 3} more` : '')
  if (gate === 'block') {
    return `This bid has ${n} AI-sourced price${n === 1 ? '' : 's'} nobody has verified (${names}). A bid binds you to its numbers — verify each one with a source link before it goes out.`
  }
  return `${n} price${n === 1 ? '' : 's'} on this ${documentWord.toLowerCase()} came from Benny and ${n === 1 ? 'has' : 'have'} not been verified (${names}). Send anyway?`
}

/**
 * Resolve a quote's document type the way the app does: its own type, else
 * what the company leads with (settings.document_types.primary), else estimate.
 */
export function resolveDocumentType(quoteDocumentType: unknown, settingRaw: unknown): string {
  const own = String(quoteDocumentType || '').toLowerCase()
  if (own === 'estimate' || own === 'bid' || own === 'proposal') return own
  let value: any = settingRaw
  if (typeof value === 'string') { try { value = JSON.parse(value) } catch { value = null } }
  const primary = String(value?.primary || '').toLowerCase()
  const enabled: string[] = Array.isArray(value?.enabled) ? value.enabled.map((x: unknown) => String(x).toLowerCase()) : []
  if (primary && enabled.includes(primary)) return primary
  return enabled[0] || 'estimate'
}

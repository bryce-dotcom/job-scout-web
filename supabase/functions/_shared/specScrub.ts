// What a customer is allowed to see on a spec sheet — ONE definition.
//
// The manufacturer's own PDF cannot be handed over: it reads "Phone: (844)
// LEDONE6 | www.ledonecorp.com" and lets the customer re-bid the job with the
// maker directly. So we render our own sheet from the extracted facts, with
// the maker's identity removed.
//
// Naive find-and-replace is wrong, and measurably so. On product 1374 the
// extractor flags 38 brand terms. Blanket case-insensitive substring removal
// of the short ones corrupts the specs:
//   "LOC" -> 8 hits inside ordinary words, 0 real ones
// So short all-caps tokens match on word boundaries only, and are
// case-sensitive. Longer, distinctive strings ("ledonecorp.com") match
// case-insensitively because they cannot collide with anything.
//
// The extractor also flags SMBE and DLC. SMBE is the customer's own product
// line — ours, deliberately kept. KEEP always beats DENY.
//
// Shared with the app through src/lib/specScrub.js so the portal, the PDF and
// the on-screen panel cannot disagree about what leaks.

/** Terms that survive scrubbing no matter who flags them. */
export const DEFAULT_KEEP_TERMS = ['SMBE']

/** Spec rows that identify the part no matter how the value is scrubbed. */
const IDENTIFYING_LABEL = /catalog|model|part\s*(no|number|#)|sku|order\s*code|listing|dlc|manufacturer|brand|series/i

const URL_RE = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io|co)\b/gi
const EMAIL_RE = /\b[\w.+-]+@[\w.-]+\.\w{2,}\b/gi
// (844) LEDONE6 and 1-510-217-9461 both have to go.
const PHONE_RE = /(?:\+?\d[\d\s().-]{6,}\d|\(\d{3}\)\s*[A-Z0-9-]{5,})/g

export interface ScrubSource {
  manufacturer?: string | null
  model_number?: string | null
  dlc_listing_number?: string | null
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Every string that must not reach the customer, longest first so
 * "LEDone Corp" is removed before "LEDone" leaves a dangling "Corp".
 */
export function buildDenyTerms(
  product?: ScrubSource | null,
  brandTerms: string[] = [],
  keepTerms: string[] = DEFAULT_KEEP_TERMS,
  // Every manufacturer the workspace buys from. A product's own fields are not
  // enough: product 1486 is named "SMBE MES 20/40/60/80W Canopy Relocate", but
  // its manufacturer field says LEDOne and "MES" only ever appears inside the
  // composite brand term "SMBE MES" — which is dropped for containing SMBE.
  // Without the shared vocabulary, MES stayed on the customer's page.
  knownManufacturers: string[] = [],
): string[] {
  const keep = new Set(keepTerms.map(k => k.toLowerCase()));
  const raw = [
    product?.manufacturer,
    product?.model_number,
    product?.dlc_listing_number,
    ...(knownManufacturers || []),
    ...(brandTerms || []),
  ].filter((t): t is string => typeof t === 'string' && t.trim().length > 1);

  // A term CONTAINING a keep word is our own product line, not the maker's.
  // The extractor flags "product-line name", so it returns whole names like
  // "SMBE 290W/320W/350W Highbay LIFT" — denying that scrubs the sheet's own
  // title. Dropping the composite is safe because the maker's own tokens
  // (MES, LEDone) are denied separately, so "SMBE MES 20/40/60/80W Canopy"
  // still loses the MES.
  const containsKeep = (term: string) =>
    keepTerms.some(k => new RegExp(`\\b${esc(k)}\\b`, 'i').test(term))

  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of raw) {
    const term = t.trim();
    if (keep.has(term.toLowerCase())) continue;   // KEEP always wins
    if (containsKeep(term)) continue;
    const k = term.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(term);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** A short all-caps token is an acronym — only ever match it standalone. */
function matcherFor(term: string): RegExp {
  const isShortAcronym = term.length <= 5 && /^[A-Z0-9-]+$/.test(term)
  return isShortAcronym
    ? new RegExp(`\\b${esc(term)}\\b`, 'g')            // case-SENSITIVE
    : new RegExp(`\\b${esc(term)}`, 'gi')
}

/** Remove every denied term, plus any url / email / phone number. */
export function scrubText(text: unknown, denyTerms: string[] = []): string {
  if (typeof text !== 'string' || !text) return ''
  let out = text
  for (const term of denyTerms) out = out.replace(matcherFor(term), '')
  // EMAIL before URL: the url pattern matches the domain inside an address
  // and would strip "ledonecorp.com" out of "sales@ledonecorp.com", leaving a
  // dangling "sales@" on the customer's sheet.
  out = out.replace(EMAIL_RE, '').replace(URL_RE, '').replace(PHONE_RE, '')
  // Tidy the punctuation the removals leave behind.
  //
  // A leading "-" is NOT punctuation when a number follows it: stripping it
  // turned "-20°C to 40°C" into "20°C to 40°C" on the operating-temperature
  // row — a 40-degree error published as fact on a customer's proposal. Only
  // trim a dash that stands alone.
  return out.replace(/\s*[|,;]\s*(?=[|,;])/g, '').replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s|,;:]+/, '').replace(/[\s|,;:]+$/, '')
    .replace(/^-\s+/, '').replace(/\s+-$/, '')
    .trim()
}

/**
 * The product name as a customer may see it.
 *
 * Some products are named after the maker outright — "MES 8ft Linear Strip",
 * "LEDONE 8ft Strip Light" — and the name is printed as the sheet title and on
 * the proposal card. Scrubbing the specs while the heading says MES achieves
 * nothing. Falls back to the original when scrubbing would leave it empty,
 * because an untitled product is worse than a branded one; the audit script
 * lists those for renaming.
 */
export function publicTitle(name: unknown, denyTerms: string[] = []): string {
  const raw = typeof name === 'string' ? name.trim() : ''
  if (!raw) return ''
  const cleaned = scrubText(raw, denyTerms)
    .replace(/\(\s*\)/g, '')            // "Highbay (MES)" -> "Highbay ()"
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s\-–—/|,]+|[\s\-–—/|,]+$/g, '')
    .trim()
  return cleaned.length >= 3 ? cleaned : raw
}

/** True when this spec row names the part rather than describing it. */
export function isIdentifyingRow(row: { label?: unknown; value?: unknown }): boolean {
  return IDENTIFYING_LABEL.test(String(row?.label ?? ''))
}

export interface PublicSheet {
  specs: Array<{ label: string; value: string }>
  applications: string[]
  construction: string
  dropped: number
}

/**
 * The customer-facing view of an extraction.
 *
 * A row is dropped rather than published when its label identifies the part,
 * or when scrubbing leaves the value empty — a spec reading "Driver:" with a
 * blank value is worse than no row.
 */
export function publicSheet(
  extraction: { specs?: Array<{ label?: unknown; value?: unknown }>; applications?: unknown[]; construction?: unknown; brand_terms?: string[] } | null | undefined,
  product?: ScrubSource | null,
  keepTerms: string[] = DEFAULT_KEEP_TERMS,
  knownManufacturers: string[] = [],
): PublicSheet {
  const deny = buildDenyTerms(product, extraction?.brand_terms || [], keepTerms, knownManufacturers)
  const specs: Array<{ label: string; value: string }> = []
  let dropped = 0

  for (const row of extraction?.specs || []) {
    if (isIdentifyingRow(row)) { dropped++; continue }
    const label = scrubText(row?.label, deny)
    const value = scrubText(row?.value, deny)
    if (!label || !value) { dropped++; continue }
    specs.push({ label, value })
  }

  return {
    specs,
    applications: (extraction?.applications || [])
      .map(a => scrubText(a, deny)).filter(Boolean) as string[],
    construction: scrubText(extraction?.construction, deny),
    dropped,
  }
}

/**
 * Belt and braces: prove a rendered payload carries none of the denied terms.
 * Used by the tests and by the batch script before anything is published —
 * a silent leak here is the whole risk of the feature.
 */
export function findLeaks(payload: unknown, denyTerms: string[] = []): string[] {
  const text = typeof payload === 'string' ? payload : JSON.stringify(payload ?? '')
  return denyTerms.filter(term => matcherFor(term).test(text))
}

// Shared, forgiving search utilities.
//
// matchAllTokens(haystack, query) — returns true when EVERY whitespace-separated
// token in `query` appears somewhere in `haystack` (case-insensitive). This lets
// users type the words in any order or with extra/missing words and still get a
// match — e.g. "central valley water" matches "Central Valley Water Reclamation
// Facility" and "water valley central" also matches.
//
// Phone digits are stripped from comparison if the query looks numeric.

export function normalizeText(s) {
  return (s == null ? '' : String(s)).toLowerCase().trim()
}

// Returns array of non-empty lowercase tokens.
export function tokenize(query) {
  return normalizeText(query).split(/\s+/).filter(Boolean)
}

// True if every token from `query` appears in `haystack` (substring, case-insensitive).
// Empty query → true (matches everything).
export function matchAllTokens(haystack, query) {
  const tokens = tokenize(query)
  if (tokens.length === 0) return true
  const hay = normalizeText(haystack)
  if (!hay) return false
  for (const t of tokens) if (!hay.includes(t)) return false
  return true
}

// Build a single searchable "blob" string from any number of fields.
// null/undefined are skipped, everything is joined with spaces.
export function buildBlob(...fields) {
  return fields.map(f => (f == null ? '' : String(f))).filter(Boolean).join(' ')
}

// Convenience: phone-aware match. If the query looks like a phone number
// (mostly digits), compare on digits-only against `phone`. Otherwise fall back
// to token-AND match against the blob.
export function matchPhoneOrTokens(blob, phone, query) {
  const q = normalizeText(query)
  if (!q) return true
  const qDigits = q.replace(/\D/g, '')
  if (qDigits.length >= 4 && qDigits.length === q.length) {
    const phoneDigits = (phone || '').toString().replace(/\D/g, '')
    return phoneDigits.includes(qDigits)
  }
  return matchAllTokens(blob, q)
}

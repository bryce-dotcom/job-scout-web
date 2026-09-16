// Zelle deposits name the sender in the bank descriptor:
//   "Zelle payment from DANA SMITH for INV-1042"
//   "ZELLE FROM SMITH DANA"
//   "Zelle Transfer Conf# abc123; Dana Smith"
// Pull the name out and match it to a customer with an open invoice, so the
// Books lists can say "looks like Dana Smith · INV-1042" without anyone
// opening the match modal.

const STOP = new Set(['zelle', 'payment', 'from', 'transfer', 'conf', 'for', 'the', 'llc', 'inc', 'co', 'and', 'of'])

export function zelleSenderName(t) {
  const raw = `${t?.merchant_name || ''} ${t?.name || ''}`
  if (!/\bzelle\b/i.test(raw)) return null
  let s = t?.name || t?.merchant_name || ''
  // Prefer the text after "from"; otherwise whatever follows a separator.
  const m = /\bfrom\s+([^;|,]+?)(?:\s+for\b|\s+conf\b|\s+ref\b|\s*#|$)/i.exec(s)
  if (m) s = m[1]
  else {
    const parts = s.split(/[;|]/).map(x => x.trim()).filter(Boolean)
    s = parts.length > 1 ? parts[parts.length - 1] : s.replace(/\bzelle\b/i, '')
  }
  s = s.replace(/\b(payment|transfer|conf#?\s*\w+|inv[-\s]?\w+|ref\s*\w+)\b/gi, ' ')
  s = s.replace(/[^a-z\s'-]/gi, ' ').replace(/\s+/g, ' ').trim()
  const words = s.split(' ').filter(w => w && !STOP.has(w.toLowerCase()))
  if (words.length === 0) return null
  return words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
}

const tokens = (s) => String(s || '').toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(w => w.length > 1 && !STOP.has(w))

/**
 * Best customer for a sender name. `candidates` = [{ name, ... }]. Returns
 * the candidate and a score, or null. Requires at least two shared name
 * tokens, or one shared token when it is the only token on either side —
 * "Smith" alone is not a match against "Smith Electrical" AND "Dana Smith".
 */
export function matchCustomerName(sender, candidates) {
  const s = tokens(sender)
  if (s.length === 0) return null
  let best = null
  for (const c of candidates || []) {
    const ct = tokens(c.name)
    if (ct.length === 0) continue
    const shared = s.filter(w => ct.includes(w)).length
    const ok = shared >= 2 || (shared === 1 && (s.length === 1 || ct.length === 1))
    if (!ok) continue
    const score = shared / Math.max(s.length, ct.length)
    if (!best || score > best.score) best = { candidate: c, score }
  }
  if (!best) return null
  // Ambiguous: another candidate ties. Say nothing rather than guess.
  const ties = (candidates || []).filter(c => c !== best.candidate && tokens(c.name).filter(w => s.includes(w)).length / Math.max(s.length, tokens(c.name).length) === best.score)
  return ties.length > 0 ? null : best
}

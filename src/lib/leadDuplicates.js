// Near-duplicate leads — THE ONE definition of "this lead probably already
// exists", shared by every form that creates a lead and by the DB backstop
// that flags what the forms miss.
//
// Why this exists: Tracy set an appointment for "Halifax Flooring". Ninety
// minutes later the rep created "Haliflax flooring " — one letter off, a
// trailing space — and quoted from it. Her setter fee was orphaned on the
// original. The ownership transfer that was added for exactly this scenario
// had worked: he could see her lead. He made the duplicate anyway, because
// nothing told him it was one. Visibility is not the same as a warning.
//
// Compare on a squashed form (lowercase, letters and digits only), then allow
// a small edit distance on top, so "Haliflax", "Halifax Flooring LLC" and
// "HALIFAX-FLOORING" all land on the same lead. Phone and email are exact
// after normalisation — the same number is the same customer whatever the
// name says.

export const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
const lastDigits = (s) => String(s ?? '').replace(/\D/g, '').slice(-10)
const lowerEmail = (s) => String(s ?? '').trim().toLowerCase()

// Statuses that mean the earlier lead is over. A new lead for a customer who
// was lost last year is normal business, not a duplicate.
const CLOSED_STATUSES = new Set(['lost', 'dead', 'closed lost', 'not interested', 'disqualified', 'archived'])

/** Levenshtein distance with an early exit once it must exceed `max`. */
export function editDistance(a, b, max = Infinity) {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  if (!a.length) return b.length
  if (!b.length) return a.length
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[b.length]
}

// How many letters may differ before two names stop being "the same name".
// Short names get one; anything ten characters or longer gets two.
const tolerance = (len) => (len >= 10 ? 2 : 1)

/**
 * Rank existing leads that look like the same customer as `candidate`.
 *
 * @param candidate  { customer_name, business_name, phone, email }
 * @param leads      the company's leads (any shape with those fields + id, status, created_at)
 * @param opts       { excludeId, maxAgeDays = 365, now = Date.now() }
 * @returns [{ lead, score, reasons: [{ kind, detail }] }] strongest first. Empty when nothing matches.
 *
 * Scores: exact name 60 · contained name 45 · name within edit tolerance 40 ·
 * same phone 50 · same email 50. Two signals stack, so a same-name same-phone
 * hit outranks either alone.
 */
export function findSimilarLeads(candidate, leads, opts = {}) {
  const { excludeId = null, maxAgeDays = 365, now = Date.now() } = opts
  const names = [candidate?.customer_name, candidate?.business_name].map(squash).filter((s) => s.length >= 4)
  const phone = lastDigits(candidate?.phone)
  const email = lowerEmail(candidate?.email)
  if (!names.length && phone.length < 7 && !email) return []

  const out = []
  for (const lead of leads || []) {
    if (!lead || (excludeId != null && String(lead.id) === String(excludeId))) continue
    if (CLOSED_STATUSES.has(String(lead.status || '').toLowerCase())) continue
    if (maxAgeDays && lead.created_at) {
      const age = (now - new Date(lead.created_at).getTime()) / 86400000
      if (age > maxAgeDays) continue
    }

    const reasons = []
    let score = 0
    const theirs = [lead.customer_name, lead.business_name].map(squash).filter((s) => s.length >= 4)
    let bestName = 0
    for (const a of names) {
      for (const b of theirs) {
        if (a === b) { bestName = Math.max(bestName, 60); continue }
        const shorter = Math.min(a.length, b.length)
        if (shorter >= 6 && (a.includes(b) || b.includes(a))) { bestName = Math.max(bestName, 45); continue }
        const tol = tolerance(Math.max(a.length, b.length))
        if (editDistance(a, b, tol) <= tol) bestName = Math.max(bestName, 40)
      }
    }
    if (bestName) {
      reasons.push({ kind: 'name', detail: bestName === 60 ? 'same name' : bestName === 45 ? 'name contains the other' : 'one or two letters off' })
      score += bestName
    }
    if (phone.length >= 7 && lastDigits(lead.phone) === phone) { reasons.push({ kind: 'phone', detail: 'same phone number' }); score += 50 }
    if (email && lowerEmail(lead.email) === email) { reasons.push({ kind: 'email', detail: 'same email' }); score += 50 }

    if (reasons.length) out.push({ lead, score, reasons })
  }
  return out.sort((x, y) => y.score - x.score || new Date(y.lead.created_at || 0) - new Date(x.lead.created_at || 0))
}

/** One line a person can read: "same name · same phone number". */
export function describeMatch(match) {
  return (match?.reasons || []).map((r) => r.detail).join(' · ')
}

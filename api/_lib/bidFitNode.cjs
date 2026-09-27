// The dedupe key for a Vercel cron, in CommonJS.
//
// api/ runs on Node and cannot import the Deno module in
// supabase/functions/_shared/bidFit.ts, so the ONE function a cron needs is
// carried here in the same words. bidFitNode.test.js asserts the two hashes
// agree, which is what makes a SAM.gov row and a portal alert for the same
// solicitation collapse into one card.

function normalizeText(s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

function fnv1a64(s) {
  let h = 0xcbf29ce484222325n
  const P = 0x100000001b3n
  const M = 0xffffffffffffffffn
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i) & 0xff)
    h = (h * P) & M
  }
  return h.toString(16).padStart(16, '0')
}

function dedupeHash(o) {
  const num = normalizeText(o.solicitation_number).replace(/ /g, '')
  if (num.length >= 4) return 'n:' + fnv1a64(num)
  const day = o.due_at ? String(o.due_at).slice(0, 10) : ''
  return 't:' + fnv1a64(`${normalizeText(o.buyer)}|${normalizeText(o.title)}|${day}`)
}

module.exports = { normalizeText, fnv1a64, dedupeHash }

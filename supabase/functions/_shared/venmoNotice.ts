// Deno twin of src/lib/venmoNotice.js — the browser reads notices, the
// inbound-email function creates them, and both must agree on what a Venmo
// email says. Kept identical on purpose: src/lib/venmoNotice.test.js runs the
// SAME cases through both files and fails if they ever drift.
//
// If you change one, change the other.
// Reading Venmo's "someone paid you" email.
//
// Tracy (2026-10-09): "It would be greatly appreciated if we can figure out how
// to link the venmo payment to an invoice. This would make it easier for me to
// see when someone pays by venmo since I don't see those transactions."
//
// WHY SHE CANNOT SEE THEM, which took looking rather than guessing:
//
// HHH's bank feed carries 45 rows saying "Venmo", $25,203.70 of them, and every
// single one is money going OUT — the company funding its Venmo balance. Not
// one is a customer paying in. No Venmo account is connected either; the only
// linked institution is Mountain America (checking, savings, a card).
//
// So when a customer Venmos HHH the money lands in the Venmo balance, which
// JobScout cannot see, and it stays invisible until somebody transfers it to
// the bank — and the transfer, when it comes, is one lump that says nothing
// about who paid or what for.
//
// 'Venmo' already exists as a payment method and three have been recorded by
// hand. The missing half is not recording it; it is KNOWING.
//
// Venmo does announce every payment, by email, immediately. This reads that
// email. It is deliberately strict: a notice it cannot parse confidently is
// left alone rather than turned into a payment nobody can trace.

/** Venmo's own sending domains. Anything else is somebody forwarding spam. */
export const VENMO_SENDERS = ['venmo.com', 'email.venmo.com']

/** Did this actually come from Venmo? Checked on the envelope, not the body. */
export function isVenmoSender(from) {
  const addr = String(from || '').toLowerCase()
  const at = addr.lastIndexOf('@')
  if (at < 0) return false
  // The part after the last @, trimmed of a trailing '>' from "Name <a@b>".
  const domain = addr.slice(at + 1).replace(/[>\s].*$/, '')
  return VENMO_SENDERS.some((d) => domain === d || domain.endsWith('.' + d))
}

const money = (s) => {
  const n = Number(String(s).replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null
}

/**
 * Who paid, how much, and what they said.
 *
 * Venmo's subject line has carried the same shape for years —
 * "Jane Smith paid you $120.00" — and the note is the line the payer typed.
 * The subject is the reliable part; the body is where the formatting churns,
 * so the subject is tried first and the body only as a fallback.
 */
export function parseVenmoNotice({ from, subject, text } = {}) {
  if (!isVenmoSender(from)) return null

  const subj = String(subject || '').replace(/\s+/g, ' ').trim()
  const body = String(text || '').replace(/\r/g, '')

  // "Jane Smith paid you $120.00"
  let m = subj.match(/^(.+?)\s+paid\s+you\s+\$([0-9,]+(?:\.[0-9]{2})?)/i)
  if (!m) {
    // Some notices put it in the body instead.
    m = body.match(/(.+?)\s+paid\s+you\s+\$([0-9,]+(?:\.[0-9]{2})?)/i)
  }
  if (!m) return null

  const amount = money(m[2])
  if (!amount) return null

  const payer = m[1].replace(/^(re|fwd|fw)\s*:\s*/i, '').trim()
  if (!payer || payer.length > 80) return null

  // The payer's note, when Venmo included one. Quoted or on its own line.
  let note = null
  const n = body.match(/^\s*(?:note|message|for)\s*[:\-]\s*(.+)$/im)
  if (n) note = n[1].trim().slice(0, 200)

  return { payer, amount, note, source: 'venmo_email' }
}

/**
 * The invoice this notice is probably for.
 *
 * Deliberately conservative. It returns ONE candidate or none — never a list
 * to pick from — because a wrong guess silently marks the wrong customer paid,
 * and "I could not tell" is a fine answer for Tracy to resolve in two clicks.
 *
 * An exact invoice number in the payer's note beats everything: somebody who
 * typed "INV-1042" has told us the answer. Otherwise it needs BOTH the amount
 * to match to the cent AND exactly one open invoice at that amount.
 */
export function matchNoticeToInvoice(notice, invoices = []) {
  if (!notice) return null
  const open = (invoices || []).filter(
    (i) => i && Number(i.balance_due ?? i.amount) > 0 && String(i.payment_status || '') !== 'Paid',
  )

  const ref = String(notice.note || '').match(/\b(INV[-\s]?[A-Z0-9]{3,})\b/i)
  if (ref) {
    const want = ref[1].replace(/\s/g, '').toUpperCase()
    const hit = open.find((i) => String(i.invoice_id || '').replace(/\s/g, '').toUpperCase() === want)
    if (hit) return { invoice: hit, why: `the payer wrote ${hit.invoice_id} in the note`, confident: true }
  }

  const cents = Math.round(Number(notice.amount) * 100)
  const sameAmount = open.filter((i) => Math.round(Number(i.balance_due ?? i.amount) * 100) === cents)
  if (sameAmount.length === 1) {
    return { invoice: sameAmount[0], why: `the only open invoice for exactly ${fmt(notice.amount)}`, confident: true }
  }
  if (sameAmount.length > 1) {
    return { invoice: null, why: `${sameAmount.length} open invoices are for exactly ${fmt(notice.amount)}`, confident: false }
  }
  return { invoice: null, why: 'no open invoice matches that amount', confident: false }
}

const fmt = (n) =>
  `$${(Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

/** The row to file. Never a payment — a notice, until somebody says which invoice. */
export function noticeRow({ companyId, notice, raw } = {}) {
  if (!notice) return null
  return {
    company_id: companyId,
    payer_name: notice.payer,
    amount: notice.amount,
    note: notice.note || null,
    source: notice.source || 'venmo_email',
    raw_subject: String(raw?.subject || '').slice(0, 300) || null,
    received_at: raw?.receivedAt || new Date().toISOString(),
  }
}

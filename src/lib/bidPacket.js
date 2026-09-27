// The bid packet: what the buyer asked for, whether we have it, and whether
// the bid may go out. One rule for the estimate page, Sal's board and, in
// Phase 3, the submit function (SAL_SCOUT_PLAN.md §5.7–5.8).
//
// A checklist row: { key, item, required, kind, page, auto, done, done_by,
// done_at, waived_reason }. `auto` names the piece the packet builder can
// satisfy by itself ('bid_form' | 'cover_letter' | 'qualifications' |
// 'cert:insurance' | 'cert:workers_comp' | 'cert:w9' | 'cert:business_license'
// | 'cert:bond'); everything else is a person's job and stays so.

import { sendGate } from './sourcedPricing'

/** The six files every packet wants, read off the companies row (§4.5). */
export const CERT_KINDS = [
  { key: 'insurance', label: 'Certificate of insurance', url: 'insurance_cert_url', expires: 'insurance_expiration' },
  { key: 'workers_comp', label: "Workers' comp certificate", url: 'workers_comp_cert_url', expires: 'workers_comp_expiration' },
  { key: 'w9', label: 'W-9', url: 'w9_url', expires: null },
  { key: 'business_license', label: 'Business license', url: 'business_license_url', expires: null },
  { key: 'bond', label: 'Bonding letter', url: 'bond_cert_url', expires: null },
]

const day = (d) => { const x = new Date(d); return Number.isNaN(x.getTime()) ? null : x }

/** Each certificate: present, and unexpired at the bid's due date. */
export function certificateItems(company, dueAt = null) {
  const due = dueAt ? day(dueAt) : null
  return CERT_KINDS.map((c) => {
    const url = company?.[c.url] || null
    const exp = c.expires && company?.[c.expires] ? day(company[c.expires]) : null
    const expiredAtDue = !!(exp && due && exp < due)
    const expiredNow = !!(exp && exp < new Date())
    return { key: c.key, label: c.label, url, expires: exp ? exp.toISOString().slice(0, 10) : null, present: !!url, expiredAtDue, expiredNow }
  })
}

/** The checklist rows a packet always carries, ahead of whatever the package demanded. */
export function baseChecklist() {
  return [
    { key: 'bid_form', item: 'Bid schedule / bid form, priced and complete', required: true, kind: 'pricing', page: null, auto: 'bid_form' },
    { key: 'cover_letter', item: 'Transmittal / cover letter', required: false, kind: 'other', page: null, auto: 'cover_letter' },
    { key: 'qualifications', item: 'Qualification statement', required: false, kind: 'other', page: null, auto: 'qualifications' },
  ]
}

/**
 * Seed a checklist from what Benny read (requirements.checklist) plus the
 * base rows, deduplicated by key. Rows from the package keep their words.
 */
export function seedChecklist(requirements) {
  const seen = new Set()
  const out = []
  for (const r of [...baseChecklist(), ...((requirements && requirements.checklist) || [])]) {
    const key = String(r.key || r.item || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
    if (!key || seen.has(key)) continue
    seen.add(key)
    // A bid or performance bond is issued per project by the surety; the
    // bonding LETTER on file never satisfies it. Only a capacity letter row
    // may auto-tick from the certificate library.
    const kind = r.kind || 'other'
    const auto = kind === 'bond' && !/letter|capacity/i.test(String(r.item || '')) ? null : (r.auto || null)
    out.push({ key, item: r.item || key, required: r.required !== false, kind, page: r.page ?? null, auto, done: false, done_by: null, done_at: null, waived_reason: null })
  }
  return out
}

/**
 * Tick the rows the packet can prove by itself. Certificates count when the
 * file is on the company and unexpired at the due date; the bid form, cover
 * letter and qualifications count when the packet holds them. Never unticks
 * something a person ticked.
 */
export function autoDoneChecklist(checklist, { company, dueAt, packet = [], coverLetter = '' } = {}) {
  const certs = Object.fromEntries(certificateItems(company, dueAt).map((c) => [c.key, c]))
  const has = (kind) => (packet || []).some((p) => p.kind === kind)
  const now = new Date().toISOString()
  return (checklist || []).map((row) => {
    if (row.done) return row
    let ok = false
    if (row.auto === 'bid_form') ok = has('bid_form')
    else if (row.auto === 'cover_letter') ok = has('cover_letter') || !!String(coverLetter || '').trim()
    else if (row.auto === 'qualifications') ok = has('qualifications')
    else if (String(row.auto || '').startsWith('cert:')) { const c = certs[row.auto.slice(5)]; ok = !!(c && c.present && !c.expiredAtDue) }
    return ok ? { ...row, done: true, done_by: 'packet', done_at: now } : row
  })
}

/**
 * §5.8: may this bid be submitted? Every reason it may not, in the words the
 * page shows. `inMargin` is advisory (a person may race the clock on purpose).
 */
export function submitReadiness({ documentType = 'bid', lines = [], checklist = [], company = null, dueAt = null, blockers = [], dueMarginHours = 24 } = {}) {
  const reasons = []
  const gate = sendGate(documentType, lines)
  if (gate.gate === 'block') reasons.push(`${gate.unverified.length} AI-sourced price${gate.unverified.length === 1 ? '' : 's'} not yet verified`)
  else if (gate.gate === 'warn') reasons.push(`${gate.unverified.length} AI-sourced price${gate.unverified.length === 1 ? '' : 's'} not yet verified (an estimate may still go; a bid may not)`)
  const open = (checklist || []).filter((r) => r.required && !r.done && !r.waived_reason)
  for (const r of open) reasons.push(`Checklist: ${r.item}${r.page ? ` (page ${r.page})` : ''}`)
  for (const c of certificateItems(company, dueAt)) {
    const needed = (checklist || []).some((r) => r.auto === `cert:${c.key}` && r.required && !r.waived_reason)
    if (needed && c.present && c.expiredAtDue) reasons.push(`${c.label} expires ${c.expires}, before the bid is due`)
  }
  for (const b of blockers || []) reasons.push(`Blocker: ${typeof b === 'string' ? b : b.text || b.reason || JSON.stringify(b)}`)
  let inMargin = false
  if (dueAt) {
    const due = day(dueAt)
    if (due && due < new Date()) reasons.push('The due date has passed')
    else if (due && due - new Date() < dueMarginHours * 3600e3) inMargin = true
  }
  return { ready: reasons.length === 0, reasons, inMargin, unverified: gate.unverified.length }
}

/** The order the buyer reads the packet in. */
export const PACKET_ORDER = ['bid_form', 'cover_letter', 'qualifications', 'buyer_form', 'cert:insurance', 'cert:workers_comp', 'cert:w9', 'cert:business_license', 'cert:bond', 'other']

export function sortPacket(packet) {
  const rank = (k) => { const i = PACKET_ORDER.indexOf(k); return i < 0 ? PACKET_ORDER.length : i }
  return [...(packet || [])].sort((a, b) => rank(a.kind) - rank(b.kind) || String(a.file_name || '').localeCompare(String(b.file_name || '')))
}

/** The exact sentence an approver ticks (§5.8.6). Phase 3 stores it. */
export function approvalSentence(companyName) {
  return `I have reviewed this bid, its prices and its attachments, and I authorize its submission on behalf of ${companyName || 'the company'}.`
}

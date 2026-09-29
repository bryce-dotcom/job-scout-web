// May this bid be submitted? The SERVER half of lib/bidPacket.js
// (SAL_SCOUT_PLAN.md §5.8). bid-submit refuses an approval that the page
// would have refused, in the same words. Keep the two in step — the browser
// twin's tests name every branch.

import { sendGate } from './sourcedPricing.ts'

// deno-lint-ignore no-explicit-any
type Any = any

export const CERT_KINDS = [
  { key: 'insurance', label: 'Certificate of insurance', url: 'insurance_cert_url', expires: 'insurance_expiration' },
  { key: 'workers_comp', label: "Workers' comp certificate", url: 'workers_comp_cert_url', expires: 'workers_comp_expiration' },
  { key: 'w9', label: 'W-9', url: 'w9_url', expires: null },
  { key: 'business_license', label: 'Business license', url: 'business_license_url', expires: null },
  { key: 'bond', label: 'Bonding letter', url: 'bond_cert_url', expires: null },
]

const day = (d: unknown) => { const x = new Date(String(d)); return Number.isNaN(x.getTime()) ? null : x }

export function certificateItems(company: Any, dueAt: string | null = null) {
  const due = dueAt ? day(dueAt) : null
  return CERT_KINDS.map((c) => {
    const url = company?.[c.url] || null
    const exp = c.expires && company?.[c.expires] ? day(company[c.expires]) : null
    return { key: c.key, label: c.label, url, expires: exp ? exp.toISOString().slice(0, 10) : null, present: !!url, expiredAtDue: !!(exp && due && exp < due) }
  })
}

export function submitReadiness({ documentType = 'bid', lines = [], checklist = [], company = null, dueAt = null, blockers = [], dueMarginHours = 24 }: {
  documentType?: string; lines?: Any[]; checklist?: Any[]; company?: Any; dueAt?: string | null; blockers?: Any[]; dueMarginHours?: number
}) {
  const reasons: string[] = []
  const gate = sendGate(documentType, lines)
  if (gate.gate === 'block') reasons.push(`${gate.unverified.length} AI-sourced price${gate.unverified.length === 1 ? '' : 's'} not yet verified`)
  else if (gate.gate === 'warn') reasons.push(`${gate.unverified.length} AI-sourced price${gate.unverified.length === 1 ? '' : 's'} not yet verified (an estimate may still go; a bid may not)`)
  for (const r of (checklist || []).filter((r: Any) => r.required && !r.done && !r.waived_reason)) reasons.push(`Checklist: ${r.item}${r.page ? ` (page ${r.page})` : ''}`)
  for (const c of certificateItems(company, dueAt)) {
    const needed = (checklist || []).some((r: Any) => r.auto === `cert:${c.key}` && r.required && !r.waived_reason)
    if (needed && c.present && c.expiredAtDue) reasons.push(`${c.label} expires ${c.expires}, before the bid is due`)
  }
  for (const b of blockers || []) reasons.push(`Blocker: ${typeof b === 'string' ? b : b.text || b.reason || JSON.stringify(b)}`)
  let inMargin = false
  if (dueAt) {
    const due = day(dueAt)
    if (due && due < new Date()) reasons.push('The due date has passed')
    else if (due && due.getTime() - Date.now() < dueMarginHours * 3600e3) inMargin = true
  }
  return { ready: reasons.length === 0, reasons, inMargin, unverified: gate.unverified.length }
}

/** The exact sentence an approver ticks (§5.8.6). */
export function approvalSentence(companyName: string | null | undefined) {
  return `I have reviewed this bid, its prices and its attachments, and I authorize its submission on behalf of ${companyName || 'the company'}.`
}

// W-9 status for 1099 contractors.
//
// Alayda filed from /employees asking about "Form W-9 — Request for Taxpayer
// ID and Certification" (feedback a84b18e3). Collection already works through
// the onboarding portal, but W-9 state only showed on an employee's DETAIL
// page — so with several contractors nobody could see who was still missing
// one without opening each record. At the time of writing, 6 of 7 contractors
// had no W-9 on file, which blocks year-end 1099-NEC filing.
//
// Pure predicates only — no SSN/TIN values are handled here, just whether a
// taxpayer ID exists (last-4 / encrypted presence).

export function isContractor(emp) {
  return /1099|contractor/i.test(String(emp?.tax_classification || ''))
}

/**
 * A W-9 is "on file" when we have the legal name AND some taxpayer ID.
 * The TIN can be an SSN (ssn_last4/ssn_encrypted) or a business EIN
 * (w9_ein_last4), depending on how the contractor is set up.
 */
export function hasW9(emp) {
  if (!emp) return false
  const legalName = String(emp.w9_legal_name || '').trim()
  const hasTin = !!(emp.ssn_last4 || emp.ssn_encrypted || emp.w9_ein_last4)
  return !!legalName && hasTin
}

/** 'not_required' (W-2) | 'on_file' | 'missing' */
export function w9Status(emp) {
  if (!isContractor(emp)) return 'not_required'
  return hasW9(emp) ? 'on_file' : 'missing'
}

/** Contractors still owing a W-9 — what an admin needs to chase. */
export function contractorsMissingW9(employees = []) {
  return (employees || []).filter((e) => e && e.active !== false && w9Status(e) === 'missing')
}

// What a customer agreed to when we text them — and whether we may.
//
// Registering for A2P 10DLC forces the question a carrier asks: how did these
// people consent? JobScout had no answer. Nothing on the customer form, the
// estimate or the portal said we may text them, no message carried opt-out
// wording, and the field that looks like consent — marketing_opt_in — is true
// for 2,687 of HHH's 3,376 customers because an import defaulted it. So it is
// evidence of nothing, and this module never reads it.
//
// The distinction that matters, and the reason nothing here blocks the texts
// the app already sends:
//
//   TRANSACTIONAL   an invoice is past due, here is your onboarding link,
//                   following up on the estimate you asked us for. The
//                   existing business relationship covers these. They are
//                   what all four of JobScout's senders send today.
//   MARKETING       a promotion nobody asked for. Needs express consent,
//                   recorded, with the date and how it was obtained.
//
// Written down once, here, so the first marketing sender anyone builds has a
// rule to call instead of inventing its own.

/** How a consent record came to exist. */
export const CONSENT_SOURCES = {
  office: 'Recorded by staff',
  portal: 'Ticked by the customer',
  import: 'Came in with an import',
}

/** Why we are texting. MARKETING is the only kind that needs express consent. */
export const TRANSACTIONAL = 'transactional'
export const MARKETING = 'marketing'

/** The path to a company's public SMS terms. No slug still gives a real page. */
export function smsTermsPath(slug) {
  const s = String(slug || '').trim()
  return s ? `/sms-terms/${encodeURIComponent(s)}` : '/sms-terms'
}

/** The absolute URL — what gets pasted into the Twilio campaign form. */
export function smsTermsUrl(slug, origin = '') {
  const base = String(origin || '').replace(/\/+$/, '')
  return `${base}${smsTermsPath(slug)}`
}

/**
 * The sentence the customer is agreeing to. The company's own name, because a
 * carrier matches the disclosure against the brand that registered — and
 * because "JobScout may text you" is not true for the customer of a tenant.
 */
export function consentDisclosure(companyName) {
  const who = String(companyName || '').trim() || 'this company'
  return `${who} may text me about my estimates, appointments, jobs and invoices. `
    + 'Message frequency varies, and message and data rates may apply. '
    + 'Reply STOP to stop, HELP for help.'
}

/**
 * The columns to write when the consent box is ticked or cleared.
 *
 * An already-given consent keeps its original date: the date is the evidence,
 * and editing a customer's address must not quietly re-date it to today.
 * Clearing it clears all three — the audit log holds the history, this holds
 * the current truth.
 */
export function recordConsent({ on, source = 'office', now = new Date(), existing = null } = {}) {
  if (!on) return { sms_consent: false, sms_consent_at: null, sms_consent_source: null }
  const was = existing?.sms_consent === true
  return {
    sms_consent: true,
    sms_consent_at: (was && existing?.sms_consent_at) || now.toISOString(),
    sms_consent_source: (was && existing?.sms_consent_source) || source,
  }
}

/** Consent as something to render: given, when, and how. */
export function smsConsentState(customer) {
  const given = customer?.sms_consent === true
  const at = customer?.sms_consent_at || null
  const source = customer?.sms_consent_source || null
  return {
    given,
    at,
    source,
    label: !given
      ? 'Not given'
      : `Given${at ? ' ' + new Date(at).toLocaleDateString() : ''}${source ? ' · ' + (CONSENT_SOURCES[source] || source) : ''}`,
  }
}

/**
 * May we text this customer for this purpose?
 *
 * A number is the floor: no phone, no text, whatever any box says. Beyond
 * that, transactional needs the business relationship we already have, and
 * marketing needs the recorded yes. marketing_opt_in is not consulted — it
 * governs email, where it came from, and it was never asked about texts.
 */
export function mayText(customer, purpose = TRANSACTIONAL) {
  if (!customer?.phone || !String(customer.phone).trim()) return false
  if (purpose === MARKETING) return customer?.sms_consent === true
  return true
}

/** Why we may not, as a sentence — or null when we may. */
export function mayTextProblem(customer, purpose = TRANSACTIONAL) {
  if (!customer?.phone || !String(customer.phone).trim()) return 'No phone number on this customer.'
  if (purpose === MARKETING && customer?.sms_consent !== true) {
    return 'This customer has not agreed to marketing texts. Transactional messages about their own jobs and invoices are still fine.'
  }
  return null
}

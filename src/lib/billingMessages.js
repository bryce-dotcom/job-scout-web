// What we say to an account that has gone read-only.
//
// Deliberately dependency-free. The banner reaches this through billingAccess
// (React, store, supabase), and a refused write reaches it through writeGate,
// which toast.js imports — and toast is imported almost everywhere. Keeping the
// wording in a leaf module means the two paths can share it without dragging
// the store and the supabase client into every module that shows a toast.
//
// One owner of the words, so the banner and the error underneath it can never
// tell the customer two different stories.

// Hard billing stops → read-only. 'past_due' is intentionally NOT here: a
// paying customer whose card just failed keeps a grace period (the banner nags
// them) rather than being locked out mid-work.
// Keep in sync with company_can_write() in the database.
export const READ_ONLY_STATUSES = ['trial_expired', 'canceled']

export const READ_ONLY_REASON = {
  trial_expired: 'Your free trial has ended. Pick a plan to start editing again — your data is safe and still here.',
  canceled: 'Your subscription is canceled. Re-subscribe to start editing again — your data is safe and still here.',
}

// When a write is refused by the database gate we see the refusal, not the
// status, so this wording has to cover both stops.
export const READ_ONLY_WRITE_REASON =
  'This account is read-only — the free trial ended or the subscription was canceled. ' +
  'Your data is safe and still here. Pick a plan in Settings › Billing to start editing again.'

export function isReadOnlyStatus(status) {
  return READ_ONLY_STATUSES.includes(status)
}

export function readOnlyReason(status) {
  return READ_ONLY_REASON[status] || 'This account is read-only.'
}

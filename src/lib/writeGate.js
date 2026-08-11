// Say what actually happened when an account is locked.
//
// When a trial ends, 123 tables become read-only through a RESTRICTIVE RLS
// policy. Postgres rejects the write with its own wording, and the app passed
// that straight through to the person using it — Antonio's beta tester saw:
//
//   Error submitting feedback: new row violates row-level security policy
//   "require_writable_ins" for table "feedback"
//
// That names an internal policy, names a table, and never mentions the trial.
// It reads like the software is broken rather than like an account that needs
// renewing, and it is the first thing a prospective customer sees at exactly
// the moment we are asking them to pay.
//
// One translation, used everywhere an error reaches a person.

/** Postgres insufficient_privilege — what RLS raises when a policy refuses. */
const RLS_CODE = '42501'

/** The trial read-only gate specifically, as opposed to any other RLS refusal. */
const GATE_POLICY = /require_writable/i

const textOf = (err) =>
  typeof err === 'string' ? err : [err?.message, err?.details, err?.hint].filter(Boolean).join(' ')

/** Did the trial/subscription read-only gate stop this write? */
export function isReadOnlyGate(err) {
  const text = textOf(err)
  if (GATE_POLICY.test(text)) return true
  // Belt and braces: the policy could be renamed, but the code plus the
  // row-level-security wording still identifies the same refusal.
  return err?.code === RLS_CODE && /row-level security/i.test(text)
}

/** Any RLS refusal that is NOT the billing gate — a genuine permission problem. */
export function isPermissionError(err) {
  return !isReadOnlyGate(err) && (err?.code === RLS_CODE || /row-level security/i.test(textOf(err)))
}

/**
 * What to show a person. Returns null when the error is ordinary and should be
 * reported as-is, so this never swallows a real message.
 */
export function friendlyWriteError(err) {
  if (isReadOnlyGate(err)) {
    return 'Your trial has ended, so the account is read-only. Everything is still here — ' +
      'renew from Settings › Billing to start making changes again.'
  }
  if (isPermissionError(err)) {
    return "You don't have access to change this. Ask an admin on your team if you think you should."
  }
  return null
}

/** The message to show, falling back to the original wording. */
export function writeErrorMessage(err, fallbackPrefix = '') {
  const friendly = friendlyWriteError(err)
  if (friendly) return friendly
  const raw = textOf(err) || 'Something went wrong.'
  return fallbackPrefix ? `${fallbackPrefix}${raw}` : raw
}

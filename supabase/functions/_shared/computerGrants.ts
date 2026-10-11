// The leash. One decision, written once, imported by the cloud (arnie-computer)
// and by the agent running on the person's machine.
//
// Why one module and not a rule in each place: this project's recurring failure
// is one rule written down twice — the sold definition that had three live
// answers $426k apart, the estimate conversion the portal had quietly drifted a
// copy of, the invoice lines built five different ways. A permission check is
// the worst possible candidate for a second copy, because the two copies
// disagreeing is indistinguishable from a bypass.
//
// The agent enforces this LOCALLY as well as the server enforcing it. That is
// not redundancy for its own sake: an agent that only did what the server told
// it would do whatever a compromised server told it. The machine's copy is the
// one that actually protects the machine; the server's copy is the audit and
// the second opinion.

export type Tier = 'watch' | 'click' | 'full'
export type Decision =
  | { ok: true; tier: Tier }
  | { ok: false; refuse: string }
  | { ok: false; needsHuman: string }

export interface Grant {
  app: string
  host: string
  tier: Tier
  duration: 'once' | 'always'
  expires_at?: string | null
  revoked_at?: string | null
  consumed_at?: string | null
}

export interface Action {
  kind: string
  app?: string | null
  host?: string | null
  target?: Record<string, unknown> | null
}

/**
 * What each tier may do.
 *
 *   watch — look, and nothing else. A screenshot and a text read.
 *   click — look and click, but never type. This is where a terminal or an IDE
 *           belongs: clicking Run is recoverable, a stray keystroke in a source
 *           file is not, and a right-click menu holds Paste.
 *   full  — everything.
 *
 * Tiers are not a convenience ladder; 'click' exists because of specific
 * programs that must never be typed into, so do not let it drift into meaning
 * "mostly allowed".
 */
export const TIER_ALLOWS: Record<Tier, readonly string[]> = {
  watch: ['screenshot', 'read_text'],
  click: ['screenshot', 'read_text', 'click', 'double_click', 'scroll', 'launch'],
  full: ['screenshot', 'read_text', 'click', 'double_click', 'right_click', 'type', 'key', 'scroll', 'drag', 'launch'],
}

/**
 * Anything that looks like it wants a secret. Arnie does not type one, ever —
 * not a utility login, not an email password, not a card number. This is not a
 * policy that could be relaxed with a flag; it is the reason the feature needs
 * no credential vault, and the reason "per user" costs nothing to guarantee.
 *
 * On a login page the right behaviour is to STOP and say so. The person types
 * their own password and clears their own 2FA, and the session that results
 * lives in their own browser profile on their own machine. Arnie carries on
 * into a session he inherited and never learned the secret for.
 */
const CREDENTIAL_HINTS = [
  'password', 'passwd', 'passcode', 'pin', 'secret', 'token', 'api key', 'apikey',
  'security code', 'cvv', 'cvc', 'card number', 'cardnumber', 'routing', 'account number',
  'ssn', 'social security', 'one-time', 'onetime', 'otp', '2fa', 'two-factor', 'verification code',
  'mfa', 'authenticator',
]

/**
 * Controls whose click cannot be taken back. Arnie fills the form and then
 * hands it over: the person reads it and clicks this themselves.
 *
 * Deliberately broad. A false stop costs one click of a human's time; a false
 * allow files a wrong rebate application, sends a half-written email to a
 * customer, or pays something twice.
 */
const IRREVERSIBLE_HINTS = [
  'submit', 'send', 'pay', 'purchase', 'buy', 'order now', 'place order', 'checkout',
  'delete', 'remove', 'destroy', 'cancel subscription', 'confirm', 'approve', 'sign',
  'accept', 'agree', 'archive', 'publish', 'post', 'transfer', 'wire', 'withdraw',
]

const hay = (a: Action): string => {
  const t = a.target || {}
  return [t.label, t.name, t.placeholder, t.aria_label, t.role, t.text, t.css, t.id]
    .filter((x) => typeof x === 'string')
    .join(' ')
    .toLowerCase()
}

/** A field asking for a secret. Checked for every typing action. */
export function isCredentialTarget(a: Action): boolean {
  const t = a.target || {}
  if (String(t.type || '').toLowerCase() === 'password') return true
  if (t.is_password === true) return true
  const h = hay(a)
  return CREDENTIAL_HINTS.some((k) => h.includes(k))
}

/** A control a person has to click themselves. */
export function isIrreversibleTarget(a: Action): boolean {
  const h = hay(a)
  // Match on the control's own words, not any text that happens to be nearby —
  // a page with a Submit button somewhere must not freeze every click on it.
  const own = [a.target?.label, a.target?.text, a.target?.name, a.target?.aria_label]
    .filter((x) => typeof x === 'string').join(' ').toLowerCase()
  return IRREVERSIBLE_HINTS.some((k) => own.includes(k)) ||
    (!own && IRREVERSIBLE_HINTS.some((k) => h.includes(k)))
}

const live = (g: Grant, now: Date): boolean => {
  if (g.revoked_at) return false
  if (g.duration === 'once' && g.consumed_at) return false
  if (g.expires_at && new Date(g.expires_at) <= now) return false
  return true
}

const TIER_RANK: Record<Tier, number> = { watch: 0, click: 1, full: 2 }

/**
 * The grant that applies to an action, or null.
 *
 * A host-specific grant wins over the app-wide one, and among equals the
 * NARROWEST tier wins — never the widest. If somebody has both a 'watch' on
 * chrome and a 'full' on chrome, the honest reading of that pair is 'watch';
 * taking the maximum would let a stale broad grant quietly re-widen a
 * deliberate narrowing.
 */
export function grantFor(grants: Grant[], a: Action, now: Date = new Date()): Grant | null {
  const app = String(a.app || '').toLowerCase()
  const host = String(a.host || '').toLowerCase()
  if (!app) return null
  const mine = grants.filter((g) => live(g, now) && String(g.app).toLowerCase() === app)
  if (!mine.length) return null
  const exact = mine.filter((g) => String(g.host || '*').toLowerCase() === host && host)
  const wide = mine.filter((g) => String(g.host || '*') === '*')
  const pool = exact.length ? exact : wide
  if (!pool.length) return null
  return pool.reduce((lo, g) => (TIER_RANK[g.tier] < TIER_RANK[lo.tier] ? g : lo))
}

/**
 * May this action run?
 *
 * Order matters and is the whole design:
 *   1. a credential field is refused outright — before any grant is consulted,
 *      because no tier and no approval makes typing a password acceptable;
 *   2. no grant means refused, never "ask the model to decide";
 *   3. the tier must allow the kind;
 *   4. an irreversible control is handed to the human even at 'full'.
 *
 * Anything this function does not explicitly allow is refused. A new action
 * kind added to the agent and not to TIER_ALLOWS is therefore dead rather than
 * wide open, which is the correct way round for a default.
 */
export function decideAction(a: Action, grants: Grant[], now: Date = new Date()): Decision {
  if ((a.kind === 'type' || a.kind === 'key') && isCredentialTarget(a)) {
    return { ok: false, refuse: 'That is a credential field. Sign in yourself and tell me when you are through — I will carry on from there.' }
  }
  const g = grantFor(grants, a, now)
  if (!g) {
    const where = a.host && a.host !== '*' ? `${a.app} on ${a.host}` : String(a.app || 'that program')
    return { ok: false, refuse: `You have not given me ${where}. Grant it and I will try again.` }
  }
  if (!TIER_ALLOWS[g.tier].includes(a.kind)) {
    return { ok: false, refuse: `You gave me ${g.tier} access to ${g.app}, which does not include ${a.kind}.` }
  }
  if (isIrreversibleTarget(a) && a.kind !== 'screenshot' && a.kind !== 'read_text') {
    return { ok: false, needsHuman: 'That one cannot be taken back, so you click it. Everything is filled in and ready for you to read.' }
  }
  return { ok: true, tier: g.tier }
}

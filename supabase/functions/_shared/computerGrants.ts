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

/**
 * What Arnie wants permission for, when he has none at all for a program.
 *
 * This is the one refusal that is really a QUESTION. "You have not given me
 * Chrome on rockymountainpower.net" is a dead end if all a person can do with
 * it is go and find a form, type the program's name, pick a tier and come
 * back. Carried as an offer instead, it is one tap: the permission and the
 * thing it is for arrive together, which is the only moment either of them
 * makes sense.
 *
 * It asks for the NARROWEST tier that allows the action, never the tier that
 * would be convenient later. An offer that quietly asks for more than the job
 * needs is how "allow" stops meaning anything.
 */
export interface GrantWanted {
  app: string
  host: string
  tier: Tier
  why: string
}

export type Decision =
  | { ok: true; tier: Tier }
  | { ok: false; refuse: string }
  | { ok: false; needsHuman: string }
  | { ok: false; needsApproval: string }
  | { ok: false; needsGrant: GrantWanted }

export interface Rule {
  kind: 'ask_first' | 'allow_auto'
  employee_id?: number | null
  app?: string | null
  host?: string | null
  action_kind?: string | null
  note?: string | null
}

/** About ten minutes, matching Grok's background-approval window. */
export const BACKGROUND_APPROVAL_SECONDS = 600

export interface Grant {
  app: string
  host: string
  tier: Tier
  duration: 'once' | 'always'
  expires_at?: string | null
  revoked_at?: string | null
  consumed_at?: string | null
  /** The action that spent a one-shot grant. See `live` below. */
  consumed_by?: number | null
}

export interface Action {
  /**
   * The row id, once there is one. The server decides BEFORE the row exists
   * and leaves this unset; the agent decides about an action it is holding and
   * knows it — which is the whole of how a one-shot grant can be spent by the
   * server and still be honoured by the machine.
   */
  id?: number | null
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
//
// The assistant's own background browser (app 'browser', 2026-10-19) adds
// three kinds. 'show' and 'hide' only move HER window in front of or behind
// the person's — a look-level thing. 'navigate' goes to an address, which is
// what clicking a link does, so it sits with click; the site it goes to must
// itself be allowed (the host is taken from the address, never the model).
export const TIER_ALLOWS: Record<Tier, readonly string[]> = {
  watch: ['screenshot', 'read_text', 'show', 'hide'],
  click: ['screenshot', 'read_text', 'show', 'hide', 'click', 'double_click', 'scroll', 'launch', 'navigate'],
  full: ['screenshot', 'read_text', 'show', 'hide', 'click', 'double_click', 'right_click', 'type', 'key', 'scroll', 'drag', 'launch', 'navigate'],
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

/**
 * Is this grant still good — and, for a one-shot grant, good for THIS action?
 *
 * The subtle one, and it had the feature broken outright. A 'once' grant is
 * spent by the server the moment it queues the action it was given for. The
 * agent then checks the leash again on its own machine, a second later, and
 * saw a grant already marked consumed — so it refused, every time. "Allow
 * once" could not run anything at all, and it is the default on every offer.
 *
 * Marking WHICH action spent it fixes that without softening anything. The
 * agent is holding exactly one action and knows its id; a spent grant is live
 * for that action and for nothing else. A server that tried to reuse the same
 * permission for a second action would be refused on the machine, which is
 * precisely what the local check is there to do.
 */
const live = (g: Grant, now: Date, forAction?: number | null): boolean => {
  if (g.revoked_at) return false
  if (g.duration === 'once' && g.consumed_at) {
    // Spent. Only the action that spent it may still use it, and only if we
    // are being asked about an action at all.
    if (!forAction || g.consumed_by !== forAction) return false
  }
  if (g.expires_at && new Date(g.expires_at) <= now) return false
  return true
}

export const TIER_RANK: Record<Tier, number> = { watch: 0, click: 1, full: 2 }

/**
 * The least access that can do this kind of action, or null if no tier can.
 *
 * Derived from TIER_ALLOWS rather than listed again, so a new action kind is
 * answered by the table that already decides what tiers mean. A kind no tier
 * allows returns null and is refused outright — never offered, because there
 * is no permission a person could give that would make it run.
 */
export function narrowestTierFor(kind: string): Tier | null {
  const tiers = (Object.keys(TIER_ALLOWS) as Tier[]).sort((a, b) => TIER_RANK[a] - TIER_RANK[b])
  return tiers.find((t) => TIER_ALLOWS[t].includes(kind)) || null
}

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
  const mine = grants.filter((g) => live(g, now, a.id) && String(g.app).toLowerCase() === app)
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
 *   2. no grant means it does not run. It is returned as needsGrant — an
 *      offer a PERSON may accept — and never as "ask the model to decide".
 *      The agent treats needsGrant exactly as it treats a refusal; the only
 *      difference is that a human is shown a button instead of a dead end;
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
    const wantTier = narrowestTierFor(a.kind)
    // No tier can do this kind at all, so there is nothing to offer: a person
    // saying yes would change nothing. Refuse, as before.
    if (!a.app || !wantTier) {
      return { ok: false, refuse: `You have not given me ${where}. Grant it and I will try again.` }
    }
    // Nothing granted for this program — the one refusal that is a question.
    return {
      ok: false,
      needsGrant: {
        app: String(a.app).toLowerCase(),
        host: String(a.host || '*').toLowerCase(),
        tier: wantTier,
        why: `I need ${where} to do this. You have not given me that yet.`,
      },
    }
  }
  if (!TIER_ALLOWS[g.tier].includes(a.kind)) {
    // A level too narrow is a QUESTION, not a dead end.
    //
    // This used to refuse outright, and that refusal is what Bryce ran into
    // asking Jenny to read his Gmail: he had allowed Chrome on mail.google.com
    // at watch, she needed to click, and all she could say was "I only have
    // watch access". Correct, useless, and with no way out of it from where he
    // was standing. Bryce: "instead of saying I cant do it bring up a
    // permission box that allows permission if the user wants to."
    //
    // It loosens nothing. The answer still has to come from a person tapping
    // Allow, exactly as when nothing is granted at all — the only change is
    // that they are asked instead of told. (Accepting it REPLACES the narrower
    // grant; adding one would leave the narrower still winning and make the
    // Allow button appear to do nothing.)
    const wantTier = narrowestTierFor(a.kind)
    if (!wantTier) {
      return { ok: false, refuse: `You gave me ${g.tier} access to ${g.app}, which does not include ${a.kind}.` }
    }
    return {
      ok: false,
      needsGrant: {
        app: String(a.app).toLowerCase(),
        host: String(a.host || '*').toLowerCase(),
        tier: wantTier,
        why: `You have given me ${g.tier} on ${g.app}${a.host && a.host !== '*' ? ` for ${a.host}` : ''}, which does not stretch to ${a.kind}.`,
      },
    }
  }
  if (isIrreversibleTarget(a) && a.kind !== 'screenshot' && a.kind !== 'read_text') {
    return { ok: false, needsHuman: 'That one cannot be taken back, so you click it. Everything is filled in and ready for you to read.' }
  }
  return { ok: true, tier: g.tier }
}

// ── Rules a person writes, on top of the leash ──────────────────────────
//
// The leash above is the FLOOR. Nothing here can loosen it: a credential field
// stays refused, an ungranted app stays refused, a tier still means what it
// says, and an irreversible control still belongs to a human. Rules only ever
// add friction, never remove it.
//
// Two kinds, both of them Grok's, because the shape is right:
//
//   ask_first   always stop and ask, even though the grant allows it
//   allow_auto  let it through — which is already the default once a grant
//               exists, so this exists to say "and keep letting it through
//               even if a broader ask_first is added later"
//
// ASK FIRST WINS when both match. And a person's own rules may only make
// behaviour stricter than the company's: that falls out of ask-first-wins
// rather than needing its own check, because the only way a personal rule can
// change a company allow_auto is by adding an ask_first, and the only way it
// could loosen a company ask_first would be an allow_auto — which loses.
const ruleMatches = (r: Rule, a: Action): boolean => {
  const eq = (ruleVal: string | null | undefined, actual: string | null | undefined) =>
    !ruleVal || String(ruleVal).toLowerCase() === String(actual || '').toLowerCase()
  return eq(r.app, a.app) && eq(r.host, a.host) && eq(r.action_kind, a.kind)
}

/**
 * The whole decision: the leash, then the rules.
 *
 * `needsApproval` is distinct from `needsHuman` on purpose. needsHuman means
 * Arnie must never do this one at all — a password, a Submit button — and no
 * approval changes that. needsApproval means he may, once a person says yes to
 * this particular action.
 */
export function decideWithRules(
  a: Action,
  grants: Grant[],
  rules: Rule[] = [],
  now: Date = new Date(),
): Decision {
  const floor = decideAction(a, grants, now)
  if (!floor.ok) return floor
  const asks = rules.filter((r) => r.kind === 'ask_first' && ruleMatches(r, a))
  if (asks.length) {
    const why = asks.find((r) => r.note)?.note
    return { ok: false, needsApproval: why || 'You asked to be checked with before this one.' }
  }
  return floor
}

/**
 * When an unanswered approval stops being answerable.
 *
 * A person who asked for something in a conversation is sitting there, so it
 * waits as long as they like. Standing work is different: nobody is watching,
 * and an action queued by a 7am routine that gets approved at 6pm is not the
 * thing anybody agreed to.
 */
export function approvalExpiry(opts: { background: boolean; now?: Date }): string | null {
  if (!opts.background) return null
  const now = opts.now ? opts.now.getTime() : Date.now()
  return new Date(now + BACKGROUND_APPROVAL_SECONDS * 1000).toISOString()
}

/**
 * An approval that ran out of time. Checked on read as well as by the sweep.
 *
 * ONLY 'needs_approval' expires, and the distinction is the whole safety
 * story. 'awaiting_human' — a password box, a Submit button — is not a
 * question and has no clock: Arnie will never do it, so there is nothing for
 * time to run out on. 'queued' has already been consented to and is waiting on
 * the agent, not on a person; expiring it would cancel approved work because
 * the laptop was asleep.
 */
export function hasExpired(row: { decision?: string; expires_at?: string | null }, now: Date = new Date()): boolean {
  // 'needs_grant' is on the same footing as an approval: it is a question put
  // to a person, and a question nobody answered stops being answerable. An
  // offer made by a 7am routine and accepted at 6pm would grant access to a
  // program for a job that is long finished.
  if (row.decision !== 'needs_approval' && row.decision !== 'needs_grant') return false
  if (!row.expires_at) return false
  return new Date(row.expires_at) <= now
}

/**
 * What somebody typed into "which program?" → the app names to grant.
 *
 * A grant only works if its name is EXACTLY the name an action carries
 * (grantFor compares `g.app.toLowerCase() === a.app.toLowerCase()`). The box
 * that collects it is free text, so Bryce typed "chrome, google suite, exel,
 * windows" and got ONE grant, named all of that, which could never match
 * anything. It sat there at tier 'full' looking like permission and doing
 * nothing — the same silent-no-op shape as the rest of today.
 *
 * So: a list becomes a list. Obvious spellings of the programs the agent can
 * actually launch are corrected, because "exel" is not ambiguous. Anything
 * else is left exactly as typed — a tenant's own web app is a legitimate name
 * and guessing at it would be worse than leaving it alone.
 */
const APP_ALIAS: Record<string, string> = {
  'exel': 'excel', 'excell': 'excel', 'ms excel': 'excel', 'microsoft excel': 'excel',
  'google chrome': 'chrome', 'chrome browser': 'chrome', 'googlechrome': 'chrome',
  'ms word': 'word', 'microsoft word': 'word', 'winword': 'word',
  'ms outlook': 'outlook', 'microsoft outlook': 'outlook', 'outlook email': 'outlook',
  'microsoft edge': 'edge', 'edge browser': 'edge',
  'windows explorer': 'explorer', 'file explorer': 'explorer', 'files': 'explorer',
  'note pad': 'notepad',
  // The assistant's own background browser.
  'background browser': 'browser', 'jenny browser': 'browser', "jenny's browser": 'browser', "arnie's browser": 'browser',
  'arnie browser': 'browser', 'her browser': 'browser', 'his browser': 'browser', 'assistant browser': 'browser',
}

export function appNames(typed: string): string[] {
  const out: string[] = []
  for (const piece of String(typed || '').split(/[,;\n/]+|\s+and\s+/i)) {
    const name = piece.trim().toLowerCase().replace(/\s+/g, ' ').replace(/[.]+$/, '')
    if (!name || name.length > 60) continue
    const real = APP_ALIAS[name] || name
    if (!out.includes(real)) out.push(real)
    if (out.length >= 10) break
  }
  return out
}

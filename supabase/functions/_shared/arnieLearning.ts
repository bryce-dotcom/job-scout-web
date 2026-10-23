// Arnie learns from being corrected (Bryce, 2026-10-23: "plan the learning
// loop … any admin, go"). Part 1: the moment someone tells him he is wrong.
//
// Until now a correction fixed one answer and was gone: the weekly review
// counted it, nobody acted on it, and the same mistake waited for the next
// person. Now the turn that follows a correction carries a note — fix it from
// a lookup, then, if what they taught is true for the whole company, offer in
// one line to make it a rule. A yes is the existing company_rule card: anyone
// drafts it, an admin approves it (Teach Jenny, 2026-10-20).
//
// PUSHBACK is the weekly review's own pattern (api/cron/arnie-review.js), so
// what the review counts as a correction and what Arnie reacts to are the
// same thing. That file is CommonJS and cannot import this one; a test keeps
// the two patterns identical.

export const PUSHBACK = /\b(that'?s (wrong|not right|not true|incorrect)|that (is|was) (wrong|not right|not true|incorrect)|you('re| are) wrong|not correct|incorrect|you (didn'?t|did not|never)|didn'?t (work|happen|go through|send|come)|i (don'?t|do not|can'?t|cannot) see|not there|doesn'?t exist|does not exist|made (that|it|this) up|where is (it|the card|that)|still (don'?t|do not|can'?t) see|never (got|received|came)|wrong (number|job|customer|price|amount))\b/i

/** A correction, unless it is a condition ("if it didn't happen Friday"). */
export function isCorrection(s: string): boolean {
  const t = String(s || '')
  const re = new RegExp(PUSHBACK.source, 'gi')
  let m
  while ((m = re.exec(t))) {
    if (!/\b(if|unless|in case|whether)\b[^.!?\n]{0,12}$/i.test(t.slice(Math.max(0, m.index - 14), m.index))) return true
  }
  return false
}

/** What the "That's wrong" button under a reply sends. */
export const FLAG_PREFIX = "That's wrong"

/**
 * The note on the turn after a correction. It rides on the newest message
 * (withNote), never the system prompt, so the cached rules stay cached.
 * `canDraft`: this turn can draw a card (a person in an app that shows them).
 */
export function correctionNote(canDraft: boolean): string {
  return [
    'THEY JUST CORRECTED YOU. First put it right: check it with a lookup now — never argue from memory, and never repeat the answer they said was wrong.',
    canDraft
      ? 'Then decide whether what they taught you will be true NEXT time, for EVERYONE at the company: how they do something, what a word or code means here, which kind of job or customer is which. If so, end with ONE short line offering to make it a rule for everyone ("Want me to make that a rule for everyone?"). If they say yes, draft it with propose_create, target company_rule, in their words.'
      : 'Then, if what they taught you will be true next time for everyone at the company, say in one line that they can make it a rule from the JobScout app ("Jenny, new rule: …").',
    'Do NOT offer a rule when it was only this one record being wrong (fix the record instead), when the mistake was simply yours (a wrong lookup), when it is this person\'s own preference (that is a memory of them, not a company rule), or when it is about money amounts, prices or anyone\'s pay — those are changed in the app, not by a rule. Most corrections are one of these; offer only when it really is a company-wide lesson.',
  ].join('\n')
}

// When a confirmation is allowed to become a permanent merchant rule.
//
// Learning is automatic: confirming any transaction teaches a rule for that
// merchant, and the rule then categorises every future transaction there. That
// has now caused real damage twice from a SINGLE observation:
//
//   "draft -> Subscriptions"  — one confirm on a transaction Plaid labelled
//       "Draft" claimed 107 check drafts worth $173,740.92. The response was
//       isUnsafePattern, which stops a rule matching half the feed.
//   "the home depot -> Transfer" — one Home Depot receipt someone marked
//       Transfer relabelled 38 purchases as transfers, and would have dropped
//       $5,715 of expense out of the books the moment the flag followed the
//       label (Tracy, 2240f676).
//
// The pattern guard was necessary but not sufficient: "the home depot" is a
// perfectly specific pattern. The hole is the EVIDENCE — one person, once,
// deciding one receipt was something unusual, turned into a standing rule about
// every future receipt from that merchant.
//
// So: evidence before a rule, and a contradiction is enough to drop one.

/** How many confirmed transactions must agree before a merchant rule is born. */
export const RULE_EVIDENCE_THRESHOLD = 3

export type RuleAction = 'create' | 'update' | 'drop' | 'skip'

export interface RuleDecision {
  action: RuleAction
  /** A sentence for the person who just confirmed, or null when nothing happened. */
  message: string | null
  reason: string
}

/**
 * What should happen to the merchant rule for the category someone just
 * confirmed.
 *
 *   existingCategory   the category the current rule assigns, or null for none
 *   agreeingCount      confirmed transactions for this merchant ALREADY carrying
 *                      `category`, including the one just confirmed
 *
 * A rule is created only once `agreeingCount` reaches the threshold, so one
 * unusual receipt can never make one. An existing rule that the person has just
 * contradicted is DROPPED rather than replaced: the old category is now known to
 * be wrong, and the new one is a single observation that has not earned a rule
 * yet. It can be learned again once the evidence is there, which also means a
 * bad rule is self-healing instead of needing someone to find the rules screen.
 */
export function ruleDecision(
  { merchantLabel, category, existingCategory, agreeingCount }:
  { merchantLabel: string; category: string; existingCategory?: string | null; agreeingCount: number },
): RuleDecision {
  const same = (a: unknown, b: unknown) =>
    String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase()

  if (existingCategory && !same(existingCategory, category)) {
    return {
      action: 'drop',
      message: `Stopped auto-categorising ${merchantLabel} as ${existingCategory} — you just called it ${category}.`,
      reason: 'existing rule contradicted by this confirmation',
    }
  }

  if (existingCategory) {
    return { action: 'skip', message: null, reason: 'rule already says this' }
  }

  if (agreeingCount < RULE_EVIDENCE_THRESHOLD) {
    const need = RULE_EVIDENCE_THRESHOLD - agreeingCount
    return {
      action: 'skip',
      message: null,
      reason: `only ${agreeingCount} of ${RULE_EVIDENCE_THRESHOLD} confirmations agree — ${need} more before a rule is learned`,
    }
  }

  return {
    action: 'create',
    message: `${merchantLabel} will now be categorised as ${category} automatically. Change it under Rules.`,
    reason: `${agreeingCount} confirmations agree`,
  }
}

// Keeping Arnie on the best model (Bryce, 2026-10-22). The rules, pure, so
// they can be read and tested apart from the function that applies them.
//
//   1. A CANDIDATE is the newest Sonnet or Opus Anthropic lists that came out
//      after Arnie's current model and has not been tried before.
//   2. It is run through Arnie's full eval beside the current model, the same
//      day, and the cost per reply is measured from ai_usage.
//   3. It replaces the current model only if it passes at least as many
//      cases, passes at least 95% of them, and costs no more than 30% more
//      per reply — and only if its price is KNOWN, not guessed from its
//      family. Otherwise Arnie stays where he is and Bryce is told why.

export type ListedModel = { id: string; display_name?: string; created_at?: string }

const FAMILY = /^claude-(sonnet|opus)-/

/** The newest Sonnet and the newest Opus, if newer than the current model and never tried. */
export function pickCandidates(models: ListedModel[], current: string, tried: Set<string>): ListedModel[] {
  const at = (m?: ListedModel) => Date.parse(m?.created_at || '') || 0
  const cur = models.find((m) => m.id === current)
  const out: ListedModel[] = []
  for (const fam of ['sonnet', 'opus']) {
    const newest = models
      .filter((m) => FAMILY.test(m.id) && m.id.includes(`-${fam}-`) && m.id !== current)
      .sort((a, b) => at(b) - at(a))[0]
    if (!newest || tried.has(newest.id)) continue
    // Newer than what Arnie runs on — when we know when that came out.
    if (cur && at(newest) <= at(cur)) continue
    out.push(newest)
  }
  return out
}

export const MAX_COST_RATIO = 1.3
export const MIN_PASS_RATE = 0.95

export type Trial = {
  passed: number; total: number; costPerCall: number | null
  baselinePassed: number; baselineTotal: number; baselineCostPerCall: number | null
  priced: boolean
}

/** switched | kept | not_priced | failed — and the sentence that says why. */
export function decideTrial(t: Trial): { decision: 'switched' | 'kept' | 'not_priced' | 'failed'; why: string } {
  if (!t.total || !t.baselineTotal) return { decision: 'failed', why: 'The eval did not finish, so there is nothing to compare.' }
  const score = `${t.passed}/${t.total} against ${t.baselinePassed}/${t.baselineTotal}`
  if (t.passed < t.baselinePassed) return { decision: 'kept', why: `It scored lower: ${score}.` }
  if (t.passed / t.total < MIN_PASS_RATE) return { decision: 'kept', why: `It passed fewer than ${Math.round(MIN_PASS_RATE * 100)}% of the cases (${score}).` }
  if (!t.priced) return { decision: 'not_priced', why: `It scored ${score}, but its price is not in the price table yet, so its cost is a guess. Add the price and it can be switched.` }
  if (t.costPerCall == null || t.baselineCostPerCall == null || t.baselineCostPerCall <= 0) {
    return { decision: 'kept', why: `It scored ${score}, but the cost per reply could not be measured.` }
  }
  const ratio = t.costPerCall / t.baselineCostPerCall
  if (ratio > MAX_COST_RATIO) return { decision: 'kept', why: `It scored ${score} but costs ${Math.round((ratio - 1) * 100)}% more per reply ($${t.costPerCall.toFixed(3)} vs $${t.baselineCostPerCall.toFixed(3)}) — over the ${Math.round((MAX_COST_RATIO - 1) * 100)}% limit.` }
  return { decision: 'switched', why: `It scored ${score} at $${t.costPerCall.toFixed(3)} a reply against $${t.baselineCostPerCall.toFixed(3)}.` }
}

// Does the item a model chose bear any relation to what the user actually
// typed?
//
// Observed for real: lead_sources held exactly one entry, "Alayda Wendel". An
// admin wrote "we stopped taking work from Angi — get rid of that as a place
// leads come from", and the model, having exactly one candidate and a removal
// to perform, proposed deleting Alayda Wendel. The summary read plausibly and
// the resulting diff was perfectly valid; only the *intent* was wrong, which
// is the one thing neither the apply arithmetic nor the approval card can
// check for you.
//
// So destructive actions require at least one distinctive word of the chosen
// item to appear in the request. A paraphrase ("remove the ROI doc" for "ROI /
// Payback Analysis Document") still passes; a substitution with nothing in
// common does not.
//
// Deliberately dependency-free so it can be unit tested outside Deno.

const STOP = new Set(['the', 'and', 'for', 'our', 'from', 'with', 'that', 'this', 'all', 'new', 'inc', 'llc'])

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

export function mentionedInRequest(value: string, request: string): boolean {
  if (!value || !request) return false
  const req = ` ${norm(request)} `
  const tokens = norm(value).split(' ').filter((t) => t.length >= 3 && !STOP.has(t))
  // Nothing distinctive to match on (an item called "AZ", or one made entirely
  // of stop words) — fall back to the whole string rather than waving it
  // through on no evidence at all.
  if (tokens.length === 0) return req.includes(` ${norm(value)} `)
  return tokens.some((t) => req.includes(t))
}

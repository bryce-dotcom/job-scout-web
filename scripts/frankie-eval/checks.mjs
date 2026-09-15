// Deterministic checks on a Frankie answer. Shared by the API runner
// (frankie-eval.mjs) and the grader for answers captured from the app
// (grade-captured.mjs), so both grade the same way.

const head = (s, n = 260) => String(s || '').replace(/\s+/g, ' ').slice(0, n)

export function deterministicChecks(answer, tags = []) {
  const a = answer || ''
  const first = head(a)
  const checks = {}
  if (tags.includes('money')) checks.leads_with_a_figure = /\$\s?\d/.test(first)
  checks.no_gap_inventory = !/what i (don'?t|do not) have|❌|not enough data|insufficient data|i (can'?t|cannot) (calculate|determine|confirm) (your|the|this)/i.test(a)
  const cpaAt = a.search(/\b(CPA|accountant|tax (advisor|professional|attorney))\b/i)
  checks.no_cpa_handoff = cpaAt < 0 || cpaAt > a.length * 0.6
  // Single-asterisk italics with a verb-first phrase (*adjusts glasses*), not
  // markdown bold — **like this** is how Frankie emphasises a number.
  checks.no_stage_directions = !/(^|[^*\w])\*(?!\*)(adjusts|leans|nods|sighs|smiles|pauses|looks|takes|pulls|cracks|clears|shuffles|taps|grins|chuckles|laughs)[^*\n]{0,60}\*(?!\*)/i.test(a)
  // A tax answer names the year it is talking about — the fiscal year when
  // the company has one, otherwise the calendar year or "year to date".
  if (tags.includes('tax')) checks.uses_the_tax_year = /fiscal|nov(ember)?\b|dec(ember)? 1|2025-12|tax year|calendar year|year[- ]to[- ]date|\b20\d\d\b/i.test(a)
  checks.not_a_wall = a.length < 4200
  return checks
}

export { head }

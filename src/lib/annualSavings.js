// Which annual-savings number does the customer see? ONE rule.
//
// It existed three times, and they disagreed:
//   estimatePdf.js:577            manual -> audit
//   FormalProposal.jsx:81         manual -> audit
//   InteractiveProposal.jsx:37    findMetric(sections) only
//
// The interactive proposal read a SNAPSHOT baked into layout.sections when the
// proposal was generated, so a rep who corrected the savings on the estimate
// still sent the customer Lenard's original figure.
//
// Cole (b4729926): "when we do a take off in lenard we cant change the savings
// so when i do a interactive proprosal it shows lenards savings not the
// savings we put in." On estimate 4512 he entered 4629.84 against Lenard's
// 2400 and the interactive proposal kept showing 2400.
//
// Order of trust: what a human typed beats what was computed, and anything
// current beats a snapshot taken when the layout was built.

/** Pull a metric out of the stored proposal layout sections. */
export function findSectionMetric(sections, key) {
  for (const s of sections || []) {
    if (s?.metrics && s.metrics[key]) return s.metrics[key]
    if (s?.type === 'savings_timeline' && s[key]) return s[key]
  }
  return 0
}

/**
 * The annual savings to show for an estimate.
 *
 * doc      — the quote row (manual_annual_savings, annual_savings_dollars, audit)
 * sections — optional stored proposal layout sections, used only as a last resort
 */
export function resolveAnnualSavings(doc, sections = null) {
  const manual = parseFloat(doc?.manual_annual_savings)
  if (Number.isFinite(manual) && manual > 0) return manual

  const onQuote = parseFloat(doc?.annual_savings_dollars)
  if (Number.isFinite(onQuote) && onQuote > 0) return onQuote

  const fromAudit = parseFloat(doc?.audit?.annual_savings_dollars)
  if (Number.isFinite(fromAudit) && fromAudit > 0) return fromAudit

  const snapshot = parseFloat(findSectionMetric(sections, 'annual_savings'))
  return Number.isFinite(snapshot) && snapshot > 0 ? snapshot : 0
}

/** True when the figure shown is a human's correction rather than a computed one. */
export function isManualSavings(doc) {
  const manual = parseFloat(doc?.manual_annual_savings)
  return Number.isFinite(manual) && manual > 0
}

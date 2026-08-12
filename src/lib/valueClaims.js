// The value of a project BEYOND the energy savings.
//
// Noah asked for a section showing building owners property-value increase,
// tax benefits, and the other reasons people actually want the work done —
// rentability, appearance, how staff perform under decent light. Bryce: get
// people emotionally charged, and adapt it to whatever kind of project it is.
//
// This module is the guard rail, because that section becomes part of a
// document a customer signs.
//
// TWO RULES, and both exist because a proposal is a contract:
//
//   1. NO NUMBER may be attached to a tax claim. Whether a customer can take
//      179D or bonus depreciation depends on their tax position, their entity,
//      and the year. Printing "$12,000 tax benefit" is tax advice, and wrong
//      advice is actionable. Tax claims are stated as eligibility to explore
//      with their own advisor — never as a figure, never in a total.
//
//   2. Property-value and rent claims must be RANGES with a stated basis, not
//      promises. "Increases your building's value by $40,000" is a number
//      someone can hold you to. "Commercial retrofits typically see..." is
//      persuasive and survives being read back in a dispute.
//
// Anything a model returns is filtered through here before it reaches a
// customer. The proposal generator already learned this lesson with savings:
// a prompt is a request, not a constraint.

/** Claim kinds we will render. Anything else the model invents is dropped. */
export const VALUE_KINDS = {
  property_value: { label: 'Property value', needsBasis: true, allowsMoney: false },
  tax: { label: 'Tax treatment', needsBasis: false, allowsMoney: false },
  rentability: { label: 'Tenants & rentability', needsBasis: true, allowsMoney: false },
  appearance: { label: 'Appearance', needsBasis: false, allowsMoney: true },
  productivity: { label: 'People & productivity', needsBasis: false, allowsMoney: true },
  safety: { label: 'Safety & liability', needsBasis: false, allowsMoney: true },
  maintenance: { label: 'Maintenance & callbacks', needsBasis: false, allowsMoney: true },
  comfort: { label: 'Comfort', needsBasis: false, allowsMoney: true },
  compliance: { label: 'Compliance', needsBasis: false, allowsMoney: true },
}

export const TAX_DISCLAIMER =
  'Eligibility depends on your tax situation — confirm with your tax advisor.'

// Currency, percentages, and written-out amounts. Deliberately broad: the cost
// of stripping a number that was fine is nil, the cost of printing a tax
// figure that is wrong is a dispute.
const MONEY = /(\$\s?[\d,]+(?:\.\d+)?)|(\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|USD)\b)|(\b\d+(?:\.\d+)?\s?%)/gi

/** Does this text promise rather than describe? */
const PROMISE = /\b(will (?:increase|save|earn|add|guarantee)|guarantees?|guaranteed|is worth|you will get)\b/gi

export function stripMoney(text) {
  return String(text || '').replace(MONEY, 'a meaningful amount').replace(/\s{2,}/g, ' ').trim()
}

export function softenPromises(text) {
  return String(text || '')
    .replace(/\bwill increase\b/gi, 'typically increases')
    .replace(/\bwill save\b/gi, 'typically saves')
    .replace(/\bwill add\b/gi, 'typically adds')
    .replace(/\bguarantees?\b/gi, 'supports')
    .replace(/\bguaranteed\b/gi, 'well established')
    .replace(/\bis worth\b/gi, 'can be worth')
    .replace(/\byou will get\b/gi, 'owners typically see')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/**
 * Clean one claim, or reject it.
 * @returns the sanitised claim, or null when it cannot be made safe.
 */
export function sanitizeClaim(raw) {
  if (!raw) return null
  const kind = String(raw.kind || '').toLowerCase()
  const spec = VALUE_KINDS[kind]
  if (!spec) return null                          // an invented category

  const title = String(raw.title || spec.label).slice(0, 80).trim()
  let detail = String(raw.detail || '').slice(0, 400).trim()
  if (!detail) return null

  // Rule 1 — a tax claim never carries a figure, and always carries the
  // advisor line.
  if (!spec.allowsMoney) detail = stripMoney(detail)

  // Rule 2 — describe, do not promise.
  detail = softenPromises(detail)

  const out = { kind, title, detail }
  if (kind === 'tax') out.disclaimer = TAX_DISCLAIMER
  if (spec.needsBasis) out.basis = String(raw.basis || 'Industry range — varies by building and market').slice(0, 160)
  return out
}

/** Clean a whole section. Returns null when nothing survives. */
export function sanitizeValueSection(section) {
  const claims = (Array.isArray(section?.claims) ? section.claims : [])
    .map(sanitizeClaim)
    .filter(Boolean)
    .slice(0, 6)                                   // a wall of bullets persuades nobody
  if (claims.length === 0) return null
  return {
    type: 'added_value',
    heading: String(section?.heading || 'Beyond the energy savings').slice(0, 90),
    content: softenPromises(stripMoney(section?.content || '')).slice(0, 400),
    claims,
  }
}

/** Belt and braces for the tests and the generator: prove nothing leaked. */
export function findClaimLeaks(section) {
  const leaks = []
  for (const c of section?.claims || []) {
    const spec = VALUE_KINDS[c.kind]
    if (spec && !spec.allowsMoney && MONEY.test(c.detail)) leaks.push(`${c.kind}: money figure`)
    MONEY.lastIndex = 0
    if (PROMISE.test(c.detail)) leaks.push(`${c.kind}: promise wording`)
    PROMISE.lastIndex = 0
    if (c.kind === 'tax' && !c.disclaimer) leaks.push('tax: missing advisor disclaimer')
  }
  return leaks
}

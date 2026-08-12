// Guard rails for the "beyond the savings" proposal section.
//
// Mirrors src/lib/valueClaims.js — the client sanitises what it renders and
// the generator sanitises what it stores, because an older saved layout must
// not be able to smuggle an unfiltered claim onto a customer's screen.
//
// TWO RULES, both because a proposal becomes a signed document:
//   1. No figure may sit on a TAX claim. Eligibility for 179D or accelerated
//      depreciation depends on the customer's tax position — printing a dollar
//      amount is tax advice, and wrong tax advice is actionable.
//   2. Property-value and rent claims are RANGES with a stated basis, never
//      promises. A number someone can hold you to has no place here.

export const TAX_DISCLAIMER =
  'Eligibility depends on your tax situation — confirm with your tax advisor.';

const KINDS: Record<string, { label: string; needsBasis: boolean; allowsMoney: boolean }> = {
  property_value: { label: 'Property value', needsBasis: true, allowsMoney: false },
  tax: { label: 'Tax treatment', needsBasis: false, allowsMoney: false },
  rentability: { label: 'Tenants & rentability', needsBasis: true, allowsMoney: false },
  appearance: { label: 'Appearance', needsBasis: false, allowsMoney: true },
  productivity: { label: 'People & productivity', needsBasis: false, allowsMoney: true },
  safety: { label: 'Safety & liability', needsBasis: false, allowsMoney: true },
  maintenance: { label: 'Maintenance & callbacks', needsBasis: false, allowsMoney: true },
  comfort: { label: 'Comfort', needsBasis: false, allowsMoney: true },
  compliance: { label: 'Compliance', needsBasis: false, allowsMoney: true },
};

const MONEY = /(\$\s?[\d,]+(?:\.\d+)?)|(\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|USD)\b)|(\b\d+(?:\.\d+)?\s?%)/gi;

const stripMoney = (t: string) =>
  String(t || '').replace(MONEY, 'a meaningful amount').replace(/\s{2,}/g, ' ').trim();

const soften = (t: string) =>
  String(t || '')
    .replace(/\bwill increase\b/gi, 'typically increases')
    .replace(/\bwill save\b/gi, 'typically saves')
    .replace(/\bwill add\b/gi, 'typically adds')
    .replace(/\bguarantees?\b/gi, 'supports')
    .replace(/\bguaranteed\b/gi, 'well established')
    .replace(/\bis worth\b/gi, 'can be worth')
    .replace(/\byou will get\b/gi, 'owners typically see')
    .replace(/\s{2,}/g, ' ')
    .trim();

export function sanitizeValueSection(section: Record<string, unknown> | null) {
  const rawClaims = Array.isArray(section?.claims) ? section!.claims as Record<string, unknown>[] : [];
  const claims = rawClaims.map((raw) => {
    const kind = String(raw?.kind || '').toLowerCase();
    const spec = KINDS[kind];
    if (!spec) return null;                       // a category the model invented
    let detail = String(raw?.detail || '').slice(0, 400).trim();
    if (!detail) return null;
    if (!spec.allowsMoney) detail = stripMoney(detail);
    detail = soften(detail);
    const out: Record<string, unknown> = {
      kind,
      title: String(raw?.title || spec.label).slice(0, 80).trim(),
      detail,
    };
    if (kind === 'tax') out.disclaimer = TAX_DISCLAIMER;
    if (spec.needsBasis) {
      out.basis = String(raw?.basis || 'Industry range — varies by building and market').slice(0, 160);
    }
    return out;
  }).filter(Boolean).slice(0, 6);

  if (claims.length === 0) return null;
  return {
    type: 'added_value',
    heading: String(section?.heading || 'Beyond the energy savings').slice(0, 90),
    content: soften(stripMoney(String(section?.content || ''))).slice(0, 400),
    claims,
  };
}

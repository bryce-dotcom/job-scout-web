// Money rules shared by edge functions.
//
// This is the Deno-side twin of src/lib/arHelpers.js. Edge functions can't
// import from src/, so the rule exists in exactly two places — here and there —
// and NOWHERE else. Do not re-derive it inline; `npm run guard` fails the build
// if you do.
//
// Why the guard exists: this single rule had drifted into FOURTEEN open-coded
// copies across the app (screens, PDF, portal, reports, revenue, collections,
// the Stripe webhook). Correcting a few left the rest wrong, so the same
// invoice reported different balances depending on which surface you looked at.

/**
 * Is this invoice stored in the LEGACY shape (`amount` already net of the
 * incentive) rather than the modern one (`amount` = gross project)?
 *
 * STRICTLY greater. A modern invoice whose deductions FULLY cover the project
 * has discount === gross and the customer owes $0. Only a legacy row (amount =
 * NET, discount informational) carries a discount larger than its own amount.
 * Using `>=` here silently bills the customer for the entire project.
 */
export function isLegacyNetShape(gross: number, disc: number): boolean {
  const g = Number(gross) || 0;
  const d = Number(disc) || 0;
  return d > 0 && d > g;
}

/** What the customer actually owes after the incentive / discount / deposit. */
export function invoiceCustomerTotal(amount: unknown, discountApplied: unknown): number {
  const gross = Number(amount) || 0;
  const disc = Number(discountApplied) || 0;
  return isLegacyNetShape(gross, disc) ? gross : Math.max(0, gross - disc);
}

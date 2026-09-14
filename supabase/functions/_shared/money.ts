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

/**
 * Payment statuses that mean the invoice is settled: nothing is owed, so
 * nothing can be overdue. Cased as the column stores them, because the
 * PostgREST filter is built from this list as well as the predicate below —
 * one definition, two uses, which is the whole point of this file.
 *
 * This is the same set collections-autopilot refuses to dun on.
 */
export const SETTLED_STATUSES = ["Paid", "Void", "Cancelled"];

export function isSettledStatus(status: unknown): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  return SETTLED_STATUSES.some((x) => x.toLowerCase() === s);
}

/**
 * Is this invoice overdue as of `asOf` (YYYY-MM-DD)?
 *
 * Unpaid is NOT `payment_status = 'Pending'`. An invoice that is part-paid and
 * past its due date is money owed, past the date — and mapping overdue onto
 * Pending alone left every one of those out of the answer. Anything not
 * settled counts.
 *
 * An invoice with NO due date is not overdue. Undated is unknown, and a
 * missing date must never read as infinitely late.
 *
 * Edge-side only for now — nothing in the browser asks this question yet. Put
 * the twin in src/lib/arHelpers.js the moment something does, rather than
 * open-coding it there.
 */
export function isInvoiceOverdue(
  inv: { payment_status?: unknown; due_date?: unknown },
  asOf: string,
): boolean {
  if (isSettledStatus(inv?.payment_status)) return false;
  const due = inv?.due_date ? String(inv.due_date).slice(0, 10) : "";
  return !!due && due < asOf;
}

/**
 * What is STILL OWED on this invoice: the customer total (gross, net of the
 * incentive / discount / deposit credit) minus the payments applied to it.
 *
 * Summing `amount` instead is the recurring mistake. It bills the utility
 * incentive and the deposit credit to the customer, and on a part-paid
 * invoice it counts money already collected — on the demo tenant that is the
 * difference between $37,100 and the $26,575 actually outstanding.
 */
export function invoiceOutstanding(
  amount: unknown,
  discountApplied: unknown,
  paidToDate: unknown,
): number {
  const owed = invoiceCustomerTotal(amount, discountApplied) - (Number(paidToDate) || 0);
  return Math.max(0, owed);
}

/**
 * Split a card charge back into what the invoice was owed and the processing
 * fee that rode on top of it.
 *
 * The portal charges principal + round(principal × pct / 100, 2) and, since
 * 2026-09-13, says so in metadata (cc_fee_cents). A session created before
 * that carries only cc_fee_percent, so the fee has to be recovered from the
 * total: find the principal whose forward computation reproduces the total
 * to the cent, trying the nearest cents either side of the naive division,
 * and fall back to the naive split if rounding never lands exactly.
 *
 * Why it matters: without this the webhook booked the whole charge as
 * payment and nothing as fee, so a $540.41 invoice paid by card showed
 * "Overpaid by $10.27" (Tracy, INV-MT4SPB8G) and she was adding phantom
 * cash payments to make invoices read zero.
 */
export function cardFeeSplit(totalDollars: unknown, percent: unknown): { principal: number; fee: number } {
  const total = Math.round((Number(totalDollars) || 0) * 100) / 100;
  const pct = Number(percent) || 0;
  if (total <= 0 || pct <= 0) return { principal: total, fee: 0 };
  const r2 = (n: number) => Math.round(n * 100) / 100;
  const guess = r2(total / (1 + pct / 100));
  for (const delta of [0, -0.01, 0.01, -0.02, 0.02]) {
    const cand = r2(guess + delta);
    if (cand > 0 && Math.abs(cand + r2(cand * pct / 100) - total) < 0.005) {
      return { principal: cand, fee: r2(total - cand) };
    }
  }
  return { principal: guess, fee: r2(total - guess) };
}

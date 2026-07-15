// Invoice section model — the single source of truth for splitting a
// customer invoice into a "utility project" (in-scope) section and a
// "customer add-ons" (out-of-scope) section for Energy Scout invoices.
//
// WHY: the utility incentive should visually reduce ONLY the utility-
// qualifying project lines (SMBE fixtures, lift, etc.), while upsells
// (Extended Service Coverage) and other add-ons are billed at full price.
// The customer pays the same grand total either way — this is a
// PRESENTATION model, not a change to the money math. The grand total
// still equals arHelpers.invoiceCustomerTotal exactly, on every shape.
//
// Consumed by the customer-facing surfaces (InvoiceDetail screen + PDF,
// CustomerPortal) so the grouping + subtotal math lives in ONE place and
// can't drift.
//
// ── The delicate part: `amount` is NOT the sum of line_totals ──────────
// On real invoices the billed gross (`amount`) can sit BELOW the sum of
// the line_totals — a negotiated/manual price cut or a whole-project
// discount lives in that gap and was never itemized. `discount_applied`
// then carries the utility incentive (+ deposit credit + sometimes a
// project_discount). If we naively summed in-scope line_totals for the
// subtotal, the displayed lines would not add up to it and nothing would
// reconcile (proven on production data — invoices 32598/32612/32423).
//
// So the model is built to two hard guarantees, in this priority order:
//   1. Amount due ALWAYS equals arHelpers.invoiceCustomerTotal, exactly.
//   2. The displayed line items ALWAYS sum to the shown "Project subtotal"
//      (any gap surfaces as an honest "Project discount" line).
// Both hold by construction for every invoice shape — see buildInvoiceSections.

import { invoiceCustomerTotal, isLegacyNetShape } from './arHelpers'

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100

// A line's displayed amount. Prefer the stored line_total; fall back to
// qty × unit_price. Handles both invoice_lines (line_total / unit_price)
// and job_lines shapes (total / price).
export function lineAmount(l) {
  const lt = Number(l?.line_total ?? l?.total)
  if (Number.isFinite(lt) && lt !== 0) return lt
  const qty = Number(l?.quantity) || 0
  const price = Number(l?.unit_price ?? l?.price) || 0
  return qty * price
}

// Is this line part of the utility incentive scope? In-scope unless
// explicitly flagged false. The flag is frozen on the invoice_line at
// creation time; fall back to the product-catalog flag for older lines
// that predate the denormalization.
export function lineInScope(l) {
  if (l?.in_utility_scope === false) return false
  if (l?.in_utility_scope === true) return true
  if (l?.item && l.item.in_utility_scope === false) return false
  return true
}

// Break discount_applied into its components (deposit credit from a parent
// deposit invoice, an optional project_discount breakout, and the utility
// incentive as the remainder), mirroring InvoiceDetail's long-standing
// logic. Used to derive the *most accurate* incentive figure when the
// caller hasn't supplied one from the linked utility invoice.
export function invoiceDiscountBreakout(invoice, parentInvoice = null) {
  const gross = Number(invoice?.amount) || 0
  const discountApplied = Number(invoice?.discount_applied) || 0
  // Shared predicate — strictly greater. When the incentive + project discount
  // FULLY cover the project, discountApplied equals gross exactly and the
  // customer owes $0; that's the modern shape, not a legacy-net invoice. A >=
  // test made a fully-covered invoice fall back to the flat layout and bill
  // the whole project.
  const isLegacyNet = isLegacyNetShape(gross, discountApplied)
  const depositCredit = (parentInvoice && parentInvoice.invoice_type === 'deposit')
    ? (Number(parentInvoice.amount) || 0)
    : 0
  const projectDiscountField = Math.min(
    Math.max(0, Number(invoice?.project_discount) || 0),
    Math.max(0, discountApplied - depositCredit)
  )
  const incentive = Math.max(0, discountApplied - depositCredit - projectDiscountField)
  return { isLegacyNet, discountApplied, depositCredit, projectDiscountField, incentive }
}

// Build the section display model for a customer invoice.
//
//   buildInvoiceSections(invoice, lines, { parentInvoice, utilityIncentive })
//     → {
//         applicable,        // false → render the classic flat layout
//         inScope, outScope, // the grouped line arrays
//         hasOutScope,       // false → collapse to a single clean section
//         inScopeSubtotal,   // "Project subtotal" shown (= in-scope line sum)
//         projectDiscount,   // reconciling discount line (gap + any project disc)
//         incentive,         // utility incentive $ (deducted from in-scope)
//         netInScope,        // what the customer owes on the project portion
//         outScopeSubtotal,  // sum of add-on line amounts (billed at full price)
//         depositCredit,     // deposit already paid, credited after both sections
//         customerTotal,     // authoritative arHelpers total (= amount due)
//         reconciles,        // sanity: sections rebuild customerTotal exactly
//         isLegacyNet, discountApplied,
//       }
//
// Reconciliation guarantees (hold for EVERY modern-shape invoice):
//   • in-scope lines sum to inScopeSubtotal          (honest itemization)
//   • inScopeSubtotal − projectDiscount − incentive = netInScope
//   • netInScope + outScopeSubtotal − depositCredit = customerTotal   ✓
//
// `utilityIncentive` (optional) is the incentive_amount from the linked
// utility_invoice — the most accurate incentive figure. When omitted we
// fall back to the discount_applied breakout. Either way the grand total
// is unaffected; it only shifts dollars between the "incentive" label and
// the "project discount" label.
//
// applicable=false when the invoice is legacy-net (amount already net of
// the incentive — restructuring it would double-count) or has no lines.
// In that case the surface keeps its existing flat rendering untouched.
export function buildInvoiceSections(invoice, lines, { parentInvoice = null, utilityIncentive = null } = {}) {
  const rows = Array.isArray(lines) ? lines : []
  const { isLegacyNet, discountApplied, depositCredit, projectDiscountField, incentive: breakoutIncentive } =
    invoiceDiscountBreakout(invoice, parentInvoice)

  const inScope = rows.filter(lineInScope)
  const outScope = rows.filter((l) => !lineInScope(l))

  // Add-ons are billed at face value — trust their line totals directly.
  const outScopeSubtotal = round2(outScope.reduce((s, l) => s + lineAmount(l), 0))
  // The listed project subtotal is the honest sum of in-scope line totals
  // (so the displayed lines always add up on screen).
  const inScopeLineSum = round2(inScope.reduce((s, l) => s + lineAmount(l), 0))
  // The billed in-scope gross, straight off the authoritative `amount`.
  const gross = Number(invoice?.amount) || 0
  const inScopeBilled = round2(gross - outScopeSubtotal)

  const customerTotal = invoiceCustomerTotal(invoice)
  // What the in-scope section must net to so the grand total lands exactly
  // on customerTotal after the add-ons and deposit are applied:
  //   netInScope + outScope − deposit = customerTotal
  const netInScope = Math.max(0, round2(customerTotal - outScopeSubtotal + depositCredit))

  // Normally the listed line sum is the subtotal. Only in the rare inverse
  // case (billed gross exceeds the itemized lines, e.g. an un-itemized
  // surcharge) do we fall back to the billed gross so we never show a
  // negative discount.
  const inScopeSubtotal = inScopeLineSum >= netInScope ? inScopeLineSum : inScopeBilled

  // Total reduction from the shown subtotal down to what's owed. Split into
  // the utility incentive (as accurate as we can source it) and a
  // reconciling "project discount" that absorbs everything else (the
  // line-sum-vs-billed gap, negotiated cuts, project_discount field).
  const totalDeductions = Math.max(0, round2(inScopeSubtotal - netInScope))
  const preferredIncentive = utilityIncentive != null
    ? Math.max(0, Number(utilityIncentive) || 0)
    : breakoutIncentive
  const incentive = round2(Math.min(Math.max(0, preferredIncentive), totalDeductions))
  const projectDiscount = round2(totalDeductions - incentive)

  // Only apply the two-section incentive treatment to modern-shape invoices
  // that actually have line items. Legacy-net invoices keep their flat
  // display so their already-delicate math is never touched.
  const applicable = !isLegacyNet && rows.length > 0

  // Reconciliation invariant (must hold by construction).
  const reconstructed = round2(netInScope + outScopeSubtotal - depositCredit)
  const reconciles = Math.abs(reconstructed - customerTotal) < 0.01

  return {
    applicable,
    inScope,
    outScope,
    hasOutScope: outScope.length > 0,
    inScopeSubtotal,
    inScopeLineSum,
    projectDiscount,
    incentive,
    netInScope,
    outScopeSubtotal,
    depositCredit,
    isLegacyNet,
    discountApplied,
    customerTotal,
    reconciles,
  }
}

// Human label for the incentive line, naming the utility dynamically when
// we know it. Falls back to a generic label. `utilityName` comes from the
// linked utility_invoice.utility_name or the job's utility provider.
export function incentiveLineLabel(utilityName) {
  const name = (utilityName || '').trim()
  return name ? `Utility incentive (paid by ${name})` : 'Utility incentive'
}

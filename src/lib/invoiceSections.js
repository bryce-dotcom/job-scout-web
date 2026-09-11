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
  // A down payment taken on the job. Without its own breakout it fell into
  // `incentive` below, so JOB-MQZGV1FN printed "Utility Incentive
  // -$15,602.85" when the incentive was $13,652.85 and $1,950 was a down
  // payment — the customer could not follow the arithmetic.
  const downPayment = Math.min(
    Math.max(0, Number(invoice?.down_payment_applied) || 0),
    Math.max(0, discountApplied - depositCredit - projectDiscountField)
  )
  const incentive = Math.max(0, discountApplied - depositCredit - projectDiscountField - downPayment)
  return { isLegacyNet, discountApplied, depositCredit, projectDiscountField, downPayment, incentive }
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
  const { isLegacyNet, discountApplied, depositCredit, projectDiscountField, downPayment: breakoutDownPayment, incentive: breakoutIncentive } =
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
  // Carve the down payment out BEFORE the reconciling discount absorbs it.
  // Otherwise it shows up as "Project Discount", which is just a different
  // wrong label — the customer needs to see the deduction they actually made.
  const downPayment = round2(Math.min(
    Math.max(0, breakoutDownPayment || 0),
    Math.max(0, totalDeductions - incentive),
  ))
  // A utility shortfall the COMPANY absorbed. The utility paid less than was
  // claimed, the customer's credit was left whole, and the difference would
  // otherwise land in the reconciling remainder and print as a "Project
  // Discount" nobody gave (it did — a $500 short-pay on the demo invoice).
  // Carve it out under its own name, capped by what is actually left. When
  // the CUSTOMER bore it, their credit was reduced instead and there is no
  // gap to explain.
  const utilityShortfall = invoice?.shortfall_borne_by === 'company'
    ? round2(Math.min(
        Math.max(0, Number(invoice?.utility_shortfall) || 0),
        Math.max(0, totalDeductions - incentive - downPayment),
      ))
    : 0
  const projectDiscount = round2(totalDeductions - incentive - downPayment - utilityShortfall)

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
    utilityShortfall,
    downPayment,
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

// ── Two-page composition ────────────────────────────────────────────────
//
// Alayda sends a submittal package to the utility. She needs the project on
// a page of its own — in-scope work, the incentive, and a total — so she can
// send that page alone without the customer's add-ons on it.
//
// This is PAGINATION, not arithmetic. Every figure below already exists on
// the sections object; the only thing that moves is WHICH PAGE a line prints
// on. `grandTotal` is taken straight from `sections.customerTotal` rather
// than re-derived, so the number at the bottom cannot drift from
// arHelpers.invoiceCustomerTotal no matter what happens to the layout.
//
// The one line that changes side is the down payment. It is a payment the
// customer made, not part of the project's price, so it sits with the other
// credits on page two and page one stays a clean project figure.
//
//   page 1:  inScopeSubtotal − incentive − projectDiscount − utilityShortfall = projectTotal
//   page 2:  projectTotal + addOns − downPayment − depositCredit = grandTotal
//
// Those two compose back to exactly the old single-page total:
//   (inScopeSubtotal − incentive − projectDiscount) + outScope
//     − downPayment − depositCredit
//   = netInScope + downPayment + outScope − downPayment − depositCredit
//   = netInScope + outScope − depositCredit
//   = customerTotal                                    (buildInvoiceSections)
export function buildInvoicePages(sections) {
  const s = sections || {}
  const inScopeSubtotal = Number(s.inScopeSubtotal) || 0
  const incentive = Number(s.incentive) || 0
  const projectDiscount = Number(s.projectDiscount) || 0
  const utilityShortfall = Number(s.utilityShortfall) || 0
  const downPayment = Number(s.downPayment) || 0
  const depositCredit = Number(s.depositCredit) || 0
  const addOnsSubtotal = Number(s.outScopeSubtotal) || 0
  const grandTotal = Number(s.customerTotal) || 0

  // The project as the utility sees it.
  const projectTotal = round2(inScopeSubtotal - incentive - projectDiscount - utilityShortfall)
  const carriedSubtotal = round2(projectTotal + addOnsSubtotal)

  // A second page only earns its place when there is something to put on it.
  const twoPage = !!(s.applicable && s.hasOutScope)

  return {
    twoPage,
    pageOne: {
      lines: s.inScope || [],
      subtotal: inScopeSubtotal,
      incentive,
      projectDiscount,
      utilityShortfall,
      total: projectTotal,
    },
    pageTwo: {
      broughtForward: projectTotal,
      lines: s.outScope || [],
      addOnsSubtotal,
      subtotal: carriedSubtotal,
      downPayment,
      depositCredit,
      grandTotal,
    },
    // True when the two pages compose back to the authoritative total. The
    // PDF should never print a layout this says is broken.
    reconciles: Math.abs(round2(carriedSubtotal - downPayment - depositCredit) - grandTotal) < 0.01,
  }
}

// Who pays what, for the foot of page one.
//
// Page one is the page that goes to the utility on its own, so it has to
// say — in words, not just as a red line in the totals — that two parties
// owe money on this project and how much each. The figures come from the
// page itself (buildInvoicePages), never recomputed here: this block must
// agree with the lines printed above it or it is worse than nothing.
//
// The utility's name comes from the invoice's own provider link where it
// has one (utility_provider_id → utility_providers), falling back to the
// linked utility row's utility_name. Both name the same utility — the
// mirror trigger set the id from the name — but the invoice is the record.
//
// Returns null when there is no incentive: an invoice with one payer has
// nothing to split, and every non-rebate invoice must print exactly as it
// does today.
export function whoPaysWhat({ utilityName, pageOne, twoPage }) {
  const incentive = Number(pageOne?.incentive) || 0
  if (!(incentive > 0)) return null
  return {
    utility: {
      name: (utilityName || '').trim() || 'Utility',
      amount: round2(incentive),
      note: 'incentive — billed to the utility',
    },
    customer: {
      name: 'Customer',
      amount: round2(pageOne?.total),
      note: twoPage ? 'project portion — add-ons and invoice total on page 2' : 'your portion',
    },
  }
}

// The utility's name as the invoice records it. Prefers the invoice's own
// provider link; falls back to the linked utility row.
export function invoiceUtilityName(invoice, utilityProviders = [], linkedUtilityInvoice = null) {
  const id = invoice?.utility_provider_id
  if (id != null) {
    const p = (utilityProviders || []).find((x) => Number(x?.id) === Number(id))
    if (p?.provider_name) return String(p.provider_name).trim()
  }
  return String(linkedUtilityInvoice?.utility_name || '').trim() || null
}

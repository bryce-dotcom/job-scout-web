// Keep a job's invoice pair reconciled with the job.
//
// The invariant, which is what a user actually expects and what the books
// need:
//
//     customer out-of-pocket  +  utility incentive  =  the project total
//
// A customer invoice stores amount = the gross project and discount_applied =
// everything the customer does NOT pay (utility incentive + any rep discount +
// any deposit already credited). The utility invoice stores the incentive. So
// the invariant holds by construction — as long as all three follow the job.
//
// They didn't. Editing the utility incentive on the job wrote jobs
// .utility_incentive and nothing else, so invoices created earlier kept the
// old number forever. JOB-MQZGV1FN: invoices created 1:26:42pm froze the
// incentive at $13,110, the job was edited to $12,849.75 at 1:47:41pm, and the
// invoices never moved. 5 of 26 utility invoices had drifted this way.
//
// Two rules that matter here:
//
//   1. Adjust discount_applied by the DELTA, never overwrite it. It is a
//      TOTAL deduction — it can also contain a deposit credit and a rep's
//      project discount. Overwriting it with the incentive silently bills the
//      customer for a deposit they already paid.
//
//   2. The gross follows the invoice's own LINES. An invoice whose amount
//      disagrees with the lines printed on it cannot be explained to a
//      customer, and it breaks the invariant above even when the incentive is
//      right.

const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100

/** Sum of an invoice's line items — the real project total on that document. */
export function lineSum(lines) {
  return r2((lines || []).reduce((s, l) => s + (Number(l?.line_total ?? l?.total) || 0), 0))
}

/**
 * What the customer is left owing given a gross and a total deduction.
 * Mirrors invoiceCustomerTotal in arHelpers (legacy rows store a NET amount
 * with a larger, informational discount).
 */
export function customerPortion(amount, discountApplied) {
  const gross = Number(amount) || 0
  const disc = Number(discountApplied) || 0
  if (disc > 0 && disc > gross) return gross      // legacy net shape
  return r2(Math.max(0, gross - disc))
}

/**
 * Patches needed to bring one job's invoice pair back in line.
 *
 * @param invoice        customer invoice row (may be null)
 * @param lines          its invoice_lines
 * @param utilityInvoice linked utility_invoices row (may be null)
 * @param incentive      the job's CURRENT utility_incentive
 * @param opts.syncGross re-anchor amount to the line sum (default true)
 *
 * Returns { invoicePatch, utilityPatch, before, after, changed }.
 * Patches are null when nothing needs to change, so a caller can skip the
 * write entirely.
 */
export function reconcileInvoicePair({ invoice, lines, utilityInvoice, incentive, syncGross = true } = {}) {
  const newIncentive = r2(incentive)
  const oldIncentive = r2(utilityInvoice?.incentive_amount ?? utilityInvoice?.amount ?? 0)

  // LEGACY rows store amount = NET with a larger, purely informational
  // discount. Re-anchoring their gross to the line sum while also moving the
  // deduction by a delta double-counts the incentive: a dry run over company 3
  // turned job 8746 from $15,480 AR into $119,084 on a $67,095 job. There is
  // no safe automatic conversion — the old discount doesn't say how much of it
  // was incentive vs deposit — so leave the customer invoice alone and only
  // correct the utility side.
  const legacyCustomer = !!invoice &&
    (Number(invoice.discount_applied) || 0) > 0 &&
    (Number(invoice.discount_applied) || 0) > (Number(invoice.amount) || 0)

  let invoicePatch = null
  if (invoice && !legacyCustomer) {
    const oldGross = r2(invoice.amount)
    const sum = lineSum(lines)
    // Only re-anchor when the invoice actually has lines. A deposit or a
    // manually-entered invoice legitimately has no lines, and forcing its
    // gross to 0 would erase a real bill.
    const newGross = (syncGross && sum > 0) ? sum : oldGross

    const oldDisc = r2(invoice.discount_applied)
    // Delta, not overwrite — preserves deposit credit and rep discount.
    const delta = r2(newIncentive - oldIncentive)
    const newDisc = r2(Math.max(0, oldDisc + delta))

    if (Math.abs(newGross - oldGross) > 0.005 || Math.abs(newDisc - oldDisc) > 0.005) {
      invoicePatch = { amount: newGross, discount_applied: newDisc || null }
    }
  }

  let utilityPatch = null
  if (utilityInvoice) {
    const projectCost = invoicePatch?.amount ?? r2(invoice?.amount ?? utilityInvoice.project_cost)
    const next = {
      amount: newIncentive,
      incentive_amount: newIncentive,
      project_cost: projectCost,
      net_cost: r2(Math.max(0, projectCost - newIncentive)),
    }
    const differs = ['amount', 'incentive_amount', 'project_cost', 'net_cost']
      .some(k => Math.abs(r2(utilityInvoice[k]) - next[k]) > 0.005)
    if (differs) utilityPatch = next
  }

  const grossAfter = invoicePatch?.amount ?? r2(invoice?.amount ?? 0)
  const discAfter = invoicePatch ? r2(invoicePatch.discount_applied) : r2(invoice?.discount_applied ?? 0)

  return {
    invoicePatch,
    utilityPatch,
    legacyCustomer,
    changed: !!(invoicePatch || utilityPatch),
    before: {
      customer: customerPortion(invoice?.amount, invoice?.discount_applied),
      utility: oldIncentive,
      ar: r2(customerPortion(invoice?.amount, invoice?.discount_applied) + oldIncentive),
    },
    after: {
      customer: customerPortion(grossAfter, discAfter),
      utility: newIncentive,
      ar: r2(customerPortion(grossAfter, discAfter) + newIncentive),
    },
  }
}

/**
 * Does this job's paperwork add up? `expected` is normally the job total.
 * Used by the repair script and by a warning in the UI.
 */
export function arReconciles({ invoice, utilityInvoice, expected }) {
  const ar = r2(
    customerPortion(invoice?.amount, invoice?.discount_applied) +
    r2(utilityInvoice?.amount ?? utilityInvoice?.incentive_amount ?? 0),
  )
  return { ar, expected: r2(expected), off: r2(ar - r2(expected)), ok: Math.abs(ar - r2(expected)) <= 0.01 }
}

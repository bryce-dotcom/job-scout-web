// ONE definition of "copy a job's line items onto an invoice".
//
// This existed five times before this file: FieldScout, Invoices, JobDetail
// (twice) and — by omission — PMJobSetter, which built an invoice FROM the
// job lines and then never wrote them. Predictably the copies drifted, and
// the drift was silent because every field still produced *a* number:
//
//   - FieldScout + Invoices read `l.line_total`, which job_lines does not
//     have. It was always undefined, so they always fell back to
//     quantity x price. That matches `total` only while no line carries a
//     discount — true today, wrong the day someone discounts a line.
//   - Both dropped `labor_cost` entirely, so summary-mode PDFs could not
//     split Parts vs Labor on anything they invoiced. 78 job lines carry a
//     real labor cost; 248 of 271 invoice lines have none.
//   - Both lost the product-name fallback, so a line with a blank
//     description billed as the word "Item". 30 live invoice lines say
//     "Item"; 52 more job lines would.
//
// Anything that bills job lines must call buildInvoiceLineRows. Adding a
// column here reaches every invoice path at once, which is the entire point.

// Accepts job_lines rows in either shape the app produces: raw (item_name,
// total) or joined (item: { name }). Callers differ and both are legitimate.
export function buildInvoiceLineRows(lines, { companyId, invoiceId }) {
  if (!Array.isArray(lines) || !invoiceId) return []

  return lines.map((l, idx) => {
    // Coerce to a real number: `??` alone would pass a non-numeric quantity
    // straight through to a numeric column, and make line_total NaN.
    // Absent or unparseable means 1; an explicit 0 stays 0.
    const rawQty = Number(l.quantity)
    const quantity = Number.isFinite(rawQty) ? rawQty : 1
    const unitPrice = parseFloat(l.price) || 0
    // `total` is the stored line total and already reflects any discount.
    // Only fall back to the multiplication when it is genuinely absent —
    // never prefer the computed value over the stored one. Some callers
    // select it aliased as `line_total`, so accept either spelling; getting
    // this wrong silently re-bills the pre-discount amount.
    const stored = parseFloat(l.total ?? l.line_total)
    const lineTotal = Number.isFinite(stored) ? stored : quantity * unitPrice

    return {
      company_id: companyId,
      invoice_id: invoiceId,
      item_id: l.item_id || null,
      line_number: idx + 1,
      description: l.description || l.item?.name || l.item_name || 'Item',
      quantity,
      unit_price: unitPrice,
      discount: parseFloat(l.discount) || 0,
      line_total: lineTotal,
      sort_order: idx,
      // Out-of-scope add-ons (Extended Service Coverage, warranties) must
      // stay out of the utility project so the customer invoice renders them
      // under "Additional Services". Default true unless explicitly false —
      // matches the products_services and invoice_lines column defaults.
      in_utility_scope: l.in_utility_scope !== false,
      // Carries the labor portion so summary PDFs split Parts vs Labor from
      // real per-line data instead of guessing by product type.
      labor_cost: parseFloat(l.labor_cost) || 0,
    }
  })
}

// A job with no line items still bills for something. Without this the
// invoice was a total with nothing under "Line Items" — on the PDF, the
// portal and the email — which is the bare invoice reps kept reporting,
// and exactly what a service visit created by hand looks like (every demo
// job, for one). One line, named for the job, for the job's total.
//
// `covered` is what the job's own lines already add up to. For a job whose
// total a person set (jobs.job_total_source 'manual'), lines added later are
// additions inside the price, not the price — so the scope line is for the
// remainder, and the invoice's lines sum to its amount.
export function summaryLineRows({ description, total, covered = 0 }, { companyId, invoiceId }) {
  const amount = Math.round(((parseFloat(total) || 0) - (parseFloat(covered) || 0)) * 100) / 100
  if (!invoiceId || !Number.isFinite(amount) || amount <= 0) return []
  return buildInvoiceLineRows([{ description: String(description || '').trim() || 'Services', quantity: 1, price: amount, total: amount }], { companyId, invoiceId })
}

// Write the rows for an invoice. Returns the rows written (empty when there
// was nothing to copy). Never throws — a failure to copy lines must not roll
// back an invoice that was already created, but it must be visible.
// `summaryFor` = { description, total, manual }: the job's priced total.
// Written as the one line when the job has no lines of its own; when the
// job's total was set by a person (manual) and its lines cover less than
// the price, written for the remainder so the invoice adds up to its amount.
export async function writeInvoiceLines(supabase, lines, { companyId, invoiceId, summaryFor = null }) {
  let rows = buildInvoiceLineRows(lines, { companyId, invoiceId })
  if (summaryFor) {
    const covered = rows.reduce((s, r) => s + (Number(r.line_total) || 0), 0)
    if (rows.length === 0) rows = summaryLineRows(summaryFor, { companyId, invoiceId })
    else if (summaryFor.manual && covered < (parseFloat(summaryFor.total) || 0) - 0.005) {
      const scope = summaryLineRows({ ...summaryFor, description: `Project scope — ${String(summaryFor.description || '').trim() || 'Services'}`, covered }, { companyId, invoiceId })
      rows = [...scope.map((r) => ({ ...r, line_number: 1, sort_order: 0 })), ...rows.map((r) => ({ ...r, line_number: r.line_number + scope.length, sort_order: r.sort_order + scope.length }))]
    }
  }
  if (rows.length === 0) return []
  const { error } = await supabase.from('invoice_lines').insert(rows)
  if (error) {
    console.error('Failed to copy line items into invoice_lines:', error)
    return []
  }
  return rows
}

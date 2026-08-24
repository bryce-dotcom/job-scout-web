// How a commission line describes itself on My Pay.
//
// Alayda (2ba59f50): "Cole's My pay — Redman is on there twice."
//
// It is on there twice because there are two Redman jobs: 12798 "Redman Van &
// Storage" and 12799 "Redman #2", with separate utility invoices of $51,615 and
// $29,697.75 paid a fortnight apart. Both commissions are correct. What was
// missing is any way to tell them apart — the row printed the job title and
// nothing else, so two different jobs for the same customer looked like the
// same thing listed twice.
//
// The second half is worse. The subtitle read `Invoice {d.invoiceId}`, and a
// utility-commission detail has no invoiceId — only utilityInvoiceId. So every
// utility line on the page said "Invoice undefined". Cole has nine of them.
//
// Alayda again (3384c8d2), on the bonus list: "HHH sides is hard because it
// lists the name of the job not the client or job number so I can't back into
// it that way." Same complaint, same fix — put the job number on the row.

/** The job's human reference (JOB-XXXX), not its database id. */
export function jobRef(detail, jobs = []) {
  if (detail?.jobId == null) return null
  const job = (jobs || []).find((j) => String(j.id) === String(detail.jobId))
  return job?.job_id || null
}

/**
 * Heading for a commission row: the job, plus its number when we know it, so
 * two jobs for one customer are visibly different things.
 */
export function payRowHeading(detail, jobs = []) {
  const title = String(detail?.jobTitle || '').trim() || 'Unknown job'
  const ref = jobRef(detail, jobs)
  return ref ? `${title} · ${ref}` : title
}

/**
 * The document this commission was earned on. Utility commissions are earned on
 * a UTILITY invoice, which is a different document with a different number —
 * calling it "Invoice" and then printing nothing helped nobody.
 */
export function payRowSource(detail) {
  if (!detail) return null
  if (detail.type === 'utility_commission') {
    const id = detail.utilityInvoiceId
    return id ? `Utility invoice ${id}` : 'Utility invoice'
  }
  if (detail.type === 'processor_commission') {
    const id = detail.utilityInvoiceId
    return id ? `Processing ${id}` : 'Processing'
  }
  return detail.invoiceId ? `Invoice ${detail.invoiceId}` : null
}

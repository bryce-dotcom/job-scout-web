// Editing a job line's description when the estimate wrote it.
//
// Bryce (2026-10-14): "The description was created in the estimate… it would be
// helpful to be able to change it here in the job page. But it would need to
// change it in the estimate as well, and a little warning that this will change
// on the estimate as well, and get the user's approval."
//
// Two things make this safe to offer.
//
// ONE: the job line has to KNOW which estimate line it came from. It did not
// until job_lines.quote_line_id existed — the converter built the link, used it
// to move the line's photos across, and threw it away. Without the link there
// is nothing to propagate to, and guessing by product name would rewrite the
// wrong line on somebody's signed estimate.
//
// TWO: nothing propagates silently. A description on an estimate is a sentence
// the customer has read and may have signed under, so changing it is the
// person's decision every time, not a side effect of fixing a typo on the job.
// The job always gets the edit; the estimate only follows when they say so.
//
// Most job lines have no estimate behind them — only 98 of HHH's 7,172 jobs
// carry a quote_id — so "no estimate to update" is the ordinary case and must
// read as ordinary, not as a failure.

/** Did this line come from an estimate we can still write back to? */
export function estimateLink(line, quoteLine) {
  const id = line?.quote_line_id
  if (!id) return null
  // The estimate may have been re-costed since; its lines are deleted and
  // rebuilt, so a link can outlive its target. Treat that as no link.
  if (!quoteLine || quoteLine.id !== id) return null
  return { quoteLineId: id, quoteId: quoteLine.quote_id ?? null }
}

/** Has anything actually changed? Trimmed, because trailing spaces are not an edit. */
export function descriptionChanged(before, after) {
  return String(before ?? '').trim() !== String(after ?? '').trim()
}

/** What to store. Blank becomes null rather than an empty string. */
export function descriptionValue(text) {
  const t = String(text ?? '').trim()
  return t || null
}

/**
 * The sentence shown before anything is written.
 * `documentWord` is lib/documentVocabulary's — this company may call it a bid
 * or a proposal, and the warning must use their word, not ours.
 */
export function propagateWarning({ documentWord = 'estimate', reference } = {}) {
  // documentWord hands back a LABEL — 'Estimate', 'Bid', 'Proposal'. These
  // are common nouns in a sentence, and "came from the Estimate" reads like
  // a typo, so they are lowercased here and nowhere else.
  const word = String(documentWord || 'estimate').toLowerCase()
  const which = reference ? `${word} ${reference}` : `the ${word}`
  return {
    title: `Change this on ${which} too?`,
    body: `This description came from ${which}. Updating it here can also update it there, so the two keep saying the same thing. The customer may have already seen the ${word}.`,
    confirm: `Change both`,
    decline: `Only on this job`,
  }
}

/**
 * What a save should do, given whether a link exists and what the person chose.
 * Returns the writes to perform — the caller does them, this decides them.
 */
export function savePlan({ line, text, link, alsoEstimate }) {
  if (!descriptionChanged(line?.description, text)) return { writes: [], reason: 'unchanged' }
  const value = descriptionValue(text)
  const writes = [{ table: 'job_lines', id: line.id, description: value }]
  if (link && alsoEstimate) {
    writes.push({ table: 'quote_lines', id: link.quoteLineId, description: value })
  }
  return { writes, reason: link ? (alsoEstimate ? 'both' : 'job-only') : 'no-link' }
}

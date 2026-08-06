// A deal must always be visible on the pipeline somewhere.
//
// The board mixes two sources. Pre-estimate columns (New, Contacted,
// Appointment Set, Qualified) render LEAD cards by lead.status. Estimate
// columns (Quote Sent, Negotiation, Won, Lost) render QUOTE cards by
// quote.status. Nothing kept the two in step: dragging a lead card writes
// lead.status only, and approving a quote writes quote.status only.
//
// So a lead whose status says "Quote Sent" while its only quote says
// "Approved" matched nothing — the Quote Sent column wanted a Sent quote, and
// the Won column additionally requires lead.status === 'Won'. The card
// rendered in NO column. Measured on company 3: 59 leads were invisible.
//
// Noah: "i moved 5 jobs from qualified to negotiation and they went out of
// qualified but didnt switch to negotiation, i also switched a project from
// qualified to won and it didnt go into the won tab and now i cant find it in
// my pipeline."
//
// An earlier fix covered the case where a lead has NO staged quote at all
// (every quote still a Draft). This is the other half: a staged quote sitting
// in a DIFFERENT column from the lead.

/** Which board stage a quote status renders in, or null. */
export function stageForQuoteStatus(quoteStatus, quoteStatusMap = {}) {
  for (const [stageId, status] of Object.entries(quoteStatusMap)) {
    if (status === quoteStatus) return stageId
  }
  return null
}

/**
 * Will any of this lead's quotes actually produce a card on the board?
 *
 * The Won column deliberately only accepts quotes whose lead is also Won —
 * delivery-stage leads bypass the date filter and would flood it with every
 * historical deal. That guard is why an Approved quote on a non-Won lead
 * renders nowhere, so it has to be accounted for here rather than assumed.
 */
export function leadRendersSomewhere(lead, quoteStatusMap = {}) {
  const quotes = lead?._quotes || []
  return quotes.some(q => {
    const stageId = stageForQuoteStatus(q?.status, quoteStatusMap)
    if (!stageId) return false                                  // Draft — no column
    if (stageId === 'Won' && lead?.status !== 'Won') return false
    return true
  })
}

/**
 * Should this stage show the LEAD card itself as a fallback?
 *
 * Only when the lead would otherwise appear nowhere AND this is the lead's own
 * status — so the rule can only ever ADD a card that was missing, never move
 * or duplicate one that already renders.
 */
export function shouldShowLeadFallback(lead, stageId, quoteStatusMap = {}) {
  if (!lead || lead.status !== stageId) return false
  return !leadRendersSomewhere(lead, quoteStatusMap)
}

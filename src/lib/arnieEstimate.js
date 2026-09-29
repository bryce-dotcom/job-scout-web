// "Describe it to Arnie": the Estimates page hands the rep to Arnie with the
// first message already said, the mic already listening, and Arnie's existing
// quote rail does the rest — propose from the price book, approve, apply.
//
// Bryce, 2026-09-29: "Arnie can build an estimate out of a button in the
// estimate page — explain the project, either speak it or type it, use Arnie
// to build it." The rail already existed (arnieQuote.ts, "Quote Halifax for 40
// high bays"); what was missing was the door from the page, the voice, and a
// way to fill the empty draft a rep is already looking at.

/** The first message Arnie hears. Pure, so the wording is tested. */
export function estimateKickoff({ forLabel = '', estimateRef = null, estimateId = null } = {}) {
  const who = forLabel ? ` for ${forLabel}` : ''
  if (estimateId) {
    return `Fill estimate ${estimateRef || `#${estimateId}`} (#${estimateId})${who}. I'll describe the project now — draft the lines from the price book into that estimate and show me the card. Ask me for anything you need before you draft.`
  }
  return `Let's build an estimate${who}. I'll describe the project — who it's for and what we're doing — and you draft the quote from the price book and show me the card. If anything is missing, ask me before you draft.`
}

/**
 * Open the corner Arnie with the kickoff said and the mic on. The floating
 * panel listens for this event (ArnieFloatingPanel). `onCreated` is kept by
 * the panel for the apply: it navigates to the estimate Arnie made or filled.
 */
export function describeToArnie(opts = {}) {
  if (typeof window === 'undefined') return false
  window.dispatchEvent(new CustomEvent('arnie:open', { detail: { kickoff: estimateKickoff(opts), mic: opts.mic !== false, intent: 'estimate', estimateId: opts.estimateId || null } }))
  return true
}

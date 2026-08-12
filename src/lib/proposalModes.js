// The three things a rep can send, named so the button says what the customer
// will actually receive.
//
// It used to say "Send Proposal" for all three. A rep had no way to tell which
// of them was about to go out, and the mode defaults to the plain document —
// so of 110 sent estimates, 79 went as the bare PDF with no savings, no
// payback and no charts, while the interactive version sat there fully built
// and unused. Cole reported it as "the link does not show savings or
// incentive"; nothing was broken, he just wasn't sending that one.
//
// WHAT EACH CARRIES (Bryce, 2026-08):
//   regular     — price and the utility incentive. No savings, no payback.
//                 It is a quote, not a pitch.
//   interactive — the full case: savings, payback, ROI, charts.
//   formal      — the legal document, terms and signature.

export const PROPOSAL_MODES = {
  pdf: {
    id: 'pdf',
    label: 'Regular Estimate',
    send: 'Send Regular Estimate',
    resend: 'Resend Regular Estimate',
    blurb: 'A clean price document — line items and the utility incentive. No savings or payback figures.',
    showsSavings: false,
    showsIncentive: true,
  },
  interactive: {
    id: 'interactive',
    label: 'Interactive Quote',
    send: 'Send Interactive Quote',
    resend: 'Resend Interactive Quote',
    blurb: 'The full case: annual savings, payback, ROI and charts, as a scrolling web quote.',
    showsSavings: true,
    showsIncentive: true,
  },
  formal: {
    id: 'formal',
    label: 'Formal Proposal / Contract',
    send: 'Send Formal Proposal',
    resend: 'Resend Formal Proposal',
    blurb: 'The legal document — scope, terms and signature block, for a customer who needs to sign.',
    showsSavings: true,
    showsIncentive: true,
  },
}

export const DEFAULT_PROPOSAL_MODE = 'pdf'

/** Never throw on an unrecognised stored mode — a bad value must not hide the button. */
export function proposalMode(mode) {
  return PROPOSAL_MODES[mode] || PROPOSAL_MODES[DEFAULT_PROPOSAL_MODE]
}

/** What the green button should read, given the mode and whether it has gone out already. */
export function sendButtonLabel(mode, alreadySent = false) {
  const m = proposalMode(mode)
  return alreadySent ? m.resend : m.send
}

/** For the selector. Order is deliberate: cheapest document first, contract last. */
export function proposalModeOptions() {
  return [PROPOSAL_MODES.pdf, PROPOSAL_MODES.interactive, PROPOSAL_MODES.formal]
}

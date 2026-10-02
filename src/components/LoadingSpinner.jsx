// Kept as a name, not as a spinner.
//
// Bryce: every indicator in JobScout is the little scout hiking, except inside
// an individual AI where the agent has its own. This used to draw a rotating
// border circle; it now delegates to ScoutLoader so the three pages still
// calling it (EstimateDetail, InvoiceDetail, Invoices) match the rest of the
// app without each needing to be edited, and so no new caller can reintroduce
// a spinner by reaching for the obvious component name.
//
// New code should use <ScoutLoader> directly.

import ScoutLoader from './ScoutLoader'

const SIZES = { small: 40, medium: 52, large: 64 }

export default function LoadingSpinner({ message = 'Loading…', size = 'medium', theme = null }) {
  return <ScoutLoader label={message} size={SIZES[size] || SIZES.medium} theme={theme} />
}

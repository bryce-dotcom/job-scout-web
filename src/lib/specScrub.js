// Spec-sheet scrubbing — re-export shim.
//
// The implementation lives in supabase/functions/_shared/specScrub.ts so the
// portal function, the PDF generator and the on-screen spec panel all share
// ONE definition of what a customer may see. Same arrangement as
// materialLaborSplit, and for the same reason: a rule written twice drifts,
// and here drift means leaking the manufacturer on a proposal.
//
// Do not reimplement anything here.

export {
  buildDenyTerms,
  scrubText,
  isIdentifyingRow,
  publicSheet,
  publicTitle,
  findLeaks,
  DEFAULT_KEEP_TERMS,
  datasheetRows,
} from '../../supabase/functions/_shared/specScrub.ts'

// Sal's fit rules — re-export shim.
//
// Implementation lives in supabase/functions/_shared/bidFit.ts so the edge
// function that scores an opportunity and the board that renders it use ONE
// definition of "outside the area", "set-aside not held", "due in 2d 4h".
//
// Do not reimplement anything here.

export {
  DEFAULT_THRESHOLDS,
  DISMISS_REASONS,
  STATUS_LABEL,
  normalizeText,
  fnv1a64,
  dedupeHash,
  kmBetween,
  setAsideRequirement,
  prefilter,
  countdown,
  statusForScore,
  shouldNotify,
} from '../../supabase/functions/_shared/bidFit.ts'

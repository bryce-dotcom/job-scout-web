// Inbound reply matching — re-export shim.
//
// The implementation lives in supabase/functions/_shared/inboundMatch.ts so the
// edge function and these tests share ONE definition. Same arrangement as
// specScrub, matLabCore and plaidSync, and for the same reason: attaching a
// customer's reply to the wrong estimate would put one customer's words in
// front of another customer's job, and a rule written twice drifts.
//
// Do not reimplement anything here.

export {
  matchInboundToEstimate,
  normalizeEmail,
  isDistinctiveQuoteId,
  stripQuotedReply,
} from '../../supabase/functions/_shared/inboundMatch.ts'

// Plaid sync rules — re-export shim.
//
// The implementation lives in supabase/functions/_shared/plaidSync.ts so the
// edge function and these tests share ONE definition. Same arrangement as
// specScrub and matLabCore, and for the same reason: this exact rule was written
// per-account when Plaid's endpoint is per-item, and the drift put $20,000 of
// business banking on an employee's expense card.
//
// Do not reimplement anything here.

export {
  buildAccountMap,
  attribute,
  groupByItem,
  itemCursor,
  mapTransaction,
  chunk,
  pullItem,
  previewAttribution,
} from '../../supabase/functions/_shared/plaidSync.ts'

// Window catalogue arithmetic — re-export shim.
//
// The rules live in supabase/functions/_shared/windowTypes.ts so the app and
// the edge functions share ONE copy, exactly as glassAreaLine does. Do not
// reimplement anything here; add to the shared module instead.

export {
  unitPanes,
  rowPanes,
  rowExtras,
  SIZE_BANDS,
  sizeBandFor,
  rowSizeBand,
  scaleHeight,
  courseHeight,
  storeyFor,
  ACCESS_LADDER,
  accessFor,
  accessWorkKey,
  describeRow,
} from '../../supabase/functions/_shared/windowTypes.ts'

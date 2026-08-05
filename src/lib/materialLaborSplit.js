// Material/Labor split — re-export shim.
//
// The implementation moved to supabase/functions/_shared/matLabCore.ts so the
// edge function and the app share ONE copy. It used to exist twice: here, and
// hand-copied inside get-portal-document under a comment saying "keep the two
// in sync". They did not stay in sync, which is why Alayda's summary invoice
// kept reverting to unsplit descriptions no matter how many times it was
// "fixed" — each pass corrected one surface.
//
// This file stays so every existing import keeps working (reports.js,
// InvoiceDetail, UtilityInvoiceDetail, the tests). Do not reimplement anything
// here; add to the core instead.

export {
  resolveMatLabSplit,
  computeMaterialLaborSplit,
  splitLinePartsLabor,
  buildSummaryRows,
  SUMMARY_ROW_LABELS,
  round2,
} from '../../supabase/functions/_shared/matLabCore.ts'

// Audit area -> estimate line — re-export shim.
//
// The rule lives in supabase/functions/_shared/auditAreaLine.ts so the app and
// the edge functions share ONE copy. It was previously written four times
// (LightingAuditDetail, NewLightingAudit, LeadDetail, backfill-audit-estimates)
// and all four disagreed. Do not reimplement anything here; add to the shared
// module instead.

export {
  round2,
  areaAnnotations,
  areaWattsReduced,
  areaOrderQty,
  auditCostPerWatt,
  areaHasRecordedPrice,
  auditAreaToIntakeLine,
  auditAreasToIntakeLines,
} from '../../supabase/functions/_shared/auditAreaLine.ts'

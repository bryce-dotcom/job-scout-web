// Glass area -> estimate line — re-export shim.
//
// The rule lives in supabase/functions/_shared/glassAreaLine.ts so the app and
// the edge functions share ONE copy, exactly as auditAreaLine does for Lenard.
// Do not reimplement anything here; add to the shared module instead.

export {
  round2,
  glassAreaAnnotations,
  glassAreaOrderQty,
  glassAreaProductPrice,
  glassAreaHasPrice,
  unpricedGlassAreas,
  glassAreaToIntakeLine,
  glassAreasToIntakeLines,
  glassAreasTotal,
} from '../../supabase/functions/_shared/glassAreaLine.ts'

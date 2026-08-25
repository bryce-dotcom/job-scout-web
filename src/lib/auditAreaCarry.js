// What a lighting audit area hands to the estimate line it becomes.
//
// The team, 24 Aug: "Lenard helps them in the field, all their notes and
// pictures are not coming over to the estimate."
//
// Two code paths turned an audit into an estimate — the wizard in
// NewLightingAudit and the convert button on LightingAuditDetail. One carried
// the tech's notes and photos across; the other created the line with a name, a
// quantity and a price and nothing else. Of 100 audit-derived estimates where
// the audit HAD field notes, 89 arrived with none.
//
// This file used to say "the pricing stays where it is — the two paths
// genuinely price differently". They did, and that was the problem: four
// copies, three of which ignored the catalogue entirely and all of which went
// negative on a zero baseline. The whole rule now lives in
// supabase/functions/_shared/auditAreaLine.ts, shared with the edge functions.
//
// This file stays so existing imports keep working. Do not reimplement
// anything here; add to the shared module instead.

export { areaAnnotations } from '../../supabase/functions/_shared/auditAreaLine.ts'

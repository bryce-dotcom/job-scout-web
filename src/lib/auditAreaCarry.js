// What a lighting audit area hands to the estimate line it becomes.
//
// The team, 24 Aug: "Lenard helps them in the field, all their notes and
// pictures are not coming over to the estimate."
//
// Two code paths turn an audit into an estimate — the wizard in
// NewLightingAudit and the convert button on LightingAuditDetail. One carried
// the tech's notes and photos across; the other created the line with a name, a
// quantity and a price and nothing else. Of 100 audit-derived estimates where
// the audit HAD field notes, 89 arrived with none.
//
// So this is one function both call. The pricing stays where it is — the two
// paths genuinely price differently — but what the tech saw and wrote travels
// the same way regardless of which button made the estimate.

/**
 * The annotations an area passes to its quote line.
 *
 * Always returns both keys. Handing back a partial object would let a caller
 * spread it and silently keep whatever was there before, which is the failure
 * this exists to stop.
 */
export function areaAnnotations(area) {
  const notes = String(area?.override_notes ?? '').trim()
  const photos = Array.isArray(area?.photos) ? area.photos.filter(Boolean) : []
  return { notes: notes || null, photos }
}

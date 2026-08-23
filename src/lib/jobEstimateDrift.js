// Where a job's line items and its estimate's line items disagree.
//
// Doug (dab8643d): "Four Pines estimate has 8' strips. When is was transferred
// to a Job it changed the 8' strips to 4' strips. 4' strips were ordered."
//
// The transfer did not change anything. The timestamps say so: the job and its
// lines were created 2026-07-28 19:05, one second apart, carrying item 1496
// (4ft) — which is what the estimate held that day. The 8ft line, item 1436,
// was written to the estimate on 2026-08-11, a fortnight later. The estimate
// was revised after the job existed and the job never heard about it.
//
// So the defect is not a bad copy, it is that nothing ever says the two have
// drifted apart — and the JOB is what gets ordered from. Doug ordered 4ft
// strips off a job whose estimate had said 8ft for two weeks.
//
// This deliberately reports rather than reconciles. 27 of 71 estimate-linked
// jobs differ from their estimate, and plenty of that is legitimate: a job
// picks up out-of-scope work that was never quoted. Auto-syncing would delete
// exactly that. Show the difference; let a person decide.

const qty = (r) => Number(r?.quantity ?? 0) || 0

/**
 * Compare a job's lines against its estimate's lines by product.
 *
 * Custom lines (no item_id) are ignored: they are typed free-text on both
 * sides and comparing them by description produces noise, not signal.
 *
 * Returns { onlyOnEstimate, onlyOnJob, quantityDiffers, hasDrift }.
 */
export function jobEstimateDrift(jobLines = [], quoteLines = [], products = []) {
  const nameOf = (id) => (products || []).find((p) => String(p.id) === String(id))?.name || `Product ${id}`

  const tally = (rows) => {
    const m = new Map()
    for (const r of rows || []) {
      if (!r || r.item_id == null || r.item_id === '') continue
      const k = String(r.item_id)
      m.set(k, (m.get(k) || 0) + qty(r))
    }
    return m
  }
  const j = tally(jobLines)
  const q = tally(quoteLines)

  const onlyOnEstimate = []
  const onlyOnJob = []
  const quantityDiffers = []

  for (const [id, n] of q) {
    if (!j.has(id)) onlyOnEstimate.push({ item_id: id, name: nameOf(id), quantity: n })
    else if (j.get(id) !== n) quantityDiffers.push({ item_id: id, name: nameOf(id), estimate: n, job: j.get(id) })
  }
  for (const [id, n] of j) {
    if (!q.has(id)) onlyOnJob.push({ item_id: id, name: nameOf(id), quantity: n })
  }

  return {
    onlyOnEstimate,
    onlyOnJob,
    quantityDiffers,
    hasDrift: onlyOnEstimate.length > 0 || onlyOnJob.length > 0 || quantityDiffers.length > 0,
  }
}

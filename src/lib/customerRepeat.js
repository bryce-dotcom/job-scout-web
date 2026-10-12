// How many times we have finished a job for this customer.
//
// Bryce wanted this inside the priority circle. It belongs on the customer's
// NAME instead: it is a fact about the customer, identical on every one of
// their jobs, so on a job card it repeats itself down the board and says
// nothing about the job you are looking at. On the name it tells a tech "these
// people keep coming back" and a rep "this one buys again."
//
// What counts as finished, and why it is not just the status:
//
// Archiving a job OVERWRITES jobs.status with 'Archived', so a finished job
// that was later archived no longer says it was ever completed. On HHH that is
// not an edge case — 6,197 of 7,171 jobs are archived, and 5,871 of those
// still carry a completed_at. Counting delivered STATUS alone would have read
// 469 instead of ~6,463 and quietly told every repeat customer they were new.
//
// So: a delivered status OR a completed_at. Neither is complete on its own —
// 171 HHH jobs sit in a delivered status with no completed_at.
//
// The store cannot answer this either; it excludes archived jobs by design.
// The count comes from customer_completed_job_counts(), which groups server
// side so no screen has to pull six thousand rows to count them.

/** Below this, there is nothing worth saying — everybody has a first job. */
export const MIN_REPEAT = 2

/** RPC rows -> { [customer_id]: count }, tolerant of whatever comes back. */
export function countsByCustomer(rows) {
  const out = {}
  for (const row of rows || []) {
    const id = row?.customer_id
    const n = Number(row?.completed_count)
    if (id == null || !Number.isFinite(n) || n <= 0) continue
    out[id] = n
  }
  return out
}

/**
 * The chip for a customer, or null when there is nothing to show.
 * A customer on their first job wears no chip — same reasoning as the priority
 * badge: a marker everybody has is a marker nobody reads.
 */
export function repeatChip(count) {
  const n = Number(count)
  if (!Number.isFinite(n) || n < MIN_REPEAT) return null
  return {
    count: n,
    label: `${n} completed jobs for this customer`,
  }
}

/**
 * PostgREST caps a response at 1000 rows whatever the client asks for, and
 * that cap applies to an RPC too — HHH already has 1,076 customers with
 * jobs, so one call would silently come back short and quietly age every
 * customer past the cut back down to no chip. Ask in batches we chose.
 */
export const ID_BATCH = 500

export function batchIds(ids, size = ID_BATCH) {
  const out = []
  const all = (ids || []).filter(n => Number.isFinite(n))
  for (let i = 0; i < all.length; i += size) out.push(all.slice(i, i + size))
  return out
}

/** The customer ids worth asking about — unique, real, and nothing else. */
export function customerIdsOf(jobs) {
  const seen = new Set()
  for (const job of jobs || []) {
    const id = job?.customer_id ?? job?.customer?.id
    if (id != null && id !== '') seen.add(Number(id))
  }
  return [...seen].filter(Number.isFinite)
}

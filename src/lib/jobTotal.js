// Who owns a job's total — its lines, or a person — and what that means
// when the two disagree.
//
// JobDetail kept job_total in step with the job's lines whenever it had any.
// Right for a job priced from its lines; ruinous for one whose total no line
// ever produced: 6,025 of HHH's 6,470 priced jobs have no lines (HouseCall
// imports, work booked with a price and no itemisation), and one $165 part
// added to such a job turned a $21,200 total into $165 (demo job 23513,
// 16 Sep 2026). jobs.job_total_source says which kind a job is:
//
//   'lines'  the lines produced the total — keep it in step with them
//   'manual' a person, an import or an estimate summary set it — lines
//            added later are additions to look at, never a replacement
//   null     legacy, unknown — the old behaviour (sync) until told otherwise
//
// Everything here is a decision, not an effect, so it can be pinned by tests.

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100

/** Sum of the job's lines, less the job-level discount — what "the lines say". */
export function linesTotalOf(lines, job) {
  const sum = (lines || []).reduce((s, l) => s + (parseFloat(l?.total) || 0), 0)
  return r2(sum - (parseFloat(job?.discount) || 0))
}

/**
 * What to do about job_total given the lines on the job right now.
 * @returns {{ action: 'none'|'sync'|'keep', stored, computed, source }}
 *   sync — write computed as the total (the lines own it)
 *   keep — leave the stored total alone and say so (a person set it)
 *   none — nothing to do (no lines, or already equal)
 */
export function jobTotalPolicy(job, lines) {
  const source = job?.job_total_source || null
  const stored = r2(job?.job_total)
  const computed = linesTotalOf(lines, job)
  if (!Array.isArray(lines) || lines.length === 0) return { action: 'none', stored, computed, source }
  if (computed === stored) return { action: 'none', stored, computed, source }
  if (source === 'manual') return { action: 'keep', stored, computed, source }
  return { action: 'sync', stored, computed, source }
}

/** The patch that makes the lines the owner of the total, at their sum. */
export function adoptLinesTotal(computed) {
  return { job_total: r2(computed), job_total_source: 'lines' }
}

/** The patch for a total a person typed: it is theirs until they say otherwise. */
export function manualTotal(amount) {
  return { job_total: r2(amount), job_total_source: 'manual' }
}

// Which job statuses a board is allowed to show.
//
// The job board renders one column per status and drops any job whose status
// has no column. That made the configured status list a silent filter on the
// data: the app writes 'Invoiced' to jobs.status when an invoice is sent
// (InvoiceDetail), no tenant had 'Invoiced' configured and it was not in the
// hardcoded fallback either, so 126 HHH jobs had nowhere to land and simply
// stopped appearing. The same shape is on record costing Christopher "10
// minutes trying to find a job that I just finished".
//
// The fix is to fail OPEN. The configured list decides ORDER, NAMES and
// COLOURS — it does not decide what exists. Any status actually present in the
// data earns a column, so no job can be hidden by a gap in configuration.
// Only statuses that are deliberately off-board are held back.

// Terminal states the board is not for. Kept out on purpose rather than by
// accident — company 3 has 6,196 archived jobs, and failing open on those
// would bury the board.
export const HIDDEN_JOB_STATUSES = new Set(['Archived', 'Cancelled'])

/**
 * @param {Array<{id:string,name:string,color:string}>} configured - the
 *        tenant's job_statuses setting, already normalized, or the fallback.
 * @param {Array<{status?:string}>} jobs - the jobs actually loaded.
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.colors] - default colour per status id.
 * @param {Set<string>} [opts.hidden] - statuses to keep off the board.
 * @returns {Array} configured statuses, then any discovered ones, each
 *          discovered entry flagged `discovered: true` so callers can tell
 *          them apart — the settings editor must not persist them as if a
 *          human had configured them.
 */
export function resolveJobStatuses(configured, jobs, opts = {}) {
  const { colors = {}, hidden = HIDDEN_JOB_STATUSES } = opts
  const base = Array.isArray(configured) ? configured : []
  if (!Array.isArray(jobs) || jobs.length === 0) return base

  const seen = new Set(base.map((s) => s?.id))
  const discovered = []
  for (const job of jobs) {
    const status = job?.status
    if (!status || seen.has(status) || hidden.has(status)) continue
    seen.add(status)
    discovered.push({
      id: status,
      name: status,
      color: colors[status] || '#9ca3af',
      discovered: true,
    })
  }
  return discovered.length ? [...base, ...discovered] : base
}

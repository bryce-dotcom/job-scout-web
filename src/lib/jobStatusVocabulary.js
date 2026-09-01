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
 * @param {Array<{id:string,name:string,color:string,category:string}>} configured
 *        - the tenant's job_statuses setting, already normalized, or the
 *        fallback.
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

// ── The stored shape of a status ────────────────────────────────────────────
//
// A status is {id, name, color, category}. `category` is the field the
// dashboard, the EOS scorecard and SalesPipeline's date filter read to decide
// what counts as delivered work (see lib/jobMetrics.js).
//
// It kept getting lost because the shape was written down twice: the settings
// editor had its own reader that rebuilt each status as {id, name, color}, and
// its own save mapper that did the same. Both dropped `category` on the floor,
// so the Category dropdown always displayed "Open" no matter what was stored,
// and saving the panel wiped every flag the tenant had set. Company 3 had six
// statuses flagged delivered; one save of that panel removed all six.
//
// Reading and writing now go through this one pair, so the shape can only
// change in one place.

/** The category a status carries. Anything not explicitly 'delivered' is open.
 *  The settings <select> and the save mapper BOTH call this, so the panel can
 *  never save a category other than the one it displayed. */
export function statusCategory(status) {
  return status?.category === 'delivered' ? 'delivered' : 'open'
}

/**
 * Settings hold a status as either a bare string (legacy) or an object. Give
 * back the full object shape, filling in a colour when none was stored.
 *
 * @param {Array<string|object>} statuses - the raw setting value.
 * @param {object} [opts]
 * @param {Record<string,string>} [opts.colors] - default colour per name.
 * @param {string[]} [opts.palette] - cycled by index when nothing else matches.
 */
export function normalizeStatuses(statuses, opts = {}) {
  const { colors = {}, palette = [] } = opts
  if (!statuses || statuses.length === 0) return []
  const paletteColor = (idx) => (palette.length ? palette[idx % palette.length] : undefined)
  return statuses.map((s, idx) => {
    if (typeof s === 'string') {
      return { id: s, name: s, color: colors[s] || paletteColor(idx), category: 'open' }
    }
    return {
      id: s.id || s.name,
      name: s.name,
      color: s.color || colors[s.name] || paletteColor(idx),
      category: statusCategory(s),
    }
  })
}

/** The rows the settings editor writes back to the job_statuses /
 *  job_section_statuses setting. Unnamed rows are dropped. */
export function statusesToSave(form) {
  return (form || [])
    .filter((s) => s?.name?.trim())
    .map((s) => ({
      id: s.name.trim(),
      name: s.name.trim(),
      color: s.color,
      category: statusCategory(s),
    }))
}

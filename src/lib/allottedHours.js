/**
 * Canonical allotted-hours calculation.
 *
 * One function, used everywhere, so the value that drives bonus pay
 * (jobs.allotted_time_hours) is identical to what the field tech sees
 * on the clock-in progress bar.
 *
 * Logic (PER-LINE, not all-or-nothing):
 *   For each job line:
 *     - If the product has `allotted_time_hours > 0`,
 *       add `allotted_time_hours × quantity` to the total.
 *     - Otherwise, fall back to `line.total / hourly_rate`
 *       (derives install hours from the dollar amount on the line).
 *     - Blank / placeholder lines (no item, total = 0) contribute 0
 *       and are silently skipped.
 *   The hourly rate is looked up per business_unit from the settings
 *   table (key `default_hourly_rates`, JSON object keyed by business
 *   unit), with a legacy fallback to `default_hourly_rate` (single
 *   number). If no rate is available, fallback lines contribute 0.
 *
 * Why per-line instead of all-or-nothing:
 *   Real jobs often have one blank placeholder line or a non-install
 *   discount row. The old "every line must have hours or fall back"
 *   rule let one blank row corrupt the total by forcing the fallback
 *   to divide the ENTIRE job_total by the hourly rate — which on a
 *   $217k lighting retrofit with one blank line produced ~3,192 hours
 *   instead of the correct ~714 (job 21004). Per-line is the only safe
 *   policy.
 *
 * This helper is pure — it takes settings in as an argument so both
 * JobDetail and FieldScout can call it with whatever they've got in
 * memory without re-reading the store.
 */

/**
 * Resolve the hourly rate for a business unit from settings rows.
 * Accepts either the raw settings array (rows with {key, value}) or
 * a pre-parsed map.
 */
export function resolveHourlyRate(settings, businessUnit) {
  if (!settings) return 0
  const rows = Array.isArray(settings) ? settings : []

  // Primary: per-business-unit map
  const ratesSetting = rows.find(s => s.key === 'default_hourly_rates')
  if (ratesSetting) {
    try {
      const ratesMap = typeof ratesSetting.value === 'string'
        ? JSON.parse(ratesSetting.value)
        : (ratesSetting.value || {})
      const rate = parseFloat(ratesMap?.[businessUnit]) || 0
      if (rate > 0) return rate
    } catch {}
  }

  // Legacy: single global rate
  const oldSetting = rows.find(s => s.key === 'default_hourly_rate')
  if (oldSetting) {
    try {
      const legacy = typeof oldSetting.value === 'string'
        ? JSON.parse(oldSetting.value)
        : oldSetting.value
      return parseFloat(legacy) || 0
    } catch {}
  }
  return 0
}

/**
 * Compute total allotted hours for a job.
 *
 * Per-line: each line contributes its own hours independently.
 *
 * @param {object} opts
 * @param {Array}  opts.lines        Job lines with `item.allotted_time_hours` joined from products_services
 * @param {number} opts.jobTotal     (unused for the main path; kept for callsite compatibility)
 * @param {string} opts.businessUnit Business unit for rate lookup on lines without product hours
 * @param {Array|object} opts.settings Settings rows (or parsed map)
 * @returns {number} Allotted hours, rounded to 2 decimals
 */
export function computeAllottedHours({ lines = [], jobTotal = 0, businessUnit = null, settings = [] } = {}) {
  const rows = Array.isArray(lines) ? lines : []
  if (rows.length === 0) {
    // No lines at all — last-resort full-job fallback so old records
    // still get a sensible value before any lines are attached.
    const total = parseFloat(jobTotal) || 0
    if (total <= 0) return 0
    const rate = resolveHourlyRate(settings, businessUnit)
    if (rate <= 0) return 0
    return Math.round((total / rate) * 100) / 100
  }

  const rate = resolveHourlyRate(settings, businessUnit)

  let sum = 0
  for (const line of rows) {
    const productHours = parseFloat(line?.item?.allotted_time_hours) || 0
    const qty = parseFloat(line?.quantity) || 0
    if (productHours > 0) {
      // Normal path: product has labor hours defined
      sum += productHours * (qty || 1)
      continue
    }
    // Fallback path: line has no product hours → derive from dollars ÷ rate.
    // Uses line.total (the final line total) so discounts and per-line
    // price adjustments are respected. Skips blank/placeholder lines
    // (item_id null + total 0) silently.
    const lineTotal = parseFloat(line?.total) || 0
    if (lineTotal > 0 && rate > 0) {
      sum += lineTotal / rate
    }
  }

  return Math.round(sum * 100) / 100
}

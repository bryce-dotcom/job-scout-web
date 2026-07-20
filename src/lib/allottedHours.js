/**
 * Canonical allotted-hours calculation.
 *
 * One function, used everywhere, so the value that drives bonus pay
 * (jobs.allotted_time_hours) is identical to what the field tech sees
 * on the clock-in progress bar.
 *
 * Logic (PER-LINE, LABOR ONLY):
 *   For each job line:
 *     - If the product has `allotted_time_hours > 0`,
 *       add `allotted_time_hours × quantity` to the total.
 *     - Else, if the line's product is tagged `material_or_labor === 'material'`
 *       (a material / lift / equipment item), it contributes 0 — you don't
 *       earn a labor bonus for buying chemicals or renting a lift.
 *     - Else (labor / untagged / custom line) fall back to `line.total / rate`
 *       (derive install hours from the labor dollars on the line).
 *     - Blank / placeholder lines (no item, total = 0) contribute 0.
 *   The hourly rate is looked up per business_unit from the settings
 *   table (key `default_hourly_rates`, JSON object keyed by business
 *   unit), with a legacy fallback to `default_hourly_rate` (single
 *   number). If no rate is available, fallback lines contribute 0.
 *
 * Why per-line, labor-only, and NO whole-job fallback:
 *   The efficiency bonus pays (allotted − actual) × rate, so a bad allotted
 *   value mints a bad bonus. Two failure modes had to be closed:
 *     1. A job with NO line items used to divide the ENTIRE job_total by the
 *        rate — counting materials, equipment and lift rental as labor. Job
 *        23385 ($47,766 power-wash ÷ $75/hr) produced 636.88 "labor hours" on
 *        a job the crew did in 52h, minting an ~$11k bonus. We now return 0
 *        (allotted unknown → flag for manual entry) instead of guessing.
 *     2. A per-line dollar fallback that ignored material vs labor over-stated
 *        material-heavy jobs. It now skips `material`-tagged lines.
 *   (Earlier this same class of bug hit job 21004 — a $217k retrofit with one
 *   blank line produced ~3,192h instead of ~714 — which is why the calc is
 *   per-line; this change extends that to labor-only + no whole-job fallback.)
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
  // No lines at all → allotted is UNKNOWN. Never divide the whole job_total by
  // the rate (that counts materials/equipment/lift as labor and mints absurd
  // bonuses — job 23385). Return 0 so the job is flagged for manual entry.
  // `jobTotal` is kept only for callsite compatibility.
  void jobTotal
  if (rows.length === 0) return 0

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
    // Labor-only dollar fallback: a line whose product is explicitly a MATERIAL
    // (chemicals, fixtures, lift/equipment rental) earns no labor hours. Only
    // labor / untagged / custom lines derive hours from dollars ÷ rate.
    if (line?.item?.material_or_labor === 'material') continue
    // line.total (final line total) so discounts + per-line price adjustments
    // are respected. Blank/placeholder lines (item_id null + total 0) → 0.
    const lineTotal = parseFloat(line?.total) || 0
    if (lineTotal > 0 && rate > 0) {
      sum += lineTotal / rate
    }
  }

  return Math.round(sum * 100) / 100
}

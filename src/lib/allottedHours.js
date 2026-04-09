/**
 * Canonical allotted-hours calculation.
 *
 * One function, used everywhere, so the value that drives bonus pay
 * (jobs.allotted_time_hours) is identical to what the field tech sees
 * on the clock-in progress bar.
 *
 * Logic (matches the original in JobDetail.jsx and what bonusCalc reads):
 *   1. If EVERY job line has a products_services.allotted_time_hours > 0,
 *      return SUM(line.item.allotted_time_hours * line.quantity).
 *   2. Otherwise, fall back to job_total / hourly_rate, where the hourly
 *      rate is looked up per business_unit from the settings table
 *      (key `default_hourly_rates`, JSON object keyed by business unit),
 *      with a legacy fallback to `default_hourly_rate` (single number).
 *   3. If nothing works, return 0.
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
 * @param {object} opts
 * @param {Array}  opts.lines        Job lines with `item.allotted_time_hours` joined from products_services
 * @param {number} opts.jobTotal     Job total dollars (used for the fallback path)
 * @param {string} opts.businessUnit Business unit for rate lookup
 * @param {Array|object} opts.settings Settings rows (or parsed map)
 * @returns {number} Allotted hours, rounded to 2 decimals
 */
export function computeAllottedHours({ lines = [], jobTotal = 0, businessUnit = null, settings = [] } = {}) {
  const rows = Array.isArray(lines) ? lines : []
  const allLinesHaveHours = rows.length > 0 && rows.every(l => parseFloat(l?.item?.allotted_time_hours) > 0)

  if (allLinesHaveHours) {
    const sum = rows.reduce(
      (acc, l) => acc + (parseFloat(l.item.allotted_time_hours) || 0) * (parseFloat(l.quantity) || 1),
      0
    )
    return Math.round(sum * 100) / 100
  }

  // Fallback: divide total dollars by the hourly rate
  const total = parseFloat(jobTotal) || 0
  if (total <= 0) return 0
  const rate = resolveHourlyRate(settings, businessUnit)
  if (rate <= 0) return 0
  return Math.round((total / rate) * 100) / 100
}

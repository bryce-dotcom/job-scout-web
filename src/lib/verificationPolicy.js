// Which business units require photo / Victor verification before a job can
// be completed and invoiced.
//
// Christopher (HHH Building Services): "None of the jobs the guys do ever get
// completed nor an invoice can be sent while in the field because we've not
// been able to figure out how to take a photo get a passing grade... on our
// end, we don't verify our work completed with a photo."
//
// The gate was hardcoded by job ROLE, so window cleaning carried the same
// photo requirement as an LED retrofit. The value differs by trade: on the
// lighting side photos prove the fixture went in, feed the customer invoice
// PDF and back utility rebate claims; on cleaning they're pure friction
// holding up completion and invoicing.
//
// Stored as an EXEMPT list rather than a required list so the default —
// nothing configured — keeps every unit gated exactly as it is today.
// Turning a unit off is an explicit act.

// Lives inside the existing payroll_config settings blob
// (payrollConfig.verification_exempt_units) so it saves through the same path
// as every other payroll setting — no new writer, no new settings row.
export const VERIFICATION_EXEMPT_KEY = 'verification_exempt_units'

/** Pull the exempt list out of a payroll_config blob (string or object). */
export function exemptUnitsFromPayrollConfig(payrollConfigOrRaw) {
  let cfg = payrollConfigOrRaw
  if (typeof cfg === 'string') { try { cfg = JSON.parse(cfg) } catch { return null } }
  return cfg?.[VERIFICATION_EXEMPT_KEY] ?? null
}

const norm = (v) => String(v || '').trim().toLowerCase()

/** Business-unit names exempted from verification. Accepts the raw setting
 *  value (JSON array, comma string, or already-parsed array). */
export function exemptUnits(settingValue) {
  if (!settingValue) return []
  let raw = settingValue
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw) } catch { raw = raw.split(',') }
  }
  if (!Array.isArray(raw)) return []
  return raw
    .map((u) => (typeof u === 'string' ? u : u?.name))
    .filter((u) => u && String(u).trim())
    .map((u) => String(u).trim())
}

/**
 * Does work in this business unit still require verification?
 * Unknown / missing business unit stays gated — we never silently drop the
 * requirement for work we can't classify.
 */
export function verificationRequiredFor(businessUnit, settingValue) {
  const exempt = exemptUnits(settingValue).map(norm)
  if (exempt.length === 0) return true
  const bu = norm(businessUnit)
  if (!bu) return true
  return !exempt.includes(bu)
}

/** True when at least one unit still requires verification — used for the
 *  daily (not job-specific) check, which isn't tied to one unit. */
export function anyUnitRequiresVerification(allUnits = [], settingValue) {
  const names = (allUnits || [])
    .map((u) => (typeof u === 'string' ? u : u?.name))
    .filter(Boolean)
  if (names.length === 0) return true
  return names.some((n) => verificationRequiredFor(n, settingValue))
}

// Who may operate what, and whether their paperwork is still good.
//
// Asked from two places — the employee card and the fleet card — and they must
// never disagree. A truck that reads "assigned, all clear" while the driver's
// own card shows an expired licence is worse than either screen alone, because
// it teaches people not to trust the warning.
//
// The bias throughout is that unknown is not fine. An unrecorded expiry date
// is the most common way a lapsed licence stays invisible: nobody deleted the
// date, it was simply never entered, and a system that treats absence as
// compliance will report a clean fleet right up until a roadside inspection.

export const OPERATOR_ROLES = [
  { value: 'driver',   label: 'Driver',   hint: 'Operates road vehicles — licence class matters' },
  { value: 'operator', label: 'Operator', hint: 'Runs equipment — certifications rather than a licence' },
  { value: 'both',     label: 'Both',     hint: 'Drives and operates' },
]

// Ordered weakest to strongest. A class covers everything below it: an A can
// drive what a B can, a B what a C can.
export const LICENSE_CLASSES = [
  { value: 'C',     label: 'Class C', rank: 1, hint: 'Ordinary licence — cars, pickups, light trailers' },
  { value: 'B',     label: 'Class B', rank: 2, hint: 'Heavy straight truck' },
  { value: 'A',     label: 'Class A', rank: 3, hint: 'Combination — tractor and trailer' },
  { value: 'CDL-C', label: 'CDL C',   rank: 4, hint: 'Commercial, small vehicle or hazmat' },
  { value: 'CDL-B', label: 'CDL B',   rank: 5, hint: 'Commercial heavy straight truck' },
  { value: 'CDL-A', label: 'CDL A',   rank: 6, hint: 'Commercial combination — the broadest' },
]

const rankOf = cls => LICENSE_CLASSES.find(c => c.value === cls)?.rank ?? 0

// What each kind of asset needs someone to hold. Deliberately conservative:
// where a class depends on weight rather than type — a dump truck may or may
// not need a CDL depending on GVWR — the stricter requirement is used, because
// warning about a truck that turns out to be fine costs a conversation, and
// staying quiet about one that is not costs considerably more.
const CLASS_REQUIRED = {
  pickup: 'C', van: 'C', service_truck: 'C', trailer: 'C',
  box_truck: 'B',
  dump_truck: 'CDL-B',
  // Equipment is not driven on the road under its own licence; it is operated,
  // and what matters is training rather than a DMV class.
}

const EQUIPMENT = new Set([
  'skid_steer', 'excavator', 'mini_excavator', 'backhoe', 'track_loader',
  'wheel_loader', 'dozer', 'telehandler', 'boom_lift', 'scissor_lift',
  'compactor', 'generator', 'attachment',
])

/** Today as YYYY-MM-DD, local. Dates here are calendar dates, not moments. */
export function today(now = new Date()) {
  const pad = n => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/**
 * Whole days until a date. Negative once past.
 *
 * Computed on calendar dates rather than timestamps: an expiry is a day, not
 * an instant, and subtracting Date objects makes the answer depend on the
 * runtime's timezone — west of UTC a licence expires a day early.
 */
export function daysUntil(dateStr, now = new Date()) {
  if (!dateStr) return null
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number)
  if (!y || !m || !d) return null
  const target = Date.UTC(y, m - 1, d)
  const [ty, tm, td] = today(now).split('-').map(Number)
  return Math.round((target - Date.UTC(ty, tm - 1, td)) / 86_400_000)
}

export const EXPIRING_SOON_DAYS = 30

/**
 * The state of one person's credentials, independent of any vehicle.
 *
 * severity: 'ok' | 'info' | 'warn' | 'error' — so a caller can sort or colour
 * without re-deriving the meaning of each status.
 */
export function credentialStatus(employee, now = new Date()) {
  const role = employee?.operator_role || null
  if (!role) return { status: 'not_a_driver', severity: 'info', message: 'Not marked as a driver or operator' }

  // An operator runs equipment; a road licence is not the relevant document,
  // so demanding one would generate noise nobody can act on.
  if (role === 'operator') {
    return { status: 'operator', severity: 'ok', message: 'Equipment operator' }
  }

  const licDays = daysUntil(employee?.license_expires, now)
  const medDays = daysUntil(employee?.medical_card_expires, now)

  if (licDays === null) {
    return { status: 'unknown', severity: 'warn', message: 'No licence expiry recorded' }
  }
  if (licDays < 0) {
    return { status: 'expired', severity: 'error', message: `Licence expired ${Math.abs(licDays)} day${Math.abs(licDays) === 1 ? '' : 's'} ago`, days: licDays }
  }
  // Checked before the licence's own soon-to-expire window: a medical card
  // lapses on a two-year cycle nobody gets a reminder for, and an expired one
  // grounds a commercial driver just as firmly as an expired licence.
  if (medDays !== null && medDays < 0) {
    return { status: 'medical_expired', severity: 'error', message: `Medical card expired ${Math.abs(medDays)} days ago`, days: medDays }
  }
  if (licDays <= EXPIRING_SOON_DAYS) {
    return { status: 'expiring', severity: 'warn', message: `Licence expires in ${licDays} day${licDays === 1 ? '' : 's'}`, days: licDays }
  }
  if (medDays !== null && medDays <= EXPIRING_SOON_DAYS) {
    return { status: 'medical_expiring', severity: 'warn', message: `Medical card expires in ${medDays} days`, days: medDays }
  }
  return { status: 'ok', severity: 'ok', message: 'Current', days: licDays }
}

/**
 * Can this person be assigned this asset?
 *
 * Combines two separate questions — are their credentials valid at all, and
 * are they valid for THIS class of machine — because a card showing one
 * without the other is misleading either way.
 */
export function canOperate(employee, asset, now = new Date()) {
  const assetClass = asset?.asset_class || null

  if (!employee) return { ok: false, status: 'unassigned', severity: 'info', message: 'Nobody assigned' }

  const cred = credentialStatus(employee, now)
  const role = employee.operator_role

  if (EQUIPMENT.has(assetClass)) {
    // Equipment needs an operator, not a licence holder.
    if (role === 'driver') {
      return { ok: false, status: 'wrong_role', severity: 'warn', message: 'Marked as a driver, not an equipment operator' }
    }
    if (!role) return { ok: false, status: 'not_a_driver', severity: 'warn', message: 'Not marked as an operator' }
    return { ok: true, status: 'ok', severity: 'ok', message: 'Equipment operator' }
  }

  // Road vehicle from here down.
  if (!role || role === 'operator') {
    return { ok: false, status: 'not_a_driver', severity: 'warn', message: 'Not marked as a driver' }
  }
  if (cred.severity === 'error' || cred.status === 'unknown') {
    return { ok: false, ...cred }
  }

  const required = CLASS_REQUIRED[assetClass] || null
  if (required && rankOf(employee.license_class) < rankOf(required)) {
    const need = LICENSE_CLASSES.find(c => c.value === required)?.label || required
    return {
      ok: false, status: 'insufficient_class', severity: 'error',
      message: employee.license_class
        ? `Holds ${employee.license_class}; this needs ${need}`
        : `No licence class recorded; this needs ${need}`,
    }
  }

  // Credentials valid but expiring: allowed, and still worth saying.
  return { ok: true, ...cred }
}

/** Assets whose assignment needs attention, worst first. */
export function complianceIssues(assignments, now = new Date()) {
  return (assignments || [])
    .map(a => ({ ...a, check: canOperate(a.employee, a.asset, now) }))
    .filter(a => !a.check.ok || a.check.severity === 'warn')
    .sort((a, b) => {
      const rank = { error: 0, warn: 1, info: 2, ok: 3 }
      return (rank[a.check.severity] ?? 9) - (rank[b.check.severity] ?? 9)
    })
}

// ─────────────────────────────────────────────────────────────────────
// Region-aware date/time formatting.
//
// Every job / appointment / lead time is stored as a proper UTC timestamptz
// in the DB. The bug HHH hit ("I set 1pm, it reopens at 7am"; "leads jump a
// day") came from formatting those instants in the VIEWER'S DEVICE timezone —
// so the same job read differently on different devices, and evening items
// landed on the wrong calendar day.
//
// HHH operates almost entirely in Utah (Mountain, observes DST); Arizona
// (no DST) is a small, growing slice (the Lenard AZ SRP program). So we
// anchor formatting to a RESOLVED timezone per entity instead of the device:
//   job/appointment business_unit -> its timezone (or address) -> company
//   default (Mountain). Arizona units/jobs can be pinned to America/Phoenix.
//
// Storage never changes — only how we render into <input datetime-local>,
// how we bucket onto calendar days, and how we display.
// ─────────────────────────────────────────────────────────────────────

export const DEFAULT_TZ = 'America/Denver' // Utah / Mountain (DST)
export const PHOENIX_TZ = 'America/Phoenix' // Arizona (no DST)

// Offset (ms) to ADD to a UTC instant to get the wall clock in `tz`.
// e.g. America/Denver in summer (MDT) returns -6h.
function tzOffsetMs(utcMs, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const map = {}
  for (const p of dtf.formatToParts(new Date(utcMs))) {
    if (p.type !== 'literal') map[p.type] = p.value
  }
  let hour = parseInt(map.hour, 10)
  if (hour === 24) hour = 0 // some engines emit "24" for midnight
  const asIfUtc = Date.UTC(+map.year, +map.month - 1, +map.day, hour, +map.minute, +map.second)
  return asIfUtc - utcMs
}

// UTC ISO -> "YYYY-MM-DDTHH:MM" wall clock in `tz`, for <input type="datetime-local">.
export function toZonedInput(iso, tz = DEFAULT_TZ) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  const shifted = new Date(d.getTime() + tzOffsetMs(d.getTime(), tz))
  const pad = (n) => String(n).padStart(2, '0')
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}T${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`
}

// "YYYY-MM-DDTHH:MM" wall clock in `tz` (what the input emits) -> UTC ISO for the DB.
export function fromZonedInput(local, tz = DEFAULT_TZ) {
  if (!local) return null
  const m = String(local).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/)
  if (!m) { const d = new Date(local); return isNaN(d.getTime()) ? null : d.toISOString() }
  const [, y, mo, da, h, mi] = m.map(Number)
  const wallAsUtc = Date.UTC(y, mo - 1, da, h, mi)
  // Offset at (approximately) the target instant — correct across DST except
  // inside the ~1h DST gap/overlap, which never matters for scheduling.
  const off = tzOffsetMs(wallAsUtc, tz)
  return new Date(wallAsUtc - off).toISOString()
}

// Display a UTC instant in `tz`. opts override the Intl parts.
export function formatZonedDateTime(iso, tz = DEFAULT_TZ, opts = {}) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', ...opts,
  }).format(d)
}

export function formatZonedDate(iso, tz = DEFAULT_TZ, opts = {}) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: tz, month: 'short', day: 'numeric', year: 'numeric', ...opts,
  }).format(d)
}

// "YYYY-MM-DD" for the day `iso` falls on IN `tz` — the key to bucket onto a
// calendar day. Using device-local here is what shifted Tracy's evening leads.
export function zonedDayKey(iso, tz = DEFAULT_TZ) {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d)
}

function inferTzFromAddress(addr) {
  if (!addr) return null
  if (/\b(AZ|Arizona)\b/i.test(addr)) return PHOENIX_TZ
  if (/\b(UT|Utah|ID|Idaho|CO|Colorado|NM|New Mexico|WY|Wyoming|MT|Montana)\b/i.test(addr)) return DEFAULT_TZ
  return null
}

// Resolve the timezone for a job/appointment: explicit BU timezone -> BU
// address -> company default. `businessUnits` is the settings array; each entry
// may carry an optional `timezone` (IANA id) and an `address`.
export function resolveTimezone(businessUnitName, businessUnits = [], companyTz = DEFAULT_TZ) {
  if (businessUnitName && Array.isArray(businessUnits)) {
    const bu = businessUnits.find((u) => u && u.name === businessUnitName)
    if (bu?.timezone) return bu.timezone
    const fromAddr = inferTzFromAddress(bu?.address)
    if (fromAddr) return fromAddr
  }
  return companyTz || DEFAULT_TZ
}

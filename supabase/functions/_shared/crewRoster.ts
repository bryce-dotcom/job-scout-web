// Who is on a job's crew. (Moved here from src/lib/crewRoster.js on 2026-10-26 so the
// crew sheet's server side follows the same rule; the app re-exports it.)
//
// Who is on a job's crew.
//
// `jobs.assigned_team` is a comma-separated string of employee NAMES doing the
// job of a foreign key. There is no join table and no id column, so every
// surface that wants "is this person on this job?" has to match on text.
//
// That rule got written down eight times, in three incompatible dialects:
//
//   - Jobs.jsx / JobDetail.jsx   split(',').trim() then `e.name === n`
//   - FieldScout / Appointments / PMJobSetter
//                                `assigned_team.toLowerCase().includes(name)`
//   - three separate `ids -> "A, B"` formatters
//
// Both dialects were wrong in opposite directions. The exact ones were too
// strict: employee 55 was stored as "Robyn Lyman " (trailing space) while the
// parser trimmed its side, so the comparison never matched and all 23 of her
// jobs failed to resolve her — opening and saving one would silently drop her
// from the crew. The substring ones are too loose: "Cole Westcott" is contained
// in "Nycole Westcott", so a job assigned to Nycole would also appear on Cole's
// FieldScout. One is a data-entry typo away, the other is a surname away.
//
// So: tolerant about SHAPE, exact about IDENTITY. Parsing forgives whitespace,
// casing, a real array, and the JSON-stringified array that is already in the
// data ('["HHH Team A"]' — one job really does hold that). Matching compares
// whole normalized names and never does a substring test.
//
// Normalizing names on the way IN is a database trigger (employees_trim_name),
// not something each caller remembers to do. This module is the second line:
// it keeps the rows already in the table from breaking anything.

/** Compare-safe form of a name: no outer space, single inner spaces, casefold.
 *  Only ever used for comparison — never stored, never displayed. */
export function normalizeName(name: unknown): string {
  if (typeof name !== 'string') return ''
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

/**
 * The crew tokens on a job, as written. Accepts every shape the column holds.
 *
 * @param {string|string[]|null|undefined} assignedTeam - `jobs.assigned_team`.
 * @returns {string[]} trimmed, non-empty names in their stored casing.
 */
export function parseCrew(assignedTeam: unknown): string[] {
  if (!assignedTeam) return []

  let raw = assignedTeam
  if (typeof raw === 'string') {
    // One job holds '["HHH Team A"]' — an array that got JSON.stringify'd into
    // a text column. Recover it rather than reading it as one absurd name.
    const trimmed = raw.trim()
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) raw = parsed
      } catch { /* not JSON after all — fall through and split on commas */ }
    }
  }

  const parts = Array.isArray(raw) ? raw : String(raw).split(',')
  return parts
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
}

/**
 * Is this employee on the crew? Whole-name match, never a substring.
 *
 * @param {string|string[]|null} assignedTeam - `jobs.assigned_team`.
 * @param {{name?:string}|string|null} employee - employee row, or a bare name.
 */
export function isOnCrew(assignedTeam: unknown, employee: any): boolean {
  const wanted = normalizeName(typeof employee === 'string' ? employee : employee?.name)
  if (!wanted) return false
  return parseCrew(assignedTeam).some((n) => normalizeName(n) === wanted)
}

/**
 * Resolve a job's crew to employee ids, for the multi-select in the edit forms.
 * Unrecognised tokens are dropped — the roster decides who exists.
 *
 * @returns {string[]} ids as strings, in the order they appear on the job.
 */
export function resolveCrewIds(assignedTeam: unknown, employees: any[]): string[] {
  const roster = Array.isArray(employees) ? employees : []
  return parseCrew(assignedTeam)
    .map((token) => {
      const hit = roster.find((e) => normalizeName(e?.name) === normalizeName(token))
      return hit ? String(hit.id) : null
    })
    .filter(Boolean)
}

/**
 * Build the stored string from selected employee ids. The inverse of
 * resolveCrewIds, so a round trip through the edit form is lossless.
 *
 * @returns {string|null} "Name A, Name B", or null when nobody is selected —
 *          null rather than '' because the column is nullable and an empty
 *          crew should read as unassigned, not as a crew with no one in it.
 */
export function formatCrew(ids: any, employees: any[]): string {
  const roster = Array.isArray(employees) ? employees : []
  const names = (ids || [])
    .map((id) => roster.find((e) => String(e?.id) === String(id))?.name)
    .map((n) => (typeof n === 'string' ? n.trim() : ''))
    .filter(Boolean)
  return names.length ? names.join(', ') : null
}

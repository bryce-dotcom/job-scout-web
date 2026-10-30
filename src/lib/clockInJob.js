// A punch is charged to a job, or it is overhead — and the ROLE decides,
// never the person at the clock.
//
// Frankie, 2026-10-11, on HHH's September: 1,513 hours punched, 530 of them
// to no job — a third of the labor landing on nothing, so every job margin
// read high. The first fix let the person pick "Overhead" at clock-in.
// Bryce, 2026-10-12: "the first thing field guys will do is use that so they
// don't charge the job and they can get more bonus... the system should be
// using the job description to know whose work is overhead or not." And
// then: "this has to work for all users not just HHH."
//
// So, for every tenant:
//   - A job title is OVERHEAD only when it is plainly an office title
//     (Office, Admin, Owner, Sales, Setter, Manager, Project Manager,
//     Estimator, Dispatcher, Accounting, Marketing, HR…) or the company
//     listed it under Settings → Employees → Job titles → "hours are
//     overhead". Any other title — Field Tech, Installer, Labor, Cleaner,
//     Driver, Painter, a title we have never seen — must clock in to a job.
//     Unknown defaults to the safe side: the job.
//   - Anyone on the efficiency bonus must clock in to a job whatever their
//     title: the bonus pays on hours kept off a job's allotment. On the bonus
//     = a skill level with a weight above zero in the company's skill_levels
//     setting; with no setting, any skill level not named "Not on bonus".
//   - The company can also force a title onto jobs ("time_clock_job_roles").
//   - A company may define overhead CODES ("time_clock_overhead_codes") —
//     Shop, Training, Meeting, Travel. Anyone may punch to one, whatever
//     their title and whether or not they are on the bonus. The hours are
//     attributed to the code and still carry no job_id, so they stay off
//     every job's margin and out of the allotment the efficiency bonus is
//     measured against — the leak above stays shut, because the hours are
//     named and reportable instead of landing on nothing.
//     Cameron, 2026-10-30: "I am no longer able to clock into “General”,
//     this is helpful when working around the shop or mounds meetings." The
//     rule above left shop time and crew meetings nowhere to go, so his only
//     options were to lose the hours or charge a job that did not get the
//     work — which corrupts the very margin the rule protects.
//     A company that defines no codes behaves exactly as it did before, so
//     this is a silent change for nobody.
//
// supabase/functions/_shared/clockInRule.ts mirrors this for Arnie's
// clock-in card. Change both or neither.

const norm = (s) => String(s || '').trim().toLowerCase()

/** Titles whose hours are overhead unless the company says otherwise. */
const OFFICE_EXACT = new Set([
  'office', 'admin', 'administrator', 'administration', 'owner', 'ceo', 'cfo', 'coo', 'president', 'vice president', 'vp',
  'manager', 'general manager', 'office manager', 'operations manager', 'project manager', 'pm', 'account manager',
  'sales', 'sales rep', 'salesperson', 'sales manager', 'setter', 'appointment setter', 'lead setter', 'estimator',
  'dispatcher', 'dispatch', 'scheduler', 'accounting', 'accountant', 'bookkeeper', 'controller', 'finance',
  'marketing', 'hr', 'human resources', 'receptionist', 'customer service', 'support', 'it', 'developer',
])
const OFFICE_WORD = /\b(office|admin|owner|sales|setter|manager|estimator|dispatch|accounting|bookkeep|marketing|receptionist|executive|director)\b/i

export function isOfficeRole(role, { overheadRoles = [], jobRoles = [] } = {}) {
  const r = norm(role)
  if (!r) return false
  if (jobRoles.some(x => norm(x) === r)) return false
  if (overheadRoles.some(x => norm(x) === r)) return true
  return OFFICE_EXACT.has(r) || OFFICE_WORD.test(r)
}

/** On the crew efficiency bonus. */
export function onBonus(employee, { skillLevels = [] } = {}) {
  const lvl = String(employee?.skill_level || '').trim()
  if (!lvl) return false
  const defined = (skillLevels || []).find(s => norm(s?.name) === norm(lvl))
  if (defined) return Number(defined.weight) > 0
  return !/not on bonus|no bonus|off bonus/i.test(lvl)
}

/** Must this person's punch carry a job? */
export function mustClockToJob(employee, settings = {}) {
  if (onBonus(employee, settings)) return true
  return !isOfficeRole(employee?.role, settings)
}

export const OVERHEAD_PREFIX = 'Overhead — '

/**
 * The overhead codes this company has defined, in order, de-duped.
 * Accepts a list of plain strings or of { name } objects, because the
 * settings row is hand-edited and both shapes turn up.
 */
export function overheadCodeList(settings = {}) {
  const seen = new Set()
  const out = []
  for (const raw of settings?.overheadCodes || []) {
    const name = String(raw?.name ?? raw ?? '').trim()
    if (!name) continue
    const key = norm(name)
    if (seen.has(key)) continue
    seen.add(key)
    out.push(name)
  }
  return out
}

/**
 * The company's own spelling of this code, or null if they never defined it.
 * Matched case-insensitively so "shop" from a chat reaches "Shop", but the
 * company's spelling is what gets stored.
 */
export function matchOverheadCode(code, settings = {}) {
  const want = norm(code)
  if (!want) return null
  return overheadCodeList(settings).find(c => norm(c) === want) || null
}

/**
 * What to write on the time_clock row, or why it cannot be written.
 * `jobId` may be a number, a numeric string, or empty. `code` is one of the
 * company's overhead codes. `settings` is { overheadRoles, jobRoles,
 * skillLevels, overheadCodes } from the company's settings.
 */
export function clockInChoice({ jobId = null, code = null, employee = null, settings = {} } = {}) {
  const id = jobId === '' || jobId == null ? null : Number(jobId)
  if (id != null && Number.isFinite(id) && id > 0) {
    return { ok: true, job_id: id, overhead_code: null, notes: null, overhead: false }
  }

  // Non-job time the company named. Allowed to anyone, bonus or not: the
  // hours carry the code and no job_id, so they stay off job margin and out
  // of the allotment — named overhead is the thing the rule wanted all along,
  // as against a punch that lands on nothing.
  const named = matchOverheadCode(code, settings)
  if (named) {
    return { ok: true, job_id: null, overhead_code: named, notes: `${OVERHEAD_PREFIX}${named}`, overhead: true }
  }
  // Asked for a code this company does not have. Refuse rather than quietly
  // writing a punch with no job and no code, which is the hole itself.
  if (code != null && String(code).trim()) {
    const codes = overheadCodeList(settings)
    return {
      ok: false,
      reason: codes.length
        ? `"${String(code).trim()}" is not one of this company's overhead codes. Pick one of: ${codes.join(', ')}.`
        : `"${String(code).trim()}" is not an overhead code. This company has not set any up — Settings → Employees → Overhead codes.`,
    }
  }

  if (mustClockToJob(employee, settings)) {
    const codes = overheadCodeList(settings)
    return {
      ok: false,
      reason: codes.length
        ? `Pick the job you are clocking in to, or the kind of work: ${codes.join(', ')}.`
        : 'Pick the job you are clocking in to. Your hours are charged to jobs; there is no overhead clock-in for your role.',
    }
  }
  const role = String(employee?.role || 'Office').trim() || 'Office'
  return { ok: true, job_id: null, overhead_code: null, notes: `${OVERHEAD_PREFIX}${role}`, overhead: true }
}

/**
 * Is this punch's "no job" the deliberate kind — a named code, or an office
 * role's hours? The column is checked first, and the notes prefix is only a
 * fallback for punches written before the column existed. `notes` is free
 * text: other paths append to it (FieldScout's "[WRONG JOB CORRECTED …]")
 * and Payroll's edit screen lets a person retype it, so it is fine as a
 * label and wrong as the key a report groups by.
 */
export function isOverheadPunch(entry) {
  if (entry?.job_id) return false
  if (String(entry?.overhead_code || '').trim()) return true
  return String(entry?.notes || '').startsWith(OVERHEAD_PREFIX)
}

/** The settings the rule reads, from a store-shaped object. */
export function clockInSettings(store = {}) {
  return {
    overheadRoles: store.timeClockOverheadRoles || [],
    jobRoles: store.timeClockJobRoles || [],
    skillLevels: store.skillLevels || [],
    overheadCodes: store.timeClockOverheadCodes || [],
  }
}

/** Jobs a person can clock in to: not delivered, not cancelled, newest first. */
const CLOSED = new Set(['Completed', 'Job Complete', 'Verified Complete', 'Post Inspection (Req)', 'Invoiced', 'Paid', 'Closed', 'Done', 'Archived', 'Cancelled', 'Canceled', 'Void', 'Voided'])
export function clockableJobs(jobs = []) {
  return (jobs || [])
    .filter(j => j && !CLOSED.has(j.status))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
}

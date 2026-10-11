// Counting submittals, including the ones that never touched JobScout.
//
// Alayda (10/10, from /admin/eos): "Some submittals aren't done through the
// system, I am trying to accuratley track the numbers, can you create a button
// that shows when we submit a job outside of the system."
//
// She is looking at the Scorecard's "Submittals Sent" and cannot trust it. The
// metric counts file_attachments with photo_context 'submittal' — 28 of them
// for HHH, so it does work — but a package emailed straight to a GC, uploaded
// to their portal, or handed over on site never creates an attachment. Those
// submittals happened and the number does not know.
//
// So a submittal is now an EVENT that can be recorded two ways: by attaching
// the package here, or by logging that it went out some other way.
//
// The one rule that matters is not double counting. If somebody attaches the
// package AND logs it, that is one submittal. The attachment wins — it is the
// older, automatic path and it carries the file — and a logged event for the
// same job on the same day is folded into it rather than added.
//
// Deliberately NOT de-duplicating the attachments against each other. A
// multi-file package would count as several, which sounds like a bug until you
// check: 28 attachment rows across 27 job-days and 26 jobs. HHH attaches one
// file per submittal, so "fixing" that would move a historical number by one
// and buy nothing.

/** The ways a submittal leaves the building without passing through here. */
export const SUBMITTAL_METHODS = {
  email: 'Emailed direct',
  portal: 'Uploaded to their portal',
  in_person: 'Handed over in person',
  mail: 'Posted',
  other: 'Some other way',
}

export const SUBMITTAL_METHOD_KEYS = Object.keys(SUBMITTAL_METHODS)

const dayOf = (value) => {
  if (!value) return null
  const s = String(value)
  // Already a calendar day, or a timestamp whose day is its first ten chars.
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

/** job_id + day, which is what makes two records the same submittal. */
export function submittalKey(row) {
  const day = dayOf(row?.created_at || row?.submitted_at)
  if (!day) return null
  const job = row?.job_id == null ? 'nojob' : String(row.job_id)
  return `${job}|${day}`
}

const inRange = (row, start, end) => {
  const day = dayOf(row?.created_at || row?.submitted_at)
  if (!day) return false
  const s = dayOf(start)
  const e = dayOf(end)
  if (s && day < s) return false
  if (e && day > e) return false
  return true
}

/**
 * Submittals sent in a window: everything attached here, plus everything
 * logged as having gone out elsewhere that is not already an attachment.
 *
 * Attachments are counted as they always were, so no historical number moves.
 */
export function countSubmittals(attachments = [], logged = [], start = null, end = null) {
  const attached = (attachments || []).filter((a) => inRange(a, start, end))
  const seen = new Set(attached.map(submittalKey).filter(Boolean))

  const extra = (logged || []).filter((l) => {
    if (!inRange(l, start, end)) return false
    const key = submittalKey(l)
    if (!key) return false
    if (seen.has(key)) return false   // the package is attached; one submittal
    seen.add(key)                     // and two logs of the same day are one too
    return true
  })

  return attached.length + extra.length
}

/** The same split, for a tooltip that explains where the number came from. */
export function submittalBreakdown(attachments = [], logged = [], start = null, end = null) {
  const inSystem = (attachments || []).filter((a) => inRange(a, start, end)).length
  const total = countSubmittals(attachments, logged, start, end)
  return { total, in_system: inSystem, logged: total - inSystem }
}

/** Why this cannot be logged yet, as a sentence for the person — or null. */
export function logProblem({ jobId, submittedAt, method } = {}) {
  if (!jobId) return 'Pick the job that was submitted.'
  if (!dayOf(submittedAt)) return 'When did it go out?'
  if (method && !SUBMITTAL_METHOD_KEYS.includes(method)) return 'Pick how it was sent.'
  return null
}

/** The row to write. */
export function submittalRow({ companyId, jobId, submittedAt, method = 'email', recipient, note, employeeId } = {}) {
  return {
    company_id: companyId,
    job_id: jobId,
    submitted_at: dayOf(submittedAt),
    method: SUBMITTAL_METHOD_KEYS.includes(method) ? method : 'other',
    recipient: String(recipient || '').trim() || null,
    note: String(note || '').trim() || null,
    employee_id: employeeId ?? null,
  }
}

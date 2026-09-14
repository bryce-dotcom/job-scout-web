// What a crew member may do the moment a job is verified complete.
//
// Christopher (1 Sep): "There is no easy way to say Job Complete and send out
// the invoice in the field. Six steps must be taken at the computer."
// Cameron (3 Aug): "It verifies the job … but it never goes to the next
// step, which is sending the invoice. It just stops."
//
// Bryce (14 Sep): a feature for every tenant, so the permissions are two
// flags on the employee card — not a role rule — and a crew that wants to
// bill and take payment on the spot (window cleaning, Housecall-Pro style)
// can be given exactly that.
//
// Everything here is a decision, not an effect, so it can be pinned by tests.

// Victor's pass mark, and the one outage case that counts as a pass: an
// ai-skipped report means our AI was down, which is our problem, not the
// crew's. Same rule Field Scout has always applied.
export const VICTOR_PASS_SCORE = 60

export function verificationPassed(report) {
  if (!report) return false
  if (report.status === 'complete_ai_skipped') return true
  return Number(report.score) >= VICTOR_PASS_SCORE
}

// The customer's email as the job knows it — the embedded customer first,
// then the job's own snapshot column.
export function jobCustomerEmail(job) {
  const e = job?.customer?.email || job?.email || ''
  return String(e).trim()
}

/**
 * What to offer on the completion sheet.
 *
 * Send is offered only when ALL of: the employee may send from the field,
 * the job has no utility incentive (the office bills those — the utility's
 * paperwork is theirs), and there is somewhere to send it. The reason a
 * button is missing is returned so the sheet can say so instead of leaving
 * a tech guessing why their colleague has a button they do not.
 */
export function completionOptions({ employee, job }) {
  const canCollect = employee?.field_collect_payment === true
  const maySend = employee?.field_send_invoice === true
  const hasIncentive = (Number(job?.utility_incentive) || 0) > 0
  const email = jobCustomerEmail(job)

  let sendBlockedReason = null
  if (!maySend) sendBlockedReason = 'not_permitted'
  else if (hasIncentive) sendBlockedReason = 'utility_job'
  else if (!email) sendBlockedReason = 'no_email'

  return {
    canSend: sendBlockedReason === null,
    canCollect,
    sendBlockedReason,
    email,
  }
}

export const SEND_BLOCKED_TEXT = {
  not_permitted: null, // nothing to explain — the button simply is not theirs
  utility_job: 'This job has a utility incentive, so the office sends the invoice with the utility paperwork.',
  no_email: 'No email on file for this customer — add one on the job and the invoice can go from here.',
}

/**
 * The job update that follows a passed verification, or a "complete anyway".
 * `flagged` = completed without a passing score: the job still completes
 * (Victor is a flag, not a gate) and the office is told.
 */
export function completionJobPatch({ score, flagged, now = new Date() }) {
  const patch = { status: 'Completed', updated_at: now.toISOString() }
  if (flagged) {
    patch.completion_flagged_at = now.toISOString()
    patch.completion_flag_reason = `Marked complete without a passing verification (Victor score ${Number.isFinite(Number(score)) ? Math.round(Number(score)) : '—'}).`
  }
  return patch
}

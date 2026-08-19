// "I'm on the wrong job" — which correction is available, and to what.
//
// This rule has been wrong twice.
//
// Dusty clocked into Winter School instead of Bird Spike and got stuck staring
// at a blocked Clock Out, so a "switch jobs" escape was added to the
// verification panel. It was gated on the ACTIVE punch.
//
// London then reported a tech who clocked into the wrong job, clocked OUT, and
// was asked by Victor to photograph work they never did. A successful clock-out
// clears the active punch while the verification panel stays on screen — so the
// escape hatch disappeared at exactly the moment it was needed, and the buttons
// that were briefly visible called a handler that returns immediately with no
// active punch: no error, no toast, nothing happens.
//
// The correction available depends on whether the clock is still running:
//   running  -> SWITCH: close this punch, open a new one, time follows
//   stopped  -> REASSIGN: the hours are already saved; move which job they
//               belong to. There is nothing left to "switch".

export const CORRECTION_NONE = 'none'
export const CORRECTION_SWITCH = 'switch'
export const CORRECTION_REASSIGN = 'reassign'

// activeEntry: the open punch, or null once the clock-out lands
// lastClosedShift: { id, job_id } of the punch just closed, or null
export function wrongJobCorrection(activeEntry, lastClosedShift) {
  if (activeEntry?.job_id) {
    return { mode: CORRECTION_SWITCH, jobId: activeEntry.job_id, entryId: activeEntry.id ?? null }
  }
  if (lastClosedShift?.job_id) {
    return { mode: CORRECTION_REASSIGN, jobId: lastClosedShift.job_id, entryId: lastClosedShift.id ?? null }
  }
  // A punch with no job at all — there is no wrong job to correct, and the
  // daily check is what the panel is asking for.
  return { mode: CORRECTION_NONE, jobId: null, entryId: null }
}

// Jobs worth offering, excluding the one already on the shift.
export function correctionChoices(todaysJobs, currentJobId, limit = 3) {
  return (todaysJobs || []).filter(j => j && j.id !== currentJobId).slice(0, limit)
}

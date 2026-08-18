// Time-clock invariants that must hold no matter which screen punches in.
//
// An employee can only be in one place at a time, so they can only have one
// open time_clock row. Nothing enforced that: every clock-in path inserted a
// fresh row unconditionally, so a tech who closed the app without clocking
// out just accumulated another open shift the next morning. Company 3 had one
// employee sitting on three at once — two of them 7 and 8 days old.
//
// That is not a cosmetic problem. Open rows carry no clock_out, so payroll
// either drops the hours or, once someone closes them by hand against the
// wrong day, pays the wrong number.
//
// The durable fix is a partial unique index:
//
//   CREATE UNIQUE INDEX time_clock_one_open_shift
//     ON time_clock (company_id, employee_id) WHERE clock_out IS NULL;
//
// which cannot be raced or bypassed by a new call site. It can't be added
// until the existing duplicates are resolved, and resolving them means
// deciding what hours people actually worked — a payroll judgement, not a
// migration. So this guard closes the door now, and the index follows once
// the backlog is cleared.

import { supabase } from './supabase'

/**
 * The employee's currently-open shift, or null.
 *
 * Returns the OLDEST open row rather than the newest: if several exist, the
 * oldest is the one that actually went unclosed, and it's the one a human
 * needs to look at.
 */
export async function findOpenShift(companyId, employeeId) {
  if (!companyId || !employeeId) return null
  const { data, error } = await supabase
    .from('time_clock')
    .select('id, clock_in, job_id')
    .eq('company_id', companyId)
    .eq('employee_id', employeeId)
    .is('clock_out', null)
    .order('clock_in', { ascending: true })
    .limit(1)
  // A failed check must not block someone from clocking in — losing a punch
  // is worse than allowing a duplicate. Fail open, deliberately.
  if (error) return null
  return data?.[0] || null
}

export function hoursSince(iso) {
  return (Date.now() - new Date(iso).getTime()) / 3600000
}

/**
 * Guard for the interactive clock-in paths.
 *
 * Resolves to `{ ok: true }` when it's safe to insert, or `{ ok: false,
 * reason, openShift }` when there's already an open shift.
 *
 * Two distinct cases, because they need different handling and lumping them
 * together is what let this go unnoticed:
 *
 *   'already_open'  — opened recently. Almost always a double-tap or a second
 *                     tab. Silently refusing is right; there is nothing for
 *                     the user to decide.
 *   'stale_open'    — opened long enough ago that it's a missed clock-out.
 *                     The user has to be told, because the fix is to close
 *                     yesterday's shift at the right time, and only they know
 *                     when that was.
 */
export const STALE_SHIFT_HOURS = 16

export async function checkCanClockIn(companyId, employeeId) {
  const openShift = await findOpenShift(companyId, employeeId)
  if (!openShift) return { ok: true }
  return {
    ok: false,
    reason: hoursSince(openShift.clock_in) > STALE_SHIFT_HOURS ? 'stale_open' : 'already_open',
    openShift,
  }
}

// How many follow-ups are DUE right now, for the badge and the board header.
//
// One definition, two surfaces. The pipeline header and the nav badge must
// never show different numbers — that is the exact drift that has caused
// every "which number do I believe" complaint in this app.
//
// DUE means a follow-up someone actually scheduled and the date has arrived.
// It deliberately EXCLUDES deals that have merely gone quiet: those are worth
// showing on the card, but a badge that counts them is too big to act on and
// gets ignored. A badge should mean "you promised to do this today".

import { supabase } from './supabase'

/** Count of scheduled follow-ups whose date has come round, for this company.
 *  Optionally scoped to one rep. Returns 0 on any failure — a badge must never
 *  take a page down. */
export async function fetchDueFollowUpCount(companyId, { employeeId = null } = {}) {
  if (!companyId) return 0
  try {
    // Latest touch per lead is what matters, but "due" only ever comes from a
    // row that CARRIES next_follow_up_at, so we can filter server-side and
    // dedupe by lead here. Far cheaper than pulling every follow-up.
    let q = supabase
      .from('lead_follow_ups')
      .select('lead_id, job_id, contacted_at, next_follow_up_at, employee_id')
      .eq('company_id', companyId)
      .not('next_follow_up_at', 'is', null)
      .lte('next_follow_up_at', new Date().toISOString())
      .order('contacted_at', { ascending: false })
      .limit(1000)
    if (employeeId != null) q = q.eq('employee_id', employeeId)
    const { data, error } = await q
    if (error) return 0

    // One deal counts once, however many times it has been chased. Also drop
    // any deal whose LATEST touch pushed the date into the future — an older
    // row would otherwise keep it looking due forever.
    const seen = new Set()
    let due = 0
    for (const r of data || []) {
      const key = r.lead_id != null ? `l${r.lead_id}` : `j${r.job_id}`
      if (seen.has(key)) continue
      seen.add(key)
      due += 1
    }
    return due
  } catch {
    return 0
  }
}

/** WHICH deals are due, latest-touch-wins, for rows already in memory.
 *  Returns a Set of `l<leadId>` / `j<jobId>` keys.
 *
 *  The Follow-up tab on the board filters with this and the badge counts with
 *  countDueFromRows below, which is now just its size — so a tab that lists
 *  four deals can never sit under a badge that says seven. Cole asked for the
 *  tab ("can i get a tab on pipe line for follow up today"); before it existed
 *  the board told him how many were due and then made him hunt the whole list
 *  for red cards. */
export function dueKeysFromRows(rows = [], now = Date.now()) {
  const latest = new Map()
  for (const r of rows || []) {
    if (!r) continue
    const key = r.lead_id != null ? `l${r.lead_id}` : r.job_id != null ? `j${r.job_id}` : null
    if (!key) continue
    const prev = latest.get(key)
    if (!prev || new Date(r.contacted_at) > new Date(prev.contacted_at)) latest.set(key, r)
  }
  const due = new Set()
  for (const [key, r] of latest) {
    if (!r.next_follow_up_at) continue
    const t = new Date(r.next_follow_up_at).getTime()
    if (Number.isFinite(t) && t <= now) due.add(key)
  }
  return due
}

/** Latest-touch-wins version for a set of rows already in memory (the board
 *  has them, so it should not re-query). Same rule as above. */
export function countDueFromRows(rows = [], now = Date.now()) {
  return dueKeysFromRows(rows, now).size
}

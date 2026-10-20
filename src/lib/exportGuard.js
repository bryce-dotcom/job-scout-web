// Bulk exports are admin-only, and every one is logged.
//
// Bryce, 2026-10-20: reps were feeding company data to an outside AI, and a
// spreadsheet of customers is the easiest thing to hand one. Every bulk
// export in the app (the list pages' Export, Reports, Books, Data Console)
// asks this first.
//
// Honest limit: this stops the one-click file. Anyone signed in can still
// read on screen what their role lets them see — permissions are what limit
// that, not this.

import { useStore } from './store'
import { supabase } from './supabase'
import { isAdmin } from './accessControl'

export const EXPORT_REFUSED = 'Exports are admin-only. Ask an admin if you need this as a file.'

/** May this person export? Admin and up (level 3+), as everywhere else. */
export function canExport(user) {
  return isAdmin(user)
}

/** Write the log row. Never throws, never blocks the download for long. */
export async function logExport({ what, rows = null, fileName = null, allowed = true }) {
  try {
    const user = useStore.getState().user
    const companyId = useStore.getState().companyId ?? user?.company_id
    if (!user || companyId == null) return
    const { data: auth } = await supabase.auth.getUser()
    await supabase.from('export_log').insert({
      company_id: companyId,
      employee_id: user.id ?? null,
      email: auth?.user?.email || user.email || null,
      what: String(what || 'export').slice(0, 120),
      row_count: Number.isFinite(rows) ? rows : null,
      file_name: fileName ? String(fileName).slice(0, 200) : null,
      page: typeof window !== 'undefined' ? window.location.pathname.slice(0, 200) : null,
      allowed,
    })
  } catch { /* the log must never break the page */ }
}

/**
 * Ask before exporting. Returns true when the export may go ahead (and logs
 * it); false when it is refused (logs the attempt and tells the person).
 */
export function guardExport(what, { rows = null, fileName = null, user = null } = {}) {
  const who = user || useStore.getState().user
  if (!canExport(who)) {
    logExport({ what, rows, fileName, allowed: false })
    if (typeof window !== 'undefined') window.alert(EXPORT_REFUSED)
    return false
  }
  logExport({ what, rows, fileName, allowed: true })
  return true
}

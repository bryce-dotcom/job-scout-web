// Remember how someone had the Sales Pipeline set up.
//
// Two tickets, same morning: "when i put my filters on pipe line then click
// into a job and then come back out i have to put all the filters on again"
// and "on pipeline it takes back to the top when you exit a job and deletes
// your prefrences". Estimates already solved the scroll half of this; the
// pipeline solved neither.
//
// Filters live in localStorage — they are a working preference and should
// survive closing the tab, the same way the estimates "only mine" toggle
// does. Scroll position lives in sessionStorage and is consumed once, so
// coming back from a job restores your place but opening the board fresh
// tomorrow starts at the top.

const FILTER_KEY = (companyId) => `pipeline_filters_${companyId}`
const SCROLL_KEY = (companyId) => `pipeline_scroll_${companyId}`

// Only these are remembered. Anything not listed is deliberately transient.
const FIELDS = ['ownerFilter', 'dateRange', 'buFilter', 'searchTerm', 'mobileFilter', 'customDateTo']

// Bumped when a DEFAULT changes. Filters are written on every change, so the
// old default is already sitting in everyone's browser as if they had chosen
// it — changing the default in code reaches new users only. Each entry drops
// the one field whose default moved, and nothing else the user set up.
//
//   2: default date range mtd -> ytd. The board was hiding most of the year's
//      work, and MTD was never a choice anyone made.
const PREFS_VERSION = 2
const RESET_ON_UPGRADE = { 2: ['dateRange'] }

export function loadPipelineFilters(companyId) {
  if (!companyId) return {}
  try {
    const raw = localStorage.getItem(FILTER_KEY(companyId))
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out = {}
    for (const f of FIELDS) if (typeof parsed[f] === 'string') out[f] = parsed[f]

    // Anything saved before a default moved forgets only that field, so the
    // new default applies once. Someone who genuinely wanted the old value
    // re-picks it and it sticks from then on.
    const was = Number(parsed.v) || 1
    if (was < PREFS_VERSION) {
      for (let v = was + 1; v <= PREFS_VERSION; v += 1) {
        for (const f of RESET_ON_UPGRADE[v] || []) delete out[f]
      }
    }
    return out
  } catch { return {} }   // private mode, or someone hand-edited it
}

export function savePipelineFilters(companyId, filters) {
  if (!companyId || !filters) return
  try {
    const out = { v: PREFS_VERSION }
    for (const f of FIELDS) if (typeof filters[f] === 'string') out[f] = filters[f]
    localStorage.setItem(FILTER_KEY(companyId), JSON.stringify(out))
  } catch { /* private mode */ }
}

/** A field tech is always locked to their own records, whatever was saved.
 *  Restoring "all" for them would show work that isn't theirs. */
export function resolveOwnerFilter(saved, { isFieldTech, userId }) {
  if (isFieldTech && userId != null) return String(userId)
  return typeof saved === 'string' && saved ? saved : 'all'
}

export function stashPipelineScroll(companyId, offsets) {
  if (!companyId) return
  try { sessionStorage.setItem(SCROLL_KEY(companyId), JSON.stringify(offsets || {})) } catch { /* private mode */ }
}

/** Read and CLEAR, so a restore happens exactly once per return trip.
 *  Without the clear, every later re-render would yank the board back. */
export function takePipelineScroll(companyId) {
  if (!companyId) return null
  try {
    const raw = sessionStorage.getItem(SCROLL_KEY(companyId))
    if (!raw) return null
    sessionStorage.removeItem(SCROLL_KEY(companyId))
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch { return null }
}

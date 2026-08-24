// Remembering how somebody had a list set up.
//
// Tracy (ecf999b4): "when I sort the invoices due by the status it does not stay
// on the status I want... When I click on an invoice to see what needs to be
// updated and then click back to all invoices I have to start all over in my
// search by sorting again."
//
// The same complaint the Sales Pipeline had, and it will be the same complaint
// on every other list in the product, so this is generic rather than another
// per-page copy. lib/pipelinePrefs stays as it is — it also carries scroll
// restore and a defaults-version ratchet that only it needs.
//
// The split matters, and it is the pipeline lesson learned the hard way:
//
//   FILTERS AND SORT live in localStorage. They are how somebody likes a list
//   set up, and they should survive closing the tab.
//
//   THE SEARCH BOX lives in sessionStorage. A search is what you are doing right
//   now, not a preference. Keeping it forever is what silently emptied Cole's
//   pipeline weeks later on one device: the board looked broken and the cause
//   was a phrase he had typed and forgotten. It still survives a trip into a
//   record and back, which is all anyone actually wanted.

const KEY = (scope, companyId, kind) => `list_${kind}_${scope}_${companyId}`

const readStore = (store, key) => {
  try {
    const raw = store && store.getItem ? store.getItem(key) : null
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch { return {} }
}

/**
 * Load saved values for a list.
 *
 * scope   a stable name for the list, e.g. 'invoices'
 * fields  { persistent: string[], session: string[] }
 *
 * Only strings come back — these seed select and text controls, and a stray
 * object would break the control it is handed to.
 */
export function loadListPrefs(scope, companyId, { persistent = [], session = [] } = {}) {
  if (!scope || !companyId) return {}
  const out = {}
  const fromLocal = readStore(globalThis.localStorage, KEY(scope, companyId, 'filters'))
  const fromSession = readStore(globalThis.sessionStorage, KEY(scope, companyId, 'search'))
  for (const f of persistent) if (typeof fromLocal[f] === 'string') out[f] = fromLocal[f]
  for (const f of session) if (typeof fromSession[f] === 'string') out[f] = fromSession[f]
  return out
}

/** Save whatever changed. Safe to call on every keystroke. */
export function saveListPrefs(scope, companyId, values = {}, { persistent = [], session = [] } = {}) {
  if (!scope || !companyId) return
  const pick = (fields) => {
    const o = {}
    for (const f of fields) if (typeof values[f] === 'string') o[f] = values[f]
    return o
  }
  try { globalThis.localStorage.setItem(KEY(scope, companyId, 'filters'), JSON.stringify(pick(persistent))) } catch { /* private mode */ }
  try { globalThis.sessionStorage.setItem(KEY(scope, companyId, 'search'), JSON.stringify(pick(session))) } catch { /* private mode */ }
}

/** Forget a list's saved set-up — for a clear-filters control. */
export function clearListPrefs(scope, companyId) {
  if (!scope || !companyId) return
  try { globalThis.localStorage.removeItem(KEY(scope, companyId, 'filters')) } catch { /* private mode */ }
  try { globalThis.sessionStorage.removeItem(KEY(scope, companyId, 'search')) } catch { /* private mode */ }
}

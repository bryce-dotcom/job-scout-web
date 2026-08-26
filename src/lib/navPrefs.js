// Letting somebody put the menu the way they want it.
//
// The sidebar carries fifty-odd destinations. Most people use six of them, and
// the other forty-four are noise they scroll past every day. This hides what
// you do not use and reorders what you do.
//
// Three rules this file exists to hold:
//
//   1. PREFERENCES ARE APPLIED AFTER ROLE FILTERING, never before. Hiding can
//      only ever remove something you could already see, and un-hiding can
//      never reveal something your access level forbids. That ordering is the
//      whole security story — get it backwards and a saved preference becomes
//      a way to grant yourself Payroll.
//
//   2. HIDING IS NOT A PERMISSION. A hidden page is still reachable by URL,
//      still linked from elsewhere in the app, still yours. This is tidying,
//      not access control, and it must never be mistaken for it.
//
//   3. ANYTHING NEW IS VISIBLE. `hidden` is an explicit list of what to hide,
//      so a page added in a later release shows up for everyone instead of
//      being silently suppressed by a preference saved before it existed.
//
// Storage is localStorage, per user and per company, matching lib/listPrefs
// and lib/pipelinePrefs — this is "how somebody likes their app set up", the
// same category those already cover. The honest limit: it is per device. Hide
// something on the laptop and the phone still shows it. Moving this to the
// database later means changing only load/save; nothing else here or in the
// UI reads storage directly.

/** Routes nobody may hide: the way home, and the way back to this screen. */
export const PROTECTED_ROUTES = ['/', '/settings']

const KEY = (companyId, email) => `jobscout:navPrefs:${companyId || 'none'}:${(email || 'anon').toLowerCase()}`

export const EMPTY_PREFS = { hidden: [], order: {} }

const store = () => {
  try { return globalThis.localStorage } catch { return null }  // Safari private mode
}

export function loadNavPrefs(companyId, email) {
  try {
    const raw = store()?.getItem(KEY(companyId, email))
    if (!raw) return EMPTY_PREFS
    const parsed = JSON.parse(raw)
    return {
      hidden: Array.isArray(parsed?.hidden) ? parsed.hidden.filter(r => typeof r === 'string') : [],
      order: parsed?.order && typeof parsed.order === 'object' ? parsed.order : {},
    }
  } catch {
    // A corrupt preference should cost you your customisation, not your menu.
    return EMPTY_PREFS
  }
}

export function saveNavPrefs(companyId, email, prefs) {
  try {
    store()?.setItem(KEY(companyId, email), JSON.stringify({
      hidden: prefs?.hidden || [],
      order: prefs?.order || {},
    }))
  } catch { /* quota or disabled storage — the menu just stays as it was */ }
  return prefs
}

export function resetNavPrefs(companyId, email) {
  try { store()?.removeItem(KEY(companyId, email)) } catch { /* nothing to clear */ }
  return EMPTY_PREFS
}

export const isHidden = (prefs, route) =>
  !PROTECTED_ROUTES.includes(route) && (prefs?.hidden || []).includes(route)

export function toggleHidden(prefs, route) {
  if (PROTECTED_ROUTES.includes(route)) return prefs
  const hidden = prefs?.hidden || []
  return {
    ...prefs,
    hidden: hidden.includes(route) ? hidden.filter(r => r !== route) : [...hidden, route],
  }
}

/**
 * Order the routes of one section, then move one of them by `delta`.
 *
 * The saved order is a list of routes, not indexes: indexes shift the moment a
 * release adds or removes a page, and a saved index would then reorder the
 * wrong thing.
 */
export function moveItem(prefs, sectionKey, routes, route, delta) {
  const current = orderedRoutes(prefs, sectionKey, routes)
  const from = current.indexOf(route)
  const to = from + delta
  if (from < 0 || to < 0 || to >= current.length) return prefs
  const next = [...current]
  next.splice(to, 0, next.splice(from, 1)[0])
  return { ...prefs, order: { ...(prefs?.order || {}), [sectionKey]: next } }
}

/**
 * The saved order for a section, reconciled against what actually exists now.
 * Saved routes that have gone are dropped; routes that have appeared since are
 * appended in their natural order rather than vanishing.
 */
export function orderedRoutes(prefs, sectionKey, routes) {
  const saved = (prefs?.order || {})[sectionKey]
  if (!Array.isArray(saved) || !saved.length) return [...routes]
  const known = saved.filter(r => routes.includes(r))
  return [...known, ...routes.filter(r => !known.includes(r))]
}

/**
 * Apply preferences to already-role-filtered sections.
 *
 * MUST run on the output of the role filter, never on the raw definitions.
 * See rule 1 at the top of this file.
 */
export function applyNavPrefs(sections, prefs) {
  if (!Array.isArray(sections)) return []
  const hidden = new Set((prefs?.hidden || []).filter(r => !PROTECTED_ROUTES.includes(r)))

  return sections
    .map(section => {
      const items = section?.items || []
      const routes = items.map(i => i.to).filter(Boolean)
      const order = orderedRoutes(prefs, section.key, routes)
      const byRoute = new Map(items.map(i => [i.to, i]))

      const ordered = [
        ...order.map(r => byRoute.get(r)).filter(Boolean),
        // Items with no route (expandable groups keyed differently) keep their
        // place at the end rather than being dropped for lacking an id.
        ...items.filter(i => !i.to),
      ]
      return { ...section, items: ordered.filter(i => !hidden.has(i.to)) }
    })
    // A section whose every item is hidden is just a heading over nothing.
    .filter(section => (section.items || []).length > 0)
}

/** What the customiser shows: every section and item BEFORE hiding. */
export function customisableSections(sections, prefs) {
  if (!Array.isArray(sections)) return []
  return sections.map(section => {
    const items = (section.items || []).filter(i => i.to)
    const order = orderedRoutes(prefs, section.key, items.map(i => i.to))
    const byRoute = new Map(items.map(i => [i.to, i]))
    return {
      key: section.key,
      title: section.title || section.key,
      items: order.map(r => byRoute.get(r)).filter(Boolean).map(i => ({
        to: i.to,
        label: i.label,
        icon: i.icon,
        hidden: hidden0(prefs, i.to),
        protected: PROTECTED_ROUTES.includes(i.to),
      })),
    }
  }).filter(s => s.items.length > 0)
}

const hidden0 = (prefs, route) => (prefs?.hidden || []).includes(route)

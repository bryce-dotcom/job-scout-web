// The four things you tap all day, at the bottom of the phone.
//
// JobScout carries forty-odd destinations behind one hamburger, and that
// hamburger is top-right — the hardest corner of a phone to reach with the
// thumb of the hand holding it. Everything costs a stretch, a drawer, a scroll
// and a tap. Of 24 active people at HHH, 16 are field crew doing that in
// gloves, outdoors, one-handed.
//
// So: a fixed bar of four, plus More. Delta does this and it is the right idea;
// what does NOT carry over is their single kind of user. A tech's four are not
// a rep's four, so the defaults are per job title and anyone can change theirs.
//
// The rule that matters most is the one navPrefs already states: PREFERENCES
// ARE APPLIED AFTER ROLE FILTERING. A tab is only ever drawn from the routes
// Layout has already decided this person may see. A Field Tech cannot see
// /customers or /jobs at all, so neither a default nor a saved preference may
// put one in their bar — it would be a tab that opens nothing.

// Three, not four: Arnie sits in the middle of the bar as the fifth thing,
// so the row is [tab][tab][Arnie][tab][More]. The wish lists below stay four
// long — the fourth is a reserve for when one of the first three is a route
// this person cannot see.
export const MAX_TABS = 3

/**
 * What each kind of person probably wants, best first.
 *
 * A wish list, not a guarantee: anything this person cannot see is dropped at
 * resolve time. Keyed on job title (employees.role), which is what actually
 * describes the work — 16 Field Techs, 5 Sales, 2 Project Managers at HHH,
 * all sharing the user_role 'User' or 'Manager'.
 */
export const TAB_WISHLISTS = {
  // Clock in, see today's work, check the calendar, check your pay. A Field
  // Tech's menu is filtered to Field Scout + Job Board + My Pay, so this is
  // very nearly everything they have.
  'field tech': ['/field-scout', '/job-board', '/company-calendar', '/my-pay'],
  installer: ['/field-scout', '/job-board', '/company-calendar', '/my-pay'],

  // Sales starts at step 2 of the flow. Step 1 is Marketing, which is a
  // company-level thing somebody sets up once — a rep's day starts at Leads
  // and runs Leads → Lead Setter → Pipeline → Estimates.
  sales: ['/leads', '/lead-setter', '/pipeline', '/estimates'],
  'sales rep': ['/leads', '/lead-setter', '/pipeline', '/estimates'],
  setter: ['/lead-setter', '/leads', '/appointments', '/pipeline'],
  'lead setter': ['/lead-setter', '/leads', '/appointments', '/pipeline'],

  'project manager': ['/job-board', '/jobs', '/company-calendar', '/customers'],
  office: ['/', '/customers', '/invoices', '/company-calendar'],
  admin: ['/', '/pipeline', '/jobs', '/invoices'],
  owner: ['/', '/pipeline', '/invoices', '/books'],
}

/** When the job title says nothing useful, go by how much of the app they have. */
const BY_ACCESS = {
  admin: ['/', '/pipeline', '/jobs', '/invoices'],
  manager: ['/', '/job-board', '/jobs', '/customers'],
  user: ['/field-scout', '/company-calendar', '/customers', '/my-pay'],
}

/**
 * Anything still empty after the wish list gets filled from here, so the bar is
 * never short. Ordered by how generally useful a thing is to somebody whose
 * role we could not read.
 */
const BACKFILL = [
  '/', '/field-scout', '/job-board', '/jobs', '/pipeline', '/leads',
  '/customers', '/company-calendar', '/estimates', '/invoices', '/my-pay',
]

/** Normalised job title, for matching a wish list. */
function titleKey(value) {
  return String(value ?? '').trim().toLowerCase()
}

/**
 * The wish list for this person: job title first, then access level.
 *
 * Job title first because it describes the WORK. A Sales lead and a Project
 * Manager can both be user_role Manager, and they want completely different
 * bars.
 */
export function defaultTabWishlist(user, accessLevel = 0) {
  const title = titleKey(user?.role)
  if (title && TAB_WISHLISTS[title]) return TAB_WISHLISTS[title]
  // A title we have not seen before: match on the words people actually use.
  if (title.includes('sales')) return TAB_WISHLISTS.sales
  if (title.includes('setter')) return TAB_WISHLISTS.setter
  if (title.includes('tech') || title.includes('install') || title.includes('crew')) return TAB_WISHLISTS['field tech']
  if (title.includes('project') || title.includes('pm')) return TAB_WISHLISTS['project manager']
  if (title.includes('owner')) return TAB_WISHLISTS.owner
  if (title.includes('office') || title.includes('admin')) return TAB_WISHLISTS.office

  if (accessLevel >= 3) return BY_ACCESS.admin
  if (accessLevel >= 2) return BY_ACCESS.manager
  return BY_ACCESS.user
}

/**
 * The four routes to actually draw.
 *
 * `available` is what Layout rendered for this person — already role-filtered
 * and already respecting their hidden-items preference. Nothing outside it can
 * reach the bar, whether it came from a default or from something they saved,
 * so a tab can never be a dead end.
 *
 * A saved choice wins outright. The default only fills an empty bar.
 */
export function resolveTabs({ saved = [], wish = [], available = [] } = {}) {
  const can = new Set((available || []).filter(Boolean))
  const keep = (list) => (list || []).filter((r) => can.has(r))

  const out = []
  const add = (routes) => {
    for (const r of routes) {
      if (out.length >= MAX_TABS) return
      if (!out.includes(r)) out.push(r)
    }
  }

  // Something they chose themselves is the whole answer, topped up only if the
  // app has since taken one of their choices away.
  add(keep(saved))
  add(keep(wish))
  add(keep(BACKFILL))
  return out
}

/**
 * Is this saved tab list still the one they chose, or has the app changed under
 * it? Used to tell "I picked these" from "these are just the defaults".
 */
export function hasCustomTabs(prefs) {
  return Array.isArray(prefs?.tabs) && prefs.tabs.length > 0
}

/** Add or remove a tab, keeping at most MAX_TABS and the order they picked. */
export function toggleTab(prefs, route) {
  const current = Array.isArray(prefs?.tabs) ? [...prefs.tabs] : []
  const at = current.indexOf(route)
  if (at >= 0) current.splice(at, 1)
  else if (current.length < MAX_TABS) current.push(route)
  else return prefs            // full: they must drop one first, silently doing
                               // it for them loses a tab they meant to keep
  return { ...prefs, tabs: current }
}

/** A short label for a tab. "Field Scout (Clock)" does not fit under an icon. */
export function tabLabel(item) {
  const raw = String(item?.title || item?.label || '').trim()
  const noParens = raw.replace(/\s*\(.*?\)\s*/g, ' ').trim()
  const SHORT = {
    '/': 'Home',
    '/field-scout': 'Field',
    '/company-calendar': 'Calendar',
    '/company-map': 'Map',
    '/job-board': 'Board',
    '/lead-setter': 'Setter',
    '/purchase-orders': 'POs',
    '/products': 'Products',
    '/payroll/inbox': 'Payroll',
    '/my-pay': 'My Pay',
  }
  if (SHORT[item?.to]) return SHORT[item.to]
  // One word if we can: two words under a 24px icon on a 375px screen is four
  // tabs' worth of wrapping.
  const first = noParens.split(/\s+/)[0] || ''
  return noParens.length <= 9 ? noParens : first
}

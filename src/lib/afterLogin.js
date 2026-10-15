// Where a signed-out person was going, so signing in takes them there.
//
// ProtectedRoute sent anyone signed out to /login, and Login sent everyone to
// the Dashboard afterwards — so a deep link lost its destination. For one page
// that made the feature unusable: the agent on a computer opens
// /connect?code=… in the default browser, and on a Mac whose browser had never
// signed in to JobScout (London, 2026-10-14) the code was gone by the time she
// had signed in. The agent sat waiting for a Connect that could never come.
//
// Session storage, one tab, one destination, read once. Only paths inside the
// app are kept — never a full URL — so this cannot become an open redirect.

const KEY = 'jobscout_after_login'

/** Keep where they were going. Ignores the home page and anything off-site. */
export function rememberAfterLogin(path) {
  const p = String(path || '')
  if (!p.startsWith('/') || p.startsWith('//') || p === '/' || p.startsWith('/login')) return
  try { sessionStorage.setItem(KEY, p.slice(0, 500)) } catch { /* private mode */ }
}

/** Where to go now, once — or null. */
export function takeAfterLogin() {
  try {
    const p = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return p && p.startsWith('/') && !p.startsWith('//') ? p : null
  } catch { return null }
}

/** Forget it — the demo must never land on a page meant for a real account. */
export function forgetAfterLogin() {
  try { sessionStorage.removeItem(KEY) } catch { /* nothing to forget */ }
}

// Report a crash the app caught, so a bug does not depend on a rep
// photographing their screen.
//
// Sentry is wired but has never been switched on (Sentry.init is gated on
// VITE_SENTRY_DSN, which is set nowhere), so until that DSN exists this is the
// only record a crash leaves. It keeps working afterwards too — an in-app list
// is where Bryce already looks, and it costs no third-party account.
//
// Everything here is best-effort and silent. It runs INSIDE an error boundary:
// if reporting a crash can itself throw, the fallback screen never renders and
// the user gets a blank page instead of "Something went wrong".


/**
 * Which build crashed, taken from the hashed bundle filename the page loaded
 * (index-CFBFFfYf.js -> CFBFFfYf). No build-time config needed, and it is the
 * same identifier used to confirm what production is actually serving — which
 * matters because a crash report from a stale PWA build otherwise looks like a
 * bug that was already fixed.
 */
function currentBuild() {
  try {
    if (typeof document === 'undefined') return null
    for (const s of document.querySelectorAll('script[src]')) {
      const m = String(s.src).match(/index-([A-Za-z0-9_-]+)\.js/)
      if (m) return m[1]
    }
    return null
  } catch { return null }
}

/** Trim a stack to something storable without losing the useful top frames. */
function trimStack(stack) {
  if (typeof stack !== 'string') return null
  return stack.split('\n').slice(0, 24).join('\n').slice(0, 8000)
}

/**
 * A crash's identity is its message + route. React error #31 on /products is
 * ONE bug whether it fires once or 189 times, and a row per occurrence would
 * bury the next distinct failure.
 */
export function crashKey(message, route) {
  return `${String(message || 'Unknown error').slice(0, 300)}|${route || ''}`
}

export async function reportCrash(error, { componentStack = null, companyId = null, employeeId = null } = {}) {
  try {
    const message = String(error?.message || error || 'Unknown error').slice(0, 500)
    const route = typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`.slice(0, 300)
      : null

    const row = {
      company_id: companyId ?? null,
      employee_id: employeeId ?? null,
      message,
      stack: trimStack(error?.stack),
      component: componentStack ? String(componentStack).split('\n').slice(0, 8).join('\n').slice(0, 2000) : null,
      route,
      user_agent: typeof navigator !== 'undefined' ? String(navigator.userAgent || '').slice(0, 300) : null,
      app_build: currentBuild(),
      last_seen_at: new Date().toISOString(),
    }

    // Goes through the report-crash edge function, not a direct table write.
    //
    // A customer on /portal/:token is signed out, and client_errors has no
    // public grant — deliberately, since the function validates and clamps
    // server-side where a hostile caller cannot skip it. Routing BOTH the
    // signed-in and signed-out paths through it means one code path, so the
    // portal case cannot rot untested while the in-app case works.
    //
    // A BEFORE INSERT trigger dedupes and caps, so a flood becomes one row
    // with a rising count.
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/report-crash`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(row),
      // Survives the page being torn down by a navigation right after a crash.
      keepalive: true,
    })
    return res.ok
  } catch (e) {
    console.warn('[crashReport] reporter itself failed:', e?.message || e)
    return false
  }
}

// ── Errors the React boundary never sees ────────────────────────────────
//
// An error boundary only catches failures during RENDER. A throw inside an
// onClick handler, or a rejected promise from a fetch, unwinds outside React
// entirely — the app keeps running, the user sees a dead button, and nothing
// is recorded. That is the shape of Cameron's clock-out: no crash screen, no
// record, three days of "it just doesn't work".

// Noise that says nothing about our code. ResizeObserver's benign loop warning
// is fired by Chrome constantly; the rest come from extensions and blocked
// requests and would drown the real reports.
const IGNORED = [
  /ResizeObserver loop/i,
  /Non-Error promise rejection captured/i,
  /^Script error\.?$/i,          // cross-origin, carries no detail
  /chrome-extension:|moz-extension:|safari-extension:/i,
  /Failed to fetch dynamically imported module/i,  // stale chunk after a deploy
]

// One report per distinct problem per page load. A handler that throws on
// every mousemove must not write thousands of rows, and the server-side count
// already carries repetition.
const seenThisSession = new Set()
const MAX_PER_SESSION = 10

export function installGlobalCrashHandlers(getContext = () => ({})) {
  if (typeof window === 'undefined' || window.__jsCrashHandlersInstalled) return
  window.__jsCrashHandlersInstalled = true

  const handle = (error, kind) => {
    try {
      const message = String(error?.message || error || '')
      if (!message) return
      if (IGNORED.some(re => re.test(message))) return
      if (seenThisSession.size >= MAX_PER_SESSION) return

      const key = crashKey(message, window.location?.pathname)
      if (seenThisSession.has(key)) return
      seenThisSession.add(key)

      const ctx = getContext() || {}
      reportCrash(error instanceof Error ? error : new Error(message), {
        componentStack: `(${kind} — outside React render)`,
        companyId: ctx.companyId ?? null,
        employeeId: ctx.employeeId ?? null,
      })
    } catch { /* a reporter that throws is worse than no reporter */ }
  }

  window.addEventListener('error', (e) => handle(e?.error || e?.message, 'window.onerror'))
  window.addEventListener('unhandledrejection', (e) => handle(e?.reason, 'unhandled promise rejection'))
}

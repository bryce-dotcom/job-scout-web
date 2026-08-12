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
      // What they did in the seconds before it broke. The cheap half of
      // session replay, and usually the half that finds the bug.
      breadcrumbs: crumbTrail(),
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
  // An AbortError is an AbortController doing exactly its job: the user
  // navigated away, or a newer request replaced this one. Nothing crashed and
  // nobody saw an error screen — these arrive as unhandled rejections only
  // because the aborted promise has no catch, which is the normal way to write
  // it. Four of the five open crash reports were this, one from simply going
  // Lead Setter -> Leads. A genuinely stuck request still shows up, as the
  // FAILED http crumb that precedes it, so nothing real is lost here.
  /^AbortError\b/i,
  /signal is aborted without reason/i,
  /(the user aborted a request|the operation was aborted)/i,
]

/** True for an abort however it arrives — DOMException carries the name even
 *  when the message is empty, which message matching alone would miss. */
const isAbort = (error) =>
  error?.name === 'AbortError' || error?.code === 20   // DOMException.ABORT_ERR

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
      if (isAbort(error)) return
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

// ── Breadcrumbs ─────────────────────────────────────────────────────────
//
// The practical half of session replay. Watching a video of a rep's session is
// nice; knowing "they were on /products, clicked Edit, a request to
// products_services returned 400, then it crashed" is what actually finds the
// bug — and it costs a ring buffer instead of a subscription.
//
// Kept in memory only, capped, and attached to the report at crash time.
// Nothing is stored unless something breaks, so this is not tracking: a
// session that never crashes leaves no record anywhere.

const MAX_CRUMBS = 25
const crumbs = []

/** Text only, clamped — a breadcrumb must never carry a customer's data. */
function pushCrumb(kind, detail) {
  try {
    crumbs.push({
      t: new Date().toISOString().slice(11, 19),   // HH:MM:SS, no date noise
      kind,
      detail: String(detail ?? '').slice(0, 120),
    })
    while (crumbs.length > MAX_CRUMBS) crumbs.shift()
  } catch { /* never let bookkeeping break the app */ }
}

export function addCrumb(kind, detail) { pushCrumb(kind, detail) }
export function getCrumbs() { return crumbs.slice() }

function crumbTrail() {
  if (crumbs.length === 0) return null
  return crumbs.map(c => `${c.t}  ${c.kind}  ${c.detail}`).join('\n').slice(0, 4000)
}

/**
 * Watch the things that explain a crash: where they were, what they clicked,
 * and which request failed. Clicks record the element's own label, never the
 * value of any field — a breadcrumb trail that captured what someone typed
 * would be a liability, not a debugging aid.
 */
export function installBreadcrumbs() {
  if (typeof window === 'undefined' || window.__jsCrumbsInstalled) return
  window.__jsCrumbsInstalled = true

  pushCrumb('load', window.location?.pathname || '')

  // Route changes, including the SPA pushState the router uses.
  const record = () => pushCrumb('route', window.location?.pathname || '')
  window.addEventListener('popstate', record)
  for (const m of ['pushState', 'replaceState']) {
    const original = history[m]
    history[m] = function (...args) {
      const out = original.apply(this, args)
      record()
      return out
    }
  }

  // Clicks — label, not content.
  window.addEventListener('click', (e) => {
    try {
      const el = e.target?.closest?.('button, a, [role="button"], select, input[type="checkbox"]')
      if (!el) return
      const label = (el.getAttribute?.('aria-label') || el.getAttribute?.('title')
        || el.textContent || el.tagName || '').trim().replace(/\s+/g, ' ')
      pushCrumb('click', label.slice(0, 60) || el.tagName)
    } catch { /* ignore */ }
  }, { capture: true, passive: true })

  // Failed requests. Cameron's clock-out was a rejected write with no crash
  // screen at all — the request result is the only thing that would have
  // explained it.
  const origFetch = window.fetch
  if (typeof origFetch === 'function') {
    window.fetch = async function (...args) {
      const started = Date.now()
      try {
        const res = await origFetch.apply(this, args)
        if (!res.ok) {
          const u = String(args[0]?.url || args[0] || '').split('?')[0]
          pushCrumb('http', `${res.status} ${u.slice(-70)} (${Date.now() - started}ms)`)
        }
        return res
      } catch (err) {
        const u = String(args[0]?.url || args[0] || '').split('?')[0]
        pushCrumb('http', `FAILED ${u.slice(-70)} — ${err?.message || 'network'}`)
        throw err
      }
    }
  }

  window.addEventListener('offline', () => pushCrumb('network', 'went offline'))
  window.addEventListener('online', () => pushCrumb('network', 'back online'))
}

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

import { supabase } from './supabase'

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

    // Bump the existing row for this crash rather than inserting a duplicate.
    // onConflict matches the (company_id, message, route) unique index.
    const { error: upsertErr } = await supabase
      .from('client_errors')
      .upsert(row, { onConflict: 'company_id,message,route', ignoreDuplicates: false })

    // A duplicate that lost the race is fine; anything else is worth a console
    // line for whoever has devtools open, but never a throw.
    if (upsertErr) console.warn('[crashReport] could not record crash:', upsertErr.message)
    return !upsertErr
  } catch (e) {
    console.warn('[crashReport] reporter itself failed:', e?.message || e)
    return false
  }
}

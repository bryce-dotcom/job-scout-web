// What the crash intake refuses, decided server-side so no client build can
// get it wrong.
//
// The reporter in the app drops crashes from a developer machine
// (lib/crashReport.js, since 2026-08-18). A local preview built from an OLDER
// branch does not have that guard, and on 2026-09-15..17 one on
// localhost:5190 filed "Failed to update a ServiceWorker for scope
// ('http://localhost:5190/')" nine times — alerted on, ticketed, and read as
// though a rep had hit it. The intake is the one place every build passes
// through, so the rule lives here too.

const DEV_HOST = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$|\.(local|localhost|test)$/i
const DEV_URL = /https?:\/\/(?:localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0|[a-z0-9.-]+\.(?:local|localhost))(?::\d+)?\//i

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null
  try { return new URL(url).hostname.toLowerCase() } catch { return null }
}

/**
 * True when the report comes from a developer's machine: the request's
 * Origin (or Referer) is a local host, or the crash text itself names a
 * localhost URL (a service-worker scope, a chunk URL, a fetch target).
 */
export function isDevReport(
  { origin, referer, message, stack }:
  { origin?: string | null; referer?: string | null; message?: string | null; stack?: string | null },
): boolean {
  for (const h of [hostOf(origin), hostOf(referer)]) if (h && DEV_HOST.test(h)) return true
  return DEV_URL.test(String(message || '')) || DEV_URL.test(String(stack || '').slice(0, 2000))
}

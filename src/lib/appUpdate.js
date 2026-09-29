// Keeping an open app on the newest build.
//
// The service worker is autoUpdate (skipWaiting + clientsClaim) and main.jsx
// reloads on controllerchange — but a worker only looks for a new sw.js on a
// page LOAD. An installed PWA that stays open on a phone for days never does
// one, so Cole's Lenard kept showing last week's savings maths after the fix
// shipped (Bryce, 2026-09-29: "there is no refresh"). Two checks now run
// while the app is open, on the moments a person comes back to it:
//
//   1. ask the worker to look for a new sw.js (registration.update()) — when
//      one exists the existing controllerchange reload takes it from there;
//   2. compare the build this page was compiled with against /version.json
//      on the server (written at build time, see vite.config.js). This one
//      catches a worker that could not update (sw.js fetch failed on a
//      job-site connection) and browsers without a worker at all.
//
// When the server is ahead: a person who has just come BACK to the app after
// a while is reloaded straight away (nothing half-typed to lose); anyone
// mid-session gets a banner with a Refresh button instead of losing a form.

/** How long away counts as "not in the middle of anything". */
export const AWAY_MS = 2 * 60 * 1000
/** Re-check cadence while the app stays in the foreground. */
export const POLL_MS = 15 * 60 * 1000

/**
 * The rule. Pure, so it is tested.
 * @param {object} a
 * @param {string} a.running   build id this page was compiled with
 * @param {string|null} a.served  build id /version.json reports (null = unknown)
 * @param {number} a.hiddenForMs  how long the page was hidden before this check (0 = still visible)
 * @param {string|null} a.reloadedFor  build id this tab already reloaded for
 * @returns {'reload'|'banner'|'none'}
 */
export function updateDecision({ running, served, hiddenForMs = 0, reloadedFor = null }) {
  if (!running || !served || typeof served !== 'string') return 'none'
  if (served === running) return 'none'
  // Reloading once for a build that still reads as different afterwards means
  // the served file and the bundle disagree (a CDN edge mid-deploy). Do not
  // loop — show the banner and let the person decide.
  if (reloadedFor === served) return 'banner'
  return hiddenForMs >= AWAY_MS ? 'reload' : 'banner'
}

const RELOADED_KEY = 'app_reloaded_for_build'

async function servedBuild() {
  try {
    const res = await fetch(`/version.json?t=${Date.now()}`, { cache: 'no-store' })
    if (!res.ok) return null
    const j = await res.json()
    return typeof j?.build === 'string' && j.build ? j.build : null
  } catch {
    return null
  }
}

function reloadFor(build) {
  try { sessionStorage.setItem(RELOADED_KEY, build) } catch { /* private mode */ }
  window.location.reload()
}

/** A plain-DOM banner: works even when React is the thing that is stale. */
function showBanner(build) {
  if (document.getElementById('app-update-banner')) return
  const bar = document.createElement('div')
  bar.id = 'app-update-banner'
  bar.setAttribute('role', 'status')
  bar.style.cssText = [
    'position:fixed', 'left:12px', 'right:12px', 'bottom:calc(16px + env(safe-area-inset-bottom))',
    'z-index:10000', 'display:flex', 'align-items:center', 'justify-content:space-between', 'gap:12px',
    'padding:12px 14px', 'border-radius:12px', 'background:#2c3530', 'color:#f7f5ef',
    'box-shadow:0 8px 24px rgba(0,0,0,.25)', 'font:500 14px/1.3 system-ui,sans-serif',
  ].join(';')
  const text = document.createElement('span')
  text.textContent = 'A new version of JobScout is ready.'
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = 'Refresh'
  btn.style.cssText = 'min-height:44px;padding:0 18px;border:0;border-radius:10px;background:#5a6349;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer'
  btn.onclick = () => reloadFor(build)
  bar.append(text, btn)
  document.body.appendChild(bar)
}

/**
 * Wire the checks. Call once at startup. `running` is the build id baked in
 * at compile time (import.meta.env.VITE_APP_BUILD).
 */
export function installAppUpdateCheck({ running } = {}) {
  if (typeof window === 'undefined' || !running) return () => {}
  let hiddenAt = 0
  let checking = false

  const check = async (hiddenForMs) => {
    if (checking || !navigator.onLine) return
    checking = true
    try {
      // 1. the worker's own update path (controllerchange → reload in main.jsx)
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {})
      }
      // 2. the build stamp
      const served = await servedBuild()
      let reloadedFor = null
      try { reloadedFor = sessionStorage.getItem(RELOADED_KEY) } catch { /* private mode */ }
      const d = updateDecision({ running, served, hiddenForMs, reloadedFor })
      if (d === 'reload') reloadFor(served)
      else if (d === 'banner') showBanner(served)
    } finally {
      checking = false
    }
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return }
    const away = hiddenAt ? Date.now() - hiddenAt : 0
    hiddenAt = 0
    check(away)
  }
  const onOnline = () => check(0)
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)
  const timer = setInterval(() => { if (document.visibilityState === 'visible') check(0) }, POLL_MS)
  // First look a moment after startup — a page that loaded from the
  // worker's precache may already be behind the server.
  const first = setTimeout(() => check(0), 4000)

  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    clearInterval(timer); clearTimeout(first)
  }
}

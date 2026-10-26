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

// ── Holding the reload while someone has unsaved work ─────────────────────
// "Away for two minutes" is not the same as "nothing to lose". On 10-11 a
// Chris quote — roofline read, Street View, access check and a paid picture —
// was wiped because the tab sat hidden for two minutes while another commit
// shipped. On a phone that is a rep switching to the camera. A page with work
// in hand holds updates; the person gets the banner and chooses when.
const holds = new Set()

/** Hold automatic reloads until the returned function is called. */
export function holdAppUpdate(reason = 'unsaved work') {
  const token = { reason }
  holds.add(token)
  return () => { holds.delete(token) }
}

/** True while any page holds updates. */
export function appUpdateHeld() {
  return holds.size > 0
}

/** How long away counts as "not in the middle of anything". */
export const AWAY_MS = 2 * 60 * 1000
/** Re-check cadence while the app stays in the foreground. */
export const POLL_MS = 5 * 60 * 1000
/**
 * Untouched this long while VISIBLE counts as away too. A phone propped on a
 * dashboard with the chat open is never "hidden", so the away rule never
 * fired for it — it sat on a banner nobody looked at, on the old build, for
 * days. Ten minutes with no tap and no key is nobody mid-form.
 */
export const IDLE_MS = 10 * 60 * 1000
/**
 * How long a new build may wait quietly before it is worth interrupting for.
 *
 * This is the number that was missing. Every rule below was about WHETHER a
 * person is mid-task; none was about how OFTEN to ask. We ship forty times on
 * a busy day, so somebody working through the afternoon met the banner forty
 * times — "i will say refresh like 10 times before they can finish what they
 * were doing". Each refresh costs them their place, and five minutes later
 * another deploy lands.
 *
 * Being three minutes behind harms nobody. So a pending update now waits for
 * the person to move between pages and lands invisibly there; the banner is
 * only for someone who has sat on one screen for the best part of an hour and
 * genuinely is falling behind.
 */
export const STALE_MS = 45 * 60 * 1000
/** How long "Later" buys. Long enough that a busy afternoon is not a queue of banners. */
export const SNOOZE_MS = 60 * 60 * 1000

/**
 * The rule. Pure, so it is tested.
 * @param {object} a
 * @param {string} a.running   build id this page was compiled with
 * @param {string|null} a.served  build id /version.json reports (null = unknown)
 * @param {number} a.hiddenForMs  how long the page was hidden before this check (0 = still visible)
 * @param {string|null} a.reloadedFor  build id this tab already reloaded for
 * @param {boolean} a.held  a page has unsaved work (holdAppUpdate)
 * @param {boolean} a.firstCheck  the check a few seconds after a cold start
 * @param {number} a.pendingForMs  how long this page has been behind the server
 * @returns {'reload'|'banner'|'defer'|'none'}  defer = say nothing, catch it on the next navigation
 */
export function updateDecision({ running, served, hiddenForMs = 0, reloadedFor = null, held = false, firstCheck = false, idleMs = 0, pendingForMs = 0 }) {
  if (!running || !served || typeof served !== 'string') return 'none'
  if (served === running) return 'none'
  // Reloading once for a build that still reads as different afterwards means
  // the served file and the bundle disagree (a CDN edge mid-deploy). Do not
  // loop — show the banner and let the person decide.
  if (reloadedFor === served) return 'banner'
  if (held) return 'banner'
  // A STALE COLD START FIXES ITSELF.
  //
  // The worker only looks for a new sw.js on a page load, and serves its
  // precached index.html while it does — so the FIRST load after a deploy is
  // the old app, every time, and the second is the new one. That cost two
  // people most of a day: the Arnie crash looked unfixed after a deploy that
  // had fixed it, "hit Refresh" proved nothing, and a good change was
  // reverted on the strength of it.
  //
  // Four seconds after a cold start nobody has half-typed anything, so the
  // banner is protecting work that does not exist yet. Reload instead. Later
  // checks, when someone is actually using the app, still ask.
  if (firstCheck) return 'reload'
  if (hiddenForMs >= AWAY_MS || idleMs >= IDLE_MS) return 'reload'
  // SOMEBODY MID-TASK IS NOT INTERRUPTED FOR A BUILD THAT IS MINUTES OLD.
  //
  // This used to return 'banner' here, which meant every deploy put a bar in
  // front of everyone working. Being a few minutes behind costs nothing, and
  // the update lands by itself the next time they move between pages — which
  // in this app is constantly. 'defer' is that: no bar, no reload, wait for a
  // door. Only someone who has sat on one screen for most of an hour is
  // genuinely falling behind, and they get asked.
  return pendingForMs >= STALE_MS ? 'banner' : 'defer'
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

/**
 * Reload onto `build` — at most ONCE per build, per tab.
 *
 * THE BUG THIS CLOSES. London, 26 Oct, eight minutes after the last of nine
 * deploys between 07:26 and 08:46: "I click on the three lines to open up the
 * side menu to get to Field Scout, I have to repeat that process about four
 * times before I can get into field Scout or honestly anything — the tab kind
 * of just reload itself multiple times."
 *
 * The once-per-build stamp already existed and updateDecision already honoured
 * it. But the navigation door called this function DIRECTLY, so it never met
 * that rule — it asked only "is there a pending build?", which stays true. The
 * worker answers each reload out of its own precache (the same thing that made
 * the banner's old plain reload useless, see applyUpdate), so the page comes
 * back on the SAME build with the server still ahead, `pending` is set again,
 * and her next tap reloads again. Nothing decayed, so nothing stopped it.
 *
 * Reloading twice for one build is pointless by definition: the first reload
 * already proved it does not land. The stamp therefore lives HERE, in the one
 * function that performs the reload, rather than in each caller — a caller
 * cannot forget a rule it does not have to remember. Returns false when it
 * refuses, so the caller can offer the banner instead; that Refresh goes
 * through applyUpdate(), which drops the worker and the caches and so is the
 * only thing that actually escapes the precache.
 */
function reloadFor(build) {
  let already = null
  try { already = sessionStorage.getItem(RELOADED_KEY) } catch { /* private mode */ }
  if (already && already === build) return false
  try { sessionStorage.setItem(RELOADED_KEY, build) } catch { /* private mode */ }
  window.location.reload()
  return true
}

/** The build a controllerchange reload left behind. */
const SW_RELOAD_FROM_KEY = 'sw_reload_from_build'

/**
 * A new service worker has taken control — should this tab reload onto it?
 *
 * The old rule in main.jsx was a 30-SECOND THROTTLE, which permitted every
 * reload spaced further apart than that. On a morning like 26 Oct — nine
 * deploys in eighty minutes — a tab could legitimately be reloaded again and
 * again, each one a new worker taking over. Time was never the right question.
 *
 * The build is. A reload is only worth doing if it CHANGES the build this page
 * runs, so stamp the build we reload away FROM: if we come back still running
 * it, the reload did not land — the worker served the old precache — and doing
 * it again cannot help. Once a reload really does land a new build the stamp
 * stops matching, which re-arms this for the next genuine update.
 *
 * Pure, so it is tested.
 * @param {object} a
 * @param {string} a.running  build id this page was compiled with
 * @param {string|null} a.reloadedFrom  build a controllerchange reload already left
 * @param {boolean} a.held  a page has unsaved work (holdAppUpdate)
 * @returns {'reload'|'banner'}
 */
export function swReloadDecision({ running, reloadedFrom = null, held = false }) {
  if (held) return 'banner'
  // No build id to key on (an unstamped build) still gets ONE reload per tab
  // rather than one every 30 seconds.
  return reloadedFrom === (running || 'unknown') ? 'banner' : 'reload'
}

/**
 * Wire-up for the controllerchange listener in main.jsx. The thinking is in
 * swReloadDecision; this is the storage and the reload.
 */
export function swTookControl({ running } = {}) {
  let reloadedFrom = null
  try { reloadedFrom = sessionStorage.getItem(SW_RELOAD_FROM_KEY) } catch { /* private mode */ }
  const d = swReloadDecision({ running, reloadedFrom, held: appUpdateHeld() })
  if (d === 'banner') {
    // The new worker is already in control, so Refresh later loads the new
    // build. A held page gets told regardless; a refusal respects a "Later".
    if (appUpdateHeld() || Date.now() >= snoozedUntil()) showBanner(null)
    return false
  }
  try { sessionStorage.setItem(SW_RELOAD_FROM_KEY, running || 'unknown') } catch { /* private mode */ }
  window.location.reload()
  return true
}

/**
 * Actually land the newest build. One press, every commit since.
 *
 * There is no queue of updates to work through: a load fetches whatever is
 * served NOW, so ten pushes are caught up by one refresh. The reason it did
 * not feel that way is that this was written twice and the weaker copy was the
 * one people saw. BuildTag's menu item unregistered the worker and cleared the
 * caches; the banner — the thing that appears unprompted in front of everyone
 * — called plain window.location.reload(), which the service worker is
 * entitled to answer out of its own precache. So the page came back identical,
 * and you pressed it again. BuildTag's own comment had already named it:
 * "leaving it in place is how somebody 'updates' three times and sees the same
 * screen."
 *
 * The worker goes first because it is the thing holding the old build, then
 * the caches, then a URL the browser cannot mistake for one it already has.
 * Every step is best-effort: a failure here must still end in a reload, or the
 * button does nothing at all.
 */
export async function applyUpdate() {
  try {
    if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations().catch(() => [])
      await Promise.all(regs.map((r) => r.unregister().catch(() => false)))
    }
    if (typeof caches !== 'undefined') {
      const keys = await caches.keys().catch(() => [])
      await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)))
    }
  } finally {
    window.location.replace(`${window.location.pathname}?u=${Date.now()}`)
  }
}

/** Quiet until this timestamp — set by Later, and by a silent deferral. */
const SNOOZE_KEY = 'app_update_snoozed_until'
function snoozedUntil() {
  try { return Number(sessionStorage.getItem(SNOOZE_KEY)) || 0 } catch { return 0 }
}
function snooze(ms) {
  try { sessionStorage.setItem(SNOOZE_KEY, String(Date.now() + ms)) } catch { /* private mode */ }
  const bar = typeof document !== 'undefined' && document.getElementById('app-update-banner')
  if (bar) bar.remove()
}

/** A plain-DOM banner: works even when React is the thing that is stale. */
export function showBanner(build) {
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
  const actions = document.createElement('span')
  actions.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0'
  // Somewhere to put "not now". Without it the only way to clear the bar was
  // to refresh, so every deploy cost whoever was working their place on the
  // page — and we ship forty times on a busy day.
  const later = document.createElement('button')
  later.type = 'button'
  later.textContent = 'Later'
  later.style.cssText = 'min-height:44px;padding:0 12px;border:0;border-radius:10px;background:transparent;color:#cfd6cb;font:500 14px system-ui,sans-serif;cursor:pointer'
  later.onclick = () => snooze(SNOOZE_MS)
  const btn = document.createElement('button')
  btn.type = 'button'
  btn.textContent = 'Refresh'
  btn.style.cssText = 'min-height:44px;padding:0 18px;border:0;border-radius:10px;background:#5a6349;color:#fff;font:600 14px system-ui,sans-serif;cursor:pointer'
  // applyUpdate, not reload: the worker will happily serve the old build back
  // from precache, which is why pressing this used to change nothing.
  btn.onclick = () => {
    try { if (build) sessionStorage.setItem(RELOADED_KEY, build) } catch { /* private mode */ }
    btn.disabled = true
    btn.textContent = 'Updating…'
    applyUpdate()
  }
  actions.append(later, btn)
  bar.append(text, actions)
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
  let lastTouch = Date.now()
  let pendingSince = 0
  let pending = null
  const touched = () => { lastTouch = Date.now() }
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, touched, { passive: true, capture: true })

  const check = async (hiddenForMs, firstCheck = false) => {
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
      // When the pending build CHANGES, the clock does not restart. Forty
      // deploys in an afternoon must not keep a person permanently fresh and
      // therefore permanently un-asked; what matters is how long they have
      // been behind, not which build they are behind.
      if (served && served !== running) { if (!pendingSince) pendingSince = Date.now() } else { pendingSince = 0 }
      pending = served && served !== running ? served : null
      const d = updateDecision({
        running, served, hiddenForMs, reloadedFor, held: appUpdateHeld(), firstCheck,
        idleMs: Date.now() - lastTouch,
        pendingForMs: pendingSince ? Date.now() - pendingSince : 0,
      })
      if (d === 'reload') reloadFor(served)
      else if (d === 'banner' && Date.now() >= snoozedUntil()) showBanner(served)
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

  // THE DOOR. Moving between pages is the one moment nothing is half-typed,
  // so a pending update lands there and nobody is asked anything. In a CRM
  // people navigate constantly, which is why deferring is cheap: the banner
  // becomes the exception rather than the thing everyone meets after a deploy.
  //
  // Held work still blocks it — a draft survives a navigation in this app, so
  // reloading over one would lose exactly what holdAppUpdate exists to protect.
  const onNavigate = () => {
    if (!pending || appUpdateHeld()) return
    // reloadFor refuses a build this tab has already reloaded for, and a
    // refusal is the whole point of the door now: `pending` stays set while
    // the worker keeps serving the old precache, so without this every tap
    // reloaded again and the menu never held (London, 26 Oct). Offer the
    // banner instead — its Refresh drops the worker and really does land it.
    if (!reloadFor(pending) && Date.now() >= snoozedUntil()) showBanner(pending)
  }
  // React Router moves with pushState, which fires no event of its own.
  const wrap = (name) => {
    const orig = history[name]
    if (typeof orig !== 'function' || orig.__appUpdateWrapped) return orig
    const patched = function (...args) {
      const r = orig.apply(this, args)
      try { window.dispatchEvent(new Event('app:navigated')) } catch { /* no-op */ }
      return r
    }
    patched.__appUpdateWrapped = true
    history[name] = patched
    return orig
  }
  const origPush = wrap('pushState')
  const origReplace = wrap('replaceState')
  window.addEventListener('app:navigated', onNavigate)
  window.addEventListener('popstate', onNavigate)

  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('online', onOnline)
  const timer = setInterval(() => { if (document.visibilityState === 'visible') check(0) }, POLL_MS)
  // First look a moment after startup — a page that loaded from the
  // worker's precache may already be behind the server.
  const first = setTimeout(() => check(0, true), 4000)

  return () => {
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.removeEventListener(ev, touched, { capture: true })
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('online', onOnline)
    window.removeEventListener('app:navigated', onNavigate)
    window.removeEventListener('popstate', onNavigate)
    // Put history back exactly as found, or a test that installs twice leaves
    // a stack of wrappers behind and every navigation fires several times.
    if (typeof origPush === 'function') history.pushState = origPush
    if (typeof origReplace === 'function') history.replaceState = origReplace
    clearInterval(timer); clearTimeout(first)
  }
}

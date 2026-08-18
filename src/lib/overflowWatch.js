// Notice when the page has pushed something out of reach.
//
// Christopher zoomed his browser to roughly 25% to edit a price on an estimate,
// then photographed the monitor to tell us. The Price column had been shoved
// past the right edge by a grid track that refused to shrink, and because
// html/body carry overflow-x: hidden the excess was CLIPPED rather than
// scrolled — no scrollbar, no error, nothing to see. It read as a mystery
// precisely because a clipped layout looks exactly like a working one.
//
// npm run guard now blocks the grid shape that caused it. But that is a TEXT
// rule: a track string built at runtime, a CSS class, an over-long unbroken
// word, an oversized image — all walk straight past it. This is the backstop
// that does not care WHY something is off-screen.
//
// It reports only when a control the user needs is unreachable, because that
// is the difference between a cosmetic overflow and Christopher's afternoon.
// Everything below exists to keep it quiet enough to stay switched on.

import { reportCrash } from './crashReport'

// A few px of overflow is rounding and sub-pixel layout, not a lost column.
const SLOP_PX = 24
// One report per route per session, and a hard cap: a resize handler must
// never be able to write hundreds of rows.
const MAX_PER_SESSION = 3
const SETTLE_MS = 1200

const seen = new Set()
let sent = 0

/** Things a person clicks or types into. If one of these is off-screen, work stops. */
const INTERACTIVE = 'input, select, textarea, button, [role="button"], [contenteditable="true"]'

/** A short, human-readable handle for an element — enough to find it in the code. */
function describe(el) {
  // Guarded: this is called from tests and would otherwise die on `document`.
  if (!el) return 'page'
  if (typeof document !== 'undefined' && el === document.body) return 'page'
  const id = el.id ? `#${el.id}` : ''
  const cls = typeof el.className === 'string' && el.className.trim()
    ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
    : ''
  const label = (el.getAttribute?.('aria-label') || el.getAttribute?.('placeholder') || '').slice(0, 30)
  return `${el.tagName.toLowerCase()}${id}${cls}${label ? ` "${label}"` : ''}`
}

/**
 * Elements whose content is wider than their box. scrollWidth still exceeds
 * clientWidth under overflow:hidden — which is exactly why this can see the
 * damage that is invisible on screen.
 */
function clippedContainers(root = document.body) {
  const out = []
  const all = root.querySelectorAll('*')
  for (const el of all) {
    if (el.scrollWidth - el.clientWidth <= SLOP_PX) continue
    const style = getComputedStyle(el)
    // Only when the overflow is actually hidden from the user. A container
    // that scrolls is doing its job — the content is reachable.
    const x = style.overflowX
    if (x !== 'hidden' && x !== 'clip') continue
    out.push(el)
  }
  return out
}

/** Interactive controls sitting outside their clipping ancestor's visible box. */
function unreachableControls(container) {
  const box = container.getBoundingClientRect()
  const lost = []
  for (const el of container.querySelectorAll(INTERACTIVE)) {
    if (el.disabled || el.type === 'hidden') continue
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue
    // Past the right edge, or starting beyond it entirely.
    if (r.left >= box.right - 4 || r.right > box.right + SLOP_PX) lost.push(el)
  }
  return lost
}

function scan() {
  if (sent >= MAX_PER_SESSION) return
  const route = window.location?.pathname || ''
  if (seen.has(route)) return

  let worst = null
  for (const container of clippedContainers()) {
    const lost = unreachableControls(container)
    if (!lost.length) continue
    const overflow = container.scrollWidth - container.clientWidth
    if (!worst || overflow > worst.overflow) worst = { container, lost, overflow }
  }
  if (!worst) return

  seen.add(route)
  sent += 1

  const { container, lost, overflow } = worst
  const message =
    `Off-screen content: ${lost.length} control${lost.length === 1 ? '' : 's'} unreachable — ` +
    `${describe(container)} overflows its box by ${Math.round(overflow)}px`
  const error = new Error(message)
  // No stack worth keeping — the useful detail is WHICH controls were lost and
  // how wide the window was, so it goes where a stack would.
  error.stack = [
    `viewport ${window.innerWidth}x${window.innerHeight}`,
    `container ${describe(container)} client=${container.clientWidth} scroll=${container.scrollWidth}`,
    ...lost.slice(0, 6).map(el => `  unreachable: ${describe(el)}`),
  ].join('\n')

  reportCrash(error, { componentStack: '(layout — content clipped off-screen, not a crash)' })
}

let timer = null
const schedule = () => {
  clearTimeout(timer)
  // After the route has settled — measuring mid-render reports layouts that
  // never existed for the user.
  timer = setTimeout(() => {
    if (typeof requestIdleCallback === 'function') requestIdleCallback(scan, { timeout: 2000 })
    else scan()
  }, SETTLE_MS)
}

export function installOverflowWatch() {
  if (typeof window === 'undefined' || window.__jsOverflowWatchInstalled) return
  window.__jsOverflowWatchInstalled = true

  schedule()
  window.addEventListener('popstate', schedule)
  window.addEventListener('resize', schedule)

  // React Router navigates via pushState, which fires no event.
  for (const fn of ['pushState', 'replaceState']) {
    const original = history[fn]
    history[fn] = function (...args) {
      const result = original.apply(this, args)
      schedule()
      return result
    }
  }
}

// Exported for tests.
export const __internals = { describe, clippedContainers, unreachableControls, SLOP_PX }

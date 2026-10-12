import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// The bottom tab bar (BottomTabs, position:fixed bottom:0 z-index:48, phones
// only) paints over whatever is behind it. Anything fixed to the bottom of a
// phone screen has to leave room, and the way it does that is
// --jobscout-tabbar-space: 64px + the home-indicator inset on mobile, 0 above
// md, declared once in Layout's style block.
//
// The menu drawer was the one that missed it. It runs to bottom: 0 at z-index
// 46, so its last 64px — the user card, with Refresh and Sign Out — sat under
// the bar: on a 375x812 phone the Refresh button measured y 770–812 and a tap
// at its centre landed on the bar's Arnie button. Bryce, 9 Oct 2026: "We
// changed the menu on the phone recently but the guys cant refresh their app
// now." That is the Refresh they mean.

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '../..', p), 'utf8')
const layout = read('src/components/Layout.jsx')

/** The style block of the element whose inline styles contain `marker`. */
const styleAround = (src, marker, span = 900) => {
  const at = src.indexOf(marker)
  expect(at, `marker not found: ${marker}`).toBeGreaterThan(-1)
  return src.slice(Math.max(0, at - span), at + span)
}

describe('everything fixed to the bottom of a phone clears the tab bar', () => {
  it('the variable is declared for phones and zeroed above md', () => {
    expect(layout).toMatch(/--jobscout-tabbar-space: calc\(64px \+ env\(safe-area-inset-bottom/)
    expect(layout).toMatch(/--jobscout-tabbar-space: 0px/)
  })

  it('the page body leaves room, as it always did', () => {
    expect(styleAround(layout, "className=\"main-content")).toMatch(/paddingBottom: 'var\(--jobscout-tabbar-space, 0px\)'/)
  })

  it('THE MENU DRAWER leaves room — this is the one that did not', () => {
    // the drawer is the z-index 46 panel anchored right, below the header
    expect(styleAround(layout, "zIndex: 46,")).toMatch(/paddingBottom: 'calc\(var\(--jobscout-tabbar-space, 0px\)/)
  })

  it('and on an agent page it clears the SECOND bar as well', () => {
    // Agent pages stack their own tab bar on top of the global one. With only
    // the global bar's 64px reserved, the drawer's Refresh landed at y=689 on
    // a 375x812 phone — on screen, and under Arnie's tab bar, so a tap at its
    // centre hit the bar. The same failure as the original, one bar further up.
    expect(styleAround(layout, "zIndex: 46,")).toMatch(/var\(--jobscout-agentbar-space, 0px\)/)
  })

  it('the agent bar publishes its height, and takes it back on the way out', () => {
    const agentHeader = read('src/components/AgentHeader.jsx')
    // it sits ABOVE the global bar rather than on the same 64px of screen
    expect(agentHeader).toMatch(/bottom: 'var\(--jobscout-tabbar-space, 0px\)'/)
    expect(agentHeader).toMatch(/setProperty\('--jobscout-agentbar-space'/)
    // off an agent page the variable must be gone, or every drawer in the app
    // keeps reserving room for a bar that is not there
    expect(agentHeader).toMatch(/removeProperty\('--jobscout-agentbar-space'\)/)
  })

  it('the floating launchers sit above the bar too', () => {
    expect(read('src/components/ArnieFloatingPanel.jsx')).toMatch(/var\(--jobscout-tabbar-space/)
    expect(read('src/components/FeedbackButton.jsx')).toMatch(/var\(--jobscout-tabbar-space/)
  })

  it('and the bar itself is still the thing being cleared', () => {
    const bar = read('src/components/BottomTabs.jsx')
    expect(bar).toMatch(/position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 48/)
    expect(bar).toMatch(/className="md:hidden"/)
  })
})

describe('the drawer still holds the controls a tech needs', () => {
  it('Refresh and Sign Out are in the drawer, not only the desktop sidebar', () => {
    // two of each: the desktop sidebar (hidden on phones) and the drawer
    expect((layout.match(/>\s*Refresh\s*</g) || []).length).toBeGreaterThanOrEqual(2)
    expect((layout.match(/Sign Out/g) || []).length).toBeGreaterThanOrEqual(2)
  })

  it('Refresh clears the service workers and caches before reloading', () => {
    const block = styleAround(layout, 'Refresh app and check for updates', 1400)
    expect(block).toMatch(/getRegistrations\(\)/)
    expect(block).toMatch(/caches\.keys\(\)/)
    expect(block).toMatch(/location\.reload\(\)/)
  })
})

// Where the conversation sits, and how tall it is.
//
// The app's phone shell is a fixed 64px bar on top and, inside an agent
// workspace, a fixed tab bar along the bottom. The page between them is an
// ordinary document that grows with its content. A chat cannot live in a
// document like that: after the first long answer the composer has trailed
// off the bottom of the screen, and when you do scroll down to it, it is
// under the tab bar and the floating buttons.
//
// So on a phone the conversation is pinned to the gap between the two bars
// and scrolls inside itself, like a messaging app. When the keyboard is up
// the visible screen is shorter (visualViewport tells us by how much) and
// the tab bar is behind the keyboard, so the frame shrinks to what is
// visible and stops clearing the bar.
//
// On a laptop nothing is fixed; the chat simply fills the window below the
// header so the composer is always on screen.

export const MIN_CHAT_HEIGHT = 320
const KEYBOARD_THRESHOLD = 120   // px the visual viewport must lose before we call it a keyboard

/**
 * @param {object} m
 * @param {boolean} m.isMobile
 * @param {number}  m.anchorTop          document offset of the chat's top edge
 * @param {number}  m.viewportHeight     visualViewport.height (what is actually visible)
 * @param {number}  m.layoutHeight       window.innerHeight (unchanged by the keyboard on iOS)
 * @param {number}  [m.viewportOffsetTop] visualViewport.offsetTop — how far iOS has panned
 * @param {number}  [m.tabbarHeight]     the fixed bottom tab bar, safe area included
 * @returns {{ style: object, keyboardOpen: boolean }}
 */
export function chatFrame({ isMobile, anchorTop, viewportHeight, layoutHeight, viewportOffsetTop = 0, tabbarHeight = 0 }) {
  if (!isMobile) {
    return {
      keyboardOpen: false,
      style: { position: 'relative', height: Math.max(MIN_CHAT_HEIGHT, layoutHeight - anchorTop) },
    }
  }

  const keyboardOpen = layoutHeight - viewportHeight > KEYBOARD_THRESHOLD
  const bottomClearance = keyboardOpen ? 0 : tabbarHeight
  return {
    keyboardOpen,
    style: {
      position: 'fixed',
      left: 0,
      right: 0,
      top: viewportOffsetTop + anchorTop,
      height: Math.max(160, viewportHeight - anchorTop - bottomClearance),
    },
  }
}

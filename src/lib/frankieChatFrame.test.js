import { describe, it, expect } from 'vitest'
import { chatFrame, MIN_CHAT_HEIGHT } from '../pages/agents/frankie/chatFrame'

// The numbers below are an iPhone 13/14 in portrait: 812 tall, the app's
// 64px top bar plus Frankie's 51px one-line header above the chat, and a
// 64px tab bar (plus 34px home indicator) along the bottom.
const phone = { isMobile: true, anchorTop: 115, viewportHeight: 812, layoutHeight: 812, tabbarHeight: 98 }

describe('the conversation on a phone', () => {
  it('is pinned to the gap between the top bar and the tab bar', () => {
    // The bug being fixed: the composer used to trail the last answer down
    // the page and end up under the tab bar.
    const { style, keyboardOpen } = chatFrame(phone)
    expect(style.position).toBe('fixed')
    expect(style.top).toBe(115)
    expect(style.height).toBe(812 - 115 - 98)
    expect(keyboardOpen).toBe(false)
  })

  it('shrinks to the visible screen when the keyboard is up, and stops clearing the tab bar', () => {
    // With the keyboard open iOS keeps innerHeight at 812 but the visual
    // viewport drops to ~470. The tab bar is behind the keyboard, so
    // clearing it would just push the composer up into the middle of the
    // screen for no reason.
    const { style, keyboardOpen } = chatFrame({ ...phone, viewportHeight: 470, viewportOffsetTop: 0 })
    expect(keyboardOpen).toBe(true)
    expect(style.height).toBe(470 - 115)
  })

  it('follows the visual viewport when iOS pans the page to the focused input', () => {
    const { style } = chatFrame({ ...phone, viewportHeight: 470, viewportOffsetTop: 60 })
    expect(style.top).toBe(60 + 115)
  })

  it('does not mistake the URL bar collapsing for a keyboard', () => {
    // Safari's toolbar hides on scroll and gives back ~50px. That is not a
    // keyboard; the tab bar is still on screen and still needs clearing.
    const { style, keyboardOpen } = chatFrame({ ...phone, viewportHeight: 760 })
    expect(keyboardOpen).toBe(false)
    expect(style.height).toBe(760 - 115 - 98)
  })
})

describe('the conversation on a laptop', () => {
  it('fills the window below the header, in normal flow', () => {
    const { style } = chatFrame({ isMobile: false, anchorTop: 120, viewportHeight: 900, layoutHeight: 900 })
    expect(style.position).toBe('relative')
    expect(style.height).toBe(780)
  })

  it('never collapses below a usable height on a short window', () => {
    const { style } = chatFrame({ isMobile: false, anchorTop: 400, viewportHeight: 500, layoutHeight: 500 })
    expect(style.height).toBe(MIN_CHAT_HEIGHT)
  })
})

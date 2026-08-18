import { describe, it, expect, vi, beforeEach } from 'vitest'
import { __internals } from './overflowWatch'

const { unreachableControls, describe: describeEl } = __internals

// Christopher's failure, reduced: a container that clips, holding a control
// that has been pushed past its right edge. Nothing throws, nothing looks
// wrong — the only evidence is geometry.

/** Minimal stand-in for a DOM element with a known box. */
const el = (rect, extra = {}) => ({
  getBoundingClientRect: () => ({ width: rect.right - rect.left, height: rect.bottom - rect.top, ...rect }),
  tagName: extra.tagName || 'INPUT',
  id: extra.id || '',
  className: extra.className || '',
  disabled: extra.disabled || false,
  type: extra.type || 'text',
  getAttribute: () => extra.label || null,
})

const container = (rect, controls) => ({
  getBoundingClientRect: () => ({ ...rect, width: rect.right - rect.left, height: 100 }),
  querySelectorAll: () => controls,
})

beforeEach(() => { vi.unstubAllGlobals() })

describe('what counts as out of reach', () => {
  it('flags a control pushed past the clipped right edge', () => {
    const price = el({ left: 1300, right: 1400, top: 0, bottom: 20 })
    const c = container({ left: 0, right: 1200, top: 0, bottom: 100 }, [price])
    expect(unreachableControls(c)).toHaveLength(1)
  })

  it('leaves a control that is fully visible alone', () => {
    const qty = el({ left: 100, right: 200, top: 0, bottom: 20 })
    const c = container({ left: 0, right: 1200, top: 0, bottom: 100 }, [qty])
    expect(unreachableControls(c)).toHaveLength(0)
  })

  it('ignores a few px of sub-pixel spill — that is rounding, not a lost column', () => {
    const edge = el({ left: 1100, right: 1205, top: 0, bottom: 20 })
    const c = container({ left: 0, right: 1200, top: 0, bottom: 100 }, [edge])
    expect(unreachableControls(c)).toHaveLength(0)
  })

  it('ignores disabled and hidden controls — nobody was going to use them', () => {
    const off = el({ left: 1300, right: 1400, top: 0, bottom: 20 }, { disabled: true })
    const hidden = el({ left: 1300, right: 1400, top: 0, bottom: 20 }, { type: 'hidden' })
    const c = container({ left: 0, right: 1200, top: 0, bottom: 100 }, [off, hidden])
    expect(unreachableControls(c)).toHaveLength(0)
  })

  it('ignores zero-size controls, which are not rendered', () => {
    const ghost = el({ left: 1300, right: 1300, top: 0, bottom: 0 })
    const c = container({ left: 0, right: 1200, top: 0, bottom: 100 }, [ghost])
    expect(unreachableControls(c)).toHaveLength(0)
  })

  it('reports every lost control, not just the first', () => {
    const a = el({ left: 1300, right: 1400, top: 0, bottom: 20 })
    const b = el({ left: 1420, right: 1500, top: 0, bottom: 20 })
    const c = container({ left: 0, right: 1200, top: 0, bottom: 100 }, [a, b])
    expect(unreachableControls(c)).toHaveLength(2)
  })
})

describe('the description a person has to act on', () => {
  it('names the element usefully', () => {
    expect(describeEl({ tagName: 'INPUT', id: 'price', className: 'cell num', getAttribute: () => 'Price' }))
      .toContain('input#price')
  })

  it('survives an element with nothing to say about itself', () => {
    expect(() => describeEl({ tagName: 'DIV', id: '', className: '', getAttribute: () => null })).not.toThrow()
  })
})

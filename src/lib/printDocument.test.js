import { describe, it, expect } from 'vitest'
import { buildPrintDocument, printTitle, printElement } from './printDocument'

// Noah (10/09): "need to be able to print out formal legal docs or save as pdf"

describe('the printable document', () => {
  it('wraps the copied markup in a standalone page', () => {
    const html = buildPrintDocument('<div>Proposal body</div>', 'Proposal — EST-1')
    expect(html).toMatch(/^<!DOCTYPE html>/)
    expect(html).toContain('<div>Proposal body</div>')
    expect(html).toMatch(/<title>Proposal — EST-1<\/title>/)
  })

  it('keeps the colours, which Safari drops by default', () => {
    // Without this the accent bars and the totals panel print as white boxes
    // and the proposal looks unfinished.
    const html = buildPrintDocument('<p>x</p>')
    expect(html).toMatch(/print-color-adjust:\s*exact/)
    expect(html).toMatch(/-webkit-print-color-adjust:\s*exact/)
  })

  it('leaves no buttons or inputs on the paper', () => {
    expect(buildPrintDocument('<p>x</p>')).toMatch(/button, input, textarea, select \{ display: none/)
  })

  it('cannot have a title break out of the tag', () => {
    expect(buildPrintDocument('<p>x</p>', 'Bad <script>alert(1)</script>'))
      .not.toMatch(/<script>/)
  })

  it('survives being handed nothing', () => {
    const html = buildPrintDocument()
    expect(html).toMatch(/<body><\/body>/)
    expect(html).toMatch(/<title>Document<\/title>/)
  })
})

describe('the filename someone can find again', () => {
  it('reads as the document it is', () => {
    expect(printTitle({ docWord: 'Proposal', reference: 'EST-MUYG1LB8', customer: 'AZ Care More Collision' }))
      .toBe('Proposal — EST-MUYG1LB8 — AZ Care More Collision')
  })

  it('drops the parts it does not have', () => {
    expect(printTitle({ docWord: 'Bid', reference: 'EST-9' })).toBe('Bid — EST-9')
    expect(printTitle({})).toBe('Proposal')
    expect(printTitle()).toBe('Proposal')
  })
})

describe('when it cannot print', () => {
  it('says so rather than doing nothing', () => {
    expect(printElement(null)).toMatch(/nothing on screen/i)
  })

  it('names the usual culprit when the window is blocked', () => {
    const open = globalThis.window?.open
    globalThis.window = { ...(globalThis.window || {}), open: () => null }
    expect(printElement({ outerHTML: '<p>x</p>' })).toMatch(/blocked the print window.*pop-ups/i)
    if (open) globalThis.window.open = open
  })
})

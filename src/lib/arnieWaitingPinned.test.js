// Alayda, 2026-10-22: approval cards showed "sometimes in the chat and
// sometimes at the top", and the top meant scrolling all the way up. And
// Bryce, the same day: the customer portal lists lines on EVERY invoice.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('waiting cards are pinned above the message box', () => {
  const chat = read('src/pages/agents/arnie/ArnieChat.jsx')
  const scrollStart = chat.indexOf('{/* Messages area */}')
  const scrollEnd = chat.indexOf('<div ref={messagesEndRef} />')
  const pinned = chat.indexOf('{waitingCards.length > 0 && (')
  const input = chat.indexOf('{/* Input area */}')

  it('outside the scrolling conversation, just before the input', () => {
    expect(pinned).toBeGreaterThan(scrollEnd)
    expect(pinned).toBeLessThan(input)
    expect(chat.slice(scrollStart, scrollEnd)).not.toMatch(/Waiting for you/)
  })
  it('every undecided card — including one also shown inline', () => {
    expect(chat).toMatch(/const waitingCards = pendingCards\n/)
    expect(chat).not.toMatch(/pendingCards\.filter\(\(c\) => !shownInline\.has\(c\.id\)\)/)
  })
  it('an inline card is decided through its message (an expense keeps its receipt photo)', () => {
    expect(chat).toMatch(/const m = inlineMsgFor\(c\.id\)\n\s+if \(!m\) return decidePending\(c\.id, decision\)/)
    expect(chat).toMatch(/await decideProposal\(decision, c\.id, m\.id\)/)
    expect(chat).toMatch(/if \(!failed\) setPendingCards\(\(prev\) => prev\.filter\(\(x\) => x\.id !== proposalId\)\)/)
  })
  it('two show, the rest open on a tap, and the strip never takes the whole screen', () => {
    expect(chat).toMatch(/\(showAllWaiting \? waitingCards : waitingCards\.slice\(0, 2\)\)/)
    expect(chat).toMatch(/maxHeight: '38vh', overflowY: 'auto'/)
  })
})

describe('the customer portal lists lines on every invoice', () => {
  const portal = read('src/pages/CustomerPortal.jsx')
  it('the plain layout lists them too, with their notes — but not on a summary invoice', () => {
    expect(portal).toMatch(/\{!summaryMode && Array\.isArray\(line_items\) && line_items\.length > 0 && \(/)
    expect(portal).toMatch(/\{line_items\.map\(renderPortalInvoiceLine\)\}/)
  })
})

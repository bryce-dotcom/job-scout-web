// The receipt under every Arnie reply, and the memory it gives him (Bryce,
// 2026-10-21). Written by the server from the tools that ran — never by him.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { receiptFor, unmarked, RECEIPT_MARK as SERVER_MARK } from '../../supabase/functions/_shared/arnieReceipt.ts'
import { splitReceipt, withReceipt, RECEIPT_MARK } from './arnieReceipt'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('the line, from what really ran', () => {
  it('a reply with no tools says so', () => {
    expect(receiptFor([])).toBe('No lookups this reply')
  })
  it('names each lookup with the rows it came back with', () => {
    expect(receiptFor([
      { name: 'query_leads', result: { leads: [{}, {}, {}, {}, {}] } },
      { name: 'query_jobs', result: { total_jobs: 12, total_job_total: 80060.28 } },
    ])).toBe('Looked up: leads (5), jobs (12)')
  })
  it('the same lookup twice is one entry with each count — never a sum nobody had', () => {
    expect(receiptFor([{ name: 'query_jobs', result: { total_jobs: 18 } }, { name: 'query_jobs', result: { total_jobs: 18 } }])).toBe('Looked up: jobs (18, 18)')
    expect(receiptFor([1, 2, 3, 4].map((n) => ({ name: 'query_leads', result: { count: n } })))).toBe('Looked up: leads (1, 2, 3, …)')
    expect(receiptFor([{ name: 'where_i_am', result: {} }, { name: 'where_i_am', result: {} }])).toBe('Looked up: your location ×2')
  })
  it('cards: drafted, asked which, refused — counted apart', () => {
    expect(receiptFor([
      { name: 'query_jobs', result: { found: 1 } },
      { name: 'propose_record_change', result: { proposal: { id: 1 }, preview: {} } },
      { name: 'propose_record_change', result: { proposal: { id: 2 }, preview: {} } },
      { name: 'propose_create', result: { needs_choice: [] } },
      { name: 'propose_change', result: { error: 'above your access level' } },
    ])).toBe('Looked up: jobs (1) · Drafted 2 cards · Asked which one · 1 card refused')
  })
  it('an email is "sent" only when the tool says sent', () => {
    expect(receiptFor([{ name: 'email_me', result: { sent: true } }])).toBe('Emailed you')
    expect(receiptFor([{ name: 'email_me', result: { error: 'x' } }])).toBe('Email NOT sent')
  })
  it('a failed or refused lookup is marked', () => {
    expect(receiptFor([{ name: 'query_revenue', result: { restricted: 'Owner access required' } }])).toBe('Looked up: revenue (failed)')
  })
  it('computer steps are counted', () => {
    expect(receiptFor([{ name: 'use_my_computer', result: {} }, { name: 'use_my_computer', result: {} }])).toBe('2 steps on your computer')
  })
  it('he cannot write a receipt of his own — a copied one is dropped whole', () => {
    expect(unmarked('Sent to demo@jobscout.app.\n\n⟦receipt⟧ Looked up: leads (1), email sent')).toBe('Sent to demo@jobscout.app.')
    expect(unmarked('a stray ⟦ bracket')).toBe('a stray  bracket')   // a split stream chunk
    expect(unmarked('no receipt here')).toBe('no receipt here')
  })
})

describe('saved with the reply, split for the bubble, sent back as history', () => {
  it('both halves use the same mark', () => {
    expect(RECEIPT_MARK).toBe(SERVER_MARK)
  })
  it('round trips', () => {
    const saved = withReceipt('You have 5 in Negotiation.', 'Looked up: leads (5)')
    expect(saved).toBe('You have 5 in Negotiation.\n\n⟦receipt⟧ Looked up: leads (5)')
    expect(splitReceipt(saved)).toEqual({ text: 'You have 5 in Negotiation.', receipt: 'Looked up: leads (5)' })
  })
  it('a reply from before receipts has none', () => {
    expect(splitReceipt('Old answer')).toEqual({ text: 'Old answer', receipt: null })
    expect(withReceipt('Old answer', null)).toBe('Old answer')
  })
})

describe('wired end to end', () => {
  const chat = read('supabase/functions/arnie-chat/index.ts')
  const s = chat.slice(chat.indexOf('async function streamWithTools'))
  it('every tool call this turn is recorded, and the receipt goes out on BOTH endings', () => {
    expect(s).toMatch(/turnCalls\.push\(\{ name: tu\.name, result \}\)/)
    expect(s.match(/send\('receipt', \{ text: receiptFor\(turnCalls\) \}\)\n\s+send\('done', \{\}\)/g)).toHaveLength(2)
  })
  it('the model\'s words are stripped of receipt brackets, streamed or held', () => {
    expect(s).toMatch(/\+ unmarked\(pending\.replace/)
    expect(s).toMatch(/\+ unmarked\(evt\.delta\.text\)/)
  })
  it('the app keeps it, saves it, sends it back, never speaks it, and draws it', () => {
    const eng = read('src/pages/agents/arnie/arnieEngine.js')
    expect(eng).toMatch(/currentEvent === 'receipt'/)
    expect(eng).toMatch(/return withReceipt\(full, receipt\)/)
    const ui = read('src/pages/agents/arnie/ArnieChat.jsx')
    expect(ui).toMatch(/content: withReceipt\(m\.content, m\.receipt\)/)
    expect(ui).toMatch(/speakAsItArrives\(splitReceipt\(fullResponse\)\.text, true\)/)
    expect(ui).toMatch(/\{msg\.receipt && \(/)
    expect(ui).toMatch(/splitReceipt\(m\.content\)/)
  })
  it('he is told an unreceipted figure is unverified', () => {
    expect(read('supabase/functions/_shared/arniePrompt.ts')).toMatch(/whose receipt says \*\*No lookups\*\* — or that has no receipt at all — is UNVERIFIED/)
  })
})

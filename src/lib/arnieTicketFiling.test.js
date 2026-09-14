import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const create = read('../../supabase/functions/_shared/arnieCreate.ts')
const widget = read('../components/FeedbackButton.jsx')
const engine = read('../pages/agents/arnie/arnieEngine.js')

// Arnie files the ticket. Tracy's three tickets in September were all his
// diagnosis copied by hand into the Feedback widget, and he was right every
// time. These keep his tickets indistinguishable from the widget's.

describe('a ticket is a create target that lands in the same queue as the widget', () => {
  const block = create.slice(create.indexOf('ticket: {'), create.indexOf('export const isCreateTarget'))

  it('writes to feedback, anyone may file, details are required', () => {
    expect(block).toMatch(/table: 'feedback'/)
    expect(block).toMatch(/minLevel: 0/)
    expect(block).toMatch(/message:\s*\{[^}]*required: true/)
  })

  it('uses only the types the widget uses', () => {
    const arnieTypes = block.match(/oneOf: \[([^\]]+)\]/)[1].match(/'([a-z]+)'/g).map(s => s.replace(/'/g, ''))
    for (const t of arnieTypes) {
      // Every type Arnie can file is one the widget offers — the queue filters on them.
      expect(widget, `widget has no type '${t}'`).toContain(`'${t}'`)
    }
  })

  it('apply sets exactly what the widget sets — the person\'s email, a page, status new', () => {
    const apply = create.slice(create.indexOf("if (target.table === 'feedback') {"), create.indexOf('const res = await fetch(`${r.url}/rest/v1/${target.table}`'))
    expect(apply).toMatch(/row\.user_email = prop\.created_by/)
    expect(apply).toMatch(/row\.status = 'new'/)
    expect(apply).toMatch(/row\.page_url = /)
    // and the widget really does write those three
    expect(widget).toMatch(/user_email: user\?\.email/)
    expect(widget).toMatch(/status: 'new'/)
    expect(widget).toMatch(/page_url: window\.location\.pathname/)
  })

  it('says on the ticket that Arnie drafted it', () => {
    expect(create).toMatch(/Drafted by Arnie from a conversation/)
  })
})

describe('withdrawing a ticket', () => {
  const rb = create.slice(create.indexOf('export async function rollbackCreateProposal'))

  it('does not run the id through Number() — feedback ids are UUIDs', () => {
    // The first live run left a test ticket in the queue: Number('8810cf13-…') is NaN.
    expect(rb).not.toMatch(/Number\(prop\.payload\?\.created_id\)/)
    expect(rb).toMatch(/String\(prop\.payload\.created_id\)/)
    expect(rb).toMatch(/\[A-Za-z0-9-\]\{1,64\}/)
  })

  it('refuses once someone has picked the ticket up or replied', () => {
    expect(rb).toMatch(/t\.status !== 'new' \|\| t\.reply_message/)
  })
})

describe('the prompt', () => {
  const p = engine.slice(engine.indexOf('## Filing a ticket'), engine.indexOf('## The daily brief'))
  it('offers to file instead of telling the person to copy a paragraph to Bryce', () => {
    expect(p).toMatch(/do not end with "flag Bryce immediately"/)
    expect(p).toMatch(/propose_create with target=ticket/)
  })
  it('wants ids, figures and what was checked in the ticket', () => {
    expect(p).toMatch(/EXACT record ids and numbers/)
  })
  it('is not filed until approved, and nothing is filed for a system that works', () => {
    expect(p).toMatch(/It is not filed until they approve/)
    expect(p).toMatch(/do NOT offer a ticket/)
  })
})

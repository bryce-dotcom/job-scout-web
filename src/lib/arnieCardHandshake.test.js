import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '..', p), 'utf8')
const chatTs = readFileSync(resolve(here, '../../supabase/functions/arnie-chat/index.ts'), 'utf8')
const engine = read('pages/agents/arnie/arnieEngine.js')
const chatJsx = read('pages/agents/arnie/ArnieChat.jsx')

// propose_bulk_change reached production before the card that draws it. The
// client of the day routed every non-'record' preview into the settings-list
// card, which calls .map() on `after` — and a bulk preview's `after` is a
// string, so the message list threw mid-render. Nothing was written and
// nothing could be approved, but the panel broke.
//
// The fix is a handshake: the client says what it can draw, the server offers
// only tools whose output fits. These tests exist so that stays true.

describe('the client declares what it can draw', () => {
  it('sends its renderable card types on every request', () => {
    expect(engine).toMatch(/export const RENDERABLE_CARDS = \[/)
    expect(engine).toMatch(/supports: RENDERABLE_CARDS/)
  })

  it('only claims card types ArnieChat actually renders', () => {
    // This is the invariant that matters. Claiming a card the UI cannot draw
    // re-creates the original bug exactly.
    const claimed = [...engine.matchAll(/export const RENDERABLE_CARDS = \[([^\]]+)\]/g)]
      .flatMap(m => [...m[1].matchAll(/'([^']+)'/g)].map(x => x[1]))
    expect(claimed.length).toBeGreaterThan(0)
    for (const kind of claimed) {
      if (kind === 'config') {
        // The settings-list card is the one selected structurally, by shape.
        expect(chatJsx).toMatch(/Array\.isArray\(pv0\(msg\)\.after\)/)
      } else {
        expect(chatJsx, `no card renders kind '${kind}'`).toContain(`pv0(msg).kind === '${kind}'`)
      }
    }
  })

  it('picks the settings card by shape, not by "not a record"', () => {
    // The old negative test is what let an unknown preview shape through.
    expect(chatJsx).not.toMatch(/pv0\(msg\)\.kind !== 'record'/)
  })
})

describe('the server withholds tools the caller cannot render', () => {
  it('maps every proposal tool to the card it produces', () => {
    for (const tool of ['propose_change', 'propose_record_change', 'propose_bulk_change']) {
      expect(chatTs).toMatch(new RegExp(`${tool}: '`))
    }
  })

  it('filters the offered tools by the declared card set', () => {
    expect(chatTs).toMatch(/function toolsFor\(role: string, cards: string\[\]\)/)
    expect(chatTs).toMatch(/return !needs \|\| cards\.includes\(needs\)/)
  })

  it('credits a client that says nothing with only the pre-handshake cards', () => {
    // A cached tab from before this existed shipped with the config and record
    // cards and nothing newer. Defaulting to "everything" would reintroduce
    // the crash for exactly the users least able to avoid it.
    expect(chatTs).toMatch(/if \(!Array\.isArray\(declared\)\) return \['config', 'record'\]/)
  })
})

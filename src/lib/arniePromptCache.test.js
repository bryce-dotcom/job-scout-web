// Bryce, 2026-10-21: "turn on prompt caching". ai_usage had zero cached tokens —
// every round re-sent ~40-50k tokens of tools and rules at full price.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'

const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const fn = (name) => new Function('CACHE', `${transformSync(chat.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`))[0], { loader: 'ts' }).code}; return ${name}`)({ type: 'ephemeral' })
const cachedTools = fn('cachedTools'), cachedSystem = fn('cachedSystem'), cachedMessages = fn('cachedMessages')

describe('prompt caching', () => {
  it('marks the last tool only, and leaves the list it was given alone', () => {
    const tools = [{ name: 'a' }, { name: 'b' }]
    const out = cachedTools(tools)
    expect(out.map((t) => !!t.cache_control)).toEqual([false, true])
    expect(tools[1].cache_control).toBeUndefined()
    expect(cachedTools([])).toEqual([])
  })
  it('the rules are cached; the last-step note sits after the marker', () => {
    expect(cachedSystem('RULES')).toEqual([{ type: 'text', text: 'RULES', cache_control: { type: 'ephemeral' } }])
    const s = cachedSystem('RULES', 'NOTE')
    expect(s[1]).toEqual({ type: 'text', text: 'NOTE' })
    expect(cachedSystem('')).toBe('')
  })
  it('the fixed rules get their own marker, so a new message does not re-send them', () => {
    const s = cachedSystem('RULESthis-message help', 'NOTE', 5)
    expect(s.map((b) => b.text)).toEqual(['RULES', 'this-message help', 'NOTE'])
    expect(s.map((b) => !!b.cache_control)).toEqual([true, true, false])
    expect(s.map((b) => b.text).join('')).toBe('RULESthis-message helpNOTE')   // the words are unchanged
    expect(cachedSystem('RULES', '', 5)).toHaveLength(1)        // nothing after the rules: one block
    expect(cachedSystem('RULES', '', undefined)).toHaveLength(1)
  })
  it('the last lookup round must answer, and a reply is never blank (live test, 2026-10-21)', () => {
    const s = chat.slice(chat.indexOf('async function streamWithTools'))
    expect(s).toMatch(/const lastLookup = \(round: number\) => !used\.has\('use_my_computer'\) && round === 4/)
    expect(s).toMatch(/if \(!shownAny\) send\('text', \{ delta: setup\.tangled \}\)\n\s+send\('done', \{\}\)/)
    expect(chat).toMatch(/i === 4 && !used\.has\('use_my_computer'\) \? \{ tool_choice: \{ type: 'none' \} \}/)
    expect(chat).toMatch(/never fill it in\.'/)
  })
  it('the prompt builder records where its rules end, and both paths use it', () => {
    const sp = readFileSync(new URL('../../supabase/functions/_shared/arnieServerPrompt.ts', import.meta.url), 'utf8')
    expect(sp).toMatch(/rulesEnd\.set\(caller, rules\.length\)\r?\n\s+return rules \+/)
    expect(chat.match(/rulesEnd\.get\(caller as unknown as object\)/g).length).toBe(2)
  })
  it('marks a copy of the newest message — never the conversation itself', () => {
    const convo = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'yo' }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x', content: '{}' }] }]
    const out = cachedMessages(convo)
    expect(out[2].content[0].cache_control).toEqual({ type: 'ephemeral' })
    expect(convo[2].content[0].cache_control).toBeUndefined()
    expect(out.slice(0, 2)).toEqual(convo.slice(0, 2))
    expect(cachedMessages([{ role: 'user', content: 'hi' }])[0].content).toEqual([{ type: 'text', text: 'hi', cache_control: { type: 'ephemeral' } }])
  })
  it('both request paths use all three markers — three, under the API limit of four', () => {
    expect(chat.match(/system: cachedSystem\(/g).length).toBe(2)
    expect(chat.match(/tools: cachedTools\(setup\.tools\)/g).length).toBe(2)
    expect(chat.match(/messages: cachedMessages\(convo\)/g).length).toBe(2)
    expect(chat).not.toMatch(/messages: convo,/)
  })
  it('the meter prices Sonnet 5.5 at $2/$10, ahead of the generic Sonnet line', () => {
    const a = readFileSync(new URL('../../supabase/functions/_shared/anthropic.ts', import.meta.url), 'utf8')
    expect(a.indexOf("{ match: /sonnet-5-5/i, inPerM: 2, outPerM: 10 }")).toBeLessThan(a.indexOf("{ match: /sonnet/i, inPerM: 3"))
    expect(a.indexOf("{ match: /sonnet-5-5/i")).toBeGreaterThan(-1)
  })
})

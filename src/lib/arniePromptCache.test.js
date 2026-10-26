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
  it('the rules are cached, and the system prompt never carries a round-specific note', () => {
    expect(cachedSystem('RULES')).toEqual([{ type: 'text', text: 'RULES', cache_control: { type: 'ephemeral' } }])
    expect(cachedSystem('')).toBe('')
    expect(chat).not.toMatch(/system: cachedSystem\([^)]*NOTE/)
  })
  it('the fixed rules get their own marker, so a new message does not re-send them', () => {
    const s = cachedSystem('RULESthis-message help', 5)
    expect(s.map((b) => b.text)).toEqual(['RULES', 'this-message help'])
    expect(s.map((b) => !!b.cache_control)).toEqual([true, true])
    expect(s.map((b) => b.text).join('')).toBe('RULESthis-message help')   // the words are unchanged
    expect(cachedSystem('RULES', 5)).toHaveLength(1)        // nothing after the rules: one block
    expect(cachedSystem('RULES', undefined)).toHaveLength(1)
  })
  it('a last-round note rides after the newest message (Sonnet 5.5 rejects a changed system prompt mid-turn)', () => {
    const withNote = fn('withNote')
    const convo = [{ role: 'user', content: 'q' }, { role: 'assistant', content: [{ type: 'tool_use', id: 't', name: 'x', input: {} }] }, { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: '{}' }] }]
    const out = withNote(convo, '\n\n## Last lookup\nAnswer.')
    expect(out[2].content).toEqual([{ type: 'tool_result', tool_use_id: 't', content: '{}' }, { type: 'text', text: '## Last lookup\nAnswer.' }])
    expect(convo[2].content).toHaveLength(1)   // the conversation itself is untouched
    expect(withNote(convo, '')).toBe(convo)
    expect(withNote([{ role: 'user', content: 'fix that' }], 'N')[0].content).toEqual([{ type: 'text', text: 'fix that' }, { type: 'text', text: 'N' }])
    // A correction's note and a repeated question's note ride first (the
    // learning loop, 2026-10-23); the last-round note after them.
    expect(chat).toMatch(/messages: cachedMessages\(withNote\(convo, notes\(learnNote, askedBefore, outOfSteps\(round\) \? LAST_STEP_NOTE : lastLookup\(round\) \? LAST_LOOKUP_NOTE : ''\)\)\)/)
    expect(chat).toMatch(/messages: cachedMessages\(withNote\(convo, notes\(learnNote, askedBefore, i === 4 && !used\.has\('use_my_computer'\) \? LAST_LOOKUP_NOTE : ''\)\)\)/)
  })
  it('the last lookup round must answer, and a reply is never blank (live test, 2026-10-21)', () => {
    const s = chat.slice(chat.indexOf('async function streamWithTools'))
    expect(s).toMatch(/const lastLookup = \(round: number\) => !used\.has\('use_my_computer'\) && round === 4/)
    expect(s).toMatch(/if \(!shownAny\) send\('text', \{ delta: setup\.tangled \}\)\n\s+send\('receipt', \{ text: receiptFor\(turnCalls\) \}\)\n\s+send\('done', \{\}\)/)
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
  it('both request paths use every marker — four at most, the API limit', () => {
    expect(chat.match(/system: cachedSystem\(/g).length).toBe(2)
    expect(chat.match(/tools: cachedTools\(setup\.tools\)/g).length).toBe(2)
    expect(chat.match(/messages: cachedMessages\(withNote\(convo,/g).length).toBe(2)
    expect(chat).not.toMatch(/messages: convo,/)
  })
  it('Arnie runs on Sonnet 5.5, with room to think', () => {
    const m = readFileSync(new URL('../../supabase/functions/_shared/arnieModel.ts', import.meta.url), 'utf8')
    expect(m).toMatch(/export const ARNIE_MODEL = 'claude-sonnet-5-5'/)
    expect(chat).toMatch(/import \{ ARNIE_MODEL, liveArnieModel \} from '\.\.\/_shared\/arnieModel\.ts'/)
    expect(chat).not.toMatch(/const ARNIE_MODEL = /)
    expect(chat).toMatch(/maxTokens: isNewModel\(model\) \? 16000 : 4096,/)
    const c = readFileSync(new URL('../../supabase/functions/_shared/computeConfig.ts', import.meta.url), 'utf8')
    expect(c.indexOf("m.includes('sonnet-5-5')")).toBeLessThan(c.indexOf("return { in: 3, out: 15"))
    expect(c).toMatch(/if \(m\.includes\('sonnet-5-5'\)\) return \{ in: 2, out: 10, cacheRead: 0\.2 \}/)
  })
  it('the brief push, teach and the settings parser run on the same model, read text by type, with room to think', () => {
    const f = (p) => readFileSync(new URL(`../../supabase/functions/${p}`, import.meta.url), 'utf8')
    const brief = f('arnie-brief-push/index.ts'), teach = f('arnie-teach/index.ts'), config = f('_shared/arnieConfig.ts')
    for (const src of [brief, teach, config]) {
      expect(src).not.toMatch(/claude-sonnet-4-5/)
      expect(src).toMatch(/textOf\(ai\.data\)/)
    }
    expect(brief).toMatch(/\.\.\.\(await quickCall\(4000\)\)/)
    expect(config).toMatch(/\.\.\.\(await quickCall\(2000\)\)/)
    expect(teach).toMatch(/model: await liveArnieModel\(\),\s+max_tokens: 12000,/)
    expect(teach).not.toMatch(/content\?\.\[0\]\?\.text/)   // the first block can be thinking
  })
  it('textOf skips thinking blocks', async () => {
    const { textOf, quickCall } = await import('../../supabase/functions/_shared/arnieModel.ts')
    expect(textOf({ content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: 'Morning Bryce.' }] })).toBe('Morning Bryce.')
    expect(textOf({})).toBe('')
    // No database here, so the live model falls back to the code's.
    expect(await quickCall(2000)).toEqual({ model: 'claude-sonnet-5-5', max_tokens: 2000, output_config: { effort: 'low' } })
  })
  it('the meter prices Sonnet 5.5 at $2/$10, ahead of the generic Sonnet line', () => {
    const a = readFileSync(new URL('../../supabase/functions/_shared/anthropic.ts', import.meta.url), 'utf8')
    expect(a.indexOf("{ match: /sonnet-5-5/i, inPerM: 2, outPerM: 10 }")).toBeLessThan(a.indexOf("{ match: /sonnet/i, inPerM: 3"))
    expect(a.indexOf("{ match: /sonnet-5-5/i")).toBeGreaterThan(-1)
  })
})

// "Hey Jenny" on an iPhone (2026-10-26): a Shortcut listens, arnie-voice
// answers as the person whose voice key it carries, the Shortcut reads it aloud.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { newVoiceKey, looksLikeVoiceKey, hashVoiceKey, keyHint, speakable, isGoodbye, VOICE_NOTE } from '../../supabase/functions/_shared/arnieVoice.ts'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

describe('the voice key', () => {
  it('is long, random, recognisable, and only its hash is kept', async () => {
    const a = newVoiceKey(), b = newVoiceKey()
    expect(a).not.toBe(b)
    expect(looksLikeVoiceKey(a)).toBe(true)
    expect(looksLikeVoiceKey('sk_live_123')).toBe(false)
    const h = await hashVoiceKey(a)
    expect(h).toMatch(/^[0-9a-f]{64}$/)
    expect(h).not.toContain(a.slice(4, 20))
    expect(await hashVoiceKey(` ${a} `)).toBe(h)
    expect(keyHint(a)).toBe(`…${a.slice(-4)}`)
  })
})

describe('an answer fit to be heard', () => {
  it('no markdown, no tables, no links, no receipt', () => {
    const s = speakable("**Today: Step Saver.** Crew is you.\n\n| a | b |\n|---|---|\n- 24 high bays need a lift\nOpen https://jobscout.appsannex.com/crew-sheet?x=1\n⟦receipt⟧ Looked up: crew sheet")
    expect(s).toBe('Today: Step Saver. Crew is you.\n24 high bays need a lift\nOpen the link in the app')
  })
  it('the turn is told it will be read aloud', () => {
    expect(VOICE_NOTE).toMatch(/READ ALOUD/)
    expect(VOICE_NOTE).toMatch(/No tables, no bullet lists, no markdown, no links/)
    expect(VOICE_NOTE).toMatch(/waiting for them to approve in the JobScout app/)
  })
})

describe('when the conversation is over', () => {
  it.each(['thanks', 'Thank you Jenny', "that's all", 'Okay thanks', 'bye', '', 'never mind', "I'm good"])('over: "%s"', (s) => { expect(isGoodbye(s)).toBe(true) })
  it.each(['thanks, what about tomorrow?', 'how many open jobs', 'stop the Mesa job from being invoiced'])('not over: "%s"', (s) => { expect(isGoodbye(s)).toBe(false) })
})

describe('the wiring', () => {
  const fn = read('supabase/functions/arnie-voice/index.ts')
  it('a Shortcut has no login: the gateway lets it through and the key decides', () => {
    expect(read('supabase/config.toml')).toMatch(/\[functions\.arnie-voice\]\nverify_jwt = false/)
    expect(fn).toMatch(/key_hash=eq\.\$\{await hashVoiceKey\(voiceKey\)\}/)
    expect(fn).toMatch(/if \(!k\) return spoken\('JobScout does not know that voice key/)
    expect(fn).toMatch(/if \(k\.revoked_at\) return spoken\('That voice key has been turned off/)
    expect(fn).toMatch(/active=eq\.true/)
  })
  it('the key actions need the person signed in, and act only on their own keys', () => {
    expect(fn).toMatch(/resolveCaller\(req, URL_, KEY, \{ verify: true \}\)/)
    expect(fn).toMatch(/revoke_key[\s\S]{0,200}employee_id=eq\.\$\{caller\.employeeId\}/)
  })
  it('the turn is the same Arnie as texts and routines, told it will be heard; cards wait in the app', () => {
    expect(fn).toMatch(/runArnieTurn\([\s\S]{0,200}voice: true/)
    expect(read('supabase/functions/_shared/arnieHeadless.ts')).toMatch(/\.\.\.\(o\.voice \? \{ voice_reply: true, spoken: true \} : \{\}\)/)
    expect(read('supabase/functions/arnie-chat/index.ts')).toMatch(/if \(body\?\.voice_reply === true && !inTheApp\) \{/)
  })
  it('the conversation is a normal Arnie session, so it is in their history and Monday\'s review', () => {
    expect(fn).toMatch(/write\('ai_sessions', 'POST'[\s\S]{0,300}voice: true/)
    expect(fn).toMatch(/write\('ai_messages', 'POST'/)
  })
  it('a daily cap so a looping Shortcut cannot run up a bill', () => {
    expect(fn).toMatch(/if \(uses >= VOICE_DAILY_CAP\)/)
  })
  it('Settings has the card on both views', () => {
    expect(read('src/pages/agents/arnie/ArnieSetup.jsx').match(/<ArnieVoiceShortcut name=\{who\} \/>/g)).toHaveLength(2)
  })
})

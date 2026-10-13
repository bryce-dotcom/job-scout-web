// The voice rule.
//
// Cole picked Jenny and heard Arnie. So did anyone who picked any of the eight
// free Microsoft voices, because that engine had stopped opening its socket
// and every failure path quietly spoke with the one built-in male voice
// instead. Three things made that possible and each has a test here:
//
//   1. dead voices were still on offer
//   2. the panel where you pick a voice never loaded the working ones
//   3. a voice that could not speak was replaced by one of the other gender
//
// These read the source rather than running the audio, because what went
// wrong was never a wrong number — it was a list holding things that cannot
// speak and a fallback that did not care which voice you asked for. The
// gender resolver is real logic, so that part is exercised properly.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, '..', p), 'utf8').replace(/\r\n/g, '\n')
// Comments explain the bug by name, so they must not be what satisfies a test.
const code = (p) => read(p).replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')

const voice = code('pages/agents/arnie/arnieVoice.js')
const voiceRaw = read('pages/agents/arnie/arnieVoice.js')
const persona = code('pages/agents/arnie/ArniePersona.jsx')

describe('only voices that can speak are offered', () => {
  it('the retired Microsoft engine is gone, not merely unused', () => {
    // Left in place it would come back: the old code reached it whenever
    // ElevenLabs hiccuped, and one failure disabled every voice for the
    // rest of the session.
    expect(voice).not.toMatch(/speech\.platform\.bing\.com/)
    expect(voice).not.toMatch(/edgeTTSBroken/)
    expect(voice).not.toMatch(/msVoice/)
    expect(voice).not.toMatch(/en-US-\w+Neural/)
  })

  it('the list handed to a picker holds only ElevenLabs and built-in voices', () => {
    expect(voice).toMatch(/getVoices\(\)\s*\{\s*return \[\.\.\.elevenVoices, \.\.\.BROWSER_VOICES\]/)
  })

  it('a retired id is remembered only as the gender it stood for', () => {
    // Somebody's account still says edge_jenny. That has to mean "a woman's
    // voice", never "no voice" and never "whatever is first".
    expect(voice).toMatch(/VOICE_WISH = \{/)
    expect(voice).toMatch(/edge_jenny: 'female'/)
    expect(voice).toMatch(/edge_andrew: 'male'/)
  })

  it('a saved voice that no longer exists is not handed back as the default', () => {
    expect(voice).toMatch(/VOICE_WISH\[saved\] && resolveVoice\(saved\)\.id/)
  })
})

describe('the panel where you pick a voice loads the real ones', () => {
  it('ArniePersona fetches the account voices, not just the built-in list', () => {
    // This was the whole of "can't switch to Jenny": the dropdown was built
    // from getVoices() alone, which before loadArnieVoices() knows nothing
    // but the two system voices.
    expect(persona).toMatch(/loadArnieVoices\(\)/)
    expect(persona).toMatch(/setVoices\(list \|\| \[\]\)/)
  })

  it('Jenny asks for a woman, rather than naming one dead voice', () => {
    expect(persona).toMatch(/DEFAULT_VOICE = \{ arnie: null, jenny: 'voice_female' \}/)
    expect(persona).not.toMatch(/jenny: 'edge_jenny'/)
  })

  it('a wish shows as the voice it resolves to, not as blank', () => {
    expect(persona).toMatch(/voiceExists\(savedVoice\)/)
    expect(persona).toMatch(/resolveVoice\(savedVoice\)/)
  })
})

describe('a voice is never swapped for one that sounds different', () => {
  it('the built-in stand-in keeps the gender that was asked for', () => {
    expect(voice).toMatch(/BROWSER_VOICES\.find\(\(v\) => v\.gender === voiceDef\.gender\)/)
  })

  it('a failed ElevenLabs call no longer re-speaks as a fixed male voice', () => {
    // The old line was: return speak(text, EDGE_VOICES[0].id, ...) — Andrew,
    // whoever you had chosen.
    expect(voice).not.toMatch(/return speak\(text, EDGE_VOICES/)
    expect(voice).not.toMatch(/EDGE_VOICES/)
  })

  it('standing in is recorded so a screen can admit it', () => {
    expect(voice).toMatch(/export function takeVoiceFallback\(\)/)
  })

  it('every voice resolves through one function', () => {
    // speak() used to do its own lookup with its own default, which is how it
    // and the pickers disagreed about which voice was in force.
    expect(voice).toMatch(/const voiceDef = resolveVoice\(voiceId\)/)
    expect(voice).toMatch(/export function resolveVoice\(voiceId\)/)
  })
})

describe('gender by name', () => {
  // The resolver's only input is a display name like "Jessica - Playful,
  // Bright, Warm", so this is where a wish for a woman's voice is honoured
  // or quietly broken.
  const pick = (name) => {
    const m = voiceRaw.match(/const FEMALE_NAMES = \[([^\]]*)\]/)
    const f = voiceRaw.match(/const MALE_NAMES = \[([^\]]*)\]/)
    const parse = (s) => s[1].split(',').map((x) => x.trim().replace(/^'|'$/g, ''))
    const first = String(name).trim().toLowerCase().split(/[^a-z]+/)[0]
    if (parse(m).includes(first)) return 'female'
    if (parse(f).includes(first)) return 'male'
    return null
  }

  it('reads the first name out of an ElevenLabs display name', () => {
    expect(pick('Jessica - Playful, Bright, Warm')).toBe('female')
    expect(pick('Sarah - Mature, Reassuring, Confident')).toBe('female')
    expect(pick('Brian - Deep, Resonant and Comforting')).toBe('male')
    expect(pick('Bill - Wise, Mature, Balanced')).toBe('male')
  })

  it('knows every woman on the live account, or Jenny gets a man', () => {
    // Taken from the account as it answered on 2026-10-13. If ElevenLabs
    // renames or adds voices this is the test that should fail first.
    for (const n of ['Alice', 'Bella', 'Jessica', 'Laura', 'Lily', 'Matilda', 'Sarah']) {
      expect(pick(n)).toBe('female')
    }
  })

  it('an unfamiliar name is unknown, never guessed as female', () => {
    // Guessing would hand someone a man's voice under a woman's name, which
    // is the exact complaint. Unknown has to stay unknown.
    expect(pick('Zalthor')).toBe(null)
    expect(pick('')).toBe(null)
  })
})

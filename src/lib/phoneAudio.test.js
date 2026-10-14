// No sound on a phone.
//
// Bryce: "On the phone there is no sound when I talk to Arnie or Jenny."
// Everything worked on a desktop, which is exactly why it survived: none of
// what follows applies there.
//
// Three separate iOS rules, each enough on its own to produce silence, and
// all three failing without a word:
//   1. permission is granted to an ELEMENT a finger has touched, not to the
//      page — and every chunk was played through a brand new Audio() created
//      in a network callback;
//   2. the ring/silent switch mutes HTML audio unless the page says the sound
//      is the point, and a work phone lives on silent;
//   3. an AudioContext made before a tap starts suspended and stays that way.

import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const read = (p) => readFileSync(resolve(here, p), 'utf8').replace(/\r\n/g, '\n')
const code = (p) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '')

const voice = code('../pages/agents/arnie/arnieVoice.js')
const chat = code('../pages/agents/arnie/ArnieChat.jsx')
const panel = code('../components/ArnieFloatingPanel.jsx')

describe('one element, blessed by a tap', () => {
  it('playback reuses it instead of making a new one each time', () => {
    expect(voice).toMatch(/const audio = theAudio\(\)/)
    expect(voice).not.toMatch(/new Audio\(audioUrl\)/)
  })

  it('the unlock touches that same element', () => {
    const fn = voice.slice(voice.indexOf('export function unlockAudio'))
      .split('export function')[1]
    expect(fn).toMatch(/theAudio\(\)/)
  })
})

describe('the things that silenced it', () => {
  it('asks iOS to play through the ring/silent switch', () => {
    expect(voice).toMatch(/navigator\.audioSession/)
    expect(voice).toMatch(/audioSession\.type = 'playback'/)
  })

  it('resumes an AudioContext that started suspended', () => {
    expect(voice).toMatch(/audioCtx\.state === 'suspended'/)
    expect(voice).toMatch(/audioCtx\.resume\(\)/)
  })

  it('only counts as unlocked once it has really played', () => {
    // The old version set the flag whether or not the silent play resolved,
    // so one call before any tap marked audio unlocked for the whole session
    // and nothing tried again.
    expect(voice).toMatch(/\.then\(\(\) => \{ audioUnlocked = true/)
    expect(voice).toMatch(/if \(err\?\.name === 'NotAllowedError'\) audioUnlocked = false/)
  })

  it('says so in the console instead of failing mutely', () => {
    expect(voice).toMatch(/the browser refused to play/)
  })
})

describe('taking every chance a finger offers', () => {
  it('opening the panel unlocks, since on a phone it may be the only tap', () => {
    expect(panel).toMatch(/unlockAudio\(\)/)
  })

  it('so does the voice button', () => {
    expect(chat).toMatch(/unlockAudio\(\)\s*\n\s*noteSound\(\)/)
  })
})

describe('and if it is still blocked, there is something to tap', () => {
  it('the button offers sound rather than claiming the voice is on', () => {
    expect(chat).toMatch(/'Tap for sound'/)
    expect(chat).toMatch(/const \[soundReady, setSoundReady\]/)
  })

  it('and tapping it then is not read as turning the voice off', () => {
    expect(chat).toMatch(/if \(voiceOn && !audioIsUnlocked\(\)\) return/)
  })
})

// Arnie TTS.
//
// Two engines, best first:
//   eleven   ElevenLabs — Arnie's own voice (a voice named "Arnie" in the
//            company's ElevenLabs My Voices, or any voice there). Goes
//            through the arnie-tts function, which holds the key and lets
//            only the platform company / opted-in tenants spend credits.
//            Loaded at runtime by loadArnieVoices(); absent until then.
//   browser  speechSynthesis — the fallback of last resort.
//
// WHAT WENT WRONG, AND THE RULE THAT CAME OUT OF IT (2026-10-13). There used
// to be a third engine: eight free Microsoft neural voices (edge_andrew …
// edge_jenny) spoken over Bing's read-aloud WebSocket. That socket no longer
// opens from a browser at all — checked live against production, it fails
// before the handshake. So all eight of those names were dead, and every one
// of them fell through a fallback that ignored which voice had been asked for
// and spoke with the single built-in male system voice. Cole picked Jenny and
// got Arnie, and so would anyone picking any of the eight.
//
// Hence the rule: A VOICE IS NEVER SILENTLY SWAPPED FOR ONE THAT SOUNDS
// DIFFERENT. Only voices that can actually speak are offered; if the engine
// for a chosen voice fails anyway, the substitute has to match the gender
// that was asked for, and resolveVoice() — one function, used by the pickers
// and by speak() alike — is the only place that decides.
//
// The chosen voice is saved on the person's account (arnie_personas.voice_id)
// so it follows them to their phone, with localStorage as a local echo.

import { supabase } from '../../../lib/supabase'

// ── Voice options ───────────────────────────────────────────────────────

const BROWSER_VOICES = [
  { id: 'browser_male_1', name: 'System Male', desc: 'Built-in voice (lower quality)', engine: 'browser', gender: 'male', priority: ['google uk english male', 'david', 'mark', 'daniel', 'james', 'alex'] },
  { id: 'browser_female_1', name: 'System Female', desc: 'Built-in voice (lower quality)', engine: 'browser', gender: 'female', priority: ['google uk english female', 'samantha', 'karen', 'zira', 'victoria'] },
]

// Ids that are not voices but a WISH for one, resolved against whatever the
// account can actually speak with. Two kinds live here:
//   voice_female / voice_male  what a persona asks for (Jenny wants a woman's
//                              voice); storing the wish rather than one
//                              account's voice id means it still resolves on
//                              a tenant with an entirely different voice list.
//   edge_*                     the eight retired Microsoft voices. Someone
//                              picked one of these before today and it is
//                              saved on their account; mapping it to the
//                              gender they chose is the whole point.
const VOICE_WISH = {
  voice_female: 'female', voice_male: 'male',
  edge_jenny: 'female', edge_aria: 'female',
  edge_andrew: 'male', edge_brian: 'male', edge_guy: 'male',
  edge_davis: 'male', edge_eric: 'male', edge_steffan: 'male',
}

// Which voices are women. ElevenLabs gives a display name and no gender, so
// this is the only way to honour "a female voice" — by first name, matched
// against the name as listed ("Jessica - Playful, Bright, Warm"). A name that
// is not in either list counts as unknown, never as a match, so an unknown
// name is never handed out as the female voice.
const FEMALE_NAMES = ['alice', 'bella', 'jessica', 'laura', 'lily', 'matilda', 'sarah', 'rachel', 'domi', 'charlotte', 'dorothy', 'elli', 'freya', 'gigi', 'glinda', 'grace', 'jenny', 'aria', 'emily', 'nicole', 'serena', 'mimi', 'joanne']
const MALE_NAMES = ['adam', 'antoni', 'arnold', 'arnie', 'bill', 'brian', 'callum', 'charlie', 'chris', 'clyde', 'daniel', 'dave', 'drew', 'eric', 'ethan', 'george', 'giovanni', 'harry', 'james', 'jeremy', 'joseph', 'josh', 'liam', 'michael', 'patrick', 'paul', 'roger', 'sam', 'thomas', 'will', 'bryce', 'jay']

// Closest in character to the voices that were retired, best first. Nothing
// breaks when none of these is on an account — it falls through to any voice
// of the right gender.
const PREFERRED = {
  female: ['jessica', 'bella', 'sarah', 'laura', 'lily'],
  male: ['brian', 'eric', 'chris', 'roger', 'bill'],
}

function genderOfName(name) {
  const first = String(name || '').trim().toLowerCase().split(/[^a-z]+/)[0]
  if (FEMALE_NAMES.includes(first)) return 'female'
  if (MALE_NAMES.includes(first)) return 'male'
  return null
}

const VOICE_PREF_KEY = 'arnie_voice'
let elevenVoices = []          // filled by loadArnieVoices()
let elevenArnieId = null       // 'eleven:<id>' of the voice named Arnie, when the account has one

export function getVoices() { return [...elevenVoices, ...BROWSER_VOICES] }

// The one rule for turning a saved voice id into the voice that will speak.
// Exact match wins. Failing that, a wish (voice_female, or a retired edge_*)
// becomes the first voice of that gender the account really has, and only
// then the built-in system voice of that gender. Nothing here can return a
// voice of the other gender than the one asked for.
export function resolveVoice(voiceId) {
  const all = getVoices()
  const exact = all.find((v) => v.id === voiceId)
  if (exact) return exact

  const want = VOICE_WISH[voiceId] || null
  if (want) {
    // Of the right gender, prefer the ones that sound like what was retired —
    // Jenny was a warm American woman, and resolving her to a clipped British
    // narrator is technically correct and still the wrong voice. Alphabetical
    // order is not a judgement about how a voice sounds.
    const pool = elevenVoices.filter((v) => v.gender === want)
    for (const liked of PREFERRED[want] || []) {
      const hit = pool.find((v) => genderOfName(v.name) === want && v.name.trim().toLowerCase().startsWith(liked))
      if (hit) return hit
    }
    if (pool.length) return pool[0]
    return BROWSER_VOICES.find((v) => v.gender === want) || BROWSER_VOICES[0]
  }

  // No id, or one nobody recognises: Arnie's own voice, else anything real.
  return all.find((v) => v.id === elevenArnieId) || all[0] || BROWSER_VOICES[0]
}

// Is this a voice the account can actually speak with? The pickers use it to
// avoid showing a saved-but-retired id as if it were a live choice.
export function voiceExists(voiceId) { return getVoices().some((v) => v.id === voiceId) }
export function savedVoiceId() { try { return localStorage.getItem(VOICE_PREF_KEY) } catch { return null } }
export function rememberVoice(id) { try { localStorage.setItem(VOICE_PREF_KEY, id) } catch { /* private mode */ } }

// Ask the server which ElevenLabs voices this company may use. Resolves
// to the full list plus the id to start on: the saved pick if it still
// exists, else Arnie's own voice, else Andrew.
export async function loadArnieVoices() {
  try {
    const { data } = await supabase.functions.invoke('arnie-tts', { body: { action: 'voices' } })
    const list = Array.isArray(data?.voices) ? data.voices : []
    elevenVoices = list.map((v) => ({
      id: `eleven:${v.id}`, name: v.name, engine: 'eleven', elevenId: v.id,
      gender: genderOfName(v.name),
      desc: v.id === data?.arnie ? "Arnie's own voice · ElevenLabs" : v.category && v.category !== 'premade' ? 'Your ElevenLabs voice' : 'ElevenLabs voice',
    }))
    elevenArnieId = data?.arnie ? `eleven:${data.arnie}` : null
    if (elevenArnieId) elevenVoices.sort((a, b) => (a.id === elevenArnieId ? -1 : b.id === elevenArnieId ? 1 : 0))
  } catch { elevenVoices = []; elevenArnieId = null }
  const voices = getVoices()
  const saved = savedVoiceId()
  // A saved pick that no longer exists (one of the retired Microsoft voices)
  // must not be handed back as the default — that is how a dead voice stayed
  // selected for weeks. It goes through resolveVoice like everything else.
  const defaultId = (saved && voices.some((v) => v.id === saved) && saved)
    || (saved && VOICE_WISH[saved] && resolveVoice(saved).id)
    || elevenArnieId
    || voices[0]?.id
    || BROWSER_VOICES[0].id
  return { voices, defaultId }
}

// One chunk through the server (ElevenLabs), back as an mp3 Blob.
async function elevenTTS(text, elevenId) {
  const { data, error } = await supabase.functions.invoke('arnie-tts', { body: { text, voiceId: `eleven:${elevenId}` } })
  if (error || !data?.audio) throw new Error(error?.message || data?.error || 'ElevenLabs failed')
  const bin = atob(data.audio)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Blob([bytes], { type: 'audio/mpeg' })
}

// ── Helpers ─────────────────────────────────────────────────────────────

function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s/g, '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g, '$1')
    .replace(/`{1,3}[^`]*`{1,3}/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\|[^\n]+\|/g, '')
    .replace(/[-–—]{3,}/g, '')
    .replace(/>\s/g, '')
    .replace(/\n{2,}/g, '. ')
    .replace(/\n/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : (Date.now().toString(16) + Math.random().toString(16).slice(2)).slice(0, 32)
}

// ── State ───────────────────────────────────────────────────────────────

// A shade quicker than the default. Bryce: "arnie and jenny talk to slow".
// The ElevenLabs side has its own speed setting in arnie-tts; this is the
// built-in voice, which is only ever the fallback.
const SPEAK_RATE = 1.12

let currentAudio = null
let currentUtterance = null
let audioUnlocked = false
let currentSpeakId = 0 // used to cancel chunked playback

export function unlockAudio() {
  if (audioUnlocked) return
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const buf = ctx.createBuffer(1, 1, 22050)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
    const silent = new Audio('data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=')
    silent.volume = 0
    silent.play().catch(() => {})
    audioUnlocked = true
  } catch (e) {}
}

export function stopSpeaking() {
  currentSpeakId = -1 // cancel any chunked playback in progress
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    if (currentAudio._blobUrl) URL.revokeObjectURL(currentAudio._blobUrl)
    currentAudio = null
  }
  if (currentUtterance) {
    window.speechSynthesis?.cancel()
    currentUtterance = null
  }
}

export function isAvailable() { return true }

// ── Browser Speech Synthesis (fallback) ─────────────────────────────────

let cachedVoices = null

function getSystemVoices() {
  if (cachedVoices?.length > 0) return cachedVoices
  const voices = window.speechSynthesis?.getVoices() || []
  if (voices.length > 0) cachedVoices = voices
  return voices
}

function findBestVoice(voiceDef) {
  const voices = getSystemVoices()
  if (voices.length === 0) return null
  const langVoices = voices.filter(v => v.lang.startsWith('en'))
  const wantMale = voiceDef?.gender !== 'female'

  // Log available voices so we can debug
  if (!findBestVoice._logged) {
    findBestVoice._logged = true
    console.log('[Arnie Voice] Available voices:', langVoices.map(v => v.name).join(', '))
  }

  // Try priority keywords first
  const priorities = voiceDef?.priority || ['david', 'mark', 'daniel']
  for (const kw of priorities) {
    const found = langVoices.find(v => v.name.toLowerCase().includes(kw))
    if (found) {
      console.log('[Arnie Voice] Matched voice:', found.name, 'via keyword:', kw)
      return found
    }
  }

  // If we want male, filter out anything with 'female', 'zira', 'woman', 'girl' in the name
  if (wantMale) {
    const maleOnly = langVoices.filter(v => {
      const n = v.name.toLowerCase()
      return !n.includes('female') && !n.includes('zira') && !n.includes('woman') && !n.includes('girl')
    })
    if (maleOnly.length > 0) {
      console.log('[Arnie Voice] Male fallback:', maleOnly[0].name)
      return maleOnly[0]
    }
  }

  return langVoices[0] || voices[0] || null
}

function speakBrowser(text, voiceDef, onStart, onEnd) {
  const synth = window.speechSynthesis
  if (!synth) { onEnd?.(); return }
  stopSpeaking()

  let spoken = false
  const trySpeak = () => {
    if (spoken) return // CRITICAL: prevent double-speak
    const voices = synth.getVoices() || []
    if (voices.length === 0) return // voices not ready yet, wait for onvoiceschanged
    spoken = true
    synth.onvoiceschanged = null // clean up

    if (voices.length > 0 && !cachedVoices) cachedVoices = voices
    const voice = findBestVoice(voiceDef)

    if (text.length > 200) { speakChunked(text, voice, onStart, onEnd); return }

    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice; u.lang = 'en-US'; u.rate = SPEAK_RATE; u.pitch = 1.0
    let ended = false
    const callOnEnd = () => { if (!ended) { ended = true; currentUtterance = null; onEnd?.() } }
    u.onstart = () => onStart?.()
    u.onend = callOnEnd
    u.onerror = (e) => { if (e.error !== 'canceled') console.error('[Arnie Voice] TTS error:', e.error); callOnEnd() }
    currentUtterance = u
    synth.speak(u)
  }

  // Try immediately with cached voices
  if (cachedVoices?.length > 0) {
    spoken = true
    const voice = findBestVoice(voiceDef)
    if (text.length > 200) { speakChunked(text, voice, onStart, onEnd); return }
    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice; u.lang = 'en-US'; u.rate = SPEAK_RATE; u.pitch = 1.0
    let ended = false
    const callOnEnd = () => { if (!ended) { ended = true; currentUtterance = null; onEnd?.() } }
    u.onstart = () => onStart?.()
    u.onend = callOnEnd
    u.onerror = (e) => { if (e.error !== 'canceled') console.error('[Arnie Voice] TTS error:', e.error); callOnEnd() }
    currentUtterance = u
    synth.speak(u)
    return
  }

  // Voices not cached — wait for them (only one path calls trySpeak)
  synth.onvoiceschanged = trySpeak
  setTimeout(trySpeak, 300)
}

function speakChunked(text, voice, onStart, onEnd) {
  const synth = window.speechSynthesis
  const chunks = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]
  const merged = []
  let cur = ''
  for (const c of chunks) {
    if ((cur + c).length > 180 && cur) { merged.push(cur.trim()); cur = c } else { cur += c }
  }
  if (cur.trim()) merged.push(cur.trim())

  let ended = false, started = false, idx = 0
  const callOnEnd = () => { if (!ended) { ended = true; currentUtterance = null; onEnd?.() } }

  const next = () => {
    if (idx >= merged.length || !currentUtterance) { callOnEnd(); return }
    const u = new SpeechSynthesisUtterance(merged[idx])
    u.voice = voice; u.lang = 'en-US'; u.rate = SPEAK_RATE; u.pitch = 1.0
    u.onstart = () => { if (!started) { started = true; onStart?.() } }
    u.onend = () => { idx++; next() }
    u.onerror = (e) => { if (e.error !== 'canceled') console.error('[Arnie Voice] Chunk error:', e.error); callOnEnd() }
    currentUtterance = u
    synth.speak(u)
  }
  currentUtterance = { _chunked: true }
  next()
}

// ── Main speak ──────────────────────────────────────────────────────────

let speakCallId = 0

// Split text into speakable chunks (sentences) for faster first-word playback
function splitIntoChunks(text, max = 200) {
  // Split on sentence boundaries
  const raw = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]
  // Merge tiny chunks together (aim for 50-max char chunks)
  const chunks = []
  let cur = ''
  for (const r of raw) {
    if ((cur + r).length > max && cur) {
      chunks.push(cur.trim())
      cur = r
    } else {
      cur += r
    }
  }
  if (cur.trim()) chunks.push(cur.trim())
  return chunks.filter(c => c.length > 0)
}

export async function speak(text, voiceId, onStart, onEnd) {
  const callId = ++speakCallId
  currentSpeakId = callId
  const clean = stripMarkdown(text)
  if (!clean) { onEnd?.(); return }
  const truncated = clean.length > 3000 ? clean.slice(0, 3000) + '...' : clean
  const voiceDef = resolveVoice(voiceId)

  console.log(`[Arnie Voice] speak #${callId} engine=${voiceDef.engine} voice=${voiceDef.name} len=${truncated.length}`)

  // ElevenLabs: split into chunks, start playing the first immediately; while
  // it plays, pre-download the next for a seamless handoff.
  const isEleven = voiceDef.engine === 'eleven'
  const fetchChunk = (t) => elevenTTS(t, voiceDef.elevenId)
  if (isEleven) {
    stopSpeaking()
    currentSpeakId = callId // restore after stopSpeaking clears it
    const chunks = splitIntoChunks(truncated, 420)
    let started = false
    let failed = false

    // Pre-fetch next chunk's audio while current plays
    let prefetchPromise = null

    for (let i = 0; i < chunks.length; i++) {
      if (currentSpeakId !== callId) return // cancelled

      // Use prefetched blob if available, otherwise fetch now
      let blob
      if (prefetchPromise) {
        blob = await prefetchPromise
        prefetchPromise = null
      } else {
        try {
          blob = await fetchChunk(chunks[i])
        } catch {
          failed = true
          break
        }
      }

      if (!blob) { failed = true; break }

      // Start prefetching next chunk while this one plays
      if (i + 1 < chunks.length) {
        prefetchPromise = fetchChunk(chunks[i + 1]).catch(() => null)
      }

      // Play this chunk
      const audioUrl = URL.createObjectURL(blob)
      const audio = new Audio(audioUrl)
      audio._blobUrl = audioUrl

      const playOk = await new Promise(resolve => {
        let ended = false
        const finish = () => {
          if (!ended) { ended = true; URL.revokeObjectURL(audioUrl); currentAudio = null; resolve(true) }
        }
        audio.onended = finish
        audio.onerror = () => { console.error('[Arnie Voice] Edge chunk error'); finish() }

        audio.play().then(() => {
          currentAudio = audio
          if (!started) { started = true; onStart?.() }
        }).catch(() => { ended = true; resolve(false) })
      })

      if (!playOk || currentSpeakId !== callId) { failed = !playOk; break }
    }

    if (!failed && started) {
      console.log(`[Arnie Voice] speak #${callId} → ElevenLabs complete (${chunks.length} chunks)`)
      onEnd?.()
      return
    }
    if (currentSpeakId !== callId) return
    console.warn(`[Arnie Voice] speak #${callId} → ElevenLabs failed, falling back to the built-in voice`)
    lastFallback = { voice: voiceDef.name, at: Date.now() }
  }

  // Built-in voice. This is the one place a voice gets substituted, so it
  // keeps the gender that was asked for: picking a woman's voice and being
  // answered by a man is the bug this whole file was rewritten for. An
  // unknown gender keeps the old behaviour rather than guessing.
  const bDef = voiceDef.engine === 'browser'
    ? voiceDef
    : (BROWSER_VOICES.find((v) => v.gender === voiceDef.gender) || BROWSER_VOICES[0])
  speakBrowser(truncated, bDef, onStart, onEnd)
  console.log(`[Arnie Voice] speak #${callId} → built-in ${bDef.name} started`)
}

// Set when a chosen voice could not speak and the built-in one stood in, so a
// screen can say so instead of leaving someone to wonder why their pick made
// no difference. Cleared by reading it.
let lastFallback = null
export function takeVoiceFallback() { const f = lastFallback; lastFallback = null; return f }

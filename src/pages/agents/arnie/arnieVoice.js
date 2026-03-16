// Arnie TTS — Edge TTS (free neural voices via Supabase edge function) with browser fallback
//
// Edge TTS returns base64-encoded MP3 audio via JSON. Falls back to browser
// speechSynthesis if the edge function is unavailable.

import { supabase } from '../../../lib/supabase'

// ── Voice options ───────────────────────────────────────────────────────

const EDGE_VOICES = [
  { id: 'edge_andrew',  name: 'Andrew',  desc: 'Warm American male',       engine: 'edge' },
  { id: 'edge_brian',   name: 'Brian',   desc: 'Friendly American male',   engine: 'edge' },
  { id: 'edge_guy',     name: 'Guy',     desc: 'Casual American male',     engine: 'edge' },
  { id: 'edge_davis',   name: 'Davis',   desc: 'Calm American male',       engine: 'edge' },
  { id: 'edge_eric',    name: 'Eric',    desc: 'Confident American male',  engine: 'edge' },
  { id: 'edge_steffan', name: 'Steffan', desc: 'Professional male',        engine: 'edge' },
  { id: 'edge_jenny',   name: 'Jenny',   desc: 'Warm American female',     engine: 'edge' },
  { id: 'edge_aria',    name: 'Aria',    desc: 'Friendly American female', engine: 'edge' },
]

const BROWSER_VOICES = [
  { id: 'browser_male_1', name: 'System Male', desc: 'Built-in male voice', engine: 'browser', match: ['daniel', 'david', 'james', 'mark', 'alex', 'google us english', 'male'] },
  { id: 'browser_female_1', name: 'System Female', desc: 'Built-in female voice', engine: 'browser', match: ['samantha', 'karen', 'victoria', 'zira', 'google us english female', 'female'] },
]

export const ARNIE_VOICES = [...EDGE_VOICES, ...BROWSER_VOICES]

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

// ── State ───────────────────────────────────────────────────────────────

let currentAudio = null
let currentUtterance = null
let audioUnlocked = false

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
  } catch (e) {
    // Non-fatal
  }
}

export function stopSpeaking() {
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

export function isAvailable() {
  return true
}

// ── Browser voice matching ──────────────────────────────────────────────

let cachedBrowserVoices = null

function getBrowserVoices() {
  if (cachedBrowserVoices) return cachedBrowserVoices
  const voices = window.speechSynthesis?.getVoices() || []
  if (voices.length > 0) cachedBrowserVoices = voices
  return voices
}

function findBrowserVoice(voiceDef) {
  const voices = getBrowserVoices()
  if (voices.length === 0) return null
  const keywords = voiceDef?.match || ['daniel', 'david', 'james', 'mark', 'male']
  const langVoices = voices.filter(v => v.lang.startsWith('en'))
  for (const kw of keywords) {
    const found = langVoices.find(v => {
      const name = v.name.toLowerCase()
      if (kw === 'male') return /\bmale\b/.test(name) && !name.includes('female')
      if (kw === 'female') return name.includes('female')
      return name.includes(kw)
    })
    if (found) return found
  }
  return langVoices[0] || voices[0] || null
}

// ── Edge TTS (primary) ─────────────────────────────────────────────────
// Returns true if audio played successfully, false if failed.
// IMPORTANT: Does NOT call onEnd on failure — only the final playing engine calls onEnd.

async function speakEdgeTTS(text, voiceId, onStart, onEnd) {
  stopSpeaking()

  try {
    const { data, error } = await supabase.functions.invoke('arnie-tts', {
      body: { text, voiceId },
    })

    if (error) {
      console.error('[Arnie Voice] Edge TTS invoke error:', error)
      return false // NO onEnd — caller will fallback
    }

    if (!data?.audio) {
      console.error('[Arnie Voice] Edge TTS returned no audio')
      return false
    }

    // Decode base64 to audio blob
    const binary = atob(data.audio)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const audioBlob = new Blob([bytes], { type: 'audio/mpeg' })
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    audio._blobUrl = audioUrl

    let ended = false
    const callOnEnd = () => {
      if (!ended) {
        ended = true
        URL.revokeObjectURL(audioUrl)
        currentAudio = null
        onEnd?.()
      }
    }

    audio.onended = callOnEnd
    audio.onerror = () => {
      console.error('[Arnie Voice] Edge TTS playback error')
      callOnEnd()
    }

    await audio.play()
    currentAudio = audio
    onStart?.()
    return true
  } catch (err) {
    console.error('[Arnie Voice] Edge TTS failed:', err)
    return false // NO onEnd
  }
}

// ── Browser Speech Synthesis (fallback) ─────────────────────────────────

function speakBrowser(text, voiceDef, onStart, onEnd) {
  const synth = window.speechSynthesis
  if (!synth) {
    console.warn('[Arnie Voice] speechSynthesis not available')
    onEnd?.()
    return
  }

  stopSpeaking()

  const trySpeak = () => {
    const voice = findBrowserVoice(voiceDef)

    if (text.length > 200) {
      speakChunked(text, voice, onStart, onEnd)
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = voice
    utterance.lang = 'en-US'
    utterance.rate = 1.05
    utterance.pitch = 0.9

    let ended = false
    const callOnEnd = () => { if (!ended) { ended = true; currentUtterance = null; onEnd?.() } }

    utterance.onstart = () => onStart?.()
    utterance.onend = callOnEnd
    utterance.onerror = (e) => {
      if (e.error !== 'canceled') console.error('[Arnie Voice] Browser TTS error:', e.error)
      callOnEnd()
    }

    currentUtterance = utterance
    synth.speak(utterance)
  }

  const voices = getBrowserVoices()
  if (voices.length === 0) {
    synth.onvoiceschanged = () => { cachedBrowserVoices = null; trySpeak() }
    setTimeout(trySpeak, 100)
  } else {
    trySpeak()
  }
}

function speakChunked(text, voice, onStart, onEnd) {
  const synth = window.speechSynthesis
  const chunks = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]
  const merged = []
  let current = ''
  for (const chunk of chunks) {
    if ((current + chunk).length > 180 && current) {
      merged.push(current.trim())
      current = chunk
    } else {
      current += chunk
    }
  }
  if (current.trim()) merged.push(current.trim())

  let ended = false
  const callOnEnd = () => { if (!ended) { ended = true; currentUtterance = null; onEnd?.() } }
  let started = false
  let idx = 0

  const speakNext = () => {
    if (idx >= merged.length || !currentUtterance) { callOnEnd(); return }
    const utterance = new SpeechSynthesisUtterance(merged[idx])
    utterance.voice = voice
    utterance.lang = 'en-US'
    utterance.rate = 1.05
    utterance.pitch = 0.9
    utterance.onstart = () => { if (!started) { started = true; onStart?.() } }
    utterance.onend = () => { idx++; speakNext() }
    utterance.onerror = (e) => {
      if (e.error !== 'canceled') console.error('[Arnie Voice] Chunk error:', e.error)
      callOnEnd()
    }
    currentUtterance = utterance
    synth.speak(utterance)
  }

  currentUtterance = { _chunked: true }
  speakNext()
}

// ── Main speak function ─────────────────────────────────────────────────
// Only ONE engine calls onEnd per invocation. Edge TTS does NOT call onEnd on failure.

export async function speak(text, voiceId, onStart, onEnd) {
  const clean = stripMarkdown(text)
  if (!clean) { onEnd?.(); return }

  const truncated = clean.length > 4000 ? clean.slice(0, 4000) + '...' : clean
  const voiceDef = ARNIE_VOICES.find(v => v.id === voiceId) || ARNIE_VOICES[0]

  // Try Edge TTS first (free neural voices)
  if (voiceDef.engine === 'edge') {
    const success = await speakEdgeTTS(truncated, voiceDef.id, onStart, onEnd)
    if (success) return // Edge TTS is playing — it will call onEnd when done
    console.warn('[Arnie Voice] Edge TTS failed, falling back to browser voice')
  }

  // Browser voice fallback — this is the ONLY engine that calls onEnd now
  const browserDef = voiceDef.engine === 'browser' ? voiceDef : BROWSER_VOICES[0]
  speakBrowser(truncated, browserDef, onStart, onEnd)
}

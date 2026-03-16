// Arnie TTS — Edge TTS (free neural voices via Supabase edge function) with browser fallback
//
// Strategy: Use Microsoft Edge neural voices via our arnie-tts edge function (free, unlimited,
// high quality). Falls back to browser speechSynthesis if the edge function fails.

import { supabase } from '../../../lib/supabase'

// ── Voice options ───────────────────────────────────────────────────────

// Edge TTS voices — free, neural, natural-sounding
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

// Browser voices as fallback
const BROWSER_VOICES = [
  { id: 'browser_male_1', name: 'System Male', desc: 'Built-in male voice', engine: 'browser', match: ['daniel', 'david', 'james', 'mark', 'alex', 'google us english', 'male'] },
  { id: 'browser_female_1', name: 'System Female', desc: 'Built-in female voice', engine: 'browser', match: ['samantha', 'karen', 'victoria', 'zira', 'google us english female', 'female'] },
]

// Export combined list — Edge voices first (they sound way better)
export const ARNIE_VOICES = [
  ...EDGE_VOICES,
  ...BROWSER_VOICES,
]

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
let edgeTTSFailed = false // sticky flag — if edge function is broken, stop trying

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

// ── Find best matching browser voice ────────────────────────────────────

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

// ── Edge TTS (primary — free neural voices) ────────────────────────────

async function speakEdgeTTS(text, voiceId, onStart, onEnd) {
  stopSpeaking()

  let ended = false
  const callOnEnd = () => { if (!ended) { ended = true; onEnd?.() } }

  try {
    const { data, error } = await supabase.functions.invoke('arnie-tts', {
      body: { text, voiceId },
      responseType: 'blob',
    })

    if (error) {
      console.error('[Arnie Voice] Edge TTS error:', error)
      callOnEnd()
      return false
    }

    // data should be a Blob of audio/mpeg
    const audioBlob = data instanceof Blob ? data : new Blob([data], { type: 'audio/mpeg' })
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    audio._blobUrl = audioUrl

    audio.onended = () => { URL.revokeObjectURL(audioUrl); currentAudio = null; callOnEnd() }
    audio.onerror = () => { URL.revokeObjectURL(audioUrl); currentAudio = null; callOnEnd() }

    try {
      await audio.play()
      currentAudio = audio
      onStart?.()
      return true
    } catch (playErr) {
      console.error('[Arnie Voice] Autoplay blocked:', playErr)
      URL.revokeObjectURL(audioUrl)
      callOnEnd()
      return false
    }
  } catch (err) {
    console.error('[Arnie Voice] Edge TTS failed:', err)
    callOnEnd()
    return false
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

    if (text.length > 200) {
      speakChunked(text, voice, onStart, onEnd)
      return
    }

    synth.speak(utterance)
  }

  const voices = getBrowserVoices()
  if (voices.length === 0) {
    synth.onvoiceschanged = () => {
      cachedBrowserVoices = null
      trySpeak()
    }
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
    if (idx >= merged.length || !currentUtterance) {
      callOnEnd()
      return
    }
    const utterance = new SpeechSynthesisUtterance(merged[idx])
    utterance.voice = voice
    utterance.lang = 'en-US'
    utterance.rate = 1.05
    utterance.pitch = 0.9

    utterance.onstart = () => {
      if (!started) { started = true; onStart?.() }
    }
    utterance.onend = () => {
      idx++
      speakNext()
    }
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

export async function speak(text, voiceId, onStart, onEnd) {
  const clean = stripMarkdown(text)
  if (!clean) { onEnd?.(); return }

  const truncated = clean.length > 4000 ? clean.slice(0, 4000) + '...' : clean

  const voiceDef = ARNIE_VOICES.find(v => v.id === voiceId) || ARNIE_VOICES[0]

  // Edge TTS — primary (free neural voices)
  if (voiceDef.engine === 'edge' && !edgeTTSFailed) {
    const success = await speakEdgeTTS(truncated, voiceDef.id, onStart, onEnd)
    if (success) return
    console.log('[Arnie Voice] Edge TTS failed, falling back to browser voice')
    // Don't set edgeTTSFailed on first failure — could be transient
  }

  // Browser voice fallback
  const browserDef = voiceDef.engine === 'browser' ? voiceDef : BROWSER_VOICES[0]
  speakBrowser(truncated, browserDef, onStart, onEnd)
}

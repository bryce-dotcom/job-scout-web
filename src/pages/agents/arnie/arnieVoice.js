// Arnie TTS — Browser Speech Synthesis with smart voice selection
//
// Prioritizes Google neural voices on Chrome (they sound good), falls back
// to Microsoft voices on Windows. Edge TTS via server is a future upgrade.

// ── Voice options ───────────────────────────────────────────────────────

// These match against available system voices in priority order
const VOICE_OPTIONS = [
  { id: 'voice_male_1',   name: 'Male 1',   desc: 'Best available male voice',   engine: 'browser', gender: 'male', priority: ['google uk english male', 'google us english', 'daniel', 'david', 'james', 'mark', 'alex'] },
  { id: 'voice_male_2',   name: 'Male 2',   desc: 'Alternate male voice',        engine: 'browser', gender: 'male', priority: ['google us english', 'david', 'mark', 'fred', 'tom'] },
  { id: 'voice_female_1', name: 'Female 1', desc: 'Best available female voice', engine: 'browser', gender: 'female', priority: ['google uk english female', 'google us english female', 'samantha', 'karen', 'victoria', 'zira'] },
]

export const ARNIE_VOICES = VOICE_OPTIONS

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

// ── Smart voice matching ────────────────────────────────────────────────

let cachedVoices = null
let voiceLoadAttempts = 0

function getSystemVoices() {
  if (cachedVoices && cachedVoices.length > 0) return cachedVoices
  const voices = window.speechSynthesis?.getVoices() || []
  if (voices.length > 0) cachedVoices = voices
  return voices
}

function findBestVoice(voiceDef) {
  const voices = getSystemVoices()
  if (voices.length === 0) return null

  const langVoices = voices.filter(v => v.lang.startsWith('en'))
  const priorities = voiceDef?.priority || ['google us english', 'david', 'daniel']

  // Try each priority keyword in order
  for (const kw of priorities) {
    const found = langVoices.find(v => {
      const name = v.name.toLowerCase()
      if (kw === 'male') return /\bmale\b/.test(name) && !name.includes('female')
      if (kw === 'female') return name.includes('female')
      return name.includes(kw)
    })
    if (found) {
      console.log('[Arnie Voice] Selected voice:', found.name)
      return found
    }
  }

  // Fallback: prefer Google voices (they sound better than Microsoft SAPI)
  const googleVoice = langVoices.find(v => v.name.toLowerCase().includes('google'))
  if (googleVoice) return googleVoice

  return langVoices[0] || voices[0] || null
}

// ── Speech Synthesis ────────────────────────────────────────────────────

function speakBrowser(text, voiceDef, onStart, onEnd) {
  const synth = window.speechSynthesis
  if (!synth) {
    console.warn('[Arnie Voice] speechSynthesis not available')
    onEnd?.()
    return
  }

  stopSpeaking()

  const trySpeak = () => {
    const voice = findBestVoice(voiceDef)

    // Long text: chunk it (Chrome 15s limit workaround)
    if (text.length > 200) {
      speakChunked(text, voice, onStart, onEnd)
      return
    }

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.voice = voice
    utterance.lang = 'en-US'
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.volume = 1.0

    let ended = false
    const callOnEnd = () => { if (!ended) { ended = true; currentUtterance = null; onEnd?.() } }

    utterance.onstart = () => onStart?.()
    utterance.onend = callOnEnd
    utterance.onerror = (e) => {
      if (e.error !== 'canceled') console.error('[Arnie Voice] TTS error:', e.error)
      callOnEnd()
    }

    currentUtterance = utterance
    synth.speak(utterance)
  }

  const voices = getSystemVoices()
  if (voices.length === 0 && voiceLoadAttempts < 3) {
    voiceLoadAttempts++
    synth.onvoiceschanged = () => {
      cachedVoices = null
      trySpeak()
    }
    setTimeout(trySpeak, 150)
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
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.volume = 1.0
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

export async function speak(text, voiceId, onStart, onEnd) {
  const clean = stripMarkdown(text)
  if (!clean) { onEnd?.(); return }

  const truncated = clean.length > 4000 ? clean.slice(0, 4000) + '...' : clean
  const voiceDef = ARNIE_VOICES.find(v => v.id === voiceId) || ARNIE_VOICES[0]

  speakBrowser(truncated, voiceDef, onStart, onEnd)
}

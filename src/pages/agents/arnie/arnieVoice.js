// Arnie TTS — Browser Speech Synthesis (free, unlimited) with optional ElevenLabs premium
//
// Strategy: Use the browser's built-in speechSynthesis API by default (zero cost, works
// everywhere). If a company has an ElevenLabs API key configured, offer premium voices
// as an upgrade. This scales to thousands of companies with no per-request cost.

const ELEVENLABS_API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || ''
const ELEVENLABS_BASE = 'https://api.elevenlabs.io/v1'
const ELEVENLABS_TIMEOUT_MS = 20000

// ── Voice options ───────────────────────────────────────────────────────

// Browser voices — these IDs are used to find the best match from available system voices
const BROWSER_VOICES = [
  { id: 'browser_male_1', name: 'System Male', desc: 'Default male voice', engine: 'browser', match: ['daniel', 'david', 'james', 'mark', 'alex', 'google us english', 'male'] },
  { id: 'browser_male_2', name: 'System Male 2', desc: 'Alternate male voice', engine: 'browser', match: ['fred', 'tom', 'ralph', 'male'] },
  { id: 'browser_female_1', name: 'System Female', desc: 'Default female voice', engine: 'browser', match: ['samantha', 'karen', 'victoria', 'zira', 'google us english female', 'female'] },
]

// ElevenLabs premium voices (only shown if API key exists)
const ELEVENLABS_VOICES = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', desc: 'Warm British (Premium)', engine: 'elevenlabs' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', desc: 'Deep American (Premium)', engine: 'elevenlabs' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', desc: 'Calm American (Premium)', engine: 'elevenlabs' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', desc: 'Intense (Premium)', engine: 'elevenlabs' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'Confident American (Premium)', engine: 'elevenlabs' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', desc: 'Friendly American (Premium)', engine: 'elevenlabs' },
]

// Export combined list — browser voices first, then premium if key exists
export const ARNIE_VOICES = [
  ...BROWSER_VOICES,
  ...(ELEVENLABS_API_KEY ? ELEVENLABS_VOICES : [])
]

// Default to first browser voice
const DEFAULT_VOICE_ID = 'browser_male_1'

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
let elevenlabsQuotaExceeded = false // sticky flag — don't retry ElevenLabs after quota error

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
  // Stop ElevenLabs audio
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    if (currentAudio._blobUrl) URL.revokeObjectURL(currentAudio._blobUrl)
    currentAudio = null
  }
  // Stop browser speech
  if (currentUtterance) {
    window.speechSynthesis?.cancel()
    currentUtterance = null
  }
}

export function isAvailable() {
  // Always available — browser speech works everywhere
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
      // "male" must NOT match "female" — check word boundary
      if (kw === 'male') return /\bmale\b/.test(name) && !name.includes('female')
      if (kw === 'female') return name.includes('female')
      return name.includes(kw)
    })
    if (found) return found
  }

  // Fallback: first English voice
  return langVoices[0] || voices[0] || null
}

// ── Browser Speech Synthesis ────────────────────────────────────────────

function speakBrowser(text, voiceDef, onStart, onEnd) {
  const synth = window.speechSynthesis
  if (!synth) {
    console.warn('[Arnie Voice] speechSynthesis not available')
    onEnd?.()
    return
  }

  stopSpeaking()

  // Chrome bug: voices list empty on first call. Load them.
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

    // Chrome workaround: long texts get cut off. Split into sentences if > 200 chars.
    if (text.length > 200) {
      // Chrome has a ~15s utterance limit. Use chunked approach.
      speakChunked(text, voice, onStart, onEnd)
      return
    }

    synth.speak(utterance)
  }

  const voices = getBrowserVoices()
  if (voices.length === 0) {
    // Voices not loaded yet — wait for them
    synth.onvoiceschanged = () => {
      cachedBrowserVoices = null
      trySpeak()
    }
    // Also try immediately in case they load sync
    setTimeout(trySpeak, 100)
  } else {
    trySpeak()
  }
}

// Chrome workaround: speechSynthesis silently stops after ~15 seconds.
// Split into chunks at sentence boundaries and speak sequentially.
function speakChunked(text, voice, onStart, onEnd) {
  const synth = window.speechSynthesis
  // Split at sentence boundaries
  const chunks = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [text]
  // Merge tiny chunks
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

  // Mark as active so stopSpeaking() works
  currentUtterance = { _chunked: true }
  speakNext()
}

// ── ElevenLabs (premium) ────────────────────────────────────────────────

async function speakElevenLabs(text, voiceId, onStart, onEnd) {
  stopSpeaking()

  let ended = false
  const callOnEnd = () => { if (!ended) { ended = true; onEnd?.() } }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), ELEVENLABS_TIMEOUT_MS)

    let response
    try {
      response = await fetch(
        `${ELEVENLABS_BASE}/text-to-speech/${voiceId}?optimize_streaming_latency=3`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': ELEVENLABS_API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: 'eleven_flash_v2_5',
            voice_settings: { stability: 0.45, similarity_boost: 0.78, style: 0.3, use_speaker_boost: true }
          }),
          signal: controller.signal,
        }
      )
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const errText = await response.text().catch(() => 'unknown')
      console.error('[Arnie Voice] ElevenLabs error:', response.status, errText)
      // Mark quota exhausted so we stop trying
      if (response.status === 401 || errText.includes('quota_exceeded')) {
        elevenlabsQuotaExceeded = true
        console.warn('[Arnie Voice] ElevenLabs quota exceeded — falling back to browser voice')
      }
      callOnEnd()
      return false // signal failure so caller can fallback
    }

    const audioBlob = await response.blob()
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    audio._blobUrl = audioUrl

    audio.onended = () => { URL.revokeObjectURL(audioUrl); currentAudio = null; callOnEnd() }
    audio.onerror = () => { URL.revokeObjectURL(audioUrl); currentAudio = null; callOnEnd() }

    try {
      await audio.play()
      currentAudio = audio
      onStart?.()
      return true // success
    } catch (playErr) {
      console.error('[Arnie Voice] Autoplay blocked:', playErr)
      URL.revokeObjectURL(audioUrl)
      callOnEnd()
      return false
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[Arnie Voice] ElevenLabs fetch timed out')
    } else {
      console.error('[Arnie Voice] ElevenLabs error:', err)
    }
    callOnEnd()
    return false
  }
}

// ── Main speak function ─────────────────────────────────────────────────

export async function speak(text, voiceId, onStart, onEnd) {
  const clean = stripMarkdown(text)
  if (!clean) { onEnd?.(); return }

  const truncated = clean.length > 4000 ? clean.slice(0, 4000) + '...' : clean

  // Find voice definition
  const voiceDef = ARNIE_VOICES.find(v => v.id === voiceId) || ARNIE_VOICES[0]

  // If it's an ElevenLabs voice and we have a key and quota isn't exhausted
  if (voiceDef.engine === 'elevenlabs' && ELEVENLABS_API_KEY && !elevenlabsQuotaExceeded) {
    const success = await speakElevenLabs(truncated, voiceDef.id, onStart, onEnd)
    if (success) return
    // ElevenLabs failed — fall through to browser voice
    console.log('[Arnie Voice] Falling back to browser voice')
  }

  // Browser voice (free, always works)
  speakBrowser(truncated, voiceDef.engine === 'browser' ? voiceDef : BROWSER_VOICES[0], onStart, onEnd)
}

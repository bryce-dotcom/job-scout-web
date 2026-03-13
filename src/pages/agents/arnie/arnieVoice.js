// ElevenLabs TTS for OG Arnie
// Reliability-first: AbortController timeout, guaranteed onEnd callback, safe currentAudio lifecycle.

const API_KEY = import.meta.env.VITE_ELEVENLABS_API_KEY || ''
const BASE_URL = 'https://api.elevenlabs.io/v1'

// Curated voice options — deep male voices that fit Arnie's character
export const ARNIE_VOICES = [
  { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George', desc: 'Warm, older British gentleman' },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', desc: 'Deep American, authoritative' },
  { id: 'cjVigY5qzO86Huf0OWal', name: 'Eric', desc: 'Calm, middle-aged American' },
  { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum', desc: 'Intense, transatlantic' },
  { id: 'TX3LPaxmHKxFdv7VOQHJ', name: 'Liam', desc: 'Confident, American' },
  { id: 'bIHbv24MWmeRgasZH58o', name: 'Will', desc: 'Friendly, young American' },
]

const DEFAULT_VOICE = 'pqHfZKP75CvOlQylNhV4'
const FETCH_TIMEOUT_MS = 10000

// Strip markdown for cleaner speech
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

let currentAudio = null

export function stopSpeaking() {
  if (currentAudio) {
    currentAudio.pause()
    currentAudio.currentTime = 0
    if (currentAudio._blobUrl) URL.revokeObjectURL(currentAudio._blobUrl)
    currentAudio = null
  }
}

export function isAvailable() {
  return !!API_KEY
}

export async function speak(text, voiceId, onStart, onEnd) {
  // GUARANTEE: onEnd is called on every exit path
  if (!API_KEY) {
    console.warn('[Arnie Voice] No API key — skipping TTS')
    onEnd?.()
    return
  }

  // Stop any current playback
  stopSpeaking()

  const clean = stripMarkdown(text)
  if (!clean) {
    onEnd?.()
    return
  }

  // Truncate for speed
  const truncated = clean.length > 4000 ? clean.slice(0, 4000) + '...' : clean

  // Track whether onEnd has been called to prevent double-invocation
  let ended = false
  const callOnEnd = () => {
    if (!ended) {
      ended = true
      onEnd?.()
    }
  }

  try {
    // AbortController with 10s timeout — don't hang forever if ElevenLabs is down
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS)

    let response
    try {
      response = await fetch(
        `${BASE_URL}/text-to-speech/${voiceId || DEFAULT_VOICE}?optimize_streaming_latency=3`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': API_KEY,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text: truncated,
            model_id: 'eleven_flash_v2_5',
            voice_settings: {
              stability: 0.45,
              similarity_boost: 0.78,
              style: 0.3,
              use_speaker_boost: true
            }
          }),
          signal: controller.signal,
        }
      )
    } finally {
      clearTimeout(timeoutId)
    }

    if (!response.ok) {
      const err = await response.text().catch(() => 'unknown')
      console.error('[Arnie Voice] ElevenLabs error:', response.status, err)
      callOnEnd()
      return
    }

    const audioBlob = await response.blob()
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    audio._blobUrl = audioUrl

    audio.onended = () => {
      URL.revokeObjectURL(audioUrl)
      currentAudio = null
      callOnEnd()
    }
    audio.onerror = (e) => {
      console.error('[Arnie Voice] Playback error:', e)
      URL.revokeObjectURL(audioUrl)
      currentAudio = null
      callOnEnd()
    }

    // Only set currentAudio AFTER play() succeeds — avoids dangling ref on autoplay block
    try {
      await audio.play()
      currentAudio = audio
      onStart?.()
    } catch (playErr) {
      console.error('[Arnie Voice] Autoplay blocked or play failed:', playErr)
      URL.revokeObjectURL(audioUrl)
      callOnEnd()
    }
  } catch (err) {
    if (err.name === 'AbortError') {
      console.error('[Arnie Voice] Fetch timed out after', FETCH_TIMEOUT_MS, 'ms')
    } else {
      console.error('[Arnie Voice] Error:', err)
    }
    callOnEnd()
  }
}

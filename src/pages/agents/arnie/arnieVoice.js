// ElevenLabs TTS for OG Arnie
// Uses streaming audio for fast, natural-sounding speech

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

// Default voice — Bill (deep authoritative American, closest to a wise old man)
const DEFAULT_VOICE = 'pqHfZKP75CvOlQylNhV4'

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
    currentAudio = null
  }
}

export function isAvailable() {
  return !!API_KEY
}

export async function speak(text, voiceId, onStart, onEnd) {
  if (!API_KEY) {
    console.warn('ElevenLabs: No API key — check VITE_ELEVENLABS_API_KEY in .env')
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

  console.log('[Arnie Voice] Speaking:', clean.slice(0, 60) + '...')

  try {
    const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId || DEFAULT_VOICE}`, {
      method: 'POST',
      headers: {
        'xi-api-key': API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text: clean,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.45,
          similarity_boost: 0.78,
          style: 0.3,
          use_speaker_boost: true
        }
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('[Arnie Voice] ElevenLabs error:', response.status, err)
      onEnd?.()
      return
    }

    console.log('[Arnie Voice] Audio received, playing...')
    const audioBlob = await response.blob()
    const audioUrl = URL.createObjectURL(audioBlob)
    const audio = new Audio(audioUrl)
    currentAudio = audio

    audio.onplay = () => {
      console.log('[Arnie Voice] Playing')
      onStart?.()
    }
    audio.onended = () => {
      console.log('[Arnie Voice] Finished')
      onEnd?.()
      URL.revokeObjectURL(audioUrl)
      currentAudio = null
    }
    audio.onerror = (e) => {
      console.error('[Arnie Voice] Audio playback error:', e)
      onEnd?.()
      URL.revokeObjectURL(audioUrl)
      currentAudio = null
    }

    await audio.play()
  } catch (err) {
    console.error('[Arnie Voice] Error:', err)
    onEnd?.()
  }
}

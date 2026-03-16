// Arnie TTS — Edge TTS (free Microsoft neural voices via direct WebSocket from browser)
//
// Connects directly to Bing's speech synthesis WebSocket from the client.
// No edge function needed. WebSocket is not subject to CORS.
// Falls back to browser speechSynthesis if WebSocket fails.

// ── Voice options ───────────────────────────────────────────────────────

const EDGE_VOICES = [
  { id: 'edge_andrew',  name: 'Andrew',  desc: 'Warm American male',       engine: 'edge', msVoice: 'en-US-AndrewNeural' },
  { id: 'edge_brian',   name: 'Brian',   desc: 'Friendly American male',   engine: 'edge', msVoice: 'en-US-BrianNeural' },
  { id: 'edge_guy',     name: 'Guy',     desc: 'Casual American male',     engine: 'edge', msVoice: 'en-US-GuyNeural' },
  { id: 'edge_davis',   name: 'Davis',   desc: 'Calm American male',       engine: 'edge', msVoice: 'en-US-DavisNeural' },
  { id: 'edge_eric',    name: 'Eric',    desc: 'Confident American male',  engine: 'edge', msVoice: 'en-US-EricNeural' },
  { id: 'edge_steffan', name: 'Steffan', desc: 'Professional male',        engine: 'edge', msVoice: 'en-US-SteffanNeural' },
  { id: 'edge_jenny',   name: 'Jenny',   desc: 'Warm American female',     engine: 'edge', msVoice: 'en-US-JennyNeural' },
  { id: 'edge_aria',    name: 'Aria',    desc: 'Friendly American female', engine: 'edge', msVoice: 'en-US-AriaNeural' },
]

const BROWSER_VOICES = [
  { id: 'browser_male_1', name: 'System Male', desc: 'Built-in voice (lower quality)', engine: 'browser', gender: 'male', priority: ['google uk english male', 'david', 'mark', 'daniel', 'james', 'alex'] },
  { id: 'browser_female_1', name: 'System Female', desc: 'Built-in voice (lower quality)', engine: 'browser', gender: 'female', priority: ['google uk english female', 'samantha', 'karen', 'zira', 'victoria'] },
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

function escapeXml(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function uuid() {
  return crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : (Date.now().toString(16) + Math.random().toString(16).slice(2)).slice(0, 32)
}

// ── State ───────────────────────────────────────────────────────────────

let currentAudio = null
let currentUtterance = null
let audioUnlocked = false
let edgeTTSBroken = false // sticky: if Edge TTS fails repeatedly, stop trying

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

// ── Edge TTS via WebSocket (client-side, no CORS issues) ───────────────

let edgeFailCount = 0

function edgeTTS(text, msVoice) {
  return new Promise((resolve, reject) => {
    const connId = uuid()
    const url = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connId}`

    let ws
    try {
      ws = new WebSocket(url)
    } catch (e) {
      reject(new Error('WebSocket create failed'))
      return
    }

    const audioChunks = []
    let resolved = false
    const done = (err) => {
      if (resolved) return
      resolved = true
      try { ws.close() } catch {}
      if (err) { reject(err); return }
      if (audioChunks.length === 0) { reject(new Error('No audio')); return }
      const blob = new Blob(audioChunks, { type: 'audio/mpeg' })
      resolve(blob)
    }

    ws.onopen = () => {
      const ts = new Date().toISOString()
      // Config
      ws.send(
        `X-Timestamp:${ts}\r\nContent-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n` +
        JSON.stringify({ context: { synthesis: { audio: { metadataoptions: { sentenceBoundaryEnabled: 'false', wordBoundaryEnabled: 'false' }, outputFormat: 'audio-24khz-48kbitrate-mono-mp3' } } } })
      )
      // SSML
      const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${msVoice}'><prosody pitch='+0Hz' rate='+0%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`
      ws.send(`X-RequestId:${uuid()}\r\nContent-Type:application/ssml+xml\r\nX-Timestamp:${ts}\r\nPath:ssml\r\n\r\n${ssml}`)
    }

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) done(null)
      } else if (event.data instanceof Blob) {
        // Binary blob — audio data after header. Read it.
        event.data.arrayBuffer().then(buf => {
          const view = new Uint8Array(buf)
          // Find "Path:audio\r\n" header separator
          const str = String.fromCharCode(...view.slice(0, Math.min(view.length, 500)))
          const idx = str.indexOf('Path:audio\r\n')
          if (idx >= 0) {
            const start = idx + 'Path:audio\r\n'.length
            const audio = view.slice(start)
            if (audio.length > 0) audioChunks.push(audio)
          }
        }).catch(() => {})
      } else if (event.data instanceof ArrayBuffer) {
        const view = new Uint8Array(event.data)
        const str = String.fromCharCode(...view.slice(0, Math.min(view.length, 500)))
        const idx = str.indexOf('Path:audio\r\n')
        if (idx >= 0) {
          const start = idx + 'Path:audio\r\n'.length
          const audio = view.slice(start)
          if (audio.length > 0) audioChunks.push(audio)
        }
      }
    }

    ws.onerror = () => done(new Error('WebSocket error'))
    ws.onclose = () => done(audioChunks.length > 0 ? null : new Error('Closed without audio'))

    // 15s timeout
    setTimeout(() => done(audioChunks.length > 0 ? null : new Error('Timeout')), 15000)
  })
}

async function speakEdge(text, voiceDef, onStart, onEnd) {
  stopSpeaking()
  try {
    const blob = await edgeTTS(text, voiceDef.msVoice)
    const audioUrl = URL.createObjectURL(blob)
    const audio = new Audio(audioUrl)
    audio._blobUrl = audioUrl

    let ended = false
    const callOnEnd = () => {
      if (!ended) { ended = true; URL.revokeObjectURL(audioUrl); currentAudio = null; onEnd?.() }
    }
    audio.onended = callOnEnd
    audio.onerror = () => { console.error('[Arnie Voice] Edge playback error'); callOnEnd() }

    await audio.play()
    currentAudio = audio
    onStart?.()
    edgeFailCount = 0
    return true
  } catch (err) {
    console.error('[Arnie Voice] Edge TTS failed:', err.message)
    edgeFailCount++
    if (edgeFailCount >= 3) {
      edgeTTSBroken = true
      console.warn('[Arnie Voice] Edge TTS disabled after 3 failures')
    }
    return false // NO onEnd — caller handles fallback
  }
}

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

  const trySpeak = () => {
    const voice = findBestVoice(voiceDef)
    if (text.length > 200) { speakChunked(text, voice, onStart, onEnd); return }

    const u = new SpeechSynthesisUtterance(text)
    u.voice = voice; u.lang = 'en-US'; u.rate = 1.0; u.pitch = 1.0
    let ended = false
    const callOnEnd = () => { if (!ended) { ended = true; currentUtterance = null; onEnd?.() } }
    u.onstart = () => onStart?.()
    u.onend = callOnEnd
    u.onerror = (e) => { if (e.error !== 'canceled') console.error('[Arnie Voice] TTS error:', e.error); callOnEnd() }
    currentUtterance = u
    synth.speak(u)
  }

  if (getSystemVoices().length === 0) {
    synth.onvoiceschanged = () => { cachedVoices = null; trySpeak() }
    setTimeout(trySpeak, 150)
  } else {
    trySpeak()
  }
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
    u.voice = voice; u.lang = 'en-US'; u.rate = 1.0; u.pitch = 1.0
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

export async function speak(text, voiceId, onStart, onEnd) {
  const callId = ++speakCallId
  const clean = stripMarkdown(text)
  if (!clean) { onEnd?.(); return }
  const truncated = clean.length > 3000 ? clean.slice(0, 3000) + '...' : clean
  const voiceDef = ARNIE_VOICES.find(v => v.id === voiceId) || ARNIE_VOICES[0]

  console.log(`[Arnie Voice] speak #${callId} engine=${voiceDef.engine} voice=${voiceDef.name}`)

  // Try Edge TTS (neural voices via WebSocket)
  if (voiceDef.engine === 'edge' && !edgeTTSBroken) {
    const ok = await speakEdge(truncated, voiceDef, onStart, onEnd)
    if (ok) {
      console.log(`[Arnie Voice] speak #${callId} → Edge TTS playing`)
      return
    }
    console.warn(`[Arnie Voice] speak #${callId} → Edge TTS failed, using browser`)
  }

  // Browser fallback
  const bDef = voiceDef.engine === 'browser' ? voiceDef : BROWSER_VOICES[0]
  speakBrowser(truncated, bDef, onStart, onEnd)
  console.log(`[Arnie Voice] speak #${callId} → Browser TTS started`)
}

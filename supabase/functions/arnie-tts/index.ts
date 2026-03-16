import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Edge TTS — uses Microsoft's free neural TTS API (same voices as Edge browser)
// No API key needed. Completely free, unlimited, high quality neural voices.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// Microsoft Edge TTS voices — natural sounding neural voices
const VOICE_MAP: Record<string, string> = {
  'edge_guy':      'en-US-GuyNeural',
  'edge_andrew':   'en-US-AndrewNeural',
  'edge_brian':    'en-US-BrianNeural',
  'edge_davis':    'en-US-DavisNeural',
  'edge_eric':     'en-US-EricNeural',
  'edge_jenny':    'en-US-JennyNeural',
  'edge_aria':     'en-US-AriaNeural',
  'edge_steffan':  'en-US-SteffanNeural',
}

const TRUSTED_TOKEN_URL = 'https://dev.virtualearth.net/REST/v1/Locations'

async function getEdgeTTSAudio(text: string, voiceId: string): Promise<ArrayBuffer> {
  const voice = VOICE_MAP[voiceId] || 'en-US-AndrewNeural'

  // Edge TTS uses WebSocket protocol to the speech service
  // We'll use the REST endpoint instead for simplicity
  const url = `https://eastus.api.cognitive.microsoft.com/sts/v1.0/issuetoken`

  // Use the free edge TTS approach via the speech synthesis API
  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='en-US'>
    <voice name='${voice}'>
      <prosody rate='+5%' pitch='-2%'>${escapeXml(text)}</prosody>
    </voice>
  </speak>`

  // Direct speech synthesis endpoint (used by Edge browser — no key required)
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${crypto.randomUUID().replace(/-/g, '')}`

  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl)
    const audioChunks: Uint8Array[] = []
    let headerSent = false

    ws.onopen = () => {
      // Send config
      ws.send(`Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`)

      // Send SSML
      const requestId = crypto.randomUUID().replace(/-/g, '')
      ws.send(`X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`)
    }

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        if (event.data.includes('Path:turn.end')) {
          ws.close()
        }
      } else if (event.data instanceof ArrayBuffer || event.data instanceof Blob) {
        // Binary message — extract audio after the header
        const handler = async () => {
          let buffer: ArrayBuffer
          if (event.data instanceof Blob) {
            buffer = await event.data.arrayBuffer()
          } else {
            buffer = event.data
          }
          const view = new Uint8Array(buffer)
          // Find the header separator (two CRLF)
          const headerEnd = findHeaderEnd(view)
          if (headerEnd > 0) {
            audioChunks.push(view.slice(headerEnd))
          }
        }
        handler().catch(console.error)
      }
    }

    ws.onclose = () => {
      if (audioChunks.length === 0) {
        reject(new Error('No audio received from Edge TTS'))
        return
      }
      // Combine chunks
      const totalLength = audioChunks.reduce((sum, chunk) => sum + chunk.length, 0)
      const combined = new Uint8Array(totalLength)
      let offset = 0
      for (const chunk of audioChunks) {
        combined.set(chunk, offset)
        offset += chunk.length
      }
      resolve(combined.buffer)
    }

    ws.onerror = (err) => {
      reject(new Error('Edge TTS WebSocket error'))
    }

    // Timeout after 15s
    setTimeout(() => {
      try { ws.close() } catch {}
      reject(new Error('Edge TTS timeout'))
    }, 15000)
  })
}

function findHeaderEnd(data: Uint8Array): number {
  // Look for the pattern "Path:audio\r\n" followed by the binary data
  // The header ends after the second \r\n after "Path:audio"
  const text = new TextDecoder().decode(data.slice(0, Math.min(data.length, 500)))
  const idx = text.indexOf('Path:audio\r\n')
  if (idx === -1) return -1
  return idx + 'Path:audio\r\n'.length
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { text, voiceId } = await req.json()

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Truncate to 3000 chars for speed
    const truncated = text.length > 3000 ? text.slice(0, 3000) + '...' : text

    const audioBuffer = await getEdgeTTSAudio(truncated, voiceId || 'edge_andrew')

    return new Response(audioBuffer, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-cache',
      },
    })
  } catch (err) {
    console.error('[arnie-tts] Error:', err)
    return new Response(
      JSON.stringify({ error: err.message || 'TTS failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

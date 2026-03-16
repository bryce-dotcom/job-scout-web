import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Edge TTS — Microsoft's free neural TTS via WebSocket
// Returns base64-encoded MP3 in JSON to avoid content-type issues with supabase.functions.invoke

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

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

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function makeTimestamp(): string {
  return new Date().toISOString()
}

function makeRequestId(): string {
  return crypto.randomUUID().replace(/-/g, '')
}

async function getEdgeTTSAudio(text: string, voiceId: string): Promise<Uint8Array> {
  const voice = VOICE_MAP[voiceId] || 'en-US-AndrewNeural'
  const connId = makeRequestId()
  const wsUrl = `wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1?TrustedClientToken=6A5AA1D4EAFF4E9FB37E23D68491D6F4&ConnectionId=${connId}`

  const ssml = `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xmlns:mstts='https://www.w3.org/2001/mstts' xml:lang='en-US'><voice name='${voice}'><prosody pitch='+0Hz' rate='+5%' volume='+0%'>${escapeXml(text)}</prosody></voice></speak>`

  return new Promise<Uint8Array>((resolve, reject) => {
    let ws: WebSocket
    try {
      ws = new WebSocket(wsUrl)
    } catch (e) {
      reject(new Error('WebSocket connection failed: ' + (e as Error).message))
      return
    }

    const audioChunks: Uint8Array[] = []
    let resolved = false

    const cleanup = () => {
      try { ws.close() } catch {}
    }

    ws.onopen = () => {
      const ts = makeTimestamp()
      // Send config
      ws.send(
        `X-Timestamp:${ts}\r\n` +
        `Content-Type:application/json; charset=utf-8\r\n` +
        `Path:speech.config\r\n\r\n` +
        `{"context":{"synthesis":{"audio":{"metadataoptions":{"sentenceBoundaryEnabled":"false","wordBoundaryEnabled":"false"},"outputFormat":"audio-24khz-48kbitrate-mono-mp3"}}}}`
      )

      // Send SSML request
      const reqId = makeRequestId()
      ws.send(
        `X-RequestId:${reqId}\r\n` +
        `Content-Type:application/ssml+xml\r\n` +
        `X-Timestamp:${ts}\r\n` +
        `Path:ssml\r\n\r\n` +
        ssml
      )
    }

    ws.onmessage = async (event) => {
      if (typeof event.data === 'string') {
        // Text message — check for turn.end
        if (event.data.includes('Path:turn.end')) {
          resolved = true
          cleanup()
          if (audioChunks.length === 0) {
            reject(new Error('No audio chunks received'))
            return
          }
          // Combine chunks
          const totalLen = audioChunks.reduce((s, c) => s + c.length, 0)
          const combined = new Uint8Array(totalLen)
          let offset = 0
          for (const chunk of audioChunks) {
            combined.set(chunk, offset)
            offset += chunk.length
          }
          resolve(combined)
        }
      } else {
        // Binary message — contains audio data after a header
        try {
          let buffer: ArrayBuffer
          if (event.data instanceof Blob) {
            buffer = await event.data.arrayBuffer()
          } else {
            buffer = event.data as ArrayBuffer
          }
          const view = new Uint8Array(buffer)

          // Header format: "X-RequestId:...\r\nPath:audio\r\n"
          // Find "Path:audio\r\n" and skip past it
          const headerStr = new TextDecoder().decode(view.slice(0, Math.min(view.length, 500)))
          const pathIdx = headerStr.indexOf('Path:audio\r\n')
          if (pathIdx >= 0) {
            const audioStart = pathIdx + 'Path:audio\r\n'.length
            // The header is text but encoded in the binary. We need byte offset.
            // Since the header is ASCII, char count == byte count
            const audioBytes = view.slice(audioStart)
            if (audioBytes.length > 0) {
              audioChunks.push(audioBytes)
            }
          }
        } catch (e) {
          console.error('[arnie-tts] Error processing binary message:', e)
        }
      }
    }

    ws.onerror = () => {
      if (!resolved) {
        resolved = true
        reject(new Error('WebSocket error'))
      }
    }

    ws.onclose = () => {
      if (!resolved) {
        resolved = true
        if (audioChunks.length > 0) {
          const totalLen = audioChunks.reduce((s, c) => s + c.length, 0)
          const combined = new Uint8Array(totalLen)
          let offset = 0
          for (const chunk of audioChunks) {
            combined.set(chunk, offset)
            offset += chunk.length
          }
          resolve(combined)
        } else {
          reject(new Error('WebSocket closed with no audio'))
        }
      }
    }

    // 20s timeout
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        cleanup()
        if (audioChunks.length > 0) {
          // Return what we have
          const totalLen = audioChunks.reduce((s, c) => s + c.length, 0)
          const combined = new Uint8Array(totalLen)
          let offset = 0
          for (const chunk of audioChunks) {
            combined.set(chunk, offset)
            offset += chunk.length
          }
          resolve(combined)
        } else {
          reject(new Error('Edge TTS timeout'))
        }
      }
    }, 20000)
  })
}

// Encode Uint8Array to base64
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
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

    const truncated = text.length > 3000 ? text.slice(0, 3000) + '...' : text
    const audioBytes = await getEdgeTTSAudio(truncated, voiceId || 'edge_andrew')
    const base64Audio = uint8ToBase64(audioBytes)

    return new Response(
      JSON.stringify({ audio: base64Audio }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    console.error('[arnie-tts] Error:', err)
    return new Response(
      JSON.stringify({ error: (err as Error).message || 'TTS failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// ElevenLabs, once. marketing-voice (narration under a video) and arnie-tts
// (Arnie speaking) both talk to it through here, so the key check, the
// voice list and the synthesis call are one rule.
//
// Secret: ELEVENLABS_API_KEY — a real key starts with sk_. A key ID (what
// sat in .env until 2026-10-02) is refused by ElevenLabs with
// api_key_id_used_as_api_key. Permissions on the key decide what works:
// Text to Speech is enough to speak; Voices (read) is needed to list the
// account's My Voices (otherwise callers get the stock table below).

export interface Voice { id: string; name: string; category: string; preview_url: string | null }

// Stock premade voices, by name. Bill narrates the walkthrough videos
// (scripts/generate-walkthrough-audio.cjs uses the same ids).
export const STOCK_VOICES: Record<string, string> = {
  Bill: 'pqHfZKP75CvOlQylNhV4',
  Rachel: '21m00Tcm4TlvDq8ikWAM',
  Adam: 'pNInz6obpgDQGcFmaJgB',
  Sarah: 'EXAVITQu4vr4xnSDxMaL',
  Brian: 'nPczCjzI2devNBz1zQrb',
  Drew: '29vD33N1CtxCmqQRPOHJ',
  Antoni: 'ErXwobaYiN019PkySvjV',
  Domi: 'AZnzlk1XvdvUeBnXmlld',
  Charlie: 'IKne3meq5aSn9XLyUdCD',
}
export const MODEL = 'eleven_flash_v2_5'

export const stockList = (): Voice[] =>
  Object.entries(STOCK_VOICES).map(([name, id]) => ({ id, name, category: 'premade', preview_url: null }))

export const isVoiceId = (v: string) => /^[A-Za-z0-9]{15,40}$/.test(v)

/** The server key, or null when unset or not a real key. */
export function elevenKey(): string | null {
  const k = Deno.env.get('ELEVENLABS_API_KEY') || ''
  return k.startsWith('sk_') ? k : null
}

/** My Voices on the account — library picks and clones first, premade after. null when the key cannot read voices. */
export async function listVoices(key: string): Promise<Voice[] | null> {
  try {
    const r = await fetch('https://api.elevenlabs.io/v1/voices?show_legacy=false', { headers: { 'xi-api-key': key } })
    if (!r.ok) return null
    const j = await r.json()
    const rank = (c: string) => (c === 'premade' ? 1 : 0)
    const voices: Voice[] = (j.voices || [])
      .map((v: Record<string, unknown>) => ({
        id: String(v.voice_id),
        name: String(v.name || v.voice_id),
        category: String(v.category || ''),
        preview_url: (v.preview_url as string) || null,
      }))
      .sort((a: Voice, b: Voice) => rank(a.category) - rank(b.category) || a.name.localeCompare(b.name))
    return voices.length ? voices : null
  } catch {
    return null
  }
}

/** A voice by name, case-insensitive ("Arnie"). */
export const findVoiceNamed = (voices: Voice[] | null, name: string) =>
  (voices || []).find((v) => v.name.trim().toLowerCase() === name.trim().toLowerCase()) || null

/** A stock name or a voice id → the id to speak with. Unknown → Bill. */
export function resolveVoiceId(asked: string): string {
  return STOCK_VOICES[asked] || (isVoiceId(asked) ? asked : STOCK_VOICES.Bill)
}

/** Text → mp3 bytes. Throws with ElevenLabs' status and message. */
export async function synthesize(key: string, voiceId: string, text: string, opts: { format?: string; stability?: number; style?: number } = {}): Promise<Uint8Array> {
  const format = opts.format || 'mp3_44100_128'
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}?output_format=${format}`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({
      text,
      model_id: MODEL,
      voice_settings: { stability: opts.stability ?? 0.45, similarity_boost: 0.8, style: opts.style ?? 0.2, use_speaker_boost: true },
    }),
  })
  if (!r.ok) throw new Error(`The voice service refused (${r.status}): ${(await r.text()).slice(0, 300)}`)
  return new Uint8Array(await r.arrayBuffer())
}

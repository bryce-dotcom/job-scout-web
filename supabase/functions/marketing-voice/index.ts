// marketing-voice: a voiceover for an AI video.
//
// Text in, an mp3 in the public media bucket out. ElevenLabs reads it
// (the same voices the walkthrough narration uses). The browser mixes the
// file under the video; the server never touches video.
//
// Body: { text, voice?: 'Bill'|'Rachel'|'Adam'|'Sarah'|'Brian'|'Drew'|'Antoni'|'Domi'|'Charlie', brand? }
// Reply: { ok, url, bytes, voice }   or   { ok:false, error, needs_key:true } when no key is set.
//
// Secret: ELEVENLABS_API_KEY (a real key, starts with sk_). The value in the
// repo's .env on 2026-10-02 was a key ID and does not work.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// Same table as scripts/generate-walkthrough-audio.cjs. Bill is the house voice.
export const VOICES: Record<string, string> = {
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
const MODEL = 'eleven_flash_v2_5'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller?.companyId) return json({ ok: false, error: 'Sign in first.' }, 401)
    const body = await req.json().catch(() => ({}))

    if (body.action === 'status') {
      const key = Deno.env.get('ELEVENLABS_API_KEY') || ''
      return json({ ok: true, available: key.startsWith('sk_'), voices: Object.keys(VOICES) })
    }

    const key = Deno.env.get('ELEVENLABS_API_KEY') || ''
    if (!key.startsWith('sk_')) return json({ ok: false, needs_key: true, error: 'Voiceover needs an ElevenLabs API key on the server (ELEVENLABS_API_KEY, starts with sk_).' }, 400)
    const text = String(body.text || '').trim().slice(0, 1200)
    if (!text) return json({ ok: false, error: 'Nothing to say.' }, 400)
    const voiceName = VOICES[String(body.voice || '')] ? String(body.voice) : 'Bill'

    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${VOICES[voiceName]}?output_format=mp3_44100_128`, {
      method: 'POST',
      headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify({ text, model_id: MODEL, voice_settings: { stability: 0.45, similarity_boost: 0.8, style: 0.2, use_speaker_boost: true } }),
    })
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300)
      return json({ ok: false, error: `The voice service refused (${r.status}): ${detail}` }, 502)
    }
    const bytes = new Uint8Array(await r.arrayBuffer())
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const path = `${caller.companyId}/voice/${Date.now()}_${voiceName.toLowerCase()}.mp3`
    const { error } = await sb.storage.from('marketing-media').upload(path, bytes, { contentType: 'audio/mpeg', upsert: false })
    if (error) return json({ ok: false, error: error.message }, 500)
    const { data: pub } = sb.storage.from('marketing-media').getPublicUrl(path)
    return json({ ok: true, url: pub.publicUrl, bytes: bytes.byteLength, voice: voiceName, path })
  } catch (err) {
    console.error('[marketing-voice]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Voice failed' }, 500)
  }
})

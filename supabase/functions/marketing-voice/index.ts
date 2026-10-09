// marketing-voice: a voiceover for an AI video.
//
// Text in, an mp3 in the public media bucket out. ElevenLabs reads it
// (the same voices the walkthrough narration uses). The browser mixes the
// file under the video; the server never touches video.
//
// Body: { text, voice?: a stock name ('Bill'…) or an ElevenLabs voice_id, brand? }
// Reply: { ok, url, bytes, voice }   or   { ok:false, error, needs_key:true } when no key is set.
//
// { action:'status' } → { ok, available, voices:[{id,name,category,preview_url}], from:'account'|'stock' }.
// With a key that has Voices (read), the list is the account's My Voices
// (library picks and clones first, premade after); a text-to-speech-only
// key gets the stock table below.
//
// Secret: ELEVENLABS_API_KEY (a real key, starts with sk_). The value in the
// repo's .env on 2026-10-02 was a key ID and does not work.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'
import { stockList, elevenKey, listVoices, resolveVoiceId, synthesize, STOCK_VOICES as VOICES } from '../_shared/elevenlabs.ts'
import { checkCap, capMessage, recordMediaUsage, MEDIA_PRICES } from '../_shared/mediaMeter.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })


serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller?.companyId) return json({ ok: false, error: 'Sign in first.' }, 401)
    const body = await req.json().catch(() => ({}))

    if (body.action === 'status') {
      const key = elevenKey()
      const account = key ? await listVoices(key) : null
      const voices = [...(account || stockList())]
      // The company's own Arnie voice (settings arnie_voice.voice_id) leads the list
      // when the key cannot read the account's voices.
      try {
        const sb0 = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
        const { data: row } = await sb0.from('settings').select('value').eq('company_id', caller.companyId).eq('key', 'arnie_voice').limit(1).maybeSingle()
        let cfg: Record<string, unknown> = {}
        if (row?.value && typeof row.value === 'object') cfg = row.value as Record<string, unknown>
        else if (typeof row?.value === 'string') { try { cfg = JSON.parse(row.value) } catch { cfg = {} } }
        const v = cfg.voice_id
        if (typeof v === 'string' && !voices.some((x) => x.id === v)) voices.unshift({ id: v, name: 'Arnie', category: 'pinned', preview_url: null })
      } catch { /* no pin */ }
      const cap = await checkCap({ supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY }, caller.companyId, 'voice', 0)
      return json({ ok: true, available: !!key, voices, from: account ? 'account' : 'stock', used_chars: cap.used, cap_chars: cap.cap })
    }

    const key = elevenKey()
    if (!key) return json({ ok: false, needs_key: true, error: 'Voiceover needs an ElevenLabs API key on the server (ELEVENLABS_API_KEY, starts with sk_).' }, 400)
    const text = String(body.text || '').trim().slice(0, 1200)
    if (!text) return json({ ok: false, error: 'Nothing to say.' }, 400)
    const asked = String(body.voice || '')
    const voiceId = resolveVoiceId(asked)
    const meterEnv = { supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY }
    const cap = await checkCap(meterEnv, caller.companyId, 'voice', text.length)
    if (!cap.allowed) return json({ ok: false, capped: true, used: cap.used, cap: cap.cap, error: capMessage(cap, 'voice') }, 429)
    const voiceName = Object.keys(VOICES).find((n) => VOICES[n] === voiceId) || asked.slice(0, 24) || 'voice'

    let bytes: Uint8Array
    try { bytes = await synthesize(key, voiceId, text) } catch (e) { return json({ ok: false, error: (e as Error).message }, 502) }
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const path = `${caller.companyId}/voice/${Date.now()}_${voiceName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.mp3`
    const { error } = await sb.storage.from('marketing-media').upload(path, bytes, { contentType: 'audio/mpeg', upsert: false })
    if (error) return json({ ok: false, error: error.message }, 500)
    const { data: pub } = sb.storage.from('marketing-media').getPublicUrl(path)
    await recordMediaUsage(meterEnv, { companyId: caller.companyId, kind: 'voice', model: 'eleven_flash_v2_5', units: text.length, costUsd: text.length * MEDIA_PRICES.voice_per_char })
    return json({ ok: true, url: pub.publicUrl, bytes: bytes.byteLength, voice: voiceName, path })
  } catch (err) {
    console.error('[marketing-voice]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Voice failed' }, 500)
  }
})

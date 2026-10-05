// marketing-music: a real track under a marketing video.
//
// ElevenLabs Music composes it (POST /v1/music; commercially cleared for
// online use on paid plans), the mp3 lands in marketing-media/<co>/music/,
// and a marketing_music row keeps it so the next video can reuse it.
// The browser mixes it under the picture and the narrator; the server
// never touches video.
//
// Body:
//   { action:'status' }                        → { ok, available }
//   { action:'list' }                          → { ok, tracks:[row…] }
//   { action:'compose', prompt?, mood?, seconds, title?, brand? } → { ok, track:row }
//   { action:'delete', id }                    → { ok }
// A key without the music_generation permission → { ok:false, needs_permission:true }.
//
// Secret: ELEVENLABS_API_KEY — the same key Arnie and the narrator use;
// it needs the Music permission ticked in ElevenLabs.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'
import { elevenKey } from '../_shared/elevenlabs.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

// What each mood asks for. The brand's tone words and the video's line are
// folded in; "instrumental, no vocals" is non-negotiable under a narrator.
export const MOOD_PROMPT: Record<string, string> = {
  calm: 'Warm, understated instrumental: acoustic guitar and soft piano over light brushed percussion, 80 to 90 bpm, modern and clean, gentle build, no vocals.',
  upbeat: 'Bright, optimistic instrumental: clean electric guitar, hand claps, a driving but friendly beat, 110 to 120 bpm, indie-pop energy, no vocals.',
  bold: 'Confident cinematic instrumental: deep drums, low synth pulses, a rising motif, 90 to 100 bpm, modern trailer feel without aggression, no vocals.',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller?.companyId) return json({ ok: false, error: 'Sign in first.' }, 401)
    const body = await req.json().catch(() => ({}))
    const key = elevenKey()
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })

    if (body.action === 'status') return json({ ok: true, available: !!key })

    if (body.action === 'list') {
      const { data, error } = await sb.from('marketing_music').select('*').eq('company_id', caller.companyId).order('created_at', { ascending: false }).limit(100)
      if (error) return json({ ok: false, error: error.message }, 500)
      return json({ ok: true, tracks: data || [] })
    }

    if (body.action === 'delete') {
      const id = Number(body.id)
      const { data: row } = await sb.from('marketing_music').select('id, path').eq('company_id', caller.companyId).eq('id', id).maybeSingle()
      if (!row) return json({ ok: false, error: 'No such track.' }, 404)
      await sb.storage.from('marketing-media').remove([row.path])
      await sb.from('marketing_music').delete().eq('id', id)
      return json({ ok: true })
    }

    if (body.action === 'compose') {
      if (!key) return json({ ok: false, needs_key: true, error: 'Music needs the ElevenLabs key on the server.' }, 400)
      const seconds = Math.max(3, Math.min(120, Math.round(Number(body.seconds) || 30)))
      const mood = ['calm', 'upbeat', 'bold'].includes(body.mood) ? body.mood : 'custom'
      const asked = String(body.prompt || '').trim().slice(0, 1500)
      const brand = typeof body.brand === 'string' ? body.brand : ''
      const kitKey = brand ? `marketing_brand_kit:${brand}` : 'marketing_brand_kit'
      const { data: kitRows } = await sb.from('settings').select('value').eq('company_id', caller.companyId).eq('key', kitKey).limit(1)
      let kit: Record<string, unknown> = {}
      const raw = kitRows?.[0]?.value
      if (raw && typeof raw === 'object') kit = raw as Record<string, unknown>
      else if (typeof raw === 'string') { try { kit = JSON.parse(raw) } catch { kit = {} } }
      const tone = Array.isArray(kit.tone_words) ? (kit.tone_words as string[]).slice(0, 4).join(', ') : ''
      const prompt = [
        asked || MOOD_PROMPT[mood] || MOOD_PROMPT.calm,
        tone ? `The brand sounds ${tone}.` : '',
        `A ${seconds}-second bed for a short social-media video; starts right away, clean natural ending, no vocals, no lyrics, no spoken words.`,
      ].filter(Boolean).join(' ')

      const r = await fetch('https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128', {
        method: 'POST',
        headers: { 'xi-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, music_length_ms: seconds * 1000, force_instrumental: true }),
      })
      if (!r.ok) {
        const detail = (await r.text()).slice(0, 400)
        if (r.status === 401 && /music_generation|missing_permissions/.test(detail)) return json({ ok: false, needs_permission: true, error: 'The ElevenLabs key needs the Music permission. In ElevenLabs: API Keys, edit the key, tick Music.' }, 400)
        return json({ ok: false, error: `The composer refused (${r.status}): ${detail}` }, 502)
      }
      const bytes = new Uint8Array(await r.arrayBuffer())
      const title = String(body.title || '').trim().slice(0, 80) || `${mood === 'custom' ? 'Custom' : mood[0].toUpperCase() + mood.slice(1)} · ${seconds}s · ${new Date().toISOString().slice(0, 10)}`
      const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'track'
      const path = `${caller.companyId}/music/${Date.now()}_${slug}.mp3`
      const { error: upErr } = await sb.storage.from('marketing-media').upload(path, bytes, { contentType: 'audio/mpeg', upsert: false })
      if (upErr) return json({ ok: false, error: upErr.message }, 500)
      const { data: pub } = sb.storage.from('marketing-media').getPublicUrl(path)
      const { data: row, error: dbErr } = await sb.from('marketing_music').insert({
        company_id: caller.companyId, title, prompt, mood, url: pub.publicUrl, path, seconds, source: 'eleven', created_by: caller.employeeId,
      }).select('*').single()
      if (dbErr) return json({ ok: false, error: dbErr.message }, 500)
      return json({ ok: true, track: row, bytes: bytes.byteLength })
    }

    return json({ ok: false, error: 'Unknown action.' }, 400)
  } catch (err) {
    console.error('[marketing-music]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Music failed' }, 500)
  }
})

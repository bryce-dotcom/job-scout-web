import "jsr:@supabase/functions-js/edge-runtime.d.ts"

// Arnie's voice.
//
// ONE engine, as of 2026-10-13:
//   eleven:<id> ElevenLabs — Arnie's OWN voice. The account was opened for
//               Arnie; a voice named "Arnie" in My Voices is him. On for every
//               tenant since 2026-10-11 (Microsoft's free voices died; Bryce:
//               "turn eleven labs on for everyone"); mediaMeter caps a tenant's
//               month, the platform company is uncapped, and a tenant can be
//               switched off with settings arnie_voice = { enabled: false }.
//               Identity comes from the login token.
//
// Microsoft's free voices were still wired up as a fallback here a day after
// being declared dead, and that fallback was what answered a request for
// edge_jenny: 500, "WebSocket error". Anything that is not an eleven: id is
// now mapped to a real voice of the same gender instead — see LEGACY_GENDER.
//
// Returns base64 mp3 in JSON so supabase.functions.invoke is happy.
// { action: 'voices' } → { available, allowed, voices, arnie } for the picker.

import { resolveCaller } from '../_shared/auth.ts'
import { elevenKey, listVoices, stockList, findVoiceNamed, isVoiceId, synthesize } from '../_shared/elevenlabs.ts'
import { checkCap, capMessage, recordMediaUsage, MEDIA_PRICES } from '../_shared/mediaMeter.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

async function rest<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } })
    return r.ok ? await r.json() : null
  } catch { return null }
}

// May this company spend ElevenLabs credits on Arnie? Yes unless switched off; the cap is in mediaMeter.
async function elevenAllowed(companyId: number | null): Promise<{ allowed: boolean; voiceId: string | null }> {
  if (!companyId) return { allowed: false, voiceId: null }
  const [co, st] = await Promise.all([
    rest<Array<{ is_platform: boolean }>>(`companies?select=is_platform&id=eq.${companyId}&limit=1`),
    rest<Array<{ value: unknown }>>(`settings?select=value&company_id=eq.${companyId}&key=eq.arnie_voice&limit=1`),
  ])
  let cfg: Record<string, unknown> = {}
  const raw = st?.[0]?.value
  if (raw && typeof raw === 'object') cfg = raw as Record<string, unknown>
  else if (typeof raw === 'string') { try { cfg = JSON.parse(raw) } catch { cfg = {} } }
  const allowed = co?.[0]?.is_platform === true || cfg.enabled !== false
  const voiceId = typeof cfg.voice_id === 'string' && isVoiceId(cfg.voice_id) ? cfg.voice_id : null
  return { allowed, voiceId }
}

const jsonRes = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// The eight free Microsoft voices (edge_andrew … edge_jenny) are gone. The
// socket they came from no longer opens — from a browser OR from here,
// checked against production on 2026-10-13: it answered 500 "WebSocket
// error" for every one of them. The 170 lines that tried are deleted.
//
// The ids survive as a GENDER, for one reason: a phone running a service
// worker can serve last week's bundle for days, and that bundle still asks
// for edge_jenny. Rather than fail, or answer in a man's voice, such a
// request is spoken by a real voice of the gender that was asked for. The
// app-side twin of this is VOICE_WISH in src/pages/agents/arnie/arnieVoice.js.
const LEGACY_GENDER: Record<string, 'male' | 'female'> = {
  edge_jenny: 'female', edge_aria: 'female', voice_female: 'female',
  edge_andrew: 'male', edge_brian: 'male', edge_guy: 'male',
  edge_davis: 'male', edge_eric: 'male', edge_steffan: 'male', voice_male: 'male',
}

const FEMALE_NAMES = ['alice', 'bella', 'jessica', 'laura', 'lily', 'matilda', 'sarah', 'rachel', 'domi', 'charlotte', 'dorothy', 'elli', 'freya', 'gigi', 'glinda', 'grace', 'jenny', 'aria', 'emily', 'nicole', 'serena', 'mimi', 'joanne']
const MALE_NAMES = ['adam', 'antoni', 'arnold', 'arnie', 'bill', 'brian', 'callum', 'charlie', 'chris', 'clyde', 'daniel', 'dave', 'drew', 'eric', 'ethan', 'george', 'giovanni', 'harry', 'james', 'jeremy', 'joseph', 'josh', 'liam', 'michael', 'patrick', 'paul', 'roger', 'sam', 'thomas', 'will', 'bryce', 'jay']
// Closest in character to what was retired, best first.
const PREFERRED: Record<string, string[]> = {
  female: ['jessica', 'bella', 'sarah', 'laura', 'lily'],
  male: ['brian', 'eric', 'chris', 'roger', 'bill'],
}

function genderOfName(name: string): 'male' | 'female' | null {
  const first = String(name || '').trim().toLowerCase().split(/[^a-z]+/)[0]
  if (FEMALE_NAMES.includes(first)) return 'female'
  if (MALE_NAMES.includes(first)) return 'male'
  return null
}

/** A retired voice id → a real voice of the same gender, or null if there is none. */
function legacyToEleven(voiceId: string, voices: { id: string; name: string }[]): string | null {
  const want = LEGACY_GENDER[voiceId]
  if (!want) return null
  const pool = voices.filter((v) => genderOfName(v.name) === want)
  for (const liked of PREFERRED[want] || []) {
    const hit = pool.find((v) => v.name.trim().toLowerCase().startsWith(liked))
    if (hit) return hit.id
  }
  return pool[0]?.id || null
}

// Encode Uint8Array to base64

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
    const body = await req.json()
    const { text, voiceId } = body

    if (body.action === 'voices') {
      const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
      const key = elevenKey()
      const { allowed, voiceId: pinned } = await elevenAllowed(caller?.companyId ?? null)
      const account = key && allowed ? await listVoices(key) : null
      const voices = key && allowed ? [...(account || stockList())] : []
      const arnie = pinned || findVoiceNamed(account, 'Arnie')?.id || null
      // A voice pinned in settings (made in ElevenLabs, id pasted) may be
      // missing from a list the key cannot read; put him at the front.
      if (arnie && voices.length && !voices.some((v) => v.id === arnie)) voices.unshift({ id: arnie, name: 'Arnie', category: 'pinned', preview_url: null })
      return jsonRes({ available: !!key, allowed, from: account ? 'account' : 'stock', voices, arnie })
    }

    if (!text || typeof text !== 'string') {
      return new Response(
        JSON.stringify({ error: 'text is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const truncated = text.length > 3000 ? text.slice(0, 3000) + '...' : text

    const key = elevenKey()
    if (!key) return jsonRes({ error: 'ElevenLabs is not set up on the server.' }, 400)
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    const { allowed } = await elevenAllowed(caller?.companyId ?? null)
    if (!allowed) return jsonRes({ error: 'This company is not set up for ElevenLabs voices.' }, 403)

    // One path to one engine. A retired id (or a wish like voice_female) from
    // a stale app bundle is spoken by a real voice of the gender asked for,
    // because answering a woman's name in a man's voice is the bug this whole
    // change is about.
    let id: string
    if (typeof voiceId === 'string' && voiceId.startsWith('eleven:')) {
      id = voiceId.slice('eleven:'.length)
    } else {
      const account = await listVoices(key)
      const pool = account || stockList()
      const mapped = legacyToEleven(typeof voiceId === 'string' ? voiceId : '', pool)
      id = mapped || findVoiceNamed(account, 'Arnie')?.id || pool[0]?.id || ''
    }
    if (!isVoiceId(id)) return jsonRes({ error: 'Unknown voice.' }, 400)

    const meterEnv = { supabaseUrl: SUPABASE_URL, serviceKey: SERVICE_KEY }
    const cap = await checkCap(meterEnv, caller!.companyId!, 'arnie_voice', truncated.length)
    if (!cap.allowed) return jsonRes({ error: capMessage(cap, 'arnie_voice'), capped: true }, 429)
    const audioBytes = await synthesize(key, id, truncated, { stability: 0.5, style: 0.15 })
    await recordMediaUsage(meterEnv, { companyId: caller!.companyId!, kind: 'arnie_voice', model: 'eleven_flash_v2_5', units: truncated.length, costUsd: truncated.length * MEDIA_PRICES.voice_per_char })
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

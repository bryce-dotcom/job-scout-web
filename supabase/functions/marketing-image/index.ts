// marketing-image: pictures when the inbox has none.
//
// The marketer types a line ("crew pressure washing granite pavers at a
// building entrance, morning light"); Gemini paints it in the brand's
// world (services, colour, place), the file lands in marketing-media and a
// capture row (source 'generated', note 'AI picture: …') joins the inbox,
// exactly like a photo a tech sent in. The AI video maker then builds a
// video from those pictures the same way it does from real ones.
//
// Body: { description, brand?, count?: 1..3, aspect?: 'vertical'|'square'|'landscape', style?: string }
// Reply: { ok, captures: [row…] }   or   { ok:false, error, needs_key:true } when GEMINI_API_KEY is unset/invalid.
//
// Secret: GEMINI_API_KEY (Google AI Studio). Model: gemini-2.5-flash-image.
// Every picture is labelled AI in its note; the composer shows the label.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const MODEL = 'gemini-2.5-flash-image'
const ASPECT: Record<string, string> = { vertical: '9:16', square: '1:1', landscape: '16:9' }

async function paint(key: string, prompt: string, aspect: string): Promise<{ bytes: Uint8Array; mime: string } | { error: string; status: number }> {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: ASPECT[aspect] || '9:16' } },
    }),
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) return { error: j?.error?.message || `Gemini ${r.status}`, status: r.status }
  const part = (j.candidates?.[0]?.content?.parts || []).find((p: Record<string, unknown>) => p.inlineData)
  if (!part) return { error: j.candidates?.[0]?.finishReason ? `No picture (${j.candidates[0].finishReason}).` : 'No picture came back.', status: 502 }
  const b64 = part.inlineData.data as string
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return { bytes, mime: String(part.inlineData.mimeType || 'image/png') }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller?.companyId) return json({ ok: false, error: 'Sign in first.' }, 401)
    const body = await req.json().catch(() => ({}))
    const key = Deno.env.get('GEMINI_API_KEY') || ''
    if (body.action === 'status') return json({ ok: true, available: !!key })
    if (!key) return json({ ok: false, needs_key: true, error: 'AI pictures need a Gemini API key on the server (GEMINI_API_KEY).' }, 400)

    const description = String(body.description || '').trim().slice(0, 600)
    if (!description) return json({ ok: false, error: 'Say what the picture should show.' }, 400)
    const count = Math.max(1, Math.min(3, Number(body.count) || 1))
    const aspect = ['vertical', 'square', 'landscape'].includes(body.aspect) ? body.aspect : 'vertical'
    const brand = typeof body.brand === 'string' ? body.brand : ''

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const kitKey = brand ? `marketing_brand_kit:${brand}` : 'marketing_brand_kit'
    const { data: kitRows } = await sb.from('settings').select('value').eq('company_id', caller.companyId).eq('key', kitKey).limit(1)
    let kit: Record<string, unknown> = {}
    const raw = kitRows?.[0]?.value
    if (raw && typeof raw === 'object') kit = raw as Record<string, unknown>
    else if (typeof raw === 'string') { try { kit = JSON.parse(raw) } catch { kit = {} } }
    const services = Array.isArray(kit.services) ? (kit.services as string[]).slice(0, 6).join(', ') : ''
    const area = String(kit.service_area || '').slice(0, 80)
    const style = String(body.style || '').trim().slice(0, 200) || 'natural daylight, documentary, shot on a phone by the crew, true to life'

    const prompt = [
      `A photorealistic marketing photograph for ${kit.company_name || 'a field-services company'}${services ? ` (${services})` : ''}${area ? ` in ${area}` : ''}.`,
      `Scene: ${description}.`,
      `Style: ${style}. Real job site, real materials, believable people seen from behind or at a distance, no faces in close-up.`,
      'No text, no captions, no logos, no watermarks, no borders. Vertical social-media framing with room for a headline at the top.',
    ].join(' ')

    const out: unknown[] = []
    const month = new Date().toISOString().slice(0, 7)
    for (let i = 0; i < count; i++) {
      const got = await paint(key, prompt + (i ? ` Variation ${i + 1}: a different angle of the same scene.` : ''), aspect)
      if ('error' in got) {
        if (got.status === 400 && /API key/i.test(got.error)) return json({ ok: false, needs_key: true, error: 'The Gemini API key on the server is not valid.' }, 400)
        if (/prepayment credits|billing|RESOURCE_EXHAUSTED|quota/i.test(got.error)) return json({ ok: false, needs_billing: true, error: 'AI pictures are paused: the Google AI Studio project that paints them has run out of prepaid credits. The owner adds credits at ai.studio/projects (Billing); a small top-up covers hundreds of pictures. Real photos still work.' }, 402)
        if (!out.length) return json({ ok: false, error: got.error }, 502)
        break
      }
      const ext = got.mime.includes('jpeg') ? 'jpg' : 'png'
      const path = `${caller.companyId}/${month}/${Date.now()}_ai-picture-${i + 1}.${ext}`
      const { error: upErr } = await sb.storage.from('marketing-media').upload(path, got.bytes, { contentType: got.mime, upsert: false })
      if (upErr) return json({ ok: false, error: upErr.message }, 500)
      const { data: pub } = sb.storage.from('marketing-media').getPublicUrl(path)
      const { data: row, error: dbErr } = await sb.from('marketing_captures').insert({
        company_id: caller.companyId, employee_id: caller.employeeId, bucket: 'marketing-media', path, url: pub.publicUrl,
        media_type: 'image', note: `AI picture: ${description.slice(0, 120)}`, status: 'new', source: 'generated', brand: brand || null,
      }).select('*').single()
      if (dbErr) return json({ ok: false, error: dbErr.message }, 500)
      out.push(row)
    }
    return json({ ok: true, captures: out })
  } catch (err) {
    console.error('[marketing-image]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Picture failed' }, 500)
  }
})

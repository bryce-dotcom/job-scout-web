// marketing-draft: a person pressed Draft with AI.
//
// The caller's company comes from the JWT (never the body). The drafting
// itself lives in _shared/marketing.ts so the nightly marketing-suggest cron
// writes with the same brand kit, the same examples and the same rules.
//
// Body: { capture_ids?: number[], note?: string, platforms?: string[],
//         job_id?: number, tone?: string }
// Reply: { ok, caption, hashtags[], alt_text, ai_unavailable? }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'
import { draftFromCaptures } from '../_shared/marketing.ts'
import { callAnthropic } from '../_shared/anthropic.ts'

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
    if (!caller?.companyId) return json({ ok: false, error: 'Sign in to draft a post.' }, 401)

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const body = await req.json().catch(() => ({}))

    // ── storyboard: a short vertical ad from photos, clips and a line ─
    // The pattern Bryce showed (an Instagram lighting ad): the same room
    // dark then lit with a bold headline over it, a brand card, a call to
    // action. The AI plans scenes; the browser renders them (videoEdit.js).
    if (body.mode === 'storyboard') {
      const ids: number[] = Array.isArray(body.capture_ids) ? body.capture_ids.map(Number).filter(Boolean).slice(0, 10) : []
      const description = String(body.description || body.caption || '').slice(0, 1500)
      if (!ids.length && !description.trim()) return json({ ok: false, error: 'Give it photos, clips, or a line about what to say.' }, 400)
      const brandId = body.brand ? String(body.brand) : ''
      const [{ data: caps }, { data: settingRows }, { data: co }] = await Promise.all([
        ids.length ? sb.from('marketing_captures').select('id, url, frames, poster_url, duration_s, note, media_type').eq('company_id', caller.companyId).in('id', ids) : Promise.resolve({ data: [] as any[] }),
        sb.from('settings').select('key, value').eq('company_id', caller.companyId).in('key', ['marketing_brand_kit', brandId ? `marketing_brand_kit:${brandId}` : 'marketing_brand_kit', 'marketing_brands']),
        sb.from('companies').select('company_name, phone, website').eq('id', caller.companyId).maybeSingle(),
      ])
      const parse = (k: string) => { try { return JSON.parse((settingRows || []).find((r: any) => r.key === k)?.value || 'null') } catch { return null } }
      const kit = parse(brandId ? `marketing_brand_kit:${brandId}` : 'marketing_brand_kit') || parse('marketing_brand_kit') || {}
      const brands = parse('marketing_brands') || []
      const brand = (Array.isArray(brands) ? brands : []).find((b: any) => b.id === brandId) || null
      const name = kit.company_name || brand?.name || co?.company_name || 'our company'
      const maxTotal = Math.min(60, Math.max(10, Number(body.max_seconds) || 30))

      const content: any[] = []
      for (const c of caps || []) {
        if (c.media_type === 'video') {
          const frames: string[] = Array.isArray(c.frames) ? c.frames.filter(Boolean).slice(0, 3) : []
          content.push({ type: 'text', text: `CLIP #${c.id}${c.duration_s ? ` (${Math.round(Number(c.duration_s))}s)` : ''}${c.note ? `, note: "${c.note}"` : ''}. ${frames.length ? 'Stills follow.' : 'No stills.'}` })
          for (const u of frames) content.push({ type: 'image', source: { type: 'url', url: u } })
        } else if (c.url) {
          content.push({ type: 'text', text: `PHOTO #${c.id}${c.note ? `, note: "${c.note}"` : ''}:` })
          content.push({ type: 'image', source: { type: 'url', url: c.url } })
        }
      }
      content.push({ type: 'text', text: [
        description ? `What to say: "${description}"` : 'No description; say what the photos show.',
        (caps || []).length ? '' : 'There are NO photos or clips. Plan it from text cards only (kind "card"): 3 to 5 cards, each a short bold line with an optional sub line, the last one the call to action. Do not reference any capture id.',
        `Brand: ${name}.${kit.tagline ? ` Tagline: ${kit.tagline}.` : ''}${kit.cta ? ` Call to action: ${kit.cta}.` : ''}${kit.voice ? ` Voice: ${kit.voice}` : ''}`,
        `Plan a vertical social video under ${maxTotal} seconds. Scene kinds: "compare" (a BEFORE photo and an AFTER photo of the same place; the after is revealed over the before — use it whenever two photos show the same spot in two states), "photo" (one photo with slow motion), "clip" (a stretch of a video, start/end in seconds), "card" (text only on the brand colour: a punchy headline, optional sub line). Headlines are short and bold, under 8 words, the kind that stop a thumb ("Hard evidence that lighting is everything"). Open with the strongest visual and a headline; end with a card carrying the call to action. Use every strong photo once; leave out weak or repeated ones. 2 to 4 seconds per photo, 4 to 6 for a compare, 2 to 3 for a card.`,
        'Also write "voiceover": what a warm, plain-spoken narrator says over the whole video, in the brand voice, 2 to 4 short sentences, no more than about 2.5 words per second of video, ending on the call to action. No hashtags, no emojis, say numbers as words.',
        'Return strict JSON: {"headline": string, "scenes": [{"kind":"compare","before":id,"after":id,"text":string,"seconds":n} | {"kind":"photo","capture":id,"text":string|null,"motion":"zoom_in"|"zoom_out"|"pan_left"|"pan_right","seconds":n} | {"kind":"clip","capture":id,"start":n,"end":n,"text":string|null,"seconds":n} | {"kind":"card","text":string,"sub":string|null,"seconds":n}], "cta": {"text": string, "sub": string|null}, "voiceover": string, "mood": "calm"|"upbeat"|"bold", "why": "one sentence for the marketer"}',
      ].join('\n\n') })
      const ai = await callAnthropic({ feature: 'marketing-storyboard', companyId: caller.companyId, req }, {
        model: 'claude-sonnet-4-6', max_tokens: 1200,
        system: 'You are a sharp social video director for a small field-services company. You plan short vertical ads from what you are given; you never invent what a photo shows and you never invent prices or results.',
        messages: [{ role: 'user', content }],
      })
      if (!ai.ok) return json({ ok: false, error: ai.friendly, ai_unavailable: ai.unavailable === true }, 502)
      const text = (ai.data?.content || []).map((c: any) => c.text || '').join('')
      let sbd: any = null
      try { const cleaned = text.replace(/```(?:json)?/g, ''); const m = cleaned.match(/\{[\s\S]*\}/); sbd = m ? JSON.parse(m[0]) : null } catch { sbd = null }
      if (!sbd || !Array.isArray(sbd.scenes)) return json({ ok: false, error: 'The director did not return a usable storyboard. Try again.' }, 502)
      const byId = Object.fromEntries((caps || []).map((c: any) => [c.id, c]))
      const scenes: any[] = []
      let total = 0
      for (const sc of sbd.scenes) {
        const secs = Math.max(1.5, Math.min(8, Number(sc.seconds) || 3))
        if (total + secs > maxTotal) break
        if (sc.kind === 'compare' && byId[sc.before] && byId[sc.after] && byId[sc.before].media_type !== 'video' && byId[sc.after].media_type !== 'video') {
          scenes.push({ kind: 'compare', before: Number(sc.before), after: Number(sc.after), text: String(sc.text || '').slice(0, 80), seconds: Math.max(4, secs) })
        } else if (sc.kind === 'photo' && byId[sc.capture] && byId[sc.capture].media_type !== 'video') {
          scenes.push({ kind: 'photo', capture: Number(sc.capture), text: sc.text ? String(sc.text).slice(0, 80) : null, motion: ['zoom_in', 'zoom_out', 'pan_left', 'pan_right'].includes(sc.motion) ? sc.motion : 'zoom_in', seconds: secs })
        } else if (sc.kind === 'clip' && byId[sc.capture]?.media_type === 'video') {
          const d = Number(byId[sc.capture].duration_s) || 0
          let start = Math.max(0, Number(sc.start) || 0), end = Number(sc.end)
          if (!isFinite(end) || end <= start) end = start + secs
          if (d) end = Math.min(end, d)
          if (end - start < 1) continue
          scenes.push({ kind: 'clip', capture: Number(sc.capture), start: +start.toFixed(1), end: +end.toFixed(1), text: sc.text ? String(sc.text).slice(0, 80) : null, seconds: +(end - start).toFixed(1) })
        } else if (sc.kind === 'card' && sc.text) {
          scenes.push({ kind: 'card', text: String(sc.text).slice(0, 90), sub: sc.sub ? String(sc.sub).slice(0, 90) : null, seconds: secs })
        } else continue
        total += scenes[scenes.length - 1].seconds
      }
      if (!scenes.length) return json({ ok: false, error: 'Nothing usable in that storyboard. Add a photo or two, or describe it differently.' }, 502)
      const cta = { text: String(sbd.cta?.text || kit.cta || `Call ${co?.phone || ''}`.trim()).slice(0, 60), sub: sbd.cta?.sub ? String(sbd.cta.sub).slice(0, 80) : (kit.website || co?.website || co?.phone || null) }
      const mood = ['calm', 'upbeat', 'bold'].includes(sbd.mood) ? sbd.mood : 'calm'
      return json({ ok: true, headline: String(sbd.headline || '').slice(0, 80), scenes, cta, voiceover: String(sbd.voiceover || '').slice(0, 900), mood, why: String(sbd.why || ''), total: +total.toFixed(1), brand: { name, logo_url: kit.logo_url || brand?.logo_url || null, color: kit.primary_color || null } })
    }

    // ── plan_cut: which clips, in what order, how much of each ───────
    // The editor cuts; this says what to cut. Reads each clip's stills and
    // length plus the caption or note, and returns an order, a stretch to
    // keep per clip, and which to drop, under the reel limit.
    if (body.mode === 'plan_cut') {
      const ids: number[] = Array.isArray(body.capture_ids) ? body.capture_ids.map(Number).filter(Boolean).slice(0, 8) : []
      if (!ids.length) return json({ ok: false, error: 'Pick the clips first.' }, 400)
      const { data: caps } = await sb.from('marketing_captures').select('id, frames, duration_s, note, media_type').eq('company_id', caller.companyId).in('id', ids)
      const clips = (caps || []).filter((c: any) => c.media_type === 'video')
      if (!clips.length) return json({ ok: false, error: 'None of those are videos.' }, 400)
      const maxTotal = Math.min(90, Math.max(15, Number(body.max_seconds) || 45))
      const content: any[] = []
      for (const c of clips) {
        const frames: string[] = Array.isArray(c.frames) ? c.frames.filter(Boolean).slice(0, 4) : []
        content.push({ type: 'text', text: `CLIP #${c.id}: ${c.duration_s ? `${Math.round(Number(c.duration_s))}s long` : 'length unknown'}${c.note ? `, crew note: "${c.note}"` : ''}. ${frames.length ? `Stills follow, evenly spaced through the clip.` : 'No stills available.'}` })
        for (const u of frames) content.push({ type: 'image', source: { type: 'url', url: u } })
      }
      const caption = String(body.caption || body.note || '').slice(0, 1200)
      content.push({ type: 'text', text: [
        caption ? `The post says: "${caption}"` : 'There is no caption yet; cut for the clearest story of the work.',
        `Plan one video under ${maxTotal} seconds for a Reel. Order the clips so the story reads (before → during → after, or wide shot → detail → result). Keep only the stretch of each clip that shows something; drop a clip that repeats another or shows nothing. Stills are evenly spaced, so a still's position tells you roughly where in the clip that moment is.`,
        'Return strict JSON: {"order":[clip ids to use, in order],"keep":{"<id>":{"start":seconds,"end":seconds}},"drop":[clip ids left out],"why":"one sentence for the marketer"}. start/end must lie inside the clip\'s length; the kept stretches must add up to no more than the limit.',
      ].join('\n\n') })
      const ai = await callAnthropic({ feature: 'marketing-cut-plan', companyId: caller.companyId, req }, {
        model: 'claude-sonnet-4-6', max_tokens: 800,
        system: 'You are a sharp social video editor for a field-services company. You plan cuts; you never invent what a clip shows.',
        messages: [{ role: 'user', content }],
      })
      if (!ai.ok) return json({ ok: false, error: ai.friendly, ai_unavailable: ai.unavailable === true }, 502)
      const text = (ai.data?.content || []).map((c: any) => c.text || '').join('')
      let plan: any = null
      try { const m = text.match(/\{[\s\S]*\}/); plan = m ? JSON.parse(m[0]) : null } catch { plan = null }
      if (!plan || !Array.isArray(plan.order)) return json({ ok: false, error: 'The planner did not return a usable plan. Try again.' }, 502)
      const byId = Object.fromEntries(clips.map((c: any) => [c.id, c]))
      const order = plan.order.map(Number).filter((id: number) => byId[id])
      const keep: Record<string, { start: number; end: number }> = {}
      let total = 0
      for (const id of order) {
        const d = Number(byId[id].duration_s) || 0
        const k = plan.keep?.[id] || plan.keep?.[String(id)] || {}
        let start = Math.max(0, Number(k.start) || 0), end = Number(k.end)
        if (!isFinite(end) || end <= start) end = d ? Math.min(d, start + 20) : start + 20
        if (d) end = Math.min(end, d)
        if (total + (end - start) > maxTotal) end = start + Math.max(0, maxTotal - total)
        if (end - start >= 1) { keep[id] = { start: +start.toFixed(1), end: +end.toFixed(1) }; total += end - start }
      }
      const finalOrder = order.filter((id: number) => keep[id])
      return json({ ok: true, order: finalOrder, keep, drop: clips.map((c: any) => c.id).filter((id: number) => !keep[id]), why: String(plan.why || ''), total: +total.toFixed(1) })
    }

    const r = await draftFromCaptures({
      sb, companyId: caller.companyId, req,
      captureIds: Array.isArray(body.capture_ids) ? body.capture_ids : [],
      note: body.note, platforms: Array.isArray(body.platforms) ? body.platforms : [],
      jobId: body.job_id ? Number(body.job_id) : null, brand: body.brand ? String(body.brand) : '', tone: body.tone, feature: 'marketing-draft',
    })
    if (!r.ok) return json({ ok: false, error: r.error, ai_unavailable: r.unavailable === true }, r.unavailable ? 502 : 400)
    return json({ ok: true, caption: r.caption, hashtags: r.hashtags, alt_text: r.alt_text, best_capture_id: r.best_capture_id ?? null })
  } catch (err) {
    console.error('[marketing-draft]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Draft failed' }, 500)
  }
})

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

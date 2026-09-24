// marketing-draft: field photos + a note in, a social post out.
//
// The caller's company comes from the JWT (never the body). The drafter reads
// the company's brand kit (settings.marketing_brand_kit), its EOS answers
// (core values, core focus, marketing strategy), and its own history: the
// last approved captions and the last edits people made to AI drafts. That
// history IS the style learning. Nothing is fine-tuned; delete a bad post and
// the style changes on the next draft.
//
// Body: { capture_ids?: number[], note?: string, platforms?: string[],
//         job_id?: number, tone?: string }
// Reply: { ok, caption, hashtags[], alt_text, ai_unavailable? }

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { callAnthropic } from '../_shared/anthropic.ts'
import { resolveCaller } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const PLATFORM_HINTS: Record<string, string> = {
  facebook: 'Facebook: conversational, 1-3 short paragraphs, a question or invitation at the end works.',
  instagram: 'Instagram: lead with the visual, short lines, 5-10 hashtags at the end.',
  google_business: 'Google Business Profile: plain, local, service-focused, no hashtags, under 1500 characters, name the city.',
  linkedin: 'LinkedIn: professional but human, one insight about the work, 3-5 hashtags max.',
  x: 'X: 280 characters total including hashtags.',
  threads: 'Threads: 500 characters, casual.',
  bluesky: 'Bluesky: 300 characters, casual.',
  pinterest: 'Pinterest: descriptive, keyword-rich, 500 characters.',
  tiktok: 'TikTok: hook first, casual, hashtags.',
  youtube: 'YouTube: a title-like first line then a description.',
}

function parseJsonSetting(v: unknown): any {
  if (!v) return null
  if (typeof v === 'object') return v
  try { return JSON.parse(String(v)) } catch { return null }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller?.companyId) return json({ ok: false, error: 'Sign in to draft a post.' }, 401)
    const companyId = caller.companyId

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const body = await req.json().catch(() => ({}))
    const captureIds: number[] = Array.isArray(body.capture_ids) ? body.capture_ids.map(Number).filter(Boolean).slice(0, 5) : []
    const note = String(body.note || '').slice(0, 2000)
    const platforms: string[] = Array.isArray(body.platforms) ? body.platforms.map(String) : []
    const tone = String(body.tone || '').slice(0, 200)
    if (!captureIds.length && !note.trim()) {
      return json({ ok: false, error: 'Give the AI something to go on: a photo or a note about what happened.' }, 400)
    }

    const [{ data: settingRows }, { data: company }, { data: captures }, { data: history }, job] = await Promise.all([
      sb.from('settings').select('key, value').eq('company_id', companyId)
        .in('key', ['marketing_brand_kit', 'eos_core_values', 'eos_core_focus', 'eos_marketing_strategy']),
      sb.from('companies').select('company_name, city, state, website, phone').eq('id', companyId).maybeSingle(),
      captureIds.length
        ? sb.from('marketing_captures').select('id, url, note, media_type, job_id').eq('company_id', companyId).in('id', captureIds)
        : Promise.resolve({ data: [] as any[] }),
      sb.from('marketing_posts').select('caption, ai_draft, status, approved_at, created_at')
        .eq('company_id', companyId).in('status', ['approved', 'scheduled', 'posted'])
        .order('created_at', { ascending: false }).limit(40),
      body.job_id
        ? sb.from('jobs').select('job_title, service_type, job_address, details, notes').eq('company_id', companyId).eq('id', body.job_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
    ])

    const setting = (k: string) => parseJsonSetting((settingRows || []).find((r: any) => r.key === k)?.value)
    const kit = setting('marketing_brand_kit') || {}
    const values = (setting('eos_core_values') || []).map((v: any) => (typeof v === 'string' ? v : v?.value)).filter(Boolean)
    const focus = setting('eos_core_focus') || {}
    const mk = setting('eos_marketing_strategy') || {}

    // Style examples: same rule as src/lib/marketing.js styleExamples().
    const hist = (history || []).filter((p: any) => (p.caption || '').trim())
    const approved = hist.slice(0, 20).map((p: any) => p.caption.trim())
    const edits = hist.filter((p: any) => (p.ai_draft || '').trim() && p.ai_draft.trim() !== p.caption.trim())
      .slice(0, 10).map((p: any) => ({ before: p.ai_draft.trim(), after: p.caption.trim() }))

    const brandLines = [
      `Company: ${kit.company_name || company?.company_name || 'our company'}`,
      kit.tagline ? `Tagline / what we do: ${kit.tagline}` : (focus.niche ? `What we do: ${focus.niche}` : ''),
      kit.service_area || company?.city ? `Service area: ${kit.service_area || [company?.city, company?.state].filter(Boolean).join(', ')}` : '',
      kit.audience || mk.target_market ? `Audience: ${kit.audience || mk.target_market}` : '',
      kit.voice ? `Voice: ${kit.voice}` : (focus.purpose ? `Purpose: ${focus.purpose}` : ''),
      (kit.tone_words || []).length ? `Tone: ${kit.tone_words.join(', ')}` : '',
      (kit.values || values).length ? `Core values: ${(kit.values?.length ? kit.values : values).join(', ')}` : '',
      (kit.uniques || []).length ? `What sets us apart: ${kit.uniques.join('; ')}` : ((mk.three_uniques || []).filter(Boolean).length ? `What sets us apart: ${mk.three_uniques.filter(Boolean).join('; ')}` : ''),
      kit.guarantee || mk.guarantee ? `Guarantee: ${kit.guarantee || mk.guarantee}` : '',
      (kit.services || []).length ? `Services we post about: ${kit.services.join(', ')}` : '',
      (kit.do_say || []).length ? `Say things like: ${kit.do_say.join(' | ')}` : '',
      (kit.dont_say || []).length ? `NEVER say: ${kit.dont_say.join(' | ')}` : '',
      (kit.hashtags || []).length ? `House hashtags (use some, not all): ${kit.hashtags.join(' ')}` : '',
      kit.cta ? `Default call to action: ${kit.cta}` : '',
      kit.website || company?.website ? `Website: ${kit.website || company?.website}` : '',
      kit.phone || company?.phone ? `Phone: ${kit.phone || company?.phone}` : '',
    ].filter(Boolean).join('\n')

    const platformText = platforms.length
      ? platforms.map((p) => PLATFORM_HINTS[p] || p).join('\n')
      : 'One caption that works on Facebook, Instagram and Google Business Profile: under 1500 characters, hashtags only at the end.'

    const system = `You write social media posts for a small field-services company. You write in the company's own voice, described below, and you learn from the examples of what they approved and how they edited earlier drafts.

BRAND
${brandLines}

RULES
- Write ONE caption in the company's voice. Plain words. No emojis unless the approved examples use them.
- Talk about the actual work in the photos and the note. Never invent facts, prices, customer names, or results that are not in the note.
- Do not name the customer or the exact street address unless the note says to.
- Do not describe the photo literally ("here is a photo of"); talk to the reader.
- Return strict JSON: {"caption": string, "hashtags": string[], "alt_text": string}. hashtags are bare words without #, 0-10 of them, none for Google Business. alt_text is one sentence describing the image for accessibility.
${tone ? `- Tone for this post: ${tone}` : ''}

PLATFORMS
${platformText}
${approved.length ? `\nAPPROVED CAPTIONS (this is how they sound; match it)\n${approved.map((c, i) => `${i + 1}. ${c}`).join('\n')}` : ''}
${edits.length ? `\nEDITS THEY MADE TO EARLIER DRAFTS (learn from the corrections)\n${edits.map((e) => `- Draft: ${e.before}\n  Changed to: ${e.after}`).join('\n')}` : ''}`

    const content: any[] = []
    for (const c of captures || []) {
      if (c.media_type === 'video') continue
      content.push({ type: 'image', source: { type: 'url', url: c.url } })
      if (c.note) content.push({ type: 'text', text: `Note on that photo: ${c.note}` })
    }
    // City only, never the street: the address goes to the model so it can say
    // "in Ogden", not so it can print where the customer lives.
    const cityOf = (addr: unknown) => {
      const parts = String(addr || '').split(',').map((s) => s.trim()).filter(Boolean)
      return parts.length >= 2 ? parts[parts.length - 2].replace(/\s+\d{5}(-\d{4})?$/, '') : ''
    }
    const jobBits = job?.data
      ? [
          `Job: ${[job.data.job_title, job.data.service_type].filter(Boolean).join(' / ')}`,
          cityOf(job.data.job_address) ? `City: ${cityOf(job.data.job_address)}` : '',
          job.data.details ? `Job details: ${String(job.data.details).slice(0, 600)}` : '',
          job.data.notes ? `Job notes: ${String(job.data.notes).slice(0, 400)}` : '',
        ].filter(Boolean).join('\n')
      : ''
    content.push({
      type: 'text',
      text: [
        note ? `What the crew said: ${note}` : 'No note from the crew; go by the photos.',
        jobBits,
        (captures || []).some((c: any) => c.media_type === 'video') ? 'One of the attachments is a video (not shown).' : '',
        'Write the post now. JSON only.',
      ].filter(Boolean).join('\n\n'),
    })

    const ai = await callAnthropic(
      { feature: 'marketing-draft', companyId, req },
      { model: 'claude-sonnet-4-6', max_tokens: 1024, system, messages: [{ role: 'user', content }] },
    )
    if (!ai.ok) return json({ ok: false, error: ai.friendly, ai_unavailable: ai.unavailable === true }, 502)

    const text = (ai.data?.content || []).map((c: any) => c.text || '').join('').trim()
    let parsed: any = null
    try {
      const m = text.match(/\{[\s\S]*\}/)
      parsed = m ? JSON.parse(m[0]) : null
    } catch { parsed = null }
    if (!parsed || typeof parsed.caption !== 'string') {
      return json({ ok: true, caption: text.replace(/^```(?:json)?|```$/g, '').trim(), hashtags: [], alt_text: '' })
    }
    const hashtags = Array.isArray(parsed.hashtags)
      ? parsed.hashtags.map((h: unknown) => String(h).replace(/^#/, '').replace(/\s+/g, '')).filter(Boolean).slice(0, 10)
      : []
    return json({ ok: true, caption: parsed.caption.trim(), hashtags, alt_text: String(parsed.alt_text || '') })
  } catch (err) {
    console.error('[marketing-draft]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Draft failed' }, 500)
  }
})

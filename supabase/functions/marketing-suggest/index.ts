// marketing-suggest: drafts write themselves overnight.
//
// Once a day (pg_cron, 13:30 UTC) for every company that has set marketing
// up, and on demand for one company when a manager presses Suggest now:
//
//   1. Photos in the inbox nobody turned into a post — shared from Field
//      Scout or texted in — grouped by job, one draft per group.
//   2. Jobs that finished in the last ~26 hours with photos on them and no
//      post yet. Those photos are PRIVATE (project-documents); the capture
//      points at them, the drafter reads the bytes, and nothing becomes
//      public until a human publishes.
//
// Brands: a company with several brands (HHH: cleaning, lighting, JobScout)
// gets each draft written under the brand the job's business unit feeds,
// with that brand's voice and that brand's connected accounts. A photo with
// no job, or a job whose unit no brand claims, is left in the inbox for a
// person to place; the AI never guesses which brand a photo belongs to.
//
// Every draft is status 'draft', suggested_at set, and the managers get one
// notification per company per day. Nothing here posts. A person approves.
//
// Auth: the cron sends the anon key ({"cron": true}); a signed-in Manager+
// runs it for their own company only.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'
import { draftFromCaptures, notifyManagers, loadBrands, brandForUnit, brandKey } from '../_shared/marketing.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const MAX_DRAFTS_PER_COMPANY = 5
const MAX_PHOTOS_PER_POST = 3

function parseCfg(v: unknown): any {
  try { return typeof v === 'string' ? JSON.parse(v) : v || {} } catch { return {} }
}

async function suggestForCompany(sb: any, companyId: number, req: Request) {
  const brands = await loadBrands(sb, companyId)
  const { data: settingRows } = await sb.from('settings').select('key, value').eq('company_id', companyId).like('key', 'marketing_publisher%')
  // Platforms a brand can post to: whatever it has connected that takes a photo.
  const platformsFor = (brandId: string) => {
    const cfg = parseCfg((settingRows || []).find((r: any) => r.key === brandKey('marketing_publisher', brandId))?.value)
    return ((cfg.accounts || []) as any[]).map((a) => a.platform).filter((p) => !['tiktok', 'youtube'].includes(p))
  }

  let made = 0
  const titles: string[] = []
  const skipped: string[] = []

  const makeDraft = async (opts: { captureIds: number[]; note: string; jobId: number | null; brandId: string; createdBy: number | null }) => {
    const platforms = platformsFor(opts.brandId)
    const r = await draftFromCaptures({ sb, companyId, captureIds: opts.captureIds, note: opts.note, platforms, jobId: opts.jobId, brand: opts.brandId, feature: 'marketing-suggest', req })
    if (!r.ok) return { ok: false, unavailable: r.unavailable, error: r.error }
    const { data: post } = await sb.from('marketing_posts').insert({
      company_id: companyId, status: 'draft', caption: r.caption, ai_draft: r.caption, hashtags: r.hashtags || [],
      platforms, media_urls: [], capture_ids: opts.captureIds, source: 'photo', job_id: opts.jobId,
      brand: opts.brandId || null, created_by: opts.createdBy, suggested_at: new Date().toISOString(),
    }).select('id').maybeSingle()
    if (!post?.id) return { ok: false, error: 'insert failed' }
    await sb.from('marketing_captures').update({ status: 'used', post_id: post.id, brand: opts.brandId || null }).in('id', opts.captureIds)
    made++; titles.push((r.caption || '').slice(0, 60))
    return { ok: true }
  }

  // ── 1. Inbox photos nobody used, grouped by job (or one group per orphan)
  const { data: fresh } = await sb.from('marketing_captures')
    .select('id, job_id, note, employee_id, created_at, media_type, brand')
    .eq('company_id', companyId).eq('status', 'new')
    .lt('created_at', new Date(Date.now() - 10 * 60e3).toISOString())
    .order('created_at', { ascending: false }).limit(40)
  const jobIds = [...new Set((fresh || []).map((c: any) => c.job_id).filter(Boolean))]
  const { data: capJobs } = jobIds.length
    ? await sb.from('jobs').select('id, business_unit').eq('company_id', companyId).in('id', jobIds)
    : { data: [] as any[] }
  const unitOf = new Map((capJobs || []).map((j: any) => [j.id, j.business_unit]))
  const groups = new Map<string, any[]>()
  for (const c of fresh || []) {
    const key = c.job_id ? `job:${c.job_id}` : `one:${c.id}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(c)
  }
  for (const [key, caps] of groups) {
    if (made >= MAX_DRAFTS_PER_COMPANY) break
    const jobId = key.startsWith('job:') ? Number(key.slice(4)) : null
    // The photo's own brand wins; else the job's unit; else only a
    // single-brand company gets a guess. Otherwise a person places it.
    const brandId = caps[0].brand ?? (jobId ? brandForUnit(brands, unitOf.get(jobId)) : brandForUnit(brands, null))
    if (brandId == null) { skipped.push(key); continue }
    const chosen = caps.slice(0, MAX_PHOTOS_PER_POST)
    const note = chosen.map((c: any) => c.note).filter(Boolean).join(' ')
    const r = await makeDraft({ captureIds: chosen.map((c: any) => c.id), note, jobId, brandId, createdBy: chosen[0]?.employee_id || null })
    if (!r.ok) { console.warn('[marketing-suggest] draft failed', companyId, r.error); if (r.unavailable) return { made, titles, skipped, stop: true } }
  }

  // ── 2. Jobs finished since yesterday morning with photos and no post
  if (made < MAX_DRAFTS_PER_COMPANY) {
    const since = new Date(Date.now() - 26 * 3600e3).toISOString()
    const { data: jobs } = await sb.from('jobs').select('id, job_title, service_type, completed_at, business_unit')
      .eq('company_id', companyId).gte('completed_at', since).order('completed_at', { ascending: false }).limit(20)
    for (const j of jobs || []) {
      if (made >= MAX_DRAFTS_PER_COMPANY) break
      const brandId = brandForUnit(brands, j.business_unit)
      if (brandId == null) { skipped.push(`job:${j.id}`); continue }
      const { data: existing } = await sb.from('marketing_posts').select('id').eq('company_id', companyId).eq('job_id', j.id).limit(1)
      if (existing?.length) continue
      const { data: photos } = await sb.from('file_attachments')
        .select('id, file_path, storage_bucket, file_type, photo_context, created_by')
        .eq('company_id', companyId).eq('job_id', j.id).like('file_type', 'image/%')
        .order('created_at', { ascending: false }).limit(12)
      if (!photos?.length) continue
      // After photos first, then notes, then anything; skip signed docs.
      const rank = (p: any) => (p.photo_context === 'line_after' ? 0 : p.photo_context === 'notes' ? 1 : p.photo_context == null ? 2 : 9)
      const picked = photos.filter((p: any) => rank(p) < 9).sort((a: any, b: any) => rank(a) - rank(b)).slice(0, MAX_PHOTOS_PER_POST)
      if (!picked.length) continue
      const { data: caps } = await sb.from('marketing_captures').insert(picked.map((p: any) => ({
        company_id: companyId, employee_id: p.created_by || null, job_id: j.id, bucket: p.storage_bucket || 'project-documents',
        path: p.file_path, url: '', media_type: 'image', note: null, source: 'suggested', status: 'used', brand: brandId || null,
      }))).select('id')
      const ids = (caps || []).map((c: any) => c.id)
      if (!ids.length) continue
      const r = await makeDraft({ captureIds: ids, note: '', jobId: j.id, brandId, createdBy: null })
      if (!r.ok) {
        await sb.from('marketing_captures').delete().in('id', ids)
        console.warn('[marketing-suggest] job draft failed', companyId, j.id, r.error)
        if (r.unavailable) return { made, titles, skipped, stop: true }
      }
    }
  }

  if (made) {
    const day = new Date().toISOString().slice(0, 10)
    await notifyManagers(sb, companyId, {
      type: 'marketing_drafts_ready',
      title: made === 1 ? '1 post drafted from recent work' : `${made} posts drafted from recent work`,
      message: 'Open Marketing to read, edit and approve.',
      route: '/marketing', dedupe_key: `marketing-drafts-${day}`,
      metadata: { count: made },
    })
  }
  return { made, titles, skipped, stop: false }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const body = await req.json().catch(() => ({}))

    // Cron (anon/service bearer) → every company that set marketing up.
    // A person → their own company, Manager+.
    const bearer = (req.headers.get('authorization') || '').replace(/^Bearer /, '')
    let role = ''
    try { const p = bearer.split('.')[1]; if (p) role = JSON.parse(atob(p.replace(/-/g, '+').replace(/_/g, '/'))).role || '' } catch { /* not a JWT */ }
    const internal = body.cron === true && (role === 'anon' || role === 'service_role')

    let companyIds: number[] = []
    if (internal) {
      const { data } = await sb.from('settings').select('company_id').or('key.like.marketing_publisher%,key.like.marketing_brand_kit%')
      companyIds = [...new Set((data || []).map((r: any) => r.company_id))]
    } else {
      const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
      if (!caller?.companyId) return json({ ok: false, error: 'Sign in first.' }, 401)
      if (caller.level < 2) return json({ ok: false, error: 'Only a Manager or above can run this.' }, 403)
      companyIds = [caller.companyId]
    }

    const results: Record<string, unknown> = {}
    for (const id of companyIds) {
      try {
        const r = await suggestForCompany(sb, id, req)
        results[id] = { made: r.made, titles: r.titles, skipped: r.skipped }
        if (r.stop) { results.stopped = 'ai_unavailable'; break }
      } catch (err) {
        results[id] = { error: (err as Error)?.message }
      }
    }
    return json({ ok: true, companies: companyIds.length, results })
  } catch (err) {
    console.error('[marketing-suggest]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Failed' }, 500)
  }
})

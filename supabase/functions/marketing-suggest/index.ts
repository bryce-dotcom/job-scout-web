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
import { geminiKey, paintPicture, picturePrompt } from '../_shared/gemini.ts'
import { checkCap, recordMediaUsage, MEDIA_PRICES } from '../_shared/mediaMeter.ts'
import { repEmailShell, appLink } from '../_shared/notifyRep.ts'

// The in-app note was easy to miss; the marketer opens email first thing.
// One email per company per night to every manager with an address, unless
// settings marketing_digest_email is false. Resend, same domain as the rest.
async function emailDigest(sb: any, companyId: number, made: number, painted: number, titles: string[]) {
  try {
    const key = Deno.env.get('RESEND_API_KEY')
    if (!key) return
    const { data: pref } = await sb.from('settings').select('value').eq('company_id', companyId).eq('key', 'marketing_digest_email').limit(1)
    const raw = pref?.[0]?.value
    const off = raw === false || raw === 'false' || (typeof raw === 'string' && /^"?false"?$/.test(raw))
    if (off) return
    const { data: emps } = await sb.from('employees').select('id, email, user_role, role, is_admin').eq('company_id', companyId).eq('active', true)
    const senior = new Set(['Manager', 'Admin', 'Super Admin', 'Owner', 'Developer'])
    const to = (emps || []).filter((e: any) => senior.has(e.user_role) || e.is_admin === true || (senior.has(e.role) && e.role !== 'Manager'))
      .map((e: any) => String(e.email || '').trim()).filter((e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e))
    if (!to.length) return
    const { data: co } = await sb.from('companies').select('company_name').eq('id', companyId).maybeSingle()
    const n = made === 1 ? '1 post drafted' : `${made} posts drafted`
    const sub = painted ? `${n} from yesterday's work, ${painted} with an AI picture` : `${n} from yesterday's work`
    const list = titles.slice(0, 6).map((t) => `<li style="margin:4px 0">${String(t).replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] || c))}…</li>`).join('')
    const html = repEmailShell(`${made} waiting in Marketing`, `
      <p style="margin:0 0 10px">Overnight, JobScout drafted <b>${n}</b> from finished jobs and photos the crew sent in${painted ? `, including <b>${painted}</b> with a picture the AI painted because nobody photographed the job (it is labelled; swap a real one in if you have it)` : ''}.</p>
      <ul style="margin:0 0 6px 18px;padding:0;color:#4d5a52">${list}</ul>
      <p style="margin:10px 0 0;color:#7d8a7f;font-size:13px">Read, edit and approve in Marketing. Every edit teaches the next draft.</p>`,
      appLink('/marketing'), 'Open Marketing')
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: 'JobScout Marketing <marketing@appsannex.com>', to, subject: `${co?.company_name ? co.company_name + ': ' : ''}${sub}`, html }),
    })
    if (!res.ok) console.warn('[marketing-suggest] digest email failed', companyId, res.status, (await res.text()).slice(0, 120))
  } catch (e) { console.warn('[marketing-suggest] digest email error', (e as Error)?.message) }
}

// A finished job nobody photographed still deserves a post: paint what the
// field would have shot. Two a night per company, inside the monthly cap.
const MAX_PAINTED_PER_NIGHT = 2
async function paintForJob(sb: any, companyId: number, job: any, brandId: string | null): Promise<number | null> {
  const key = geminiKey()
  if (!key) return null
  const cap = await checkCap({ supabaseUrl: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! }, companyId, 'picture', 1)
  if (!cap.allowed) return null
  const kitKey = brandId ? `marketing_brand_kit:${brandId}` : 'marketing_brand_kit'
  const { data: rows } = await sb.from('settings').select('value').eq('company_id', companyId).eq('key', kitKey).limit(1)
  let kit: Record<string, unknown> = {}
  const raw = rows?.[0]?.value
  if (raw && typeof raw === 'object') kit = raw
  else if (typeof raw === 'string') { try { kit = JSON.parse(raw) } catch { kit = {} } }
  const city = String(job.job_address || '').split(',').slice(-2, -1)[0]?.trim() || String(kit.service_area || '').split(',')[0] || ''
  const what = [job.service_type, job.job_title].filter(Boolean).join(' — ') || 'a finished job'
  const description = `the crew finishing ${what}${city ? ` in ${city}` : ''}, the work just completed and looking its best, afternoon light`
  const got = await paintPicture(key, picturePrompt(kit, description), 'vertical')
  if ('error' in got) { console.warn('[marketing-suggest] paint failed', companyId, job.id, got.error); return null }
  const ext = got.mime.includes('jpeg') ? 'jpg' : 'png'
  const path = `${companyId}/${new Date().toISOString().slice(0, 7)}/${Date.now()}_ai-picture-job${job.id}.${ext}`
  const { error: upErr } = await sb.storage.from('marketing-media').upload(path, got.bytes, { contentType: got.mime, upsert: false })
  if (upErr) return null
  const { data: pub } = sb.storage.from('marketing-media').getPublicUrl(path)
  const { data: cap2 } = await sb.from('marketing_captures').insert({
    company_id: companyId, employee_id: null, job_id: job.id, bucket: 'marketing-media', path, url: pub.publicUrl, media_type: 'image',
    note: `AI picture: ${description.slice(0, 120)}`, status: 'used', source: 'generated', brand: brandId || null,
  }).select('id').single()
  await recordMediaUsage({ supabaseUrl: Deno.env.get('SUPABASE_URL')!, serviceKey: Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')! }, { companyId, kind: 'picture', model: got.model, units: 1, costUsd: got.model.startsWith('gemini-3') ? MEDIA_PRICES.picture : MEDIA_PRICES.picture_legacy })
  return cap2?.id ?? null
}

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
  let painted = 0

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
    const { data: jobs } = await sb.from('jobs').select('id, job_title, service_type, completed_at, business_unit, job_address')
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
      if (!photos?.length) {
        // Nobody photographed it: paint what they would have shot, and draft from that.
        if (painted >= MAX_PAINTED_PER_NIGHT) continue
        const capId = await paintForJob(sb, companyId, j, brandId)
        if (!capId) continue
        painted += 1
        const rp = await makeDraft({ captureIds: [capId], note: `Finished ${[j.service_type, j.job_title].filter(Boolean).join(' — ') || 'a job'}. The picture is AI-made; say so if the brand prefers, or swap in a real one.`, jobId: j.id, brandId, createdBy: null })
        if (!rp.ok) {
          console.warn('[marketing-suggest] painted draft failed', companyId, j.id, rp.error)
          if (rp.unavailable) return { made, titles, skipped, stop: true }
        }
        continue
      }
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
      message: painted ? `${painted} with an AI picture. Open Marketing to read, edit and approve.` : 'Open Marketing to read, edit and approve.',
      route: '/marketing', dedupe_key: `marketing-drafts-${day}`,
      metadata: { count: made, painted },
    })
    await emailDigest(sb, companyId, made, painted, titles)
  }
  return { made, titles, skipped, painted, stop: false }
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

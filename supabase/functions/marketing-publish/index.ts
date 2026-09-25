// marketing-publish: the one place JobScout talks to the social publisher.
//
// The publisher is Upload-Post (api.upload-post.com). JobScout holds ONE
// Upload-Post key (secret UPLOAD_POST_API_KEY, Professional plan: $50/mo for
// 25 tenant profiles, blocks of 15/25 after). Each company gets an Upload-Post
// "user profile" named jobscout-<company_id>, created here on its first
// Connect. The tenant never sees Upload-Post: Connect opens a popup on
// Upload-Post's hosted connect page filtered to that one network, the
// network's own sign-in runs, and when the popup closes we re-read the
// profile's connected accounts.
//
// Why this vendor: same connect-link model as Ayrshare at a tenth of the
// price, and a real per-tenant profile object (an account id → company map
// we maintain ourselves is the Watchdog-devices mistake again).
//
// Vendor id columns keep their historical name: marketing_posts.ayrshare_id
// now holds Upload-Post's job_id (scheduled) or request_id (sync/async).
//
// Who may do what: anyone signed in can look; connecting, publishing and
// unscheduling need Manager or above. The gate lives here, next to the key.
//
// Body: { action, ... }
//   status      {}                       mode + connected accounts (cached) + offered networks
//   connect     { network?, origin }     ensure profile, mint connect URL → { url }
//   accounts    {}                       re-read the profile's connected accounts
//   publish     { post_id }              post now, or schedule if scheduled_for is in the future
//   delete      { post_id }              cancel a scheduled post

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const API = 'https://api.upload-post.com/api'
const PLATFORM_KEY = Deno.env.get('UPLOAD_POST_API_KEY') || ''
const LOGO = Deno.env.get('MARKETING_CONNECT_LOGO') || 'https://jobscout.appsannex.com/Scout_LOGO_GUY.png'

// Networks offered on the Channels tab, in order. Ids are Upload-Post's.
const OFFERED = ['facebook', 'instagram', 'google_business', 'linkedin', 'x', 'threads', 'tiktok', 'youtube', 'pinterest', 'bluesky']

type Cfg = {
  vendor?: string
  profile_username?: string
  accounts?: any[]
  connected_at?: string
  accounts_refreshed_at?: string
  [k: string]: unknown
}

const authHeaders = () => ({ Authorization: `Apikey ${PLATFORM_KEY}` })

async function up(method: string, path: string, body?: Record<string, unknown> | FormData) {
  const isForm = body instanceof FormData
  const res = await fetch(`${API}${path}`, {
    method,
    headers: isForm ? authHeaders() : { ...authHeaders(), 'Content-Type': 'application/json' },
    body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
  })
  let data: any = null
  const text = await res.text()
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  return { ok: res.ok, status: res.status, data }
}

function upError(data: any): string {
  if (!data) return 'No reply from the publisher'
  if (data.platforms && typeof data.platforms === 'object') {
    const bad = Object.entries(data.platforms)
      .filter(([, v]: any) => v && v.status && v.status !== 'success' && v.status !== 'pending' && v.status !== 'scheduled')
      .map(([k, v]: any) => `${k}: ${v.error || v.message || v.status}`)
    if (bad.length) return bad.join('; ')
  }
  return data.error || data.message || data.raw || 'The publisher refused the request'
}

// Upload-Post's social_accounts is a map: platform → '' | { display_name, handle, username, social_images, reauth_required }
function accountsFrom(profile: any) {
  const sa = profile?.social_accounts || {}
  const out: any[] = []
  for (const [platform, v] of Object.entries(sa)) {
    if (!v || typeof v !== 'object') continue
    const a: any = v
    out.push({
      platform,
      display_name: a.display_name || a.handle || a.username || platform,
      username: a.handle || a.username || null,
      profile_url: null,
      image: a.social_images || null,
      reauth_required: a.reauth_required === true,
    })
  }
  return out
}

// Same rule as src/lib/marketing.js composeCaption + buildPublishPayload.
function composeCaption(caption: string, hashtags: string[]) {
  const tags = (hashtags || []).map((t) => String(t).trim()).filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t.replace(/\s+/g, '')}`))
  const body = (caption || '').trim()
  if (!tags.length) return body
  return body ? `${body}\n\n${tags.join(' ')}` : tags.join(' ')
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller?.companyId) return json({ ok: false, error: 'Sign in first.' }, 401)
    const companyId = caller.companyId
    const isManager = caller.level >= 2

    const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')

    const { data: settingRow } = await sb.from('settings').select('id, value')
      .eq('company_id', companyId).eq('key', 'marketing_publisher').limit(1)
    let cfg: Cfg = {}
    try { cfg = settingRow?.[0]?.value ? JSON.parse(settingRow[0].value) : {} } catch { cfg = {} }
    let settingId: number | null = settingRow?.[0]?.id ?? null

    const saveCfg = async (next: Cfg) => {
      cfg = next
      const value = JSON.stringify(next)
      if (settingId) await sb.from('settings').update({ value }).eq('id', settingId)
      else {
        const { data: ins } = await sb.from('settings').insert({ company_id: companyId, key: 'marketing_publisher', value }).select('id').maybeSingle()
        settingId = ins?.id ?? null
      }
    }

    const username = cfg.profile_username || `jobscout-${companyId}`

    const refreshAccounts = async (): Promise<{ ok: boolean; accounts?: any[]; error?: string }> => {
      if (!cfg.profile_username || !PLATFORM_KEY) return { ok: true, accounts: [] }
      const r = await up('GET', `/uploadposts/users/${encodeURIComponent(username)}`)
      if (!r.ok) return { ok: false, error: upError(r.data) }
      const accounts = accountsFrom(r.data?.profile || r.data)
      await saveCfg({ ...cfg, accounts, accounts_refreshed_at: new Date().toISOString() })
      return { ok: true, accounts }
    }

    // ── status ────────────────────────────────────────────────────────
    if (action === 'status') {
      return json({
        ok: true,
        mode: PLATFORM_KEY ? 'platform' : 'unconfigured',
        platform_available: !!PLATFORM_KEY,
        accounts: cfg.accounts || [],
        networks: OFFERED,
        connected_at: cfg.connected_at || null,
      })
    }

    if (!PLATFORM_KEY) return json({ ok: false, error: 'Social publishing is not switched on for JobScout yet.', platform_missing: true }, 400)

    // ── connect ───────────────────────────────────────────────────────
    if (action === 'connect') {
      if (!isManager) return json({ ok: false, error: 'Only a Manager or above can connect social accounts.' }, 403)
      const network = body.network ? String(body.network) : null
      const origin = String(body.origin || '')
      if (network && !OFFERED.includes(network)) return json({ ok: false, error: `${network} is not available yet.` }, 400)

      // First time: make this company its own profile. 409/exists is fine.
      if (!cfg.profile_username) {
        const r = await up('POST', '/uploadposts/users', { username })
        const exists = !r.ok && /exist|already|duplicate/i.test(JSON.stringify(r.data))
        if (!r.ok && !exists) return json({ ok: false, error: `Could not set up the publisher: ${upError(r.data)}` }, 502)
        await saveCfg({ ...cfg, vendor: 'upload-post', profile_username: username, connected_at: new Date().toISOString(), accounts: cfg.accounts || [] })
      }

      const { data: co } = await sb.from('companies').select('company_name').eq('id', companyId).maybeSingle()
      const r = await up('POST', '/uploadposts/users/generate-jwt', {
        username,
        redirect_url: origin ? `${origin}/marketing?connected=1` : undefined,
        redirect_button_text: 'Back to JobScout',
        logo_image: LOGO,
        connect_title: network ? `Connect ${labelOf(network)}` : 'Connect your social accounts',
        connect_description: `${co?.company_name || 'Your company'} · posts from JobScout go to the accounts you connect here.`,
        platforms: network ? [network] : OFFERED,
        show_calendar: false,
        connect_theme: 'light',
      })
      if (!r.ok || !r.data?.access_url) return json({ ok: false, error: upError(r.data) }, 502)
      return json({ ok: true, url: r.data.access_url, expires_in: r.data.duration || null })
    }

    if (!cfg.profile_username) return json({ ok: false, error: 'No social accounts connected yet. Connect one on the Marketing page.', not_connected: true }, 400)

    // ── accounts ──────────────────────────────────────────────────────
    if (action === 'accounts') {
      const acc = await refreshAccounts()
      if (!acc.ok) return json({ ok: false, error: acc.error }, 400)
      return json({ ok: true, accounts: acc.accounts })
    }

    // ── publish ───────────────────────────────────────────────────────
    if (action === 'publish') {
      if (!isManager) return json({ ok: false, error: 'Only a Manager or above can publish. Save it as approved and a manager will send it.' }, 403)
      const postId = Number(body.post_id)
      const { data: post } = await sb.from('marketing_posts').select('*').eq('company_id', companyId).eq('id', postId).maybeSingle()
      if (!post) return json({ ok: false, error: 'Post not found.' }, 404)
      if (['posted', 'scheduled'].includes(post.status) && post.ayrshare_id) return json({ ok: false, error: `Already ${post.status}.` }, 400)
      if (!post.platforms?.length) return json({ ok: false, error: 'Pick at least one platform.' }, 400)
      // Re-read the profile so a just-connected network counts.
      const acc = await refreshAccounts()
      const linked = new Set((acc.accounts || cfg.accounts || []).map((a: any) => a.platform))
      const unlinked = post.platforms.filter((p: string) => !linked.has(p))
      if (unlinked.length) return json({ ok: false, error: `Not connected yet: ${unlinked.join(', ')}. Connect it under Channels first.` }, 400)

      const text = composeCaption(post.caption, post.hashtags)
      let media: string[] = (post.media_urls || []).filter(Boolean)
      // A suggested draft points at PRIVATE job photos. Only now, with a human
      // publishing, do copies go to the public bucket the publisher fetches from.
      if (!media.length && post.capture_ids?.length) {
        const { data: caps } = await sb.from('marketing_captures').select('id, bucket, path, url, media_type')
          .eq('company_id', companyId).in('id', post.capture_ids)
        const urls: string[] = []
        for (const [i, c] of (caps || []).entries()) {
          if (c.media_type === 'video') continue
          if (c.bucket === 'marketing-media' && c.url) { urls.push(c.url); continue }
          try {
            const { data: file, error } = await sb.storage.from(c.bucket).download(c.path)
            if (error || !file) continue
            const ext = (c.path.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg')
            const path = `${companyId}/published/${postId}_${i}.${ext}`
            const { error: upErr } = await sb.storage.from('marketing-media').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true })
            if (upErr) continue
            const { data: pub } = sb.storage.from('marketing-media').getPublicUrl(path)
            urls.push(pub.publicUrl)
          } catch (err) { console.warn('[marketing-publish] copy failed', c.id, err) }
        }
        media = urls
        if (media.length) await sb.from('marketing_posts').update({ media_urls: media }).eq('id', postId)
      }
      if (!text && !media.length) return json({ ok: false, error: 'Nothing to post: no caption and no media.' }, 400)

      const form = new FormData()
      form.append('user', username)
      for (const p of post.platforms) form.append('platform[]', p)
      form.append('title', text || ' ')
      if (post.platforms.includes('linkedin')) form.append('linkedin_description', text)
      for (const u of media) form.append('photos[]', u)
      let scheduled = false
      if (post.scheduled_for) {
        const d = new Date(post.scheduled_for)
        if (!isNaN(d.getTime()) && d.getTime() > Date.now() + 60_000) {
          form.append('scheduled_date', d.toISOString())
          form.append('timezone', 'UTC')
          scheduled = true
        }
      }

      const r = await up('POST', media.length ? '/upload_photos' : '/upload_text', form)
      const now = new Date().toISOString()
      if (!r.ok || r.data?.success === false || r.data?.error) {
        const error = upError(r.data)
        await sb.from('marketing_posts').update({ status: 'failed', error }).eq('id', postId)
        return json({ ok: false, error }, 400)
      }
      // 202 = scheduled/queued {job_id}; 200 sync = {platforms:{fb:{status,post_id,post_url}}}; 200 async = {request_id, platforms:{...pending}}
      const vendorId = r.data?.job_id || r.data?.request_id || null
      scheduled = scheduled || r.data?.status === 'scheduled' || r.data?.status === 'queued'
      const plat = r.data?.platforms && typeof r.data.platforms === 'object' ? r.data.platforms : {}
      const postUrls = Object.entries(plat).map(([platform, v]: any) => ({ platform, id: v?.post_id || null, postUrl: v?.post_url || null, status: v?.status || null }))
      const failedOnes = postUrls.filter((p) => p.status && !['success', 'pending', 'scheduled'].includes(p.status))
      const partial = failedOnes.length ? failedOnes.map((p) => `${p.platform}: ${(plat as any)[p.platform]?.error || p.status}`).join('; ') : null
      await sb.from('marketing_posts').update({
        status: scheduled ? 'scheduled' : 'posted',
        ayrshare_id: vendorId,
        post_urls: postUrls,
        posted_at: scheduled ? null : now,
        error: partial,
        approved_by: post.approved_by || caller.employeeId,
        approved_at: post.approved_at || now,
      }).eq('id', postId)
      if (post.capture_ids?.length) {
        await sb.from('marketing_captures').update({ status: 'used', post_id: postId }).eq('company_id', companyId).in('id', post.capture_ids)
      }
      return json({ ok: true, status: scheduled ? 'scheduled' : 'posted', post_urls: postUrls, warning: partial })
    }

    // ── delete (a scheduled post) ─────────────────────────────────────
    if (action === 'delete') {
      if (!isManager) return json({ ok: false, error: 'Only a Manager or above can unschedule.' }, 403)
      const postId = Number(body.post_id)
      const { data: post } = await sb.from('marketing_posts').select('id, ayrshare_id, status').eq('company_id', companyId).eq('id', postId).maybeSingle()
      if (!post) return json({ ok: false, error: 'Post not found.' }, 404)
      if (post.ayrshare_id && post.status === 'scheduled') {
        const r = await up('DELETE', `/uploadposts/schedule/${encodeURIComponent(post.ayrshare_id)}`)
        if (!r.ok && r.status !== 404) return json({ ok: false, error: upError(r.data) }, 400)
      }
      await sb.from('marketing_posts').update({ status: 'approved', ayrshare_id: null, post_urls: [], posted_at: null, error: null }).eq('id', postId)
      return json({ ok: true })
    }

    return json({ ok: false, error: `Unknown action "${action}"` }, 400)
  } catch (err) {
    console.error('[marketing-publish]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Publish failed' }, 500)
  }
})

function labelOf(id: string) {
  return ({ facebook: 'Facebook', instagram: 'Instagram', google_business: 'Google Business', linkedin: 'LinkedIn', x: 'X', threads: 'Threads', tiktok: 'TikTok', youtube: 'YouTube', pinterest: 'Pinterest', bluesky: 'Bluesky' } as Record<string, string>)[id] || id
}

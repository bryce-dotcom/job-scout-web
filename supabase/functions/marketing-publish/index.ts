// marketing-publish: the one place JobScout talks to Ayrshare.
//
// Two ways a company can be connected:
//
//   platform (the product)  JobScout holds ONE Ayrshare Business-plan key
//                           (secret AYRSHARE_API_KEY). Each company gets an
//                           Ayrshare "profile" created here on first use; its
//                           profileKey is stored in settings.marketing_ayrshare.
//                           The user never sees Ayrshare: they click Connect
//                           Facebook on the Channels tab, we mint a link
//                           session, the popup runs Facebook's own login, and
//                           the account is linked to their profile.
//   byo (fallback / dev)    The company pastes its own Ayrshare API key. Kept
//                           for development and for a tenant that already has
//                           Ayrshare; hidden behind "Advanced" in the UI.
//
// Every request after that is the same call with different auth headers, so
// `authFor(cfg)` is the only place the difference lives.
//
// Who may do what: anyone signed in can look; connecting, publishing and
// deleting need Manager or above. The gate lives here, next to the key.
//
// Body: { action, ... }
//   status      {}                       mode + linked accounts (cached) + which networks can be offered
//   connect     { network?, origin }     ensure profile, mint a link session → { url }; no network = hosted grid page
//   disconnect  { platform }             unlink one network from the profile
//   accounts    {}                       refresh the cached account list from Ayrshare
//   save_key    { api_key }              byo fallback: validate + store a tenant's own key
//   publish     { post_id }              post now, or schedule if scheduled_for is in the future
//   delete      { post_id }              delete a scheduled post at Ayrshare

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { resolveCaller } from '../_shared/auth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const AYR = 'https://api.ayrshare.com/api'
const PLATFORM_KEY = Deno.env.get('AYRSHARE_API_KEY') || ''
const PLATFORM_DOMAIN = Deno.env.get('AYRSHARE_DOMAIN') || ''
// X needs the tenant's (or our) X developer app; without it X is not offered.
const X_KEY = Deno.env.get('AYRSHARE_X_OAUTH1_KEY') || ''
const X_SECRET = Deno.env.get('AYRSHARE_X_OAUTH1_SECRET') || ''

// Networks we offer in platform mode, in the order the Channels tab shows them.
const OFFERED = ['facebook', 'instagram', 'gmb', 'linkedin', 'twitter', 'threads', 'tiktok', 'youtube', 'pinterest', 'bluesky']

type Cfg = {
  mode?: 'platform' | 'byo'
  api_key?: string
  profile_key?: string
  ref_id?: string
  title?: string
  accounts?: any[]
  [k: string]: unknown
}

function authFor(cfg: Cfg): Record<string, string> | null {
  if (cfg.profile_key && PLATFORM_KEY) return { Authorization: `Bearer ${PLATFORM_KEY}`, 'Profile-Key': cfg.profile_key }
  if (cfg.api_key) return { Authorization: `Bearer ${cfg.api_key}` }
  return null
}

async function ayr(headers: Record<string, string>, method: string, path: string, body?: unknown) {
  const res = await fetch(`${AYR}${path}`, {
    method,
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  let data: any = null
  const text = await res.text()
  try { data = JSON.parse(text) } catch { data = { raw: text } }
  return { ok: res.ok, status: res.status, data }
}

function ayrError(data: any): string {
  if (!data) return 'No reply from Ayrshare'
  if (Array.isArray(data.errors) && data.errors.length) {
    return data.errors.map((e: any) => [e.platform, e.message].filter(Boolean).join(': ')).join('; ')
  }
  return data.message || data.error || data.raw || 'Ayrshare refused the request'
}

function accountsFrom(user: any) {
  const names: any[] = Array.isArray(user?.displayNames) ? user.displayNames : []
  const active: string[] = Array.isArray(user?.activeSocialAccounts) ? user.activeSocialAccounts : []
  const byPlatform = new Map<string, any>()
  for (const n of names) {
    if (!n?.platform) continue
    byPlatform.set(n.platform, {
      platform: n.platform,
      display_name: n.displayName || n.pageName || n.username || n.platform,
      username: n.username || null,
      profile_url: n.profileUrl || null,
      image: n.userImage || null,
    })
  }
  for (const p of active) if (!byPlatform.has(p)) byPlatform.set(p, { platform: p, display_name: p })
  return [...byPlatform.values()]
}

// Same rule as src/lib/marketing.js composeCaption + buildAyrsharePayload.
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
      .eq('company_id', companyId).eq('key', 'marketing_ayrshare').limit(1)
    let cfg: Cfg = {}
    try { cfg = settingRow?.[0]?.value ? JSON.parse(settingRow[0].value) : {} } catch { cfg = {} }

    const saveCfg = async (next: Cfg) => {
      cfg = next
      const value = JSON.stringify(next)
      if (settingRow?.[0]?.id) await sb.from('settings').update({ value }).eq('id', settingRow[0].id)
      else {
        const { data: ins } = await sb.from('settings').insert({ company_id: companyId, key: 'marketing_ayrshare', value }).select('id').maybeSingle()
        if (ins?.id && settingRow) settingRow[0] = { id: ins.id, value }
      }
    }

    const offered = () => OFFERED.filter((n) => n !== 'twitter' || (X_KEY && X_SECRET))
    const modeOf = () => (cfg.profile_key && PLATFORM_KEY ? 'platform' : cfg.api_key ? 'byo' : PLATFORM_KEY ? 'platform' : 'unconfigured')

    const refreshAccounts = async (): Promise<{ ok: boolean; accounts?: any[]; error?: string; user?: any }> => {
      const h = authFor(cfg)
      if (!h) return { ok: true, accounts: [] }
      const r = await ayr(h, 'GET', '/user')
      if (!r.ok) return { ok: false, error: ayrError(r.data) }
      const accounts = accountsFrom(r.data)
      await saveCfg({
        ...cfg, accounts, accounts_refreshed_at: new Date().toISOString(),
        monthly_post_quota: r.data?.monthlyPostQuota ?? cfg.monthly_post_quota ?? null,
        monthly_post_count: r.data?.monthlyPostCount ?? cfg.monthly_post_count ?? null,
      })
      return { ok: true, accounts, user: r.data }
    }

    // ── status ────────────────────────────────────────────────────────
    if (action === 'status') {
      return json({
        ok: true, mode: modeOf(), platform_available: !!PLATFORM_KEY,
        accounts: cfg.accounts || [], networks: offered(),
        connected_at: cfg.connected_at || null,
      })
    }

    // ── connect (platform mode) ───────────────────────────────────────
    if (action === 'connect') {
      if (!isManager) return json({ ok: false, error: 'Only a Manager or above can connect social accounts.' }, 403)
      if (!PLATFORM_KEY) return json({ ok: false, error: 'Social publishing is not switched on for JobScout yet.', platform_missing: true }, 400)
      const network = body.network ? String(body.network) : null
      const origin = String(body.origin || '')
      if (network && !offered().includes(network)) return json({ ok: false, error: `${network} is not available yet.` }, 400)

      // First time: make this company its own Ayrshare profile.
      if (!cfg.profile_key) {
        const { data: co } = await sb.from('companies').select('company_name').eq('id', companyId).maybeSingle()
        const title = `${(co?.company_name || 'Company').slice(0, 60)} · JobScout #${companyId}`
        const r = await ayr({ Authorization: `Bearer ${PLATFORM_KEY}` }, 'POST', '/profiles', { title, hideTopHeader: true, hideLogo: true })
        if (!r.ok || !r.data?.profileKey) return json({ ok: false, error: `Could not set up the publisher: ${ayrError(r.data)}` }, 502)
        await saveCfg({
          ...cfg, mode: 'platform', profile_key: r.data.profileKey, ref_id: r.data.refId || null, title,
          connected_at: new Date().toISOString(), accounts: cfg.accounts || [],
        })
      }

      const h = authFor(cfg)!
      const extra: Record<string, string> = {}
      if (network === 'twitter' && X_KEY && X_SECRET) { extra['X-Twitter-OAuth1-Api-Key'] = X_KEY; extra['X-Twitter-OAuth1-Api-Secret'] = X_SECRET }
      const payload: Record<string, unknown> = network
        ? { mode: 'connect', network, origin }
        : { mode: 'grid', allowedSocial: offered(), redirect: origin ? `${origin}/marketing?linked=1` : undefined }
      if (PLATFORM_DOMAIN) payload.domain = PLATFORM_DOMAIN
      if (network === 'instagram') payload.instagramLinkMethod = 'facebook'
      const r = await ayr({ ...h, ...extra }, 'POST', '/profiles/link-sessions', payload)
      if (!r.ok || !r.data?.url) return json({ ok: false, error: ayrError(r.data) }, 502)
      return json({ ok: true, url: r.data.url, expires_at: r.data.expiresAt || null, mode: network ? 'connect' : 'grid' })
    }

    // ── disconnect ────────────────────────────────────────────────────
    if (action === 'disconnect') {
      if (!isManager) return json({ ok: false, error: 'Only a Manager or above can disconnect.' }, 403)
      const h = authFor(cfg)
      if (!h) return json({ ok: false, error: 'Nothing is connected.' }, 400)
      const platform = String(body.platform || '')
      const r = await ayr(h, 'DELETE', '/profiles/social', { platform })
      if (!r.ok) return json({ ok: false, error: ayrError(r.data) }, 400)
      const acc = await refreshAccounts()
      return json({ ok: true, accounts: acc.accounts || [] })
    }

    // ── save_key (byo fallback) ───────────────────────────────────────
    if (action === 'save_key') {
      if (!isManager) return json({ ok: false, error: 'Only a Manager or above can connect the publisher.' }, 403)
      const apiKey = String(body.api_key || '').trim()
      if (!apiKey) return json({ ok: false, error: 'Paste the Ayrshare API key.' }, 400)
      const r = await ayr({ Authorization: `Bearer ${apiKey}` }, 'GET', '/user')
      if (!r.ok) return json({ ok: false, error: `Ayrshare did not accept that key: ${ayrError(r.data)}` }, 400)
      const accounts = accountsFrom(r.data)
      await saveCfg({
        ...cfg, mode: 'byo', api_key: apiKey, profile_key: undefined, ref_id: undefined,
        connected_at: new Date().toISOString(), accounts, accounts_refreshed_at: new Date().toISOString(),
        monthly_post_quota: r.data?.monthlyPostQuota ?? null, monthly_post_count: r.data?.monthlyPostCount ?? null,
      })
      return json({ ok: true, accounts })
    }

    const auth = authFor(cfg)
    if (!auth) return json({ ok: false, error: 'No social accounts connected yet. Connect one on the Marketing page.', not_connected: true }, 400)

    // ── accounts ──────────────────────────────────────────────────────
    if (action === 'accounts') {
      const acc = await refreshAccounts()
      if (!acc.ok) return json({ ok: false, error: acc.error }, 400)
      return json({ ok: true, accounts: acc.accounts, monthly_post_quota: acc.user?.monthlyPostQuota ?? null, monthly_post_count: acc.user?.monthlyPostCount ?? null })
    }

    // ── publish ───────────────────────────────────────────────────────
    if (action === 'publish') {
      if (!isManager) return json({ ok: false, error: 'Only a Manager or above can publish. Save it as approved and a manager will send it.' }, 403)
      const postId = Number(body.post_id)
      const { data: post } = await sb.from('marketing_posts').select('*').eq('company_id', companyId).eq('id', postId).maybeSingle()
      if (!post) return json({ ok: false, error: 'Post not found.' }, 404)
      if (['posted', 'scheduled'].includes(post.status) && post.ayrshare_id) return json({ ok: false, error: `Already ${post.status}.` }, 400)
      if (!post.platforms?.length) return json({ ok: false, error: 'Pick at least one platform.' }, 400)
      const linked = new Set((cfg.accounts || []).map((a: any) => a.platform))
      const unlinked = post.platforms.filter((p: string) => !linked.has(p))
      if (unlinked.length) return json({ ok: false, error: `Not connected yet: ${unlinked.join(', ')}. Connect it under Channels first.` }, 400)

      const payload: any = {
        post: composeCaption(post.caption, post.hashtags),
        platforms: post.platforms,
      }
      const media = (post.media_urls || []).filter(Boolean)
      if (media.length) payload.mediaUrls = media
      if (post.scheduled_for) {
        const d = new Date(post.scheduled_for)
        if (!isNaN(d.getTime()) && d.getTime() > Date.now() + 60_000) payload.scheduleDate = d.toISOString().replace(/\.\d{3}Z$/, 'Z')
      }
      if (!payload.post && !media.length) return json({ ok: false, error: 'Nothing to post: no caption and no media.' }, 400)

      const r = await ayr(auth, 'POST', '/post', payload)
      const now = new Date().toISOString()
      if (!r.ok || r.data?.status === 'error') {
        const error = ayrError(r.data)
        await sb.from('marketing_posts').update({ status: 'failed', error, ayrshare_id: r.data?.id || post.ayrshare_id || null }).eq('id', postId)
        return json({ ok: false, error }, 400)
      }
      const scheduled = r.data?.status === 'scheduled' || !!payload.scheduleDate
      const postUrls = Array.isArray(r.data?.postIds)
        ? r.data.postIds.map((p: any) => ({ platform: p.platform, id: p.id, postUrl: p.postUrl || null, status: p.status }))
        : []
      // Some platforms can fail while others succeed; Ayrshare reports both.
      const partial = Array.isArray(r.data?.errors) && r.data.errors.length ? ayrError(r.data) : null
      await sb.from('marketing_posts').update({
        status: scheduled ? 'scheduled' : 'posted',
        ayrshare_id: r.data?.id || null,
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
      if (post.ayrshare_id) {
        const r = await ayr(auth, 'DELETE', '/post', { id: post.ayrshare_id })
        if (!r.ok && r.status !== 404) return json({ ok: false, error: ayrError(r.data) }, 400)
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

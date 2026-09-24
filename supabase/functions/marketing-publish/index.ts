// marketing-publish: the one place JobScout talks to Ayrshare.
//
// Ayrshare is the publisher. One API key per company (settings key
// marketing_ayrshare), pasted on the Marketing page's setup walkthrough; the
// company links its Facebook / Instagram / Google Business / LinkedIn / X
// accounts on Ayrshare's own page, and from then on a post here is
// POST /api/post there. Phase 2 can swap the per-company key for a platform
// key plus Ayrshare "profiles" (one header change: Profile-Key) without the
// page noticing.
//
// Who may do what: anyone signed in can look at connected accounts; saving
// the key, publishing and deleting need Manager or above. The gate lives
// here, next to the key, not in RLS.
//
// Body: { action: 'save_key' | 'accounts' | 'publish' | 'delete', ... }
//   save_key { api_key }              validates against /api/user then stores it
//   accounts {}                       refreshes the cached account list
//   publish  { post_id }              posts now, or schedules if scheduled_for is future
//   delete   { post_id }              deletes a scheduled post at Ayrshare

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

async function ayr(apiKey: string, method: string, path: string, body?: unknown) {
  const res = await fetch(`${AYR}${path}`, {
    method,
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
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
    let cfg: any = {}
    try { cfg = settingRow?.[0]?.value ? JSON.parse(settingRow[0].value) : {} } catch { cfg = {} }

    const saveCfg = async (next: any) => {
      const value = JSON.stringify(next)
      if (settingRow?.[0]?.id) await sb.from('settings').update({ value }).eq('id', settingRow[0].id)
      else await sb.from('settings').insert({ company_id: companyId, key: 'marketing_ayrshare', value })
    }

    // ── save_key ──────────────────────────────────────────────────────
    if (action === 'save_key') {
      if (!isManager) return json({ ok: false, error: 'Only a Manager or above can connect the publisher.' }, 403)
      const apiKey = String(body.api_key || '').trim()
      if (!apiKey) return json({ ok: false, error: 'Paste the Ayrshare API key.' }, 400)
      const r = await ayr(apiKey, 'GET', '/user')
      if (!r.ok) return json({ ok: false, error: `Ayrshare did not accept that key: ${ayrError(r.data)}` }, 400)
      const accounts = accountsFrom(r.data)
      await saveCfg({
        ...cfg, api_key: apiKey, connected_at: new Date().toISOString(), accounts,
        accounts_refreshed_at: new Date().toISOString(),
        plan: r.data?.plan || null, monthly_post_quota: r.data?.monthlyPostQuota ?? null, monthly_post_count: r.data?.monthlyPostCount ?? null,
      })
      return json({ ok: true, accounts })
    }

    if (!cfg.api_key) return json({ ok: false, error: 'Ayrshare is not connected yet. Finish setup on the Marketing page.', not_connected: true }, 400)

    // ── accounts ──────────────────────────────────────────────────────
    if (action === 'accounts') {
      const r = await ayr(cfg.api_key, 'GET', '/user')
      if (!r.ok) return json({ ok: false, error: ayrError(r.data) }, 400)
      const accounts = accountsFrom(r.data)
      await saveCfg({
        ...cfg, accounts, accounts_refreshed_at: new Date().toISOString(),
        monthly_post_quota: r.data?.monthlyPostQuota ?? cfg.monthly_post_quota ?? null,
        monthly_post_count: r.data?.monthlyPostCount ?? cfg.monthly_post_count ?? null,
      })
      return json({ ok: true, accounts, monthly_post_quota: r.data?.monthlyPostQuota ?? null, monthly_post_count: r.data?.monthlyPostCount ?? null })
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
      if (unlinked.length) return json({ ok: false, error: `Not linked on Ayrshare yet: ${unlinked.join(', ')}. Link it there, then refresh accounts.` }, 400)

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

      const r = await ayr(cfg.api_key, 'POST', '/post', payload)
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
        const r = await ayr(cfg.api_key, 'DELETE', '/post', { id: post.ayrshare_id })
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

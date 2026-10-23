// marketing-hit: the tenant's own website, counted by JobScout.
//
// Two doors, both public (verify_jwt=false):
//   GET  ?js=<site key>   → the snippet itself, one <script> tag's worth of
//                           JavaScript. It posts a beacon on load and on each
//                           in-page navigation, remembers a random visitor id
//                           in localStorage, and sends nothing else.
//   POST {k, e, p, r, u}  → one hit. k = site key, e = event (view | quote |
//                           form), p = path, r = referrer, u = utm fields.
//
// The site key is a random string in settings (marketing_site_key); it names
// the company and nothing more. Google Analytics would need every tenant to
// connect a Google account and Google to verify our app first; this needs a
// line pasted into their site. Bots that announce themselves are dropped.
//
// What is NOT here: no cookies, no cross-site anything, no IP stored. The
// visitor id lives in the visitor's own browser and means "the same browser
// came back", not a person.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

const BOT_RE = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|uptime|monitor/i
const KEY_RE = /^[a-z0-9]{12,40}$/
const clip = (v: unknown, n: number) => { const s = String(v ?? '').trim(); return s ? s.slice(0, n) : null }
const hostOf = (v: unknown) => { try { return new URL(String(v)).hostname.toLowerCase() || null } catch { return null } }

// Site key → company id, remembered for the life of the isolate.
const keyCache = new Map<string, { id: number; at: number }>()
async function companyForKey(sb: any, key: string): Promise<number | null> {
  const hit = keyCache.get(key)
  if (hit && Date.now() - hit.at < 10 * 60 * 1000) return hit.id
  const { data } = await sb.from('settings').select('company_id, value').eq('key', 'marketing_site_key').eq('value', key).limit(1)
  const row = data?.[0]
  if (!row) return null
  keyCache.set(key, { id: row.company_id, at: Date.now() })
  return row.company_id
}

const snippet = (fnUrl: string, key: string) => `(function(){
  if (!window.fetch || !window.localStorage) return;
  if (/bot|crawl|spider|headless/i.test(navigator.userAgent)) return;
  var K='${key}', U='${fnUrl}', V;
  try { V = localStorage.getItem('js_v'); if (!V) { V = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('js_v', V); } } catch (e) { V = null; }
  function utm(){ var q = new URLSearchParams(location.search), o = {}; ['utm_source','utm_medium','utm_campaign','utm_content'].forEach(function(n){ var x = q.get(n); if (x) o[n] = x; }); return o; }
  var first = utm(); try { if (Object.keys(first).length) sessionStorage.setItem('js_utm', JSON.stringify(first)); else { var s = sessionStorage.getItem('js_utm'); if (s) first = JSON.parse(s); } } catch (e) {}
  var last = '';
  function hit(e){
    var p = location.pathname + location.search; if (e === 'view' && p === last) return; last = p;
    try { fetch(U, { method: 'POST', keepalive: true, headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ k: K, e: e, p: location.pathname, h: location.hostname, r: document.referrer || '', u: first, v: V }) }); } catch (x) {}
  }
  hit('view');
  var ps = history.pushState; history.pushState = function(){ ps.apply(this, arguments); setTimeout(function(){ hit('view'); }, 0); };
  window.addEventListener('popstate', function(){ hit('view'); });
  document.addEventListener('submit', function(){ hit('form'); }, true);
  window.jobscoutHit = hit;
})();`

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const sb = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { autoRefreshToken: false, persistSession: false } })
  try {
    const url = new URL(req.url)
    const jsKey = url.searchParams.get('js')
    if (req.method === 'GET' && jsKey) {
      if (!KEY_RE.test(jsKey)) return new Response('// unknown site', { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/javascript' } })
      const fnUrl = `${SUPABASE_URL}/functions/v1/marketing-hit`
      return new Response(snippet(fnUrl, jsKey), { headers: { ...corsHeaders, 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
    }
    if (req.method !== 'POST') return json({ ok: false }, 405)

    const ua = req.headers.get('user-agent') || ''
    if (BOT_RE.test(ua)) return json({ ok: true, dropped: 'bot' })
    const body = await req.json().catch(() => ({}))
    const key = String(body.k || '')
    if (!KEY_RE.test(key)) return json({ ok: false, error: 'unknown site' }, 404)
    const companyId = await companyForKey(sb, key)
    if (!companyId) return json({ ok: false, error: 'unknown site' }, 404)
    const u = body.u && typeof body.u === 'object' ? body.u : {}
    const event = ['view', 'quote', 'form'].includes(String(body.e)) ? String(body.e) : 'view'
    const refHost = hostOf(body.r)
    const host = clip(body.h, 120)
    await sb.from('site_hits').insert({
      company_id: companyId, event, host, path: clip(body.p, 300),
      referrer_host: refHost && refHost !== host ? refHost : null,
      utm_source: clip(u.utm_source, 60), utm_medium: clip(u.utm_medium, 60), utm_campaign: clip(u.utm_campaign, 80), utm_content: clip(u.utm_content, 80),
      visitor: clip(body.v, 60), user_agent: clip(ua, 200),
    })
    return json({ ok: true })
  } catch (err) {
    console.error('[marketing-hit]', err)
    return json({ ok: false }, 500)
  }
})

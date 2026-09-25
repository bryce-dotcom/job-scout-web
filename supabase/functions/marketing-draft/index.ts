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
    const r = await draftFromCaptures({
      sb, companyId: caller.companyId, req,
      captureIds: Array.isArray(body.capture_ids) ? body.capture_ids : [],
      note: body.note, platforms: Array.isArray(body.platforms) ? body.platforms : [],
      jobId: body.job_id ? Number(body.job_id) : null, tone: body.tone, feature: 'marketing-draft',
    })
    if (!r.ok) return json({ ok: false, error: r.error, ai_unavailable: r.unavailable === true }, r.unavailable ? 502 : 400)
    return json({ ok: true, caption: r.caption, hashtags: r.hashtags, alt_text: r.alt_text })
  } catch (err) {
    console.error('[marketing-draft]', err)
    return json({ ok: false, error: (err as Error)?.message || 'Draft failed' }, 500)
  }
})

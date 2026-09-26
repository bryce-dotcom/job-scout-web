import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { bidsInboxAddress } from '../_shared/replyToken.ts'

// Sal's inbox address for the caller's company.
//
// The address is bids+<signed company token>@<inbound domain>. The signature
// needs REPLY_TOKEN_SECRET, which lives only on the server, so the browser
// asks here instead of computing it. The JWT is the identity; the body only
// names the tenant, and the caller must be on that tenant's roster — the
// same check benny-bid-intake makes. Read-only: it returns one string.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!
  const secret = Deno.env.get('REPLY_TOKEN_SECRET') || ''
  const domain = Deno.env.get('INBOUND_EMAIL_DOMAIN') || 'appsannex.com'

  try {
    const body = await req.json().catch(() => ({}))
    const companyId = Number(body?.company_id)
    if (!companyId) return json({ error: 'company_id is required' }, 400)

    const auth = req.headers.get('Authorization') || ''
    const uRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { Authorization: auth, apikey: ANON_KEY } })
    const user = uRes.ok ? await uRes.json() : null
    if (!user?.email) return json({ error: 'Sign in to see Sal\'s address' }, 401)
    const svc = { Authorization: `Bearer ${SERVICE_KEY}`, apikey: SERVICE_KEY }
    const empRes = await fetch(`${SUPABASE_URL}/rest/v1/employees?select=id&company_id=eq.${companyId}&email=ilike.${encodeURIComponent(user.email)}&limit=1`, { headers: svc })
    const emp = (await empRes.json())?.[0]
    if (!emp) return json({ error: 'You are not on this company\'s roster' }, 403)

    // No secret means no verifiable address: say so rather than hand out an
    // address whose mail would be filed nowhere.
    if (!secret) return json({ error: 'Sal\'s inbox is not configured on the server yet (REPLY_TOKEN_SECRET)' }, 503)

    const address = await bidsInboxAddress(companyId, secret, domain)
    return json({ ok: true, address, domain })
  } catch (err) {
    console.error('[sal-inbox-address]', err)
    return json({ error: (err as Error)?.message || 'Could not build the address' }, 500)
  }
})

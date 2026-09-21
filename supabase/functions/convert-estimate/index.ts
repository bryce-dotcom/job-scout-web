// Approve and/or convert an estimate — the page's two Approve buttons and
// its Convert to Job button, moved server-side so the portal and Arnie do
// the exact same thing (see _shared/estimateConvert.ts).
//
//   POST { quote_id, approve?: true, deposit?: { amount, method, date, notes, photo_url }, convert?: true }
//
// Caller: a signed-in employee of the estimate's company (JWT). Any level
// — the estimate page has never gated approving or converting, and a rep
// closing their own deal is the point. Service-role calls are refused;
// this is a person's action.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { resolveCaller } from "../_shared/auth.ts";
import { approveEstimate, convertEstimate } from "../_shared/estimateConvert.ts";
import { readRecordList } from "../_shared/arnieRest.ts";

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const rest = { url: SUPABASE_URL, key: SERVICE_KEY }
const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type' }
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller || caller.companyId == null) return json({ error: 'Sign in as an employee to do this.' }, 401)
    const body = await req.json().catch(() => ({}))
    const quoteId = Number(body.quote_id)
    if (!quoteId) return json({ error: 'quote_id is required' }, 400)
    const [quote] = await readRecordList(rest, `quotes?select=id,company_id,job_id,status&id=eq.${quoteId}&limit=1`)
    if (!quote || quote.company_id !== caller.companyId) return json({ error: 'No such estimate.' }, 404)

    const out: Record<string, unknown> = { quote_id: quoteId }
    if (body.approve) {
      const dep = body.deposit && Number(body.deposit.amount) > 0 ? { amount: Number(body.deposit.amount), method: body.deposit.method || null, date: body.deposit.date || null, notes: body.deposit.notes || null, photo_url: body.deposit.photo_url || null } : null
      const a = await approveEstimate(rest, caller.companyId, quoteId, { deposit: dep, createdBy: caller.email })
      if (!a.ok) return json({ error: a.error }, 500)
      out.approved = true; out.deposit_payment_id = a.paymentId
    }
    if (body.convert !== false) {
      if (quote.job_id) { out.converted = false; out.job_id = quote.job_id; out.already = true }
      else {
        const c = await convertEstimate(rest, caller.companyId, quoteId, { createdBy: caller.email })
        if (!c.ok) return json({ error: c.error, stale: c.stale === true, ...out }, c.stale ? 409 : 500)
        out.converted = true; out.job = c.result
      }
    }
    return json(out)
  } catch (e: any) {
    console.error('[convert-estimate]', e)
    return json({ error: e?.message || 'failed' }, 500)
  }
})

// tenant-prospecting-portal
// =====================================================================
// Creates a Stripe Customer Portal session for managing the Prospecting
// Pro subscription. Customer clicks "Manage Subscription" in Settings,
// we return a URL, they redirect to Stripe-hosted portal where they
// can update card, switch monthly↔annual, cancel, etc.
//
// Body: { company_id, return_url? }
// Returns: { url: 'https://billing.stripe.com/...' }
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

async function stripe(path: string, body: Record<string, string>, apiKey: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body).toString(),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${data?.error?.message || res.status}`);
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const STRIPE_KEY = Deno.env.get('JOBSCOUT_MASTER_STRIPE_KEY');
    if (!STRIPE_KEY) return json({ error: 'JOBSCOUT_MASTER_STRIPE_KEY not configured' }, 500);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Authorization required' }, 401);
    const { data: { user: callerUser }, error: userErr } = await supabase.auth.getUser(auth);
    if (userErr || !callerUser) return json({ error: 'Invalid auth token' }, 401);

    const body = await req.json().catch(() => ({}));
    const { company_id, return_url } = body;
    if (!company_id) return json({ error: 'company_id required' }, 400);

    const { data: callerEmp } = await supabase
      .from('employees')
      .select('id, user_role, has_hr_access, is_developer')
      .eq('company_id', company_id)
      .ilike('email', callerUser.email!)
      .maybeSingle();
    if (!callerEmp) return json({ error: 'Not a member of that company' }, 403);
    const isAdmin = callerEmp.is_developer
      || callerEmp.has_hr_access
      || ['Admin', 'Owner', 'Super Admin'].includes(callerEmp.user_role || '');
    if (!isAdmin) return json({ error: 'Only admins can manage subscriptions' }, 403);

    const { data: company } = await supabase
      .from('companies')
      .select('master_stripe_customer_id')
      .eq('id', company_id)
      .single();
    if (!company?.master_stripe_customer_id) {
      return json({ error: 'No Stripe customer on file for this company.' }, 404);
    }

    const origin = req.headers.get('origin') || req.headers.get('referer') || 'https://jobscout.appsannex.com';
    const baseUrl = origin.replace(/\/+$/, '').replace(/\/settings.*$/i, '');

    const session = await stripe('billing_portal/sessions', {
      customer: company.master_stripe_customer_id,
      return_url: return_url || `${baseUrl}/settings#subscription`,
    }, STRIPE_KEY);

    return json({ ok: true, url: session.url });
  } catch (err) {
    console.error('[tenant-prospecting-portal] crashed:', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});

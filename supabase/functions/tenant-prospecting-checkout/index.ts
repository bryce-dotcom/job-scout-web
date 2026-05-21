// tenant-prospecting-checkout
// =====================================================================
// Creates a Stripe Checkout Session for the AI Prospecting Pro
// subscription ($49/mo or $470/yr). Returns the hosted-page URL —
// the client redirects to it; Stripe handles the card capture and
// redirects back to JobScout when done.
//
// We use Stripe Checkout (hosted) here instead of Stripe Elements
// (in-app) — different from the existing JobScout-tier subscription
// flow, but simpler for add-on purchases. The customer has already
// completed Elements card capture for their main JobScout
// subscription; reusing that saved card via Checkout's "Use payment
// method on file" flow keeps the friction low while letting them
// review the new charge before confirming.
//
// Body: { company_id, interval: 'month' | 'year' }
// Returns: { url: 'https://checkout.stripe.com/...' }
//
// Auth: JWT bearer required; caller must belong to the company.
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

const STRIPE_API = 'https://api.stripe.com/v1';

async function stripe(path: string, body: Record<string, string>, apiKey: string) {
  const res = await fetch(`${STRIPE_API}/${path}`, {
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

    // Auth
    const auth = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!auth) return json({ error: 'Authorization required' }, 401);
    const { data: { user: callerUser }, error: userErr } = await supabase.auth.getUser(auth);
    if (userErr || !callerUser) return json({ error: 'Invalid auth token' }, 401);

    const body = await req.json().catch(() => ({}));
    const { company_id, interval = 'month' } = body;
    if (!company_id) return json({ error: 'company_id required' }, 400);
    if (!['month', 'year'].includes(interval)) return json({ error: "interval must be 'month' or 'year'" }, 400);

    // Verify caller belongs to this company + has the authority to upgrade.
    // Admin+ or has_hr_access — same threshold as managing the main subscription.
    const { data: callerEmp } = await supabase
      .from('employees')
      .select('id, company_id, user_role, has_hr_access, is_developer')
      .eq('company_id', company_id)
      .ilike('email', callerUser.email!)
      .maybeSingle();
    if (!callerEmp) return json({ error: 'Not a member of that company' }, 403);
    const isAdmin = callerEmp.is_developer
      || callerEmp.has_hr_access
      || ['Admin', 'Owner', 'Super Admin'].includes(callerEmp.user_role || '');
    if (!isAdmin) return json({ error: 'Only admins can manage subscriptions' }, 403);

    // Pull company state
    const { data: company } = await supabase
      .from('companies')
      .select('id, company_name, owner_email, master_stripe_customer_id, prospecting_stripe_sub_id, prospecting_tier, subscription_tier')
      .eq('id', company_id)
      .single();
    if (!company) return json({ error: 'Company not found' }, 404);

    // Field Boss: prospecting is bundled in, don't allow them to also pay
    if (company.subscription_tier === 'field_boss') {
      return json({ error: 'You\'re on the Field Boss plan — AI Prospecting is already included for free.' }, 409);
    }

    // Already paying for Prospecting Pro
    if (company.prospecting_stripe_sub_id) {
      return json({ error: 'Already subscribed to Prospecting Pro. Use the Manage Subscription button to change billing.' }, 409);
    }

    // Pull price IDs from system_settings
    const { data: idsRow } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'prospecting_stripe_ids')
      .single();
    const ids = idsRow?.value;
    if (!ids?.monthly_price_id || !ids?.annual_price_id) {
      return json({ error: 'Prospecting Pro pricing not set up. Run scripts/setup-prospecting-products.cjs.' }, 500);
    }
    const priceId = interval === 'year' ? ids.annual_price_id : ids.monthly_price_id;

    // If the company doesn't have a Stripe customer yet, create one.
    // (Most do — they're already on a JobScout tier — but defensive.)
    let customerId = company.master_stripe_customer_id;
    if (!customerId) {
      const cust = await stripe('customers', {
        name: company.company_name || `Company ${company.id}`,
        email: company.owner_email || callerUser.email || '',
        'metadata[jobscout_company_id]': String(company.id),
      }, STRIPE_KEY);
      customerId = cust.id;
      await supabase.from('companies').update({ master_stripe_customer_id: customerId }).eq('id', company.id);
    }

    // Build the Checkout Session. metadata is crucial — the webhook
    // reads jobscout_product='prospecting_pro' + jobscout_company_id
    // to know what to flip on success.
    const origin = req.headers.get('origin') || req.headers.get('referer') || 'https://jobscout.appsannex.com';
    // Strip trailing slashes + any path so we can append /settings#subscription cleanly.
    const baseUrl = origin.replace(/\/+$/, '').replace(/\/settings.*$/i, '');

    const session = await stripe('checkout/sessions', {
      mode: 'subscription',
      customer: customerId,
      'line_items[0][price]': priceId,
      'line_items[0][quantity]': '1',
      success_url: `${baseUrl}/settings?prospecting_upgraded=1#subscription`,
      cancel_url:  `${baseUrl}/settings?prospecting_cancel=1#subscription`,
      // metadata on the session — picked up by the webhook's
      // checkout.session.completed event handler
      'metadata[jobscout_company_id]':  String(company.id),
      'metadata[jobscout_product_id]':  'prospecting_pro',
      'metadata[interval]':             interval,
      // metadata on the subscription itself — so future updates
      // (price change, cancel) also carry the routing info
      'subscription_data[metadata][jobscout_company_id]':  String(company.id),
      'subscription_data[metadata][jobscout_product_id]':  'prospecting_pro',
      'subscription_data[metadata][interval]':             interval,
      // Allow promo codes in case we want to run any
      allow_promotion_codes: 'true',
    }, STRIPE_KEY);

    return json({ ok: true, url: session.url, session_id: session.id });
  } catch (err) {
    console.error('[tenant-prospecting-checkout] crashed:', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});

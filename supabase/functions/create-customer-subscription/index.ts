// create-customer-subscription — enroll a customer in a membership plan.
//
// Creates a Stripe Subscription on the TENANT's own Stripe account (per-tenant
// key from settings.payment_config — NEVER JobScout's master account), charging
// the customer's saved card. Admin-gated; company scoped from the caller's JWT.
//
// This is a NEW, isolated function. It does not touch stripe-webhook or any
// existing invoice/one-off payment path. Subscription lifecycle updates arrive
// via the separate customer-subscription-webhook.
//
// Body: { customer_id, membership_plan_id }
// Preconditions: the customer already has a saved card (customer_payment_methods)
// — capture one first via the existing manage-payment-methods flow.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

function jwtEmail(req: Request): string | null {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return (payload?.email || '').toLowerCase() || null;
  } catch { return null; }
}
async function resolveAdmin(sb: any, req: Request): Promise<{ email: string; companyId: number } | null> {
  const email = jwtEmail(req);
  if (!email) return null;
  const { data } = await sb.from('employees')
    .select('company_id, role, user_role, is_admin, is_developer')
    .ilike('email', email).eq('active', true).limit(1);
  const e = data?.[0];
  if (!e) return null;
  const admin = e.is_developer === true || e.is_admin === true
    || ['Admin', 'admin', 'Owner', 'owner'].includes(e.user_role)
    || ['Admin', 'Owner'].includes(e.role);
  if (!admin) return null;
  return { email, companyId: e.company_id };
}

// friendly billing_interval -> Stripe recurring {interval, interval_count}
function stripeInterval(billing: string): { interval: string; count: number } {
  switch (billing) {
    case 'year': return { interval: 'year', count: 1 };
    case 'quarter': return { interval: 'month', count: 3 };
    case 'week': return { interval: 'week', count: 1 };
    default: return { interval: 'month', count: 1 };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const admin = await resolveAdmin(sb, req);
    if (!admin) return json({ error: 'Not authorized' }, 401);
    const companyId = admin.companyId;

    const { customer_id, membership_plan_id } = await req.json();
    if (!customer_id || !membership_plan_id) return json({ error: 'customer_id and membership_plan_id are required' }, 400);

    // Plan (company-scoped)
    const { data: plan } = await sb.from('membership_plans')
      .select('*').eq('id', membership_plan_id).eq('company_id', companyId).single();
    if (!plan) return json({ error: 'Plan not found' }, 404);

    // Tenant Stripe key
    const { data: cfgRow } = await sb.from('settings').select('value')
      .eq('company_id', companyId).eq('key', 'payment_config').maybeSingle();
    let paymentConfig: any = null;
    if (cfgRow?.value) { try { paymentConfig = JSON.parse(cfgRow.value); } catch { /* ignore */ } }
    const stripeKey = paymentConfig?.stripe_secret_key || Deno.env.get('STRIPE_SECRET_KEY');
    if (!stripeKey) return json({ error: 'Stripe is not configured for this company.' }, 400);

    // Customer + saved card (company-scoped)
    const { data: cust } = await sb.from('customers')
      .select('id, name, email, stripe_customer_id').eq('id', customer_id).eq('company_id', companyId).single();
    if (!cust) return json({ error: 'Customer not found' }, 404);
    if (!cust.stripe_customer_id) return json({ error: 'This customer has no card on file. Save a card first, then enroll.', code: 'no_card' }, 400);

    const { data: pms } = await sb.from('customer_payment_methods')
      .select('stripe_payment_method_id, is_default, created_at')
      .eq('company_id', companyId).eq('customer_id', customer_id).eq('status', 'active')
      .order('is_default', { ascending: false }).order('created_at', { ascending: false }).limit(1);
    const pmId = pms?.[0]?.stripe_payment_method_id;
    if (!pmId) return json({ error: 'This customer has no card on file. Save a card first, then enroll.', code: 'no_card' }, 400);

    // Not already actively enrolled?
    const { data: existing } = await sb.from('customer_memberships')
      .select('id, status').eq('company_id', companyId).eq('customer_id', customer_id)
      .in('status', ['active', 'trialing', 'past_due', 'incomplete']).limit(1);
    if (existing?.[0]) return json({ error: 'This customer already has an active membership.', code: 'already_enrolled', membership_id: existing[0].id }, 409);

    const { interval, count } = stripeInterval(plan.billing_interval || 'month');

    // Ensure a reusable Stripe Price exists for this plan. Subscription items
    // require an existing Price/Product — inline product_data is Checkout-only.
    const sPost = async (path: string, o: Record<string, string>) => {
      const r = await fetch('https://api.stripe.com/v1/' + path, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(o).toString(),
      });
      return { ok: r.ok, body: await r.json() };
    };
    let priceId: string | null = plan.stripe_price_id || null;
    if (!priceId) {
      const prod = await sPost('products', { name: plan.name || 'Membership' });
      if (!prod.ok) return json({ error: `Stripe: ${prod.body?.error?.message || 'could not create product'}` }, 502);
      const price = await sPost('prices', {
        product: prod.body.id, currency: 'usd', unit_amount: String(plan.price_cents || 0),
        'recurring[interval]': interval, 'recurring[interval_count]': String(count),
      });
      if (!price.ok) return json({ error: `Stripe: ${price.body?.error?.message || 'could not create price'}` }, 502);
      priceId = price.body.id;
      await sb.from('membership_plans').update({ stripe_price_id: priceId }).eq('id', plan.id);
    }

    // Record the membership first (incomplete) so we can stamp its id on the sub.
    const { data: mem, error: memErr } = await sb.from('customer_memberships').insert({
      company_id: companyId, customer_id, membership_plan_id: plan.id,
      stripe_customer_id: cust.stripe_customer_id, status: 'incomplete',
      plan_name: plan.name, price_cents: plan.price_cents, billing_interval: plan.billing_interval,
      started_at: new Date().toISOString(),
    }).select('id').single();
    if (memErr) return json({ error: 'Could not create membership: ' + memErr.message }, 500);
    const membershipId = mem.id;

    // Create the Stripe subscription on the tenant's account.
    const p = new URLSearchParams();
    p.append('customer', cust.stripe_customer_id);
    p.append('default_payment_method', pmId);
    p.append('items[0][price]', priceId as string);
    p.append('payment_behavior', 'allow_incomplete');
    p.append('expand[0]', 'latest_invoice');
    p.append('metadata[subscription_kind]', 'customer_membership');
    p.append('metadata[company_id]', String(companyId));
    p.append('metadata[jobscout_customer_id]', String(customer_id));
    p.append('metadata[membership_id]', String(membershipId));

    const subRes = await fetch('https://api.stripe.com/v1/subscriptions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${stripeKey}`, 'Content-Type': 'application/x-www-form-urlencoded' },
      body: p.toString(),
    });
    const sub = await subRes.json();
    if (!subRes.ok) {
      // roll back the placeholder membership
      await sb.from('customer_memberships').delete().eq('id', membershipId);
      return json({ error: `Stripe: ${sub?.error?.message || 'subscription failed'}` }, 502);
    }

    const periodStart = sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null;
    const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;
    await sb.from('customer_memberships').update({
      stripe_subscription_id: sub.id,
      status: sub.status || 'active',
      current_period_start: periodStart,
      current_period_end: periodEnd,
      updated_at: new Date().toISOString(),
    }).eq('id', membershipId);

    return json({ ok: true, membership_id: membershipId, subscription_id: sub.id, status: sub.status });
  } catch (e) {
    console.error('create-customer-subscription error:', e);
    return json({ error: (e as Error).message }, 500);
  }
});

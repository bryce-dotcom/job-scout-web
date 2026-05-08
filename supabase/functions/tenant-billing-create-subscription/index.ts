// Create a Stripe Subscription for a tenant on JobScout's master account.
//
// Body: { company_id, plan_id, interval, payment_method_id }
//   plan_id:           field_crew | field_pro | field_boss
//   interval:          month | year
//   payment_method_id: pm_... from a previous SetupIntent confirmation
//
// Returns: { subscription_id, status, current_period_end, plan }
//
// Behavior:
//   - Looks up the price ID from system_settings.billing_plan_stripe_ids
//   - Sets default_payment_method on the customer
//   - Creates a Subscription with trial_end = company.trial_ends_at
//     (so they don't get charged twice during the existing trial)
//   - Persists subscription_id + tier + new billing_status on companies

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const MASTER_STRIPE_KEY = Deno.env.get('JOBSCOUT_MASTER_STRIPE_KEY');
    if (!MASTER_STRIPE_KEY) return jsonResponse({ error: 'Master Stripe not configured' }, 500);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { company_id, plan_id, interval, payment_method_id } = await req.json();
    if (!company_id || !plan_id || !interval || !payment_method_id) {
      return jsonResponse({ error: 'company_id, plan_id, interval, payment_method_id are required' }, 400);
    }
    if (!['field_crew', 'field_pro', 'field_boss'].includes(plan_id)) {
      return jsonResponse({ error: 'Invalid plan_id' }, 400);
    }
    if (!['month', 'year'].includes(interval)) {
      return jsonResponse({ error: 'interval must be month or year' }, 400);
    }

    // Look up the Stripe price ID for the plan + interval
    const { data: idsRow } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'billing_plan_stripe_ids')
      .single();
    if (!idsRow?.value) return jsonResponse({ error: 'Stripe products not yet set up. Run scripts/setup-stripe-products.cjs first.' }, 500);
    const ids = idsRow.value as Record<string, { product_id: string; price_monthly: string; price_yearly: string }>;
    const planRow = ids[plan_id];
    if (!planRow) return jsonResponse({ error: `No Stripe price for plan ${plan_id}` }, 500);
    const priceId = interval === 'year' ? planRow.price_yearly : planRow.price_monthly;

    // Tenant company
    const { data: company, error: cErr } = await supabase
      .from('companies')
      .select('id, master_stripe_customer_id, master_stripe_subscription_id, trial_ends_at, billing_status')
      .eq('id', company_id)
      .single();
    if (cErr || !company) return jsonResponse({ error: 'Company not found' }, 404);
    if (!company.master_stripe_customer_id) {
      return jsonResponse({ error: 'No Stripe customer yet — call tenant-billing-setup-intent first to capture a card' }, 400);
    }
    if (company.master_stripe_subscription_id) {
      return jsonResponse({ error: 'Tenant already has an active subscription. Use the change-plan flow instead.' }, 400);
    }

    // Attach the payment method + set as default
    await fetch(`https://api.stripe.com/v1/payment_methods/${payment_method_id}/attach`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MASTER_STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ customer: company.master_stripe_customer_id }).toString(),
    });

    await fetch(`https://api.stripe.com/v1/customers/${company.master_stripe_customer_id}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MASTER_STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        'invoice_settings[default_payment_method]': payment_method_id,
      }).toString(),
    });

    // Read the card brand + last4 for display
    const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${payment_method_id}`, {
      headers: { Authorization: `Bearer ${MASTER_STRIPE_KEY}` },
    });
    const pm = await pmRes.json();
    const cardBrand = pm.card?.brand || null;
    const cardLast4 = pm.card?.last4 || null;

    // Create subscription. Honor the existing trial_ends_at so a tenant
    // converting mid-trial doesn't get charged early.
    const subParams = new URLSearchParams();
    subParams.append('customer', company.master_stripe_customer_id);
    subParams.append('items[0][price]', priceId);
    subParams.append('default_payment_method', payment_method_id);
    subParams.append('metadata[company_id]', String(company_id));
    subParams.append('metadata[plan_id]', plan_id);
    if (company.trial_ends_at && new Date(company.trial_ends_at) > new Date()) {
      const trialUnix = Math.floor(new Date(company.trial_ends_at).getTime() / 1000);
      subParams.append('trial_end', String(trialUnix));
    }
    subParams.append('payment_behavior', 'default_incomplete');
    subParams.append('expand[]', 'latest_invoice.payment_intent');

    const subRes = await fetch('https://api.stripe.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MASTER_STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: subParams.toString(),
    });
    const sub = await subRes.json();
    if (!subRes.ok) return jsonResponse({ error: `Stripe subscription: ${sub.error?.message || 'unknown'}` }, 500);

    // Persist
    const newStatus = sub.status === 'trialing' ? 'trialing'
      : sub.status === 'active'                  ? 'active'
      : sub.status === 'past_due'                ? 'past_due'
      : sub.status === 'canceled'                ? 'canceled'
      : 'unbilled';

    await supabase.from('companies').update({
      master_stripe_subscription_id: sub.id,
      subscription_tier:             plan_id,
      billing_status:                newStatus,
      billing_payment_method_brand:  cardBrand,
      billing_payment_method_last4:  cardLast4,
      updated_at: new Date().toISOString(),
    }).eq('id', company_id);

    return jsonResponse({
      subscription_id: sub.id,
      status: sub.status,
      current_period_end: sub.current_period_end,
      plan: plan_id,
      trial_ends_at: company.trial_ends_at,
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

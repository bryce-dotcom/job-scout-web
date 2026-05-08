// Returns the tenant's current JobScout-side billing state for the
// Settings → Billing UI (and the trial-expired banner check).
//
// Body: { company_id }
// Returns:
//   {
//     billing_status, subscription_tier, trial_ends_at, days_left_in_trial,
//     master_stripe_customer_id, has_payment_method,
//     payment_method: { brand, last4 } | null,
//     subscription: { id, status, current_period_end, cancel_at_period_end } | null,
//     plan: { id, name, monthly_price, annual_price, ... } | null
//   }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const PLAN_DISPLAY: Record<string, { name: string; monthly_price: number; annual_price: number; user_cap: number | null; agent_cap: number | null }> = {
  field_crew: { name: 'Field Crew', monthly_price: 99,  annual_price: 990,  user_cap: 3,  agent_cap: 1 },
  field_pro:  { name: 'Field Pro',  monthly_price: 249, annual_price: 2490, user_cap: 10, agent_cap: 5 },
  field_boss: { name: 'Field Boss', monthly_price: 599, annual_price: 5990, user_cap: null, agent_cap: null },
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

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { company_id } = await req.json();
    if (!company_id) return jsonResponse({ error: 'company_id is required' }, 400);

    const { data: company, error: cErr } = await supabase
      .from('companies')
      .select('id, company_name, subscription_tier, billing_status, trial_ends_at, master_stripe_customer_id, master_stripe_subscription_id, billing_payment_method_brand, billing_payment_method_last4, billing_email')
      .eq('id', company_id)
      .single();
    if (cErr || !company) return jsonResponse({ error: 'Company not found' }, 404);

    // Days remaining in the trial
    let daysLeft: number | null = null;
    if (company.trial_ends_at) {
      const ms = new Date(company.trial_ends_at).getTime() - Date.now();
      daysLeft = Math.max(0, Math.ceil(ms / 86400000));
    }

    // Plan display data
    const planId = company.subscription_tier || 'field_crew';
    const plan = PLAN_DISPLAY[planId]
      ? { id: planId, ...PLAN_DISPLAY[planId] }
      : null;

    // Stripe-side subscription state (only if we have keys + an active sub)
    let subscription = null;
    if (MASTER_STRIPE_KEY && company.master_stripe_subscription_id) {
      try {
        const r = await fetch(`https://api.stripe.com/v1/subscriptions/${company.master_stripe_subscription_id}`, {
          headers: { Authorization: `Bearer ${MASTER_STRIPE_KEY}` },
        });
        if (r.ok) {
          const sub = await r.json();
          subscription = {
            id: sub.id,
            status: sub.status,
            current_period_end: sub.current_period_end,
            cancel_at_period_end: !!sub.cancel_at_period_end,
          };
        }
      } catch { /* ignore */ }
    }

    return jsonResponse({
      billing_status: company.billing_status,
      subscription_tier: planId,
      trial_ends_at: company.trial_ends_at,
      days_left_in_trial: daysLeft,
      master_stripe_customer_id: company.master_stripe_customer_id,
      has_payment_method: !!company.billing_payment_method_last4,
      payment_method: company.billing_payment_method_last4 ? {
        brand: company.billing_payment_method_brand,
        last4: company.billing_payment_method_last4,
      } : null,
      subscription,
      plan,
      grandfathered: company.billing_status === 'grandfathered',
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

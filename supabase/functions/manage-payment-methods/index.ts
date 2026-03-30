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

async function getStripeKey(supabase: ReturnType<typeof createClient>, companyId: number | string) {
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('company_id', companyId)
    .eq('key', 'payment_config')
    .single();

  if (!data?.value) return null;
  try {
    const cfg = JSON.parse(data.value);
    return cfg.stripe_secret_key || null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { action, company_id, customer_id } = body;

    if (!action || !company_id || !customer_id) {
      return jsonResponse({ error: 'action, company_id, and customer_id are required' }, 400);
    }

    // ---- LIST saved payment methods ----
    if (action === 'list') {
      const { data: methods, error } = await supabase
        .from('customer_payment_methods')
        .select('id, brand, last_four, exp_month, exp_year, is_default, created_at')
        .eq('company_id', company_id)
        .eq('customer_id', customer_id)
        .eq('status', 'active')
        .order('is_default', { ascending: false });

      if (error) return jsonResponse({ error: error.message }, 500);
      return jsonResponse({ methods: methods || [] });
    }

    // ---- CREATE SETUP SESSION (save a new card via Stripe Checkout) ----
    if (action === 'create_setup_session') {
      const stripeKey = await getStripeKey(supabase, company_id);
      if (!stripeKey) return jsonResponse({ error: 'Stripe is not configured' }, 400);

      // Get or create Stripe customer
      const { data: customer, error: custErr } = await supabase
        .from('customers')
        .select('id, name, email, stripe_customer_id')
        .eq('id', customer_id)
        .eq('company_id', company_id)
        .single();

      if (custErr || !customer) return jsonResponse({ error: 'Customer not found' }, 404);

      let stripeCustomerId = customer.stripe_customer_id;

      if (!stripeCustomerId) {
        // Create Stripe Customer
        const params = new URLSearchParams();
        params.append('name', customer.name || '');
        if (customer.email) params.append('email', customer.email);
        params.append('metadata[jobscout_customer_id]', String(customer.id));
        params.append('metadata[company_id]', String(company_id));

        const res = await fetch('https://api.stripe.com/v1/customers', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${stripeKey}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: params.toString(),
        });

        if (!res.ok) {
          console.error('Stripe create customer error:', await res.text());
          return jsonResponse({ error: 'Failed to create Stripe customer' }, 500);
        }

        const stripeCust = await res.json();
        stripeCustomerId = stripeCust.id;

        // Save to our DB
        await supabase
          .from('customers')
          .update({ stripe_customer_id: stripeCustomerId })
          .eq('id', customer.id);
      }

      // Get return URL from request or build default
      const returnUrl = body.return_url || `${Deno.env.get('SITE_URL') || 'https://jobscout.appsannex.com'}`;

      // Create Checkout Session in setup mode
      const sessionParams = new URLSearchParams();
      sessionParams.append('mode', 'setup');
      sessionParams.append('customer', stripeCustomerId);
      sessionParams.append('success_url', `${returnUrl}?card_saved=success`);
      sessionParams.append('cancel_url', `${returnUrl}?card_saved=cancelled`);
      sessionParams.append('metadata[customer_id]', String(customer.id));
      sessionParams.append('metadata[company_id]', String(company_id));
      sessionParams.append('payment_method_types[0]', 'card');

      const sessionRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${stripeKey}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: sessionParams.toString(),
      });

      if (!sessionRes.ok) {
        console.error('Stripe session error:', await sessionRes.text());
        return jsonResponse({ error: 'Failed to create setup session' }, 500);
      }

      const session = await sessionRes.json();
      return jsonResponse({ checkout_url: session.url });
    }

    // ---- REMOVE a saved payment method ----
    if (action === 'remove') {
      const { payment_method_id } = body;
      if (!payment_method_id) return jsonResponse({ error: 'payment_method_id required' }, 400);

      // Get the record
      const { data: pm } = await supabase
        .from('customer_payment_methods')
        .select('stripe_payment_method_id')
        .eq('id', payment_method_id)
        .eq('company_id', company_id)
        .eq('customer_id', customer_id)
        .single();

      if (!pm) return jsonResponse({ error: 'Payment method not found' }, 404);

      // Detach from Stripe
      const stripeKey = await getStripeKey(supabase, company_id);
      if (stripeKey) {
        await fetch(`https://api.stripe.com/v1/payment_methods/${pm.stripe_payment_method_id}/detach`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${stripeKey}` },
        });
      }

      // Mark as removed in our DB
      await supabase
        .from('customer_payment_methods')
        .update({ status: 'removed', updated_at: new Date().toISOString() })
        .eq('id', payment_method_id);

      return jsonResponse({ success: true });
    }

    // ---- SET DEFAULT payment method ----
    if (action === 'set_default') {
      const { payment_method_id } = body;
      if (!payment_method_id) return jsonResponse({ error: 'payment_method_id required' }, 400);

      // Unset all defaults for this customer
      await supabase
        .from('customer_payment_methods')
        .update({ is_default: false, updated_at: new Date().toISOString() })
        .eq('company_id', company_id)
        .eq('customer_id', customer_id);

      // Set the chosen one as default
      await supabase
        .from('customer_payment_methods')
        .update({ is_default: true, updated_at: new Date().toISOString() })
        .eq('id', payment_method_id)
        .eq('company_id', company_id);

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);

  } catch (error) {
    console.error('manage-payment-methods error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

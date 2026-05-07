// Capture a tenant's payment method for JobScout-side billing.
//
// Body: { company_id, billing_email? }
// Returns: { client_secret, customer_id }
//
// Flow:
//   1. Ensures companies.master_stripe_customer_id exists (creates a
//      Customer on JobScout's master Stripe account if missing).
//   2. Creates a Stripe SetupIntent so the front-end can collect a card
//      via Stripe Elements (no card data ever touches our server).
//   3. Returns the SetupIntent client_secret + the master customer id.
//
// Frontend uses Stripe Elements to confirm the SetupIntent in the
// browser → card lands on the customer in JobScout's master Stripe.
//
// IMPORTANT: This uses JOBSCOUT_MASTER_STRIPE_KEY (NOT the per-tenant
// Stripe key from settings). Set this once in Supabase Edge Function
// Secrets when JobScout's master Stripe account is ready.

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

    if (!MASTER_STRIPE_KEY) {
      return jsonResponse({ error: 'JobScout master Stripe key not configured. Set JOBSCOUT_MASTER_STRIPE_KEY in Edge Function Secrets.' }, 500);
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { company_id, billing_email } = await req.json();
    if (!company_id) return jsonResponse({ error: 'company_id is required' }, 400);

    const { data: company, error: cErr } = await supabase
      .from('companies')
      .select('id, company_name, owner_email, master_stripe_customer_id, billing_email')
      .eq('id', company_id)
      .single();
    if (cErr || !company) return jsonResponse({ error: 'Company not found' }, 404);

    let customerId = company.master_stripe_customer_id;

    if (!customerId) {
      // Create a Stripe customer on the master account
      const params = new URLSearchParams({
        name: company.company_name || `Company ${company_id}`,
        email: billing_email || company.billing_email || company.owner_email || '',
        'metadata[company_id]': String(company_id),
      });
      const cRes = await fetch('https://api.stripe.com/v1/customers', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MASTER_STRIPE_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      });
      const cust = await cRes.json();
      if (!cRes.ok) return jsonResponse({ error: `Stripe customer: ${cust.error?.message || 'unknown'}` }, 500);
      customerId = cust.id;

      await supabase.from('companies').update({
        master_stripe_customer_id: customerId,
        billing_email: billing_email || company.billing_email || company.owner_email || null,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id);
    } else if (billing_email && billing_email !== company.billing_email) {
      // Update the email on the existing customer
      await fetch(`https://api.stripe.com/v1/customers/${customerId}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${MASTER_STRIPE_KEY}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ email: billing_email }).toString(),
      });
      await supabase.from('companies').update({
        billing_email,
        updated_at: new Date().toISOString(),
      }).eq('id', company_id);
    }

    // Create a SetupIntent so the browser can save a card for future use
    const siRes = await fetch('https://api.stripe.com/v1/setup_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MASTER_STRIPE_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: customerId!,
        usage: 'off_session',
        'payment_method_types[]': 'card',
        'metadata[company_id]': String(company_id),
      }).toString(),
    });
    const si = await siRes.json();
    if (!siRes.ok) return jsonResponse({ error: `Stripe setup intent: ${si.error?.message || 'unknown'}` }, 500);

    return jsonResponse({
      client_secret: si.client_secret,
      customer_id: customerId,
      publishable_key_required: 'JOBSCOUT_MASTER_STRIPE_PUBLISHABLE_KEY',
    });
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});

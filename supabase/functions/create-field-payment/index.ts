import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { companyId, jobId, customerId, amount_cents, description } = await req.json();

    if (!companyId || !amount_cents) {
      return new Response(JSON.stringify({ error: 'companyId and amount_cents are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get company payment config
    const { data: configRow } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'payment_config')
      .single();

    let paymentConfig = null;
    if (configRow?.value) {
      try { paymentConfig = JSON.parse(configRow.value); } catch {}
    }

    const stripeKey = paymentConfig?.stripe_secret_key || Deno.env.get('STRIPE_SECRET_KEY');

    if (!stripeKey) {
      return new Response(JSON.stringify({ error: 'Stripe is not configured. Add your Stripe keys in Settings → Payments.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get company name for statement descriptor
    const { data: company } = await supabase
      .from('companies')
      .select('company_name')
      .eq('id', companyId)
      .single();

    // Create PaymentIntent
    const params = new URLSearchParams();
    params.append('amount', String(amount_cents));
    params.append('currency', 'usd');
    params.append('automatic_payment_methods[enabled]', 'true');
    if (description) {
      params.append('description', description);
    }
    if (company?.company_name) {
      // Statement descriptor max 22 chars
      const descriptor = company.company_name.substring(0, 22).replace(/[^a-zA-Z0-9 ]/g, '');
      if (descriptor.length >= 5) {
        params.append('statement_descriptor', descriptor);
      }
    }
    // Metadata for webhook reconciliation
    params.append('metadata[company_id]', companyId);
    params.append('metadata[source]', 'field_scout');
    if (jobId) params.append('metadata[job_id]', String(jobId));
    if (customerId) params.append('metadata[customer_id]', String(customerId));

    const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (!stripeRes.ok) {
      const errText = await stripeRes.text();
      console.error('Stripe PaymentIntent error:', errText);
      return new Response(JSON.stringify({ error: 'Failed to create payment. Check Stripe configuration.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const intent = await stripeRes.json();

    // Return the publishable key too so the frontend can init Stripe
    const publishableKey = paymentConfig?.stripe_publishable_key || Deno.env.get('STRIPE_PUBLISHABLE_KEY') || '';

    return new Response(JSON.stringify({
      clientSecret: intent.client_secret,
      publishableKey,
      paymentIntentId: intent.id,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('create-field-payment error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

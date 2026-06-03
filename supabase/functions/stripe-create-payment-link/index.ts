// Generate a hosted Stripe Payment Link for an invoice.
//
// Body: { company_id, invoice_id }
// Returns: { url, amount, payment_link_id }
//
// Customer pays via the link → Stripe calls the existing
// stripe-webhook with checkout.session.completed → metadata.invoice_id
// + metadata.document_type='invoice' lets the webhook record the
// payment against the right invoice.

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

// Always return HTTP 200 with the error in the body so the supabase-js
// client doesn't swallow the message as a generic FunctionsHttpError.
// Zack hit a 5xx that showed no actionable reason because the frontend
// couldn't read a non-2xx body. Surfacing as 200+error keeps the message
// usable end-to-end.
function errResponse(message: string) {
  console.log('[stripe-create-payment-link] error:', message);
  return jsonResponse({ error: message }, 200);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { company_id, invoice_id } = await req.json();
    if (!company_id || !invoice_id) {
      return errResponse('company_id and invoice_id are required');
    }

    // Fetch invoice + customer
    const { data: invoice, error: invErr } = await supabase
      .from('invoices')
      .select('id, invoice_id, amount, customer_id, payment_status, credit_card_fee, job_id')
      .eq('id', invoice_id)
      .eq('company_id', company_id)
      .single();
    if (invErr || !invoice) return errResponse(`Invoice ${invoice_id} not found (or wrong company)`);
    if (invoice.payment_status === 'Paid') return errResponse('Invoice is already paid');

    const { data: customer } = await supabase
      .from('customers')
      .select('id, name, business_name, email')
      .eq('id', invoice.customer_id)
      .single();

    // Tenant's Stripe key from settings.payment_config
    const { data: configRow } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', company_id)
      .eq('key', 'payment_config')
      .single();

    let stripeKey: string | null = null;
    if (configRow?.value) {
      try { stripeKey = JSON.parse(configRow.value).stripe_secret_key; } catch { /* ignore */ }
    }
    if (!stripeKey) return errResponse('Stripe is not configured for this tenant. Connect your Stripe account in Settings → Integrations.');

    // Tenant company name for the line item description
    const { data: company } = await supabase
      .from('companies')
      .select('company_name')
      .eq('id', company_id)
      .single();

    const totalDollars = parseFloat(String(invoice.amount)) + (parseFloat(String(invoice.credit_card_fee || 0)) || 0);
    const totalCents = Math.round(totalDollars * 100);
    if (totalCents <= 0) return errResponse('Invoice has no amount due');

    const customerLabel = customer?.business_name || customer?.name || 'Customer';
    const productName = `Invoice ${invoice.invoice_id || `#${invoice.id}`} — ${company?.company_name || 'Service'}`;
    const productDescription = `Payment for invoice ${invoice.invoice_id || invoice.id} from ${customerLabel}`;

    // Step 1: create a one-shot Stripe Product
    const productRes = await fetch('https://api.stripe.com/v1/products', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        name: productName,
        description: productDescription,
      }).toString(),
    });
    const product = await productRes.json();
    if (!productRes.ok) return errResponse(`Stripe product: ${product.error?.message || 'unknown'}`);

    // Step 2: create a Price for that product
    const priceRes = await fetch('https://api.stripe.com/v1/prices', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        product: product.id,
        unit_amount: String(totalCents),
        currency: 'usd',
      }).toString(),
    });
    const price = await priceRes.json();
    if (!priceRes.ok) return errResponse(`Stripe price: ${price.error?.message || 'unknown'}`);

    // Step 3: create a Payment Link with metadata that the webhook reads
    const linkParams = new URLSearchParams();
    linkParams.append('line_items[0][price]', price.id);
    linkParams.append('line_items[0][quantity]', '1');
    // document_id is the canonical key the webhook reads (matches
    // create-checkout-session). invoice_id stays for backward compat
    // with any older payment links already in the wild.
    linkParams.append('metadata[document_id]', String(invoice.id));
    linkParams.append('metadata[invoice_id]', String(invoice.id));
    linkParams.append('metadata[company_id]', String(company_id));
    linkParams.append('metadata[document_type]', 'invoice');
    linkParams.append('metadata[payment_type]', 'invoice_payment');
    linkParams.append('metadata[job_id]', String(invoice.job_id || ''));
    if (customer?.email) linkParams.append('customer_creation', 'always');
    // Once paid, redirect customer to a thank-you page on JobScout
    linkParams.append('after_completion[type]', 'redirect');
    linkParams.append('after_completion[redirect][url]', `https://jobscout.appsannex.com/invoices/${invoice.id}?paid=1`);

    const linkRes = await fetch('https://api.stripe.com/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: linkParams.toString(),
    });
    const link = await linkRes.json();
    if (!linkRes.ok) return errResponse(`Stripe link: ${link.error?.message || 'unknown'}`);

    // Persist on the invoice for re-use
    await supabase
      .from('invoices')
      .update({
        stripe_payment_link_url: link.url,
        stripe_payment_link_id: link.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', invoice.id);

    return jsonResponse({
      url: link.url,
      payment_link_id: link.id,
      amount: totalDollars,
    });
  } catch (err) {
    return errResponse((err as Error).message || 'Unexpected error generating payment link');
  }
});

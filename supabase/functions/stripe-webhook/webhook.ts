// Edge function: parses untyped external JSON (Stripe events, PostgREST
// rows), so `any` is used deliberately for those shapes.
// deno-lint-ignore-file no-explicit-any
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { invoiceCustomerTotal } from "../_shared/money.ts";

export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

// Manual Stripe signature verification (no SDK). Recomputes HMAC-SHA256
// over `${timestamp}.${payload}` with the endpoint signing secret and
// compares to the v1 signature in constant time, with a 5-minute replay
// window (Stripe re-signs on resend, so legitimate replays still pass).
export async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  if (!secret) return false;

  const parts = sigHeader.split(',');
  let timestamp = '';
  let signature = '';

  for (const part of parts) {
    const [key, value] = part.split('=');
    if (key === 't') timestamp = value;
    if (key === 'v1') signature = value;
  }

  if (!timestamp || !signature) return false;

  // Check timestamp tolerance (5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp)) > 300) return false;

  const signedPayload = `${timestamp}.${payload}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(signedPayload));
  const expectedSig = Array.from(new Uint8Array(mac))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');

  // Constant-time compare (mirrors master-stripe-webhook): never short-circuit
  // on the first mismatched byte, so a forged signature can't be recovered
  // from response-timing differences.
  if (expectedSig.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expectedSig.length; i++) diff |= expectedSig.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

// The supabase-js client is left untyped here (as it is throughout this
// codebase's edge functions) — `ReturnType<typeof createClient>` resolves
// the schema generics to `never`, which breaks every `.select()` result.
// deno-lint-ignore-file no-explicit-any is not set globally, so use `any`.
type SupabaseClient = any;

// ── Read-only helpers used to resolve the per-company Stripe signing
//    secret BEFORE we trust the event. Neither of these writes. ──────────

// Which JobScout company does this event belong to? The Stripe signing
// secret is per-company, so we must know the company before we can pick a
// secret to verify against. checkout.session.completed / payment_intent.
// succeeded carry company_id in metadata; setup_intent.succeeded doesn't,
// so we map its Stripe customer back to our customer row. Returns '' when
// the event can't be attributed (then only the global env secret applies).
export async function resolveCompanyId(supabase: SupabaseClient, event: any): Promise<string> {
  const obj = event?.data?.object || {};
  const metaCompanyId = obj?.metadata?.company_id;
  if (metaCompanyId) return String(metaCompanyId);

  if (event?.type === 'setup_intent.succeeded' && obj.customer) {
    const { data } = await supabase
      .from('customers')
      .select('company_id')
      .eq('stripe_customer_id', obj.customer)
      .limit(1)
      .maybeSingle();
    if (data?.company_id != null) return String(data.company_id);
  }
  return '';
}

// A company's Stripe webhook signing secret + secret key from settings.
// Read-only; both default to '' when unset so the caller can fall back to
// the global env secret / key.
export async function loadCompanyStripeConfig(
  supabase: SupabaseClient,
  companyId: string,
): Promise<{ webhookSecret: string; stripeKey: string }> {
  if (!companyId) return { webhookSecret: '', stripeKey: '' };
  const { data } = await supabase
    .from('settings')
    .select('value')
    .eq('company_id', companyId)
    .eq('key', 'payment_config')
    .maybeSingle();
  if (!data?.value) return { webhookSecret: '', stripeKey: '' };
  try {
    const cfg = JSON.parse(data.value as string);
    return { webhookSecret: cfg.stripe_webhook_secret || '', stripeKey: cfg.stripe_secret_key || '' };
  } catch {
    return { webhookSecret: '', stripeKey: '' };
  }
}

export async function handleStripeWebhook(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.text();
    const sigHeader = req.headers.get('stripe-signature') || '';
    const globalWebhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET') || '';

    // Parse defensively — a body that isn't JSON isn't a Stripe event.
    let event: any;
    try {
      event = JSON.parse(body);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid payload' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // Handle setup_intent.succeeded — fires when a customer saves a new
    // card via SetupIntent (the JobScout payment portal does this). Tracy
    // saw cards saved in Stripe but they never appeared in JobScout's
    // saved-card list because we weren't listening.
    if (event.type === 'setup_intent.succeeded') {
      const si = event.data.object;
      const stripeCustomerId = si.customer;
      const stripePmId = si.payment_method;
      if (!stripeCustomerId || !stripePmId) {
        // Nothing to record and nothing written — safe to ack without verifying.
        return new Response(JSON.stringify({ received: true, skipped: 'missing customer or payment_method' }),
          { headers: { 'Content-Type': 'application/json' } });
      }

      // ── VERIFY BEFORE ANY DB WRITE ──────────────────────────────────────
      // verify_jwt=false here (Stripe sends no Supabase JWT), so the Stripe
      // signature is the ONLY proof this event is real. The signing secret is
      // per-company; a SetupIntent carries no company_id metadata, so resolve
      // the company from its Stripe customer (read-only) and fall back to the
      // global env secret. Until this passes we do NOT touch the DB — a
      // forged/unsigned POST used to reach the upsert below and insert a
      // payment-method row through the service-role key.
      const siCompanyId = await resolveCompanyId(supabase, event);
      const { webhookSecret: siCompanySecret } = await loadCompanyStripeConfig(supabase, siCompanyId);
      const siSigningSecret = siCompanySecret || globalWebhookSecret;
      if (!(await verifyStripeSignature(body, sigHeader, siSigningSecret))) {
        console.warn(`[stripe-webhook] setup_intent.succeeded failed signature (company=${siCompanyId || 'unknown'}) — rejecting, no DB write`);
        return new Response(JSON.stringify({ error: 'Invalid signature' }),
          { status: 400, headers: { 'Content-Type': 'application/json' } });
      }

      // Find our customer by stripe_customer_id
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const custRes = await fetch(
        `${supabaseUrl}/rest/v1/customers?stripe_customer_id=eq.${stripeCustomerId}&select=id,company_id&limit=1`,
        { headers: { 'Authorization': `Bearer ${serviceKey}`, 'apikey': serviceKey } }
      );
      const custs = await custRes.json();
      const cust = Array.isArray(custs) ? custs[0] : null;
      if (!cust) {
        console.warn('[setup_intent.succeeded] no customer match for', stripeCustomerId);
        return new Response(JSON.stringify({ received: true, skipped: 'unknown customer' }),
          { headers: { 'Content-Type': 'application/json' } });
      }

      // Fetch the payment method details from Stripe to get brand/last4
      const tenantKey = Deno.env.get('STRIPE_SECRET_KEY') || '';
      const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${stripePmId}`, {
        headers: { 'Authorization': `Bearer ${tenantKey}` },
      });
      const pm = await pmRes.json();
      const card = pm.card || {};

      // Upsert into customer_payment_methods. Use stripe_payment_method_id
      // as the natural dedup key.
      await fetch(`${supabaseUrl}/rest/v1/customer_payment_methods?on_conflict=stripe_payment_method_id`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${serviceKey}`,
          'apikey': serviceKey,
          'Content-Type': 'application/json',
          'Prefer': 'resolution=merge-duplicates',
        },
        body: JSON.stringify({
          company_id: cust.company_id,
          customer_id: cust.id,
          stripe_payment_method_id: stripePmId,
          brand: card.brand || null,
          last_four: card.last4 || null,
          exp_month: card.exp_month || null,
          exp_year: card.exp_year || null,
          status: 'active',
          is_default: false,
        }),
      });

      return new Response(JSON.stringify({ received: true, synced: true }),
        { headers: { 'Content-Type': 'application/json' } });
    }

    // Event types we don't act on: ack with 200 so Stripe stops retrying and
    // doesn't auto-disable the endpoint (that outage happened 2026-08-06). No
    // DB work here, so no signature check is required.
    if (event.type !== 'checkout.session.completed' && event.type !== 'payment_intent.succeeded') {
      return new Response(JSON.stringify({ received: true }),
        { headers: { 'Content-Type': 'application/json' } });
    }

    const session = event.data.object;
    const metadata = session.metadata || {};
    const companyId = metadata.company_id;
    // Backward compat: stripe-create-payment-link historically wrote
    // `metadata[invoice_id]` while create-checkout-session writes
    // `metadata[document_id]`. The webhook used to only read document_id,
    // so EVERY Stripe payment-link charge silently failed to record
    // (Tracy reported Angie Haynie being charged 9× because the invoice
    // stayed Unpaid in our DB after the customer paid).
    const documentId = metadata.document_id || metadata.invoice_id;
    const documentType = metadata.document_type || (metadata.invoice_id ? 'invoice' : '');
    const paymentType = metadata.payment_type || (metadata.invoice_id ? 'invoice_payment' : '');
    // checkout.session: amount_total. payment_intent: amount (charged) / amount_received.
    const amountTotal = event.type === 'payment_intent.succeeded'
      ? (session.amount_received ?? session.amount)
      : session.amount_total; // cents
    const paymentIntent = event.type === 'payment_intent.succeeded'
      ? session.id                  // the PI itself
      : session.payment_intent;     // checkout session links to a PI

    if (!companyId) {
      // Not an app-generated payment — e.g. a native Stripe invoice, a
      // Payment Link made in the Stripe dashboard, or a Virtual Terminal /
      // phone charge keyed directly into Stripe. There's nothing for us to
      // record, but we MUST ack with 200: returning 4xx here made Stripe
      // count these as failures and, after enough of them, AUTO-DISABLE the
      // endpoint — which silently dropped real app payments too (the
      // recurring "captured in Stripe but still shows owing" bug). Ack and
      // move on. App-generated payments always carry company_id, so this
      // never swallows a payment we would have recorded.
      console.warn('[stripe-webhook] event has no company_id metadata — acking (not an app payment)');
      return new Response(JSON.stringify({ received: true, ignored: 'no app metadata' }),
        { headers: { 'Content-Type': 'application/json' } });
    }

    // ── VERIFY BEFORE ANY DB WRITE ──────────────────────────────────────
    // Per-company webhook secret, falling back to the global env secret —
    // the same resolution this endpoint has always used. verify_jwt=false,
    // so this signature is the only authenticity check standing between the
    // public URL and the service-role writes below.
    const { webhookSecret: companyWebhookSecret, stripeKey } =
      await loadCompanyStripeConfig(supabase, companyId);
    const signingSecret = companyWebhookSecret || globalWebhookSecret;
    if (!signingSecret) {
      console.error('No webhook secret found for company', companyId);
      return new Response(JSON.stringify({ error: 'Webhook secret not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
    if (!(await verifyStripeSignature(body, sigHeader, signingSecret))) {
      return new Response(JSON.stringify({ error: 'Invalid signature' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // ---- SETUP MODE: Save card from setup session ----
    if (session.mode === 'setup') {
      const customerId = metadata.customer_id;
      const setupIntentId = session.setup_intent;

      if (!setupIntentId || !stripeKey || !customerId) {
        console.error('Setup session missing required data');
        return new Response(JSON.stringify({ received: true }),
          { headers: { 'Content-Type': 'application/json' } });
      }

      // Fetch the SetupIntent to get the payment method
      const siRes = await fetch(`https://api.stripe.com/v1/setup_intents/${setupIntentId}`, {
        headers: { 'Authorization': `Bearer ${stripeKey}` },
      });
      const setupIntent = await siRes.json();
      const pmId = setupIntent.payment_method;

      if (pmId) {
        // Fetch payment method details
        const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${pmId}`, {
          headers: { 'Authorization': `Bearer ${stripeKey}` },
        });
        const pmData = await pmRes.json();
        const card = pmData.card || {};

        // Check if this card already exists (same last4 + exp)
        const { data: existing } = await supabase
          .from('customer_payment_methods')
          .select('id')
          .eq('company_id', companyId)
          .eq('customer_id', customerId)
          .eq('last_four', card.last4 || '')
          .eq('exp_month', card.exp_month || 0)
          .eq('exp_year', card.exp_year || 0)
          .eq('status', 'active')
          .limit(1);

        if (!existing || existing.length === 0) {
          // Check if customer has any existing methods (to set default)
          const { data: existingMethods } = await supabase
            .from('customer_payment_methods')
            .select('id')
            .eq('company_id', companyId)
            .eq('customer_id', customerId)
            .eq('status', 'active')
            .limit(1);

          const isFirst = !existingMethods || existingMethods.length === 0;

          await supabase.from('customer_payment_methods').insert({
            company_id: parseInt(companyId),
            customer_id: parseInt(customerId),
            stripe_payment_method_id: pmId,
            stripe_customer_id: session.customer || '',
            brand: card.brand || 'unknown',
            last_four: card.last4 || '',
            exp_month: card.exp_month || 0,
            exp_year: card.exp_year || 0,
            is_default: isFirst,
          });
        }
      }

      return new Response(JSON.stringify({ received: true }),
        { headers: { 'Content-Type': 'application/json' } });
    }

    // ---- PAYMENT MODE: Handle normal payment checkout ----
    if (!documentId) {
      console.error('Missing document_id in payment checkout session');
      return new Response(JSON.stringify({ received: true }),
        { headers: { 'Content-Type': 'application/json' } });
    }

    const amountDollars = amountTotal / 100;

    // If setup_future_usage was set, save the payment method from this payment
    if (paymentIntent && stripeKey && metadata.save_card === 'true' && metadata.customer_id) {
      try {
        // Fetch the PaymentIntent to get the payment method used
        const piRes = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntent}`, {
          headers: { 'Authorization': `Bearer ${stripeKey}` },
        });
        const piData = await piRes.json();
        const pmId = piData.payment_method;

        if (pmId) {
          const pmRes = await fetch(`https://api.stripe.com/v1/payment_methods/${pmId}`, {
            headers: { 'Authorization': `Bearer ${stripeKey}` },
          });
          const pmData = await pmRes.json();
          const card = pmData.card || {};

          // Check if already saved
          const { data: existing } = await supabase
            .from('customer_payment_methods')
            .select('id')
            .eq('company_id', companyId)
            .eq('customer_id', metadata.customer_id)
            .eq('last_four', card.last4 || '')
            .eq('exp_month', card.exp_month || 0)
            .eq('exp_year', card.exp_year || 0)
            .eq('status', 'active')
            .limit(1);

          if (!existing || existing.length === 0) {
            const { data: existingMethods } = await supabase
              .from('customer_payment_methods')
              .select('id')
              .eq('company_id', companyId)
              .eq('customer_id', metadata.customer_id)
              .eq('status', 'active')
              .limit(1);

            await supabase.from('customer_payment_methods').insert({
              company_id: parseInt(companyId),
              customer_id: parseInt(metadata.customer_id),
              stripe_payment_method_id: pmId,
              stripe_customer_id: session.customer || '',
              brand: card.brand || 'unknown',
              last_four: card.last4 || '',
              exp_month: card.exp_month || 0,
              exp_year: card.exp_year || 0,
              is_default: !existingMethods || existingMethods.length === 0,
            });
          }
        }
      } catch (e) {
        console.error('Error saving card from payment:', e);
        // Non-fatal — payment still recorded below
      }
    }

    if (paymentType === 'invoice_payment' && documentType === 'invoice') {
      const { data: invoice } = await supabase
        .from('invoices')
        .select('id, amount, customer_id, job_id')
        .eq('id', documentId)
        .single();

      if (invoice) {
        // Idempotency — Stripe can fire both checkout.session.completed
        // AND payment_intent.succeeded for the same charge, and webhooks
        // may be retried. We dedupe on stripe_payment_intent_id so the
        // payment never gets recorded twice.
        if (paymentIntent) {
          const { data: existingPayment } = await supabase
            .from('payments')
            .select('id')
            .eq('stripe_payment_intent_id', paymentIntent)
            .maybeSingle();
          if (existingPayment?.id) {
            return new Response(JSON.stringify({ received: true, duplicate: true }),
              { headers: { 'Content-Type': 'application/json' } });
          }
        }

        // Determine payment method. checkout.session has
        // payment_method_types; raw PaymentIntent has payment_method_types
        // as well. Default to Credit Card when unknown.
        const pmType = (session.payment_method_types?.[0] || '').toLowerCase();
        const paymentMethodType = pmType === 'us_bank_account' ? 'ACH' : 'Credit Card';

        // Insert payment record
        await supabase.from('payments').insert({
          company_id: companyId,
          invoice_id: invoice.id,
          customer_id: invoice.customer_id,
          job_id: invoice.job_id || null,
          amount: amountDollars,
          date: new Date().toISOString().split('T')[0],
          method: paymentMethodType,
          status: 'Completed',
          notes: `Stripe payment (${paymentIntent})`,
          stripe_payment_intent_id: paymentIntent || null,
        });

        // Recalculate total paid
        const { data: allPayments } = await supabase
          .from('payments')
          .select('amount')
          .eq('invoice_id', invoice.id);

        const totalPaid = (allPayments || []).reduce((sum: number, p: { amount: number }) => sum + (p.amount || 0), 0);
        // Customer balance = gross - discount_applied (utility incentive +
        // deposit credit are already netted out). Comparing totalPaid to the
        // gross would treat full payments as partial — invoice $217k with
        // $197k of credits has a real customer balance of $19k, not $217k.
        const gross = parseFloat(String(invoice.amount)) || 0;
        const discount = parseFloat(String((invoice as { discount_applied?: number | string }).discount_applied ?? 0)) || 0;
        // Legacy-shape invoices (discount stored > amount) already have
        // amount = net customer portion; don't subtract again. Shared predicate
        // — this had its own `>=` copy, which computed a fully-covered
        // invoice's balance as the whole gross and so could never mark it Paid.
        const customerBalance = invoiceCustomerTotal(gross, discount);
        const newStatus = totalPaid >= customerBalance - 0.01 ? 'Paid' : 'Partially Paid';

        await supabase
          .from('invoices')
          .update({ payment_status: newStatus })
          .eq('id', invoice.id);

        // Auto-send a payment receipt (Tracy's feedback eb14afd2). Mirrors
        // the manual-payment receipt path in InvoiceDetail.addPayment.
        // Fire-and-forget — receipt failure must never fail the webhook ack.
        try {
          const { data: invFull } = await supabase
            .from('invoices')
            .select('invoice_id, sent_to_email, business_unit, portal_token')
            .eq('id', invoice.id).single();
          let custEmail = invFull?.sent_to_email || '';
          let custName = '';
          if (invoice.customer_id) {
            const { data: custFull } = await supabase
              .from('customers').select('email, name').eq('id', invoice.customer_id).single();
            if (!custEmail) custEmail = custFull?.email || '';
            custName = custFull?.name || '';
          }
          if (custEmail) {
            const { data: companyRow } = await supabase
              .from('companies').select('company_name, phone, owner_email, address, logo_url').eq('id', companyId).single();
            let buObj: { name?: string; phone?: string; email?: string; address?: string; logo_url?: string } | null = null;
            if (invFull?.business_unit) {
              const { data: buRow } = await supabase
                .from('settings').select('value').eq('company_id', companyId).eq('key', 'business_units').maybeSingle();
              if (buRow?.value) {
                try { buObj = JSON.parse(buRow.value).find((u: { name?: string }) => u.name === invFull.business_unit) || null; } catch { /* ignore */ }
              }
            }
            await fetch(`${SUPABASE_URL}/functions/v1/send-receipt`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SERVICE_ROLE_KEY}`, 'apikey': SERVICE_ROLE_KEY },
              body: JSON.stringify({
                recipient_email: custEmail,
                customer_name: custName,
                invoice_number: invFull?.invoice_id || `INV-${invoice.id}`,
                payment_amount: amountDollars,
                payment_method: paymentMethodType,
                payment_date: new Date().toISOString().split('T')[0],
                balance_remaining: Math.max(0, customerBalance - totalPaid),
                invoice_total: customerBalance,
                total_paid: totalPaid,
                company_name: companyRow?.company_name || '',
                business_unit_name: buObj?.name || invFull?.business_unit || '',
                business_unit_phone: buObj?.phone || companyRow?.phone || '',
                business_unit_email: buObj?.email || companyRow?.owner_email || '',
                business_unit_address: buObj?.address || companyRow?.address || '',
                logo_url: buObj?.logo_url || companyRow?.logo_url || '',
                portal_url: invFull?.portal_token ? `https://jobscout.appsannex.com/portal/${invFull.portal_token}` : null,
              }),
            }).catch(() => { /* fire-and-forget */ });
          }
        } catch (_) { /* receipt is non-critical */ }
      }
    } else if (paymentType === 'estimate_deposit' && documentType === 'estimate') {
      await supabase
        .from('quotes')
        .update({
          deposit_amount: amountDollars,
          deposit_method: 'Credit Card',
          deposit_date: new Date().toISOString().split('T')[0],
          status: 'Approved',
        })
        .eq('id', documentId);

      // Pull the full quote so we can mirror approve-document behavior:
      // (a) flip linked lead to Won, (b) auto-create a job if none exists
      // so the deal shows up in Sales Won immediately.
      const { data: estimate } = await supabase
        .from('quotes')
        .select('id, company_id, lead_id, customer_id, salesperson_id, estimate_name, job_title, quote_amount, discount, quote_id, utility_incentive, summary, service_date, job_id, lead:leads(business_name, customer_name), customer:customers(business_name, name)')
        .eq('id', documentId)
        .single();

      if (estimate?.lead_id) {
        await supabase
          .from('leads')
          .update({ status: 'Won' })
          .eq('id', estimate.lead_id);
      }

      // Auto-create job (mirrors approve-document)
      if (estimate && !estimate.job_id) {
        try {
          const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`;
          // Title the job business-name-first (customer → lead), matching
          // EstimateDetail.convertToJob and approve-document. quotes has no
          // customer_name column, so the name comes from the joined records.
          // supabase-js types these to-one embeds as arrays; narrow to the
          // object shape we actually receive at runtime (cast is erased, no
          // behavior change).
          const estCustomer = estimate.customer as unknown as { business_name?: string; name?: string } | null;
          const estLead = estimate.lead as unknown as { business_name?: string; customer_name?: string } | null;
          const jobCustomerName = estCustomer?.business_name || estCustomer?.name
            || estLead?.business_name || estLead?.customer_name || 'Customer';
          const { data: newJob, error: jobErr } = await supabase
            .from('jobs')
            .insert([{
              company_id: estimate.company_id,
              job_id: jobNumber,
              job_title: estimate.estimate_name || estimate.job_title || `${jobCustomerName} - Job`,
              customer_id: estimate.customer_id || null,
              lead_id: estimate.lead_id ? parseInt(String(estimate.lead_id)) : null,
              salesperson_id: estimate.salesperson_id || null,
              quote_id: estimate.id,
              status: 'Chillin',
              // Match EstimateDetail.convertToJob — only carry an actual
              // service_date through. Auto-filling NOW would push the
              // job into the Scheduled column on the board.
              start_date: estimate.service_date || null,
              job_total: parseFloat(String(estimate.quote_amount || 0)) || 0,
              // Carry the rep's whole-project discount — without it the invoice
              // has nothing to deduct and over-bills the customer.
              discount: parseFloat(String(estimate.discount || 0)) || 0,
              utility_incentive: parseFloat(String(estimate.utility_incentive || 0)) || 0,
              details: estimate.summary || null,
              updated_at: new Date().toISOString(),
            }])
            .select('id')
            .single();
          if (!jobErr && newJob?.id) {
            await supabase.from('quotes').update({ job_id: newJob.id }).eq('id', estimate.id);
          } else if (jobErr) {
            console.error('[stripe-webhook] job auto-create failed', jobErr);
          }
        } catch (e) {
          console.error('[stripe-webhook] job auto-create exception', e);
        }
      }
    }

    return new Response(JSON.stringify({ received: true }),
      { headers: { 'Content-Type': 'application/json' } });

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('stripe-webhook error:', message);
    return new Response(JSON.stringify({ error: message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}

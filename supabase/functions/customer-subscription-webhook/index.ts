// customer-subscription-webhook — lifecycle for CUSTOMER memberships.
//
// A SEPARATE endpoint from stripe-webhook. It only handles subscription events
// (customer.subscription.* and invoice.paid/payment_failed) that the existing
// stripe-webhook ignores. It never records one-off invoice payments, so the
// existing payment path is untouched.
//
// Per-tenant: the signing secret is read from settings.payment_config
// (stripe_subscription_webhook_secret), resolved from the event's company_id —
// the same "resolve company from unverified payload, then verify" pattern the
// existing webhook uses. Every event is idempotent (stripe_subscription_events)
// and every response is 200 (anti auto-disable).
//
// config.toml pins verify_jwt=false; deploy with --no-verify-jwt.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const enc = new TextEncoder();

async function verifyStripeSignature(payload: string, sigHeader: string, secret: string): Promise<boolean> {
  try {
    const parts = Object.fromEntries(sigHeader.split(',').map((kv) => kv.split('=')) as [string, string][]);
    const t = parts['t']; const v1 = parts['v1'];
    if (!t || !v1) return false;
    // 5-minute tolerance
    if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > 300) return false;
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${t}.${payload}`));
    const expected = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
    // constant-time compare
    if (expected.length !== v1.length) return false;
    let diff = 0;
    for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ v1.charCodeAt(i);
    return diff === 0;
  } catch { return false; }
}

function ok(body: unknown = { received: true }) {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

serve(async (req) => {
  if (req.method !== 'POST') return ok({ ignored: 'method' });
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const raw = await req.text();
  const sigHeader = req.headers.get('Stripe-Signature') || '';

  // Parse unverified only to resolve which company's secret to verify with.
  let event: any;
  try { event = JSON.parse(raw); } catch { return ok({ ignored: 'bad_json' }); }
  const obj = event?.data?.object || {};
  const type: string = event?.type || '';

  // Resolve company: subscription events carry metadata.company_id; invoices we
  // trace via their subscription id to a known membership.
  let companyId: number | null = obj?.metadata?.company_id ? Number(obj.metadata.company_id) : null;
  const subId: string | null = type.startsWith('customer.subscription')
    ? obj?.id
    : (obj?.subscription || obj?.parent?.subscription_details?.subscription || null);
  if (!companyId && subId) {
    const { data } = await sb.from('customer_memberships').select('company_id').eq('stripe_subscription_id', subId).maybeSingle();
    if (data?.company_id) companyId = data.company_id;
  }
  if (!companyId) return ok({ ignored: 'no_company' });

  // Per-company signing secret (fallback to a global env for single-tenant setups).
  const { data: cfgRow } = await sb.from('settings').select('value')
    .eq('company_id', companyId).eq('key', 'payment_config').maybeSingle();
  let cfg: any = null;
  if (cfgRow?.value) { try { cfg = JSON.parse(cfgRow.value); } catch { /* ignore */ } }
  const secret = cfg?.stripe_subscription_webhook_secret || Deno.env.get('STRIPE_SUBSCRIPTION_WEBHOOK_SECRET');
  if (!secret) return ok({ ignored: 'no_secret' });

  const verified = await verifyStripeSignature(raw, sigHeader, secret);
  if (!verified) return new Response(JSON.stringify({ error: 'bad signature' }), { status: 400 });

  // Idempotency: process each event id once.
  if (event?.id) {
    const { error: dupErr } = await sb.from('stripe_subscription_events')
      .insert({ company_id: companyId, stripe_event_id: event.id, event_type: type });
    if (dupErr) return ok({ ignored: 'duplicate' }); // unique violation => already processed
  }

  const nowIso = new Date().toISOString();
  const tsIso = (n: number | null | undefined) => (n ? new Date(n * 1000).toISOString() : null);

  try {
    if (type === 'customer.subscription.updated' || type === 'customer.subscription.deleted') {
      const status = type === 'customer.subscription.deleted' ? 'canceled' : (obj.status || 'active');
      await sb.from('customer_memberships').update({
        status,
        current_period_start: tsIso(obj.current_period_start),
        current_period_end: tsIso(obj.current_period_end),
        canceled_at: status === 'canceled' ? nowIso : null,
        updated_at: nowIso,
      }).eq('stripe_subscription_id', obj.id).eq('company_id', companyId);
    } else if (type === 'invoice.paid' || type === 'invoice.payment_succeeded') {
      if (subId) {
        await sb.from('customer_memberships').update({
          status: 'active', current_period_end: tsIso(obj.lines?.data?.[0]?.period?.end), updated_at: nowIso,
        }).eq('stripe_subscription_id', subId).eq('company_id', companyId);
        // NOTE: auto-generating the paid period's service visit hooks in here (Slice 3).
      }
    } else if (type === 'invoice.payment_failed') {
      if (subId) {
        await sb.from('customer_memberships').update({ status: 'past_due', updated_at: nowIso })
          .eq('stripe_subscription_id', subId).eq('company_id', companyId);
      }
    }
    // Any other event type: acknowledged, no-op.
  } catch (e) {
    console.error('customer-subscription-webhook processing error:', e);
    // Still 200 — we recorded the event id; a re-send would dedupe. Avoid auto-disable.
  }

  return ok();
});

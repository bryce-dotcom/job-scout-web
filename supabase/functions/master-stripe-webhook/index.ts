// Webhook receiver for JobScout's master Stripe account. Translates
// subscription lifecycle events into companies.billing_status updates
// so the Settings UI + trial banner reflect reality without polling.
//
// Events handled:
//   customer.subscription.created    → set billing_status from sub.status
//   customer.subscription.updated    → ditto (handles trialing → active,
//                                       past_due, canceled, etc.)
//   customer.subscription.deleted    → billing_status='canceled'
//   invoice.payment_failed            → billing_status='past_due'
//   invoice.payment_succeeded         → confirm 'active'
//
// Set up in Stripe Dashboard:
//   1. Master Stripe → Developers → Webhooks → Add endpoint
//   2. URL: https://tzrhfhisdeahrrmeksif.supabase.co/functions/v1/master-stripe-webhook
//   3. Events: the five listed above
//   4. Copy the signing secret → set as MASTER_STRIPE_WEBHOOK_SECRET
//      in Supabase Edge Function Secrets
//
// Until the secret is set, we accept the request without verification
// (logged as a warning). Fine for development; tighten before going
// live with paying customers.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

interface StripeSubscription {
  id: string;
  status: string; // active | trialing | past_due | canceled | incomplete
  customer: string;
  cancel_at_period_end: boolean;
  current_period_end: number;
  cancel_at?: number | null;
  canceled_at?: number | null;
  items?: { data: { price: { id: string; product: string; recurring?: { interval?: string } } }[] };
  // Subscriptions for the main JobScout tier carry { company_id, plan_id }.
  // Subscriptions for the Prospecting Pro add-on carry
  // { jobscout_company_id, jobscout_product_id: 'prospecting_pro', interval }
  metadata?: {
    company_id?: string;
    plan_id?: string;
    jobscout_company_id?: string;
    jobscout_product_id?: string;
    interval?: string;
  };
}

interface StripeInvoice {
  id: string;
  customer: string;
  subscription: string | null;
}

function statusFromSub(s: string): string {
  if (s === 'active')                 return 'active';
  if (s === 'trialing')                return 'trialing';
  if (s === 'past_due')                return 'past_due';
  if (s === 'unpaid')                  return 'past_due';
  if (s === 'canceled')                return 'canceled';
  if (s === 'incomplete')              return 'unbilled';
  if (s === 'incomplete_expired')      return 'unbilled';
  return 'unbilled';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const SIGNING_SECRET = Deno.env.get('MASTER_STRIPE_WEBHOOK_SECRET');

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.text();
    if (!SIGNING_SECRET) {
      console.warn('[master-stripe-webhook] MASTER_STRIPE_WEBHOOK_SECRET not set — accepting unverified event');
    }
    // TODO: verify Stripe signature once SIGNING_SECRET is wired

    const event = JSON.parse(body);
    const type: string = event?.type || '';
    console.log('[master-stripe-webhook] event:', type);

    let companyUpdate: Record<string, unknown> | null = null;
    let companyMatch: { master_stripe_customer_id?: string; master_stripe_subscription_id?: string; company_id?: number } = {};

    if (type === 'customer.subscription.created' ||
        type === 'customer.subscription.updated' ||
        type === 'customer.subscription.deleted') {
      const sub = event.data.object as StripeSubscription;

      // ── BRANCH: Prospecting Pro add-on subscription ──────────────
      // Detected by metadata.jobscout_product_id. Routes to a separate
      // set of columns so the customer can have BOTH a main JobScout
      // subscription AND a prospecting add-on without one stomping
      // the other.
      if (sub.metadata?.jobscout_product_id === 'prospecting_pro') {
        const companyId = sub.metadata.jobscout_company_id ? Number(sub.metadata.jobscout_company_id) : null;
        if (!companyId) {
          console.warn('[master-stripe-webhook] prospecting sub missing company metadata:', sub.id);
        } else {
          const interval = sub.items?.data?.[0]?.price?.recurring?.interval || sub.metadata?.interval || null;
          const update: Record<string, unknown> = {
            prospecting_stripe_sub_id:           type === 'customer.subscription.deleted' ? null : sub.id,
            prospecting_tier:                    type === 'customer.subscription.deleted' ? 'free' : (sub.status === 'active' || sub.status === 'trialing' ? 'pro' : 'free'),
            prospecting_subscription_interval:   interval,
            prospecting_subscription_cancel_at:  sub.cancel_at  ? new Date(sub.cancel_at  * 1000).toISOString() : null,
            prospecting_subscription_canceled_at:sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
            updated_at: new Date().toISOString(),
          };
          // Field Boss customers keep their comp tier on cancellation —
          // never demote a Field Boss user to 'free'.
          const { data: existing } = await supabase
            .from('companies')
            .select('subscription_tier')
            .eq('id', companyId)
            .maybeSingle();
          if (existing?.subscription_tier === 'field_boss') {
            update.prospecting_tier = 'field_boss';
          }
          const { error } = await supabase.from('companies').update(update).eq('id', companyId);
          if (error) console.error('[master-stripe-webhook] prospecting update failed:', error.message);
          else console.log('[master-stripe-webhook] prospecting tier set for company', companyId, '→', update.prospecting_tier);
        }
        return new Response(JSON.stringify({ received: true, type, route: 'prospecting' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // ── Default branch: main JobScout subscription ──────────────
      companyMatch.master_stripe_subscription_id = sub.id;
      if (sub.metadata?.company_id) companyMatch.company_id = Number(sub.metadata.company_id);
      const newStatus = type === 'customer.subscription.deleted' ? 'canceled' : statusFromSub(sub.status);
      companyUpdate = {
        billing_status: newStatus,
        // If metadata carries plan_id, sync the tier
        ...(sub.metadata?.plan_id ? { subscription_tier: sub.metadata.plan_id } : {}),
        updated_at: new Date().toISOString(),
      };
    } else if (type === 'invoice.payment_failed') {
      const inv = event.data.object as StripeInvoice;
      if (inv.subscription) {
        companyMatch.master_stripe_subscription_id = inv.subscription;
      } else if (inv.customer) {
        companyMatch.master_stripe_customer_id = inv.customer;
      }
      companyUpdate = { billing_status: 'past_due', updated_at: new Date().toISOString() };
    } else if (type === 'invoice.payment_succeeded') {
      const inv = event.data.object as StripeInvoice;
      if (inv.subscription) companyMatch.master_stripe_subscription_id = inv.subscription;
      // Only flip to 'active' if currently past_due — don't override 'trialing'
      // Need to look up first.
    } else {
      return new Response(JSON.stringify({ ignored: true, type }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (companyUpdate) {
      let q = supabase.from('companies').update(companyUpdate);
      if (companyMatch.master_stripe_subscription_id) {
        q = q.eq('master_stripe_subscription_id', companyMatch.master_stripe_subscription_id);
      } else if (companyMatch.company_id) {
        q = q.eq('id', companyMatch.company_id);
      } else if (companyMatch.master_stripe_customer_id) {
        q = q.eq('master_stripe_customer_id', companyMatch.master_stripe_customer_id);
      }
      const { error } = await q;
      if (error) console.error('[master-stripe-webhook] company update failed:', error.message);
    } else if (type === 'invoice.payment_succeeded' && companyMatch.master_stripe_subscription_id) {
      // Pull current row, only flip to 'active' if it was past_due
      const { data: c } = await supabase
        .from('companies')
        .select('id, billing_status')
        .eq('master_stripe_subscription_id', companyMatch.master_stripe_subscription_id)
        .maybeSingle();
      if (c?.billing_status === 'past_due') {
        await supabase.from('companies').update({
          billing_status: 'active',
          updated_at: new Date().toISOString(),
        }).eq('id', c.id);
      }
    }

    return new Response(JSON.stringify({ received: true, type }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[master-stripe-webhook] error:', (err as Error).message);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

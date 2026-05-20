// Surface the tenant's Stripe account health so reps can self-diagnose
// "I'm charging customers but the money isn't hitting my bank."
// 99% of the time that's payouts_enabled = false because KYC isn't
// complete or a bank hasn't been added — pure Stripe-side state we
// can read but cannot fix for them.
//
// Body: { company_id }
// Returns:
//   {
//     ok: true,
//     charges_enabled, payouts_enabled, details_submitted,
//     requirements: { currently_due, eventually_due, past_due, disabled_reason },
//     business_name, email, default_currency,
//     livemode  (true if a live key, false for test),
//   }
// On any failure: { ok: false, error: string }
//
// Always returns HTTP 200 with ok=false so the frontend gets a
// structured error instead of a FunctionsHttpError swallowing the body.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function res(body: unknown) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { company_id } = await req.json();
    if (!company_id) return res({ ok: false, error: "company_id required" });

    // Pull the tenant's stripe key from settings.payment_config.
    const settingsRes = await fetch(
      `${SUPABASE_URL}/rest/v1/settings?company_id=eq.${company_id}&key=eq.payment_config&select=value`,
      {
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        },
      },
    );
    if (!settingsRes.ok) return res({ ok: false, error: `settings lookup: ${settingsRes.status}` });
    const settingsRows = await settingsRes.json();
    if (!settingsRows || !settingsRows.length) {
      return res({ ok: false, error: "No payment_config configured for this company yet." });
    }

    let cfg = settingsRows[0].value;
    if (typeof cfg === "string") {
      try { cfg = JSON.parse(cfg); } catch { /* keep as-is */ }
    }

    const stripeKey: string | undefined = cfg?.stripe_secret_key;
    if (!stripeKey) {
      return res({ ok: false, error: "Stripe secret key not set. Paste it in Settings → Payments → Stripe." });
    }

    const livemode = stripeKey.startsWith("sk_live_");

    // Hit Stripe's GET /v1/account for the account behind this key.
    const acctRes = await fetch("https://api.stripe.com/v1/account", {
      method: "GET",
      headers: {
        Authorization: `Bearer ${stripeKey}`,
      },
    });
    const acct = await acctRes.json();
    if (!acctRes.ok) {
      const msg = acct?.error?.message || `Stripe ${acctRes.status}`;
      return res({ ok: false, error: `Stripe: ${msg}`, livemode });
    }

    return res({
      ok: true,
      livemode,
      charges_enabled: !!acct.charges_enabled,
      payouts_enabled: !!acct.payouts_enabled,
      details_submitted: !!acct.details_submitted,
      requirements: acct.requirements
        ? {
            currently_due: acct.requirements.currently_due || [],
            eventually_due: acct.requirements.eventually_due || [],
            past_due: acct.requirements.past_due || [],
            disabled_reason: acct.requirements.disabled_reason || null,
          }
        : null,
      business_name: acct.business_profile?.name || acct.settings?.dashboard?.display_name || null,
      email: acct.email || null,
      default_currency: acct.default_currency || null,
    });
  } catch (err) {
    return res({ ok: false, error: (err as Error).message || "Unexpected error" });
  }
});

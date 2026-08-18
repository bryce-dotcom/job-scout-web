// Tests for the stripe-webhook signature gate and event ordering.
//
// Run:  deno test -A supabase/functions/stripe-webhook/webhook_test.ts
//
// The security-critical assertions are the ones proving that an
// unsigned / wrongly-signed request performs NO service-role DB write —
// i.e. the setup_intent.succeeded branch (and the payment path) verify the
// Stripe signature BEFORE touching the database.

import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { handleStripeWebhook, verifyStripeSignature } from "./webhook.ts";

const GLOBAL_SECRET = "whsec_global_test";

// ── env the handler reads ────────────────────────────────────────────────
Deno.env.set("SUPABASE_URL", "https://test.supabase.co");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc_test");
Deno.env.set("STRIPE_WEBHOOK_SECRET", GLOBAL_SECRET);
Deno.env.set("STRIPE_SECRET_KEY", "sk_test");

// Build a real Stripe-style signature header for a payload+secret.
async function sign(payload: string, secret: string, ts = Math.floor(Date.now() / 1000)): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, enc.encode(`${ts}.${payload}`));
  const hex = Array.from(new Uint8Array(mac)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return `t=${ts},v1=${hex}`;
}

function req(payload: string, sigHeader: string): Request {
  return new Request("https://edge/functions/v1/stripe-webhook", {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": sigHeader },
    body: payload,
  });
}

interface Call { method: string; url: string; body?: string }

// Intercept every outbound HTTP call so we can (a) feed canned reads and
// (b) assert whether any DB WRITE happened. supabase-js and the branch's
// direct fetch both go through globalThis.fetch.
function installFetchSpy(opts: {
  resolveCustomerRow?: Record<string, unknown> | null; // resolveCompanyId (select=company_id)
  branchCustomerRow?: Record<string, unknown> | null;  // setup_intent branch (select=id,company_id)
  settingsRow?: { value: string } | null;              // loadCompanyStripeConfig
} = {}) {
  const calls: Call[] = [];
  const orig = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const method = String(init.method || (input instanceof Request ? input.method : "GET")).toUpperCase();
    calls.push({ method, url, body: typeof init.body === "string" ? init.body : undefined });

    const json = (b: unknown, status = 200) =>
      new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

    if (url.includes("api.stripe.com")) {
      return Promise.resolve(json({ id: "pm_x", card: { brand: "visa", last4: "4242", exp_month: 12, exp_year: 2030 } }));
    }
    if (url.includes("/rest/v1/customers")) {
      if (url.includes("id,company_id") || url.includes("id%2Ccompany_id")) {
        return Promise.resolve(json(opts.branchCustomerRow ? [opts.branchCustomerRow] : []));
      }
      return Promise.resolve(json(opts.resolveCustomerRow ? [opts.resolveCustomerRow] : []));
    }
    if (url.includes("/rest/v1/settings")) {
      return Promise.resolve(json(opts.settingsRow ? [opts.settingsRow] : []));
    }
    // customer_payment_methods / payments / invoices / quotes / jobs, etc.
    return Promise.resolve(json([]));
  }) as typeof fetch;

  return {
    calls,
    restore() { globalThis.fetch = orig; },
    // Any mutating call against the REST API = a DB write.
    dbWrites() {
      return calls.filter((c) => ["POST", "PATCH", "PUT", "DELETE"].includes(c.method) && c.url.includes("/rest/v1/"));
    },
  };
}

const SETUP_INTENT = JSON.stringify({
  type: "setup_intent.succeeded",
  data: { object: { customer: "cus_123", payment_method: "pm_123" } },
});
const CHECKOUT_WITH_COMPANY = JSON.stringify({
  type: "checkout.session.completed",
  data: { object: { metadata: { company_id: "2", document_id: "10", document_type: "invoice", payment_type: "invoice_payment" }, amount_total: 5000, payment_intent: "pi_1" } },
});

// ─────────────────────────── crypto primitive ───────────────────────────

Deno.test("verifyStripeSignature: correct signature passes", async () => {
  const p = JSON.stringify({ hello: "world" });
  assertEquals(await verifyStripeSignature(p, await sign(p, "whsec_x"), "whsec_x"), true);
});

Deno.test("verifyStripeSignature: wrong secret fails", async () => {
  const p = JSON.stringify({ hello: "world" });
  assertEquals(await verifyStripeSignature(p, await sign(p, "whsec_real"), "whsec_attacker"), false);
});

Deno.test("verifyStripeSignature: tampered payload fails", async () => {
  const header = await sign(JSON.stringify({ amount: 100 }), "whsec_x");
  assertEquals(await verifyStripeSignature(JSON.stringify({ amount: 999999 }), header, "whsec_x"), false);
});

Deno.test("verifyStripeSignature: missing/empty signature header fails", async () => {
  assertEquals(await verifyStripeSignature("{}", "", "whsec_x"), false);
  assertEquals(await verifyStripeSignature("{}", "t=123", "whsec_x"), false); // no v1
});

Deno.test("verifyStripeSignature: stale timestamp fails (replay window)", async () => {
  const oldTs = Math.floor(Date.now() / 1000) - 600; // 10 min
  assertEquals(await verifyStripeSignature("{}", await sign("{}", "whsec_x", oldTs), "whsec_x"), false);
});

Deno.test("verifyStripeSignature: empty secret fails closed", async () => {
  assertEquals(await verifyStripeSignature("{}", "t=1,v1=deadbeef", ""), false);
});

// ────────────────────── SECURITY: no write before verify ─────────────────

Deno.test("setup_intent.succeeded UNSIGNED → 400, zero DB writes", async () => {
  const spy = installFetchSpy({ branchCustomerRow: { id: 1, company_id: 2 } });
  try {
    const res = await handleStripeWebhook(req(SETUP_INTENT, "")); // no signature
    assertEquals(res.status, 400);
    assertEquals(spy.dbWrites(), []); // <-- the fix: nothing written
  } finally {
    spy.restore();
  }
});

Deno.test("setup_intent.succeeded WRONG signature → 400, zero DB writes", async () => {
  const spy = installFetchSpy({ branchCustomerRow: { id: 1, company_id: 2 } });
  try {
    const forged = await sign(SETUP_INTENT, "whsec_attacker_guess");
    const res = await handleStripeWebhook(req(SETUP_INTENT, forged));
    assertEquals(res.status, 400);
    assertEquals(spy.dbWrites(), []);
  } finally {
    spy.restore();
  }
});

Deno.test("setup_intent.succeeded forged even WITH a resolvable per-company secret → 400, zero writes", async () => {
  // Attacker supplies a real stripe_customer_id, so we resolve the company
  // AND its real webhook secret — the forged signature must still be rejected.
  const spy = installFetchSpy({
    resolveCustomerRow: { company_id: 2 },
    settingsRow: { value: JSON.stringify({ stripe_webhook_secret: "whsec_company_real" }) },
    branchCustomerRow: { id: 1, company_id: 2 },
  });
  try {
    const forged = await sign(SETUP_INTENT, "whsec_wrong");
    const res = await handleStripeWebhook(req(SETUP_INTENT, forged));
    assertEquals(res.status, 400);
    assertEquals(spy.dbWrites(), []);
  } finally {
    spy.restore();
  }
});

Deno.test("checkout.session.completed with company_id UNSIGNED → 400, zero writes", async () => {
  const spy = installFetchSpy();
  try {
    const res = await handleStripeWebhook(req(CHECKOUT_WITH_COMPANY, ""));
    assertEquals(res.status, 400);
    assertEquals(spy.dbWrites(), []);
  } finally {
    spy.restore();
  }
});

// ───────────────── happy path: valid signature still works ───────────────

Deno.test("setup_intent.succeeded VALID signature (global secret) → 200 synced, card upserted", async () => {
  const spy = installFetchSpy({ branchCustomerRow: { id: 1, company_id: 2 } });
  try {
    const good = await sign(SETUP_INTENT, GLOBAL_SECRET);
    const res = await handleStripeWebhook(req(SETUP_INTENT, good));
    assertEquals(res.status, 200);
    const writes = spy.dbWrites();
    assertEquals(writes.length, 1);
    assert(writes[0].url.includes("/rest/v1/customer_payment_methods"), "expected upsert into customer_payment_methods");
  } finally {
    spy.restore();
  }
});

// ─────────── behavior preserved: acks that must NOT require a signature ───

Deno.test("unhandled event type UNSIGNED → 200 received, no writes (anti auto-disable)", async () => {
  const spy = installFetchSpy();
  try {
    const res = await handleStripeWebhook(req(JSON.stringify({ type: "charge.refunded", data: { object: {} } }), ""));
    assertEquals(res.status, 200);
    assertEquals(spy.dbWrites(), []);
  } finally {
    spy.restore();
  }
});

Deno.test("checkout with NO company_id UNSIGNED → 200 ignored, no writes (native Stripe event)", async () => {
  const spy = installFetchSpy();
  try {
    const nativeEvt = JSON.stringify({ type: "payment_intent.succeeded", data: { object: { metadata: {}, amount_received: 100, id: "pi_native" } } });
    const res = await handleStripeWebhook(req(nativeEvt, ""));
    assertEquals(res.status, 200);
    const bodyJson = await res.json();
    assertEquals(bodyJson.ignored, "no app metadata");
    assertEquals(spy.dbWrites(), []);
  } finally {
    spy.restore();
  }
});

Deno.test("malformed body → 400 (not a 500)", async () => {
  const spy = installFetchSpy();
  try {
    const res = await handleStripeWebhook(req("not json{", ""));
    assertEquals(res.status, 400);
    assertEquals(spy.dbWrites(), []);
  } finally {
    spy.restore();
  }
});

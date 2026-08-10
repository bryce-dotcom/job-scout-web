// Public crash intake.
//
// A customer reading a proposal at /portal/:token is not signed in, so a
// direct table insert is refused — and that is the one screen where a silent
// failure costs a sale. Granting anon INSERT on client_errors was tried twice
// and did not stick (this project revokes anon grants on public tables), and
// fighting that would have traded a security posture for convenience.
//
// So the write happens here instead, with the service role. The table keeps
// NO public grant at all, which is the better arrangement regardless: the
// payload is validated and clamped server-side, where a hostile caller cannot
// skip it.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const clamp = (v: unknown, n: number) =>
  v == null ? null : String(v).slice(0, n);

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const message = clamp(body?.message, 500);
    if (!message) {
      return new Response(JSON.stringify({ error: "message required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // company_id is trusted only as far as it being a number — an anonymous
    // caller supplies it and could name any tenant. It scopes the report for
    // triage; nothing reads it as an authorisation decision.
    const companyId = Number.isFinite(Number(body?.company_id)) && Number(body?.company_id) > 0
      ? Number(body.company_id)
      : null;

    // The BEFORE INSERT trigger dedupes and enforces the per-tenant hourly cap,
    // so a flood collapses into one row with a rising count.
    const { error } = await sb.from("client_errors").insert({
      company_id: companyId,
      employee_id: Number.isFinite(Number(body?.employee_id)) ? Number(body.employee_id) : null,
      message,
      stack: clamp(body?.stack, 8000),
      component: clamp(body?.component, 2000),
      route: clamp(body?.route, 300),
      user_agent: clamp(req.headers.get("user-agent") ?? body?.user_agent, 300),
      app_build: clamp(body?.app_build, 100),
      breadcrumbs: clamp(body?.breadcrumbs, 4000),
      last_seen_at: new Date().toISOString(),
    });
    if (error) throw error;

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Never make a crashing client crash harder.
    return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// Tell someone when the app crashes.
//
// The in-app crash log records every error screen, but a log nobody opens is
// only marginally better than no log: Cameron's clock-out failed for three
// days and the Products page was broken for all 189 products with specs, and
// in both cases the signal was a person photographing their screen.
//
// Same channel as health-check on purpose — a feedback ticket (the queue that
// already gets read) plus an email. A new alerting surface nobody checks is
// how this problem repeats itself.
//
// Alerts on NEW crashes only. A crash already alerted stays quiet no matter
// how many times it recurs, so one broken page cannot produce a hundred
// emails; the seen_count in the console carries the volume instead. A crash
// that RECURS after being marked resolved is re-alerted, because the trigger
// reopens it and clears alerted_at — being wrong about a fix is worth knowing.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ADMIN_EMAIL = "bryce@hhh.services";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const sb = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: fresh, error } = await sb
      .from("client_errors")
      .select("id, company_id, message, route, seen_count, app_build, last_seen_at")
      .is("alerted_at", null)
      .eq("resolved", false)
      .order("last_seen_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    if (!fresh || fresh.length === 0) {
      return new Response(JSON.stringify({ alerted: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // One message covering everything new since the last run, grouped per
    // tenant so a multi-tenant outage is one alert per affected customer.
    const byCompany = new Map<number, typeof fresh>();
    for (const row of fresh) {
      const list = byCompany.get(row.company_id) ?? [];
      list.push(row);
      byCompany.set(row.company_id, list);
    }

    let sent = 0;
    for (const [companyId, rows] of byCompany) {
      // Not everything here is a crash. The overflow watcher reports controls
      // pushed off-screen, where nothing threw and no error screen appeared.
      // Calling that "App crash" trains the reader to distrust the subject
      // line, and a distrusted alert is an ignored one.
      const isLayout = (m: string) => String(m).startsWith("Off-screen content:");
      const layoutCount = rows.filter(r => isLayout(r.message)).length;
      const crashCount = rows.length - layoutCount;

      const subject = rows.length === 1
        ? (isLayout(rows[0].message)
            ? `Layout: content off-screen on ${rows[0].route || "a page"}`
            : `App crash: ${String(rows[0].message).slice(0, 80)}`)
        : crashCount === 0
          ? `${layoutCount} pages with content off-screen`
          : `${crashCount} new app crashes${layoutCount ? ` + ${layoutCount} layout` : ""}`;

      const lines = rows.map(r =>
        `• ${r.message}\n` +
        `    page: ${r.route || "unknown"}\n` +
        `    seen: ${r.seen_count} time${r.seen_count === 1 ? "" : "s"}` +
        `${r.app_build ? `   build: ${r.app_build}` : ""}`
      ).join("\n\n");

      const message =
        `${crashCount ? "The app showed an error screen to someone." : "Content was pushed off-screen where nobody could reach it — nothing crashed, which is why this kind of failure used to surface only when someone photographed their monitor."}

${lines}

` +
        `Full stacks and resolve/reopen: Data Console > Crashes.\n\n` +
        `You are told once per distinct crash. If it keeps happening the count ` +
        `rises there rather than sending more email. Marking one resolved and ` +
        `then seeing it again will alert you a second time.`;

      await sb.from("feedback").insert({
        company_id: companyId,
        user_email: "system@jobscout",
        page_url: rows[0].route || "/",
        feedback_type: "bug",
        subject,
        message,
        status: "new",
      });

      // Email is best-effort: the ticket is the durable record, and a Resend
      // outage must not stop us stamping these as alerted and then loop.
      await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-feedback-reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}`,
          apikey: Deno.env.get("SUPABASE_ANON_KEY") ?? "",
        },
        body: JSON.stringify({
          recipient_email: ADMIN_EMAIL,
          subject,
          original_message: "Automated crash alert",
          reply_message: message,
          feedback_type: "bug",
        }),
      }).catch(() => {});

      sent += 1;
    }

    // Stamp AFTER alerting. Stamping first would lose the alert entirely if
    // this run died halfway; stamping after can at worst repeat one.
    const { error: stampErr } = await sb
      .from("client_errors")
      .update({ alerted_at: new Date().toISOString() })
      .in("id", fresh.map(r => r.id));
    if (stampErr) throw stampErr;

    return new Response(JSON.stringify({ alerted: fresh.length, emails: sent }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

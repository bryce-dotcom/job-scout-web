// Daily follow-up digest.
//
// One notification per rep per morning: "3 follow-ups due today." Silent when
// they have none. Chosen over per-follow-up pushes deliberately — a rep with
// six due would get six buzzes, and anything that fires unpredictably gets
// notification permission revoked, after which the feature is worth nothing.
//
// VAPID_PRIVATE_KEY / VAPID_PUBLIC_KEY / VAPID_SUBJECT come from Supabase
// secrets and are never in the client bundle.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import webpush from "https://esm.sh/web-push@3.6.7";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const publicKey = Deno.env.get("VAPID_PUBLIC_KEY");
    const privateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const subject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@hhh.services";
    if (!publicKey || !privateKey) {
      // Not configured yet — succeed quietly so a cron does not alarm anyone.
      return new Response(JSON.stringify({ skipped: "VAPID keys not configured" }), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    webpush.setVapidDetails(subject, publicKey, privateKey);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const nowIso = new Date().toISOString();

    // Follow-ups whose scheduled date has arrived. Latest touch per deal wins:
    // an older row saying "due last week" must not keep a deal flagged after
    // the rep pushed it out. Same rule as lib/followUpDue.
    const { data: rows, error } = await supabase
      .from("lead_follow_ups")
      .select("company_id, employee_id, lead_id, job_id, contacted_at, next_follow_up_at")
      .not("next_follow_up_at", "is", null)
      .lte("next_follow_up_at", nowIso)
      .order("contacted_at", { ascending: false })
      .limit(5000);
    if (error) throw error;

    const latest = new Map<string, typeof rows[number]>();
    for (const r of rows || []) {
      const key = `${r.company_id}:${r.lead_id != null ? `l${r.lead_id}` : `j${r.job_id}`}`;
      if (!latest.has(key)) latest.set(key, r); // already sorted newest-first
    }

    // Count per (company, employee). A follow-up with no employee is nobody's
    // to be reminded about, so it is counted for the board but not pushed.
    const perEmployee = new Map<string, { company_id: number; employee_id: number; count: number }>();
    for (const r of latest.values()) {
      if (r.employee_id == null) continue;
      const k = `${r.company_id}:${r.employee_id}`;
      const cur = perEmployee.get(k) || { company_id: r.company_id, employee_id: r.employee_id, count: 0 };
      cur.count += 1;
      perEmployee.set(k, cur);
    }

    let sent = 0, cleaned = 0, failed = 0;
    for (const { company_id, employee_id, count } of perEmployee.values()) {
      const { data: subs } = await supabase
        .from("push_subscriptions")
        .select("id, endpoint, p256dh, auth, failure_count")
        .eq("company_id", company_id)
        .eq("employee_id", employee_id);
      if (!subs || subs.length === 0) continue;

      const payload = JSON.stringify({
        title: count === 1 ? "1 follow-up due" : `${count} follow-ups due`,
        body: count === 1 ? "One deal is waiting on you today." : `${count} deals are waiting on you today.`,
        tag: "jobscout-followups",
        url: "/pipeline",
      });

      for (const s of subs) {
        try {
          await webpush.sendNotification(
            { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
            payload,
          );
          sent += 1;
          await supabase.from("push_subscriptions")
            .update({ last_sent_at: nowIso, failure_count: 0 })
            .eq("id", s.id);
        } catch (e) {
          const status = (e as { statusCode?: number })?.statusCode;
          // 404/410 mean the browser dropped this endpoint for good. Retrying
          // it every morning forever is how these tables rot.
          if (status === 404 || status === 410) {
            await supabase.from("push_subscriptions").delete().eq("id", s.id);
            cleaned += 1;
          } else {
            // A transient failure (network, push service hiccup). Count it so
            // an endpoint that fails every morning can be pruned later, and
            // increment from the STORED value rather than writing a constant.
            failed += 1;
            await supabase.from("push_subscriptions")
              .update({ failure_count: (Number(s.failure_count) || 0) + 1 })
              .eq("id", s.id);
          }
        }
      }
    }

    return new Response(JSON.stringify({ recipients: perEmployee.size, sent, cleaned, failed }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});

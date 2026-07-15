// Collections Autopilot — hellofrank-style automated AR reminders.
//
// Cadence (days overdue):
//   Tier 1  ≥ 7d   friendly email
//   Tier 2  ≥ 14d  firmer email + SMS (when customer has a phone)
//   Tier 3  ≥ 30d  escalation email (cc owner) + flagged in log
//
// Safety properties (Bryce: "do NOT break anything"):
//   - DEFAULT OFF. Runs only for companies whose settings row
//     key='collections_autopilot' has {"enabled": true}. No row = no-op.
//   - Idempotent: each tier sends at most once per invoice, tracked in
//     collection_reminders (method = 'auto_t1_email' | 'auto_t2_email' |
//     'auto_t2_sms' | 'auto_t3_email'). One tier escalation per run per
//     invoice — a 40-day-overdue invoice on first enable gets ONE tier-3
//     notice, not three emails at once.
//   - Per-customer opt-out via settings {opt_out_customer_ids: [...]}.
//   - max_per_run cap (default 25 sends) so the first enable can't blast.
//   - {preview: true} returns the would-send list WITHOUT sending — the
//     Frankie Settings UI uses this so Tracy can see exactly what would
//     go out before flipping the switch.
//
// Invocation:
//   {cron: true}                      → run all enabled companies (pg_cron)
//   {company_id, preview: true}       → dry-run list for one company
//   {company_id}                      → live run for one company (if enabled)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}

// Default escalation ladder. Per-company overrides come from the
// settings row: { t1_days, t2_days, t3_days, sms_enabled }.
function tiersFor(cfg: { t1_days?: number; t2_days?: number; t3_days?: number; sms_enabled?: boolean }) {
  const t1 = Number(cfg.t1_days) || 7;
  const t2 = Math.max(Number(cfg.t2_days) || 14, t1 + 1);
  const t3 = Math.max(Number(cfg.t3_days) || 30, t2 + 1);
  const sms = cfg.sms_enabled !== false; // default on for tier 2
  return [
    { tier: 3, minDays: t3, methods: ['email'], tone: 'escalation' },
    { tier: 2, minDays: t2, methods: sms ? ['email', 'sms'] : ['email'], tone: 'firm' },
    { tier: 1, minDays: t1, methods: ['email'], tone: 'friendly' },
  ];
}

function fmtUsd(n: number) {
  return '$' + (Number(n) || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function buildEmail(tone: string, custName: string, invNum: string, amount: string, daysOverdue: number, companyName: string, portalUrl: string | null) {
  const first = (custName || '').split(' ')[0] || 'there';
  const payLine = portalUrl ? `<p><a href="${portalUrl}" style="background:#5a6349;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none;font-weight:600;">View &amp; Pay Invoice</a></p>` : '';
  if (tone === 'friendly') {
    return {
      subject: `Friendly reminder — invoice ${invNum}`,
      html: `<p>Hi ${first},</p><p>Just a friendly reminder that invoice <strong>${invNum}</strong> for <strong>${amount}</strong> is now past due. If you've already sent payment, please disregard this note.</p>${payLine}<p>Questions about the invoice? Just reply to this email.</p><p>Thank you!<br/>${companyName}</p>`,
    };
  }
  if (tone === 'firm') {
    return {
      subject: `Past due notice — invoice ${invNum} (${daysOverdue} days)`,
      html: `<p>Hi ${first},</p><p>Invoice <strong>${invNum}</strong> for <strong>${amount}</strong> is now <strong>${daysOverdue} days past due</strong>. We'd appreciate payment at your earliest convenience.</p>${payLine}<p>If something is holding this up — a question about the work, a billing detail — reply here and we'll sort it out quickly.</p><p>Thank you,<br/>${companyName}</p>`,
    };
  }
  return {
    subject: `FINAL NOTICE — invoice ${invNum} is ${daysOverdue} days past due`,
    html: `<p>Hi ${first},</p><p>This is a final notice that invoice <strong>${invNum}</strong> for <strong>${amount}</strong> is now <strong>${daysOverdue} days past due</strong>.</p><p>Please remit payment within 7 days or contact us to arrange a payment plan. Continued non-payment may pause scheduled work and incur late fees where permitted.</p>${payLine}<p>${companyName}</p>`,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const preview = !!body.preview;

    // Resolve which companies to process
    let companyIds: number[] = [];
    if (body.cron) {
      const { data: rows } = await supabase.from('settings').select('company_id, value').eq('key', 'collections_autopilot');
      for (const r of rows || []) {
        try { if (JSON.parse(r.value)?.enabled) companyIds.push(r.company_id); } catch { /* skip bad json */ }
      }
    } else if (body.company_id) {
      companyIds = [Number(body.company_id)];
    } else {
      return json({ error: 'company_id or cron:true required' }, 400);
    }

    const results: Record<string, unknown>[] = [];

    for (const companyId of companyIds) {
      // Config (default off)
      const { data: cfgRow } = await supabase.from('settings').select('value')
        .eq('company_id', companyId).eq('key', 'collections_autopilot').maybeSingle();
      let cfg: { enabled?: boolean; opt_out_customer_ids?: number[]; max_per_run?: number; t1_days?: number; t2_days?: number; t3_days?: number; sms_enabled?: boolean } = {};
      try { cfg = cfgRow?.value ? JSON.parse(cfgRow.value) : {}; } catch { cfg = {}; }
      if (!cfg.enabled && !preview) { results.push({ companyId, skipped: 'disabled' }); continue; }
      const optOut = new Set((cfg.opt_out_customer_ids || []).map(Number));
      const maxPerRun = Number(cfg.max_per_run) || 25;

      const { data: companyRow } = await supabase.from('companies')
        .select('company_name, owner_email').eq('id', companyId).single();
      const companyName = companyRow?.company_name || 'Our Company';

      // Open customer invoices (exclude deposits — those have their own flow)
      const { data: invoices } = await supabase.from('invoices')
        .select('id, invoice_id, amount, discount_applied, payment_status, due_date, created_at, customer_id, sent_to_email, portal_token, invoice_type')
        .eq('company_id', companyId)
        .not('payment_status', 'in', '("Paid","Void","Cancelled")')
        .neq('invoice_type', 'deposit');

      const invIds = (invoices || []).map(i => i.id);
      // Payments per invoice (chunked .in)
      const payByInv = new Map<number, number>();
      for (let i = 0; i < invIds.length; i += 200) {
        const chunk = invIds.slice(i, i + 200);
        const { data: pays } = await supabase.from('payments').select('invoice_id, amount').in('invoice_id', chunk);
        for (const p of pays || []) {
          if (!p.invoice_id) continue;
          payByInv.set(p.invoice_id, (payByInv.get(p.invoice_id) || 0) + (Number(p.amount) || 0));
        }
      }
      // Prior auto-reminders (idempotency)
      const sentTiers = new Map<number, Set<number>>();
      for (let i = 0; i < invIds.length; i += 200) {
        const chunk = invIds.slice(i, i + 200);
        const { data: prior } = await supabase.from('collection_reminders')
          .select('invoice_id, method').in('invoice_id', chunk).like('method', 'auto_%');
        for (const r of prior || []) {
          const m = String(r.method).match(/^auto_t(\d)_/);
          if (!m) continue;
          if (!sentTiers.has(r.invoice_id)) sentTiers.set(r.invoice_id, new Set());
          sentTiers.get(r.invoice_id)!.add(Number(m[1]));
        }
      }

      // Customer contact info
      const custIds = [...new Set((invoices || []).map(i => i.customer_id).filter(Boolean))];
      const custById = new Map<number, { name?: string; email?: string; phone?: string }>();
      for (let i = 0; i < custIds.length; i += 200) {
        const chunk = custIds.slice(i, i + 200);
        const { data: custs } = await supabase.from('customers').select('id, name, email, phone').in('id', chunk);
        for (const c of custs || []) custById.set(c.id, c);
      }

      const now = new Date();
      const planned: Record<string, unknown>[] = [];

      for (const inv of invoices || []) {
        if (inv.customer_id && optOut.has(Number(inv.customer_id))) continue;
        // Customer balance — same shape as arHelpers (gross − discount,
        // legacy-net guard) minus applied payments.
        // The guard is STRICTLY greater, matching arHelpers.invoiceCustomerTotal.
        // A fully-covered invoice has disc === gross and is owed $0; the old >=
        // test read that as legacy-net and returned the whole gross, which would
        // have this autopilot dunning a customer for money they don't owe.
        const gross = Number(inv.amount) || 0;
        const disc = Number(inv.discount_applied) || 0;
        const base = disc > 0 && disc > gross ? gross : Math.max(0, gross - disc);
        const balance = base - (payByInv.get(inv.id) || 0);
        if (balance <= 0.01) continue;
        // Due date: explicit, else Net-30 from created_at
        const due = inv.due_date ? new Date(inv.due_date) : new Date(new Date(inv.created_at).getTime() + 30 * 86400000);
        const daysOverdue = Math.floor((now.getTime() - due.getTime()) / 86400000);
        if (daysOverdue < (Number(cfg.t1_days) || 7)) continue;

        const already = sentTiers.get(inv.id) || new Set();
        // Highest eligible tier not yet sent — one escalation per run.
        const next = tiersFor(cfg).find(t => daysOverdue >= t.minDays && !already.has(t.tier));
        if (!next) continue;

        const cust = inv.customer_id ? custById.get(inv.customer_id) : null;
        const email = inv.sent_to_email || cust?.email || null;
        const phone = cust?.phone || null;
        if (!email && !phone) continue;

        planned.push({
          invoiceId: inv.id, invoiceNumber: inv.invoice_id || `INV-${inv.id}`,
          customerId: inv.customer_id, customerName: cust?.name || '',
          email, phone: next.methods.includes('sms') ? phone : null,
          balance: Math.round(balance * 100) / 100, daysOverdue,
          tier: next.tier, tone: next.tone,
          portalUrl: inv.portal_token ? `https://jobscout.appsannex.com/portal/${inv.portal_token}` : null,
        });
      }

      // Worst-first, capped
      planned.sort((a, b) => (b.daysOverdue as number) - (a.daysOverdue as number));
      const batch = planned.slice(0, maxPerRun);

      if (preview) {
        results.push({ companyId, enabled: !!cfg.enabled, wouldSend: batch, totalEligible: planned.length, cap: maxPerRun });
        continue;
      }

      let sent = 0, failed = 0;
      for (const p of batch) {
        const msg = buildEmail(p.tone as string, p.customerName as string, p.invoiceNumber as string, fmtUsd(p.balance as number), p.daysOverdue as number, companyName, p.portalUrl as string | null);
        // Email
        if (p.email) {
          try {
            const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}`, 'apikey': KEY },
              body: JSON.stringify({
                to: p.email, subject: msg.subject, html: msg.html,
                reply_to: companyRow?.owner_email || undefined,
              }),
            });
            if (!r.ok) throw new Error(`send-email ${r.status}`);
            await supabase.from('collection_reminders').insert({
              company_id: companyId, invoice_id: p.invoiceId, customer_id: p.customerId,
              method: `auto_t${p.tier}_email`, urgency: p.tone, amount_due: p.balance,
              days_overdue: p.daysOverdue, sent_at: new Date().toISOString(), status: 'sent',
              message: msg.subject,
            });
            sent++;
          } catch (e) { failed++; console.error(`[autopilot] email inv ${p.invoiceId}:`, e); }
        }
        // SMS (tier 2 only, when phone exists)
        if (p.phone) {
          try {
            const smsBody = `Hi ${(p.customerName as string || '').split(' ')[0] || 'there'}, invoice ${p.invoiceNumber} for ${fmtUsd(p.balance as number)} is ${p.daysOverdue} days past due. ${p.portalUrl ? 'Pay here: ' + p.portalUrl : 'Please contact us to arrange payment.'} — ${companyName}`;
            const r = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}`, 'apikey': KEY },
              body: JSON.stringify({ company_id: companyId, to: p.phone, message: smsBody }),
            });
            if (!r.ok) throw new Error(`send-sms ${r.status}`);
            await supabase.from('collection_reminders').insert({
              company_id: companyId, invoice_id: p.invoiceId, customer_id: p.customerId,
              method: `auto_t${p.tier}_sms`, urgency: p.tone, amount_due: p.balance,
              days_overdue: p.daysOverdue, sent_at: new Date().toISOString(), status: 'sent',
              message: 'sms reminder',
            });
            sent++;
          } catch (e) { failed++; console.error(`[autopilot] sms inv ${p.invoiceId}:`, e); }
        }
      }
      results.push({ companyId, sent, failed, eligible: planned.length, processed: batch.length });
    }

    return json({ success: true, results });
  } catch (error) {
    console.error('collections-autopilot error:', error);
    return json({ error: (error as Error).message }, 500);
  }
});

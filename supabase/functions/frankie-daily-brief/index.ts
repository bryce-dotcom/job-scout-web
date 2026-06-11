// Frankie Daily Brief — the "financial dialogue" piece of the hellofrank
// model: every morning Frankie emails the owner a plain-English cash
// position instead of waiting to be asked.
//
// Contents: available cash + debt (live bank balances), yesterday's money
// in/out (payments + bank debits), open AR + overdue count, and up to
// three suggested actions (rule-based, same spirit as FrankieInsights).
//
// Safety:
//   - DEFAULT OFF. Per-company settings key 'frankie_daily_brief'
//     {"enabled": true, "recipients": ["a@b.com"]}. No row = no-op.
//   - {preview:true, company_id} returns the HTML without sending.
//   - Cron body {cron:true} loops enabled companies only.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
}
const usd = (n: number) => '$' + Math.round(Number(n) || 0).toLocaleString('en-US');

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const preview = !!body.preview;

    let companyIds: number[] = [];
    if (body.cron) {
      const { data: rows } = await supabase.from('settings').select('company_id, value').eq('key', 'frankie_daily_brief');
      for (const r of rows || []) {
        try { if (JSON.parse(r.value)?.enabled) companyIds.push(r.company_id); } catch { /* skip */ }
      }
    } else if (body.company_id) {
      companyIds = [Number(body.company_id)];
    } else return json({ error: 'company_id or cron:true required' }, 400);

    const results: Record<string, unknown>[] = [];

    for (const companyId of companyIds) {
      const { data: cfgRow } = await supabase.from('settings').select('value')
        .eq('company_id', companyId).eq('key', 'frankie_daily_brief').maybeSingle();
      let cfg: { enabled?: boolean; recipients?: string[] } = {};
      try { cfg = cfgRow?.value ? JSON.parse(cfgRow.value) : {}; } catch { cfg = {}; }
      if (!cfg.enabled && !preview) { results.push({ companyId, skipped: 'disabled' }); continue; }

      const { data: company } = await supabase.from('companies')
        .select('company_name, owner_email').eq('id', companyId).single();
      const recipients = (cfg.recipients?.length ? cfg.recipients : [company?.owner_email]).filter(Boolean) as string[];
      if (!recipients.length && !preview) { results.push({ companyId, skipped: 'no recipients' }); continue; }

      // ── Bank position ──
      const { data: accts } = await supabase.from('connected_accounts')
        .select('account_type, current_balance, status').eq('company_id', companyId).eq('status', 'active');
      const cash = (accts || []).filter(a => a.account_type === 'depository').reduce((s, a) => s + (Number(a.current_balance) || 0), 0);
      const debt = (accts || []).filter(a => a.account_type === 'credit' || a.account_type === 'loan').reduce((s, a) => s + (Number(a.current_balance) || 0), 0);
      const hasBank = (accts || []).length > 0;

      // ── Yesterday's movement ──
      const yest = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      const { data: yPays } = await supabase.from('payments').select('amount').eq('company_id', companyId).eq('date', yest);
      const cashIn = (yPays || []).reduce((s, p) => s + (Number(p.amount) || 0), 0);
      const { data: yTxns } = await supabase.from('plaid_transactions').select('amount, is_transfer').eq('company_id', companyId).eq('date', yest);
      const cashOut = (yTxns || []).filter(t => (Number(t.amount) || 0) > 0 && !t.is_transfer).reduce((s, t) => s + Number(t.amount), 0);

      // ── AR snapshot ──
      const { data: openInv } = await supabase.from('invoices')
        .select('id, amount, discount_applied, due_date, created_at')
        .eq('company_id', companyId)
        .not('payment_status', 'in', '("Paid","Void","Cancelled")')
        .neq('invoice_type', 'deposit');
      let ar = 0, overdueCount = 0, overdueTotal = 0;
      const now = Date.now();
      for (const i of openInv || []) {
        const gross = Number(i.amount) || 0, disc = Number(i.discount_applied) || 0;
        const bal = disc > 0 && disc >= gross ? gross : Math.max(0, gross - disc);
        ar += bal;
        const due = i.due_date ? new Date(i.due_date).getTime() : new Date(i.created_at).getTime() + 30 * 86400000;
        if (now > due && bal > 0.01) { overdueCount++; overdueTotal += bal; }
      }

      // ── Suggested actions (max 3, rule-based) ──
      const actions: string[] = [];
      if (overdueCount > 0) actions.push(`Collect: ${overdueCount} overdue invoice${overdueCount === 1 ? '' : 's'} totaling ${usd(overdueTotal)}. The Collections tab can send reminders in one click.`);
      if (hasBank && debt > 0 && cash > debt) actions.push(`Debt check: cash on hand (${usd(cash)}) covers your ${usd(debt)} card/loan balance — consider paying it down to stop interest.`);
      if (hasBank && cashOut > cashIn && cashOut > 0) actions.push(`Yesterday ran negative: ${usd(cashOut)} out vs ${usd(cashIn)} in. Worth a glance at the Money tab to see what cleared.`);
      if (!actions.length) actions.push('Nothing urgent flagged today. Keep an eye on AR aging in the Reports tab.');

      const dateLabel = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      const html = `
<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#2c3530;max-width:560px;">
  <h2 style="margin:0 0 4px;">Frankie's Daily Brief — ${dateLabel}</h2>
  <p style="margin:0 0 16px;color:#7d8a7f;font-size:13px;">${company?.company_name || ''}</p>
  ${hasBank ? `
  <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
    <tr>
      <td style="padding:12px;background:#f7f5ef;border-radius:8px;"><div style="font-size:11px;color:#7d8a7f;text-transform:uppercase;">Available Cash</div><div style="font-size:22px;font-weight:700;color:#22c55e;">${usd(cash)}</div></td>
      <td style="width:8px;"></td>
      <td style="padding:12px;background:#f7f5ef;border-radius:8px;"><div style="font-size:11px;color:#7d8a7f;text-transform:uppercase;">Total Debt</div><div style="font-size:22px;font-weight:700;color:${debt > 0 ? '#ef4444' : '#22c55e'};">${usd(debt)}</div></td>
    </tr>
  </table>` : `<p style="font-size:13px;color:#7d8a7f;">(Connect a bank in Books → Money to see live cash + debt here.)</p>`}
  <p style="font-size:14px;margin:0 0 4px;"><strong>Yesterday:</strong> ${usd(cashIn)} collected · ${usd(cashOut)} spent</p>
  <p style="font-size:14px;margin:0 0 16px;"><strong>Receivables:</strong> ${usd(ar)} open · ${overdueCount} overdue (${usd(overdueTotal)})</p>
  <div style="border-top:1px solid #d6cdb8;padding-top:12px;">
    <div style="font-size:11px;color:#7d8a7f;text-transform:uppercase;margin-bottom:6px;">Today I'd focus on</div>
    ${actions.map(a => `<p style="font-size:13px;margin:0 0 8px;">• ${a}</p>`).join('')}
  </div>
  <p style="font-size:12px;color:#7d8a7f;margin-top:16px;">— Frankie · <a href="https://jobscout.appsannex.com/agents/frankie" style="color:#5a6349;">open the full dashboard</a></p>
</div>`;

      if (preview) { results.push({ companyId, recipients, html }); continue; }

      let sent = 0;
      for (const to of recipients) {
        try {
          const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${KEY}`, 'apikey': KEY },
            body: JSON.stringify({ to, subject: `Frankie's Daily Brief — ${dateLabel}`, html }),
          });
          if (r.ok) sent++;
        } catch (e) { console.error('[daily-brief] send failed:', e); }
      }
      results.push({ companyId, sent });
    }

    return json({ success: true, results });
  } catch (error) {
    console.error('frankie-daily-brief error:', error);
    return json({ error: (error as Error).message }, 500);
  }
});

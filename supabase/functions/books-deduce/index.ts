// Frankie the bookkeeper — the deduction run.
//
// Actions (POST, { action, company_id, ... }):
//   run      { limit?, since?, skip_model?, only_ids? }  → deduce every unconfirmed bank row,
//            ask Claude only about the ones the rules leave under the bar (with the
//            rules' own candidates), and store one verdict per row in books_verdicts
//            (status 'proposed'). REVIEW-ONLY: never writes the ledger.
//   summary  → counts by kind / confidence for the proposed verdicts.
//
// Caller: the service role (cron / scripts) or an active employee of the
// company in the body (from the JWT, never from the body).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic } from "../_shared/anthropic.ts";
import { deduce, buildHistory, summarize, descriptor } from "../_shared/booksDeduce.ts";
import type { Txn, Context, Verdict } from "../_shared/booksDeduce.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

function jwtPayload(req: Request): Record<string, any> | null {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
  } catch { return null; }
}

const num = (v: unknown) => { const n = parseFloat(String(v ?? '')); return Number.isFinite(n) ? n : 0; };
const isLegacyNet = (gross: number, disc: number) => disc > 0 && disc > gross;
const customerTotal = (inv: any) => {
  const gross = num(inv.amount), disc = num(inv.discount_applied), tax = num(inv.tax_amount);
  return (isLegacyNet(gross, disc) ? gross : Math.max(0, gross - disc)) + tax;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || 'run');
    const company_id = Number(body.company_id);
    if (!company_id) return json({ error: 'company_id is required' }, 400);

    // Who is asking: service role, or an employee of THIS company.
    const payload = jwtPayload(req);
    const isService = payload?.role === 'service_role';
    if (!isService) {
      const email = String(payload?.email || '').toLowerCase();
      if (!email) return json({ error: 'Sign in required' }, 401);
      const { data: emp } = await sb.from('employees').select('id').ilike('email', email).eq('active', true).eq('company_id', company_id).limit(1);
      if (!emp?.length) return json({ error: 'Not a member of this company' }, 403);
    }

    if (action === 'summary') {
      const { data } = await sb.from('books_verdicts').select('kind, confidence, status, matches').eq('company_id', company_id).eq('status', 'proposed');
      const rows = (data || []) as any[];
      const byKind: Record<string, number> = {};
      let sure = 0, likely = 0, unsure = 0, matched = 0;
      for (const r of rows) {
        byKind[r.kind] = (byKind[r.kind] || 0) + 1;
        const c = num(r.confidence);
        if (c >= 0.9) sure++; else if (c >= 0.7) likely++; else unsure++;
        matched += (r.matches || []).reduce((s: number, m: any) => s + num(m.amount), 0);
      }
      return json({ proposed: rows.length, byKind, confidence: { sure, likely, unsure }, matchedAmount: Math.round(matched * 100) / 100 });
    }

    if (action !== 'run') return json({ error: `Unknown action: ${action}` }, 400);

    const limit = Math.min(Number(body.limit) || 400, 2000);
    const since = String(body.since || `${new Date().getFullYear()}-01-01`).slice(0, 10);
    const skipModel = !!body.skip_model;
    const runId = `run_${Date.now().toString(36)}`;

    // ── the rows to judge ──
    let q = sb.from('plaid_transactions')
      .select('id, amount, date, name, merchant_name, connected_account_id, is_transfer, user_category, ai_category, ai_tax_category, ai_job_id, ai_job_confidence, plaid_personal_finance_category, stripe_payout_id, matched_payment_id, matched_utility_invoice_id, loan_payment_id, pending, confirmed')
      .eq('company_id', company_id).eq('confirmed', false).gte('date', since).order('date', { ascending: false }).limit(limit);
    if (Array.isArray(body.only_ids) && body.only_ids.length) q = q.in('id', body.only_ids.map(Number));
    const { data: rows, error: rowsErr } = await q;
    if (rowsErr) return json({ error: rowsErr.message }, 500);
    const txns = (rows || []).filter((t: any) => !t.pending) as Txn[];
    if (txns.length === 0) return json({ run_id: runId, judged: 0, summary: summarize([]), message: 'Nothing unconfirmed to judge.' });

    // ── everything the ledger already knows ──
    const yearAgo = new Date(); yearAgo.setMonth(yearAgo.getMonth() - 18);
    const histSince = yearAgo.toISOString().slice(0, 10);
    const [inv, pays, claims, loans, runs, stubs, liabs, rules, vendors, cats, confirmed, recent] = await Promise.all([
      sb.from('invoices').select('id, invoice_id, customer_id, amount, discount_applied, tax_amount, payment_status, invoice_date, due_date, created_at, invoice_type, customer:customers(name)').eq('company_id', company_id).not('payment_status', 'in', '("Paid","Void","Cancelled")').limit(3000),
      sb.from('payments').select('invoice_id, amount, status').eq('company_id', company_id).gte('date', histSince).limit(20000),
      sb.from('utility_invoices').select('id, utility_name, amount, incentive_amount, payment_status, invoice_id, customer_name, job_description, source_transaction_id').eq('company_id', company_id).neq('payment_status', 'Paid').limit(1000),
      sb.from('liabilities').select('id, name, lender, monthly_payment, next_payment_amount, match_payee, status').eq('company_id', company_id),
      sb.from('payroll_runs').select('id, pay_date, total_gross, status').eq('company_id', company_id).gte('pay_date', histSince),
      sb.from('paystubs').select('payroll_run_id, net_pay').eq('company_id', company_id).gte('pay_date', histSince).limit(20000),
      sb.from('payroll_tax_liabilities').select('id, agency, amount_total, amount_employee, amount_employer, due_date, paid_at').eq('company_id', company_id).is('paid_at', null),
      sb.from('category_rules').select('id, merchant_pattern, assigned_category, assigned_tax_category, match_type, priority').eq('company_id', company_id),
      sb.from('vendors').select('id, name, business_name').eq('company_id', company_id).eq('active', true),
      sb.from('expense_categories').select('name, type, default_tax_category').or(`company_id.eq.${company_id},company_id.is.null`),
      sb.from('plaid_transactions').select('id, amount, date, name, merchant_name, user_category, user_tax_category, ai_tax_category, is_transfer').eq('company_id', company_id).eq('confirmed', true).gte('date', histSince).limit(20000),
      sb.from('plaid_transactions').select('id, amount, date, name, merchant_name, connected_account_id').eq('company_id', company_id).gte('date', since).limit(20000),
    ]);

    // Open invoice balances: customer total minus collected payments. Deposit
    // invoices are real money owed too, so they stay in.
    const paidBy = new Map<number, number>();
    for (const p of (pays.data || []) as any[]) {
      if (['Refunded', 'Voided'].includes(String(p.status || ''))) continue;
      paidBy.set(p.invoice_id, (paidBy.get(p.invoice_id) || 0) + num(p.amount));
    }
    const openInvoices = ((inv.data || []) as any[]).map(i => ({
      id: i.id, invoice_id: i.invoice_id, customer_id: i.customer_id, customer_name: i.customer?.name || null,
      balance: Math.round((customerTotal(i) - (paidBy.get(i.id) || 0)) * 100) / 100, invoice_date: i.invoice_date || String(i.created_at || '').slice(0, 10), due_date: i.due_date,
    })).filter(i => i.balance > 0.5);
    // Invoices marked Paid by hand with no payment row: the money arrived,
    // nobody recorded where. To the engine they are open balances flagged
    // phantom; applying the verdict records the payment the deposit is.
    const { data: paidInv } = await sb.from('invoices').select('id, invoice_id, customer_id, amount, discount_applied, tax_amount, invoice_date, due_date, created_at, customer:customers(name)')
      .eq('company_id', company_id).eq('payment_status', 'Paid').gte('created_at', histSince).limit(3000);
    for (const i of (paidInv || []) as any[]) {
      if (paidBy.has(i.id)) continue;
      const total = Math.round(customerTotal(i) * 100) / 100;
      if (total > 0.5) openInvoices.push({ id: i.id, invoice_id: i.invoice_id, customer_id: i.customer_id, customer_name: i.customer?.name || null, balance: total, invoice_date: i.invoice_date || String(i.created_at || '').slice(0, 10), due_date: i.due_date, phantom: true } as any);
    }
    const phantomCount = openInvoices.filter((i: any) => i.phantom).length;
    const openClaims = ((claims.data || []) as any[]).filter(c => !c.source_transaction_id).map(c => ({
      id: c.id, utility_name: c.utility_name, amount: num(c.amount ?? c.incentive_amount), invoice_id: c.invoice_id, customer_name: c.customer_name, job_description: c.job_description,
    })).filter(c => c.amount > 0);
    const netByRun = new Map<number, number>();
    for (const s of (stubs.data || []) as any[]) netByRun.set(s.payroll_run_id, (netByRun.get(s.payroll_run_id) || 0) + num(s.net_pay));
    const payrollRuns = ((runs.data || []) as any[]).filter(r => String(r.status || '').toLowerCase() !== 'void').map(r => ({ id: r.id, pay_date: r.pay_date, total_gross: num(r.total_gross), net_total: netByRun.get(r.id) || 0 }));
    const taxLiabilities = ((liabs.data || []) as any[]).map(l => ({ id: l.id, agency: l.agency, amount_total: num(l.amount_total) || num(l.amount_employee) + num(l.amount_employer), due_date: l.due_date, paid_at: l.paid_at }));

    const ctx: Context = {
      openInvoices, openClaims, loans: (loans.data || []) as any, payrollRuns, taxLiabilities,
      rules: (rules.data || []) as any, vendors: (vendors.data || []) as any, categories: (cats.data || []) as any,
      history: buildHistory((confirmed.data || []) as any), recentTxns: (recent.data || []) as any,
    };

    // ── the rules ──
    const verdicts: Verdict[] = txns.map(t => deduce(t, ctx));

    // ── the model, only where the rules are unsure, only among candidates ──
    let modelAsked = 0, modelAnswered = 0, modelError: string | null = null;
    const askable = skipModel ? [] : verdicts.filter(v => v.needs_model);
    const byId = new Map(txns.map(t => [t.id, t]));
    for (let i = 0; i < askable.length; i += 25) {
      const batch = askable.slice(i, i + 25);
      modelAsked += batch.length;
      const items = batch.map(v => {
        const t = byId.get(v.txn_id)!;
        return {
          id: v.txn_id, amount: num(t.amount), direction: num(t.amount) < 0 ? 'money in' : 'money out', date: t.date, descriptor: descriptor(t),
          plaid_hint: t.plaid_personal_finance_category || null,
          rules_say: { kind: v.kind, category: v.category, confidence: v.confidence, reason: v.reason, evidence: v.evidence },
          candidates: {
            invoices: (v.candidates?.invoices || []).map(x => ({ id: x.id, invoice: x.invoice_id, customer: x.customer_name, open_balance: x.balance })),
            incentive_claims: (v.candidates?.claims || []).map(x => ({ id: x.id, utility: x.utility_name, amount: x.amount, customer: x.customer_name })),
            categories: v.candidates?.categories || [],
          },
        };
      });
      const system = `You are the bookkeeper for a small field-services contractor (lighting retrofits, electrical, fleet). You reason like a CPA: a bank row is explained by what the ledger already holds before it is explained by its descriptor. Money in is a customer payment on an open invoice, a utility incentive on an open claim, a transfer, a refund, or outside money. Money out is an expense in exactly one of the company's categories, a transfer, a loan payment, payroll, a tax deposit, or an owner draw. Pick ONLY from the candidates given (an invoice/claim id, or a category name); never invent ids or category names. Be honest about confidence: 0.9+ only when the evidence pins it, 0.5–0.8 when it is a reasonable reading, below 0.5 when it is a guess. Respond with ONLY a JSON array, no prose.`;
      const prompt = `For each row return {"id": number, "kind": "customer_payment"|"utility_incentive"|"transfer"|"refund"|"income"|"expense"|"loan_payment"|"payroll"|"tax_deposit"|"unknown", "category": string|null, "match_ids": number[], "confidence": number, "reason": "one plain sentence a business owner can read"}.\n"match_ids" are invoice ids for customer_payment or claim ids for utility_incentive, from the candidates only.\n\nRows:\n${JSON.stringify(items)}`;
      const ai = await callAnthropic({ feature: 'books-deduce', companyId: company_id }, {
        model: 'claude-sonnet-4-6', max_tokens: 4096, temperature: 0, system, messages: [{ role: 'user', content: prompt }],
      });
      if (!ai.ok) { modelError = ai.friendly || ai.errorKind || 'AI unavailable'; break; }
      let parsed: any[] = [];
      try {
        const text = (ai.data?.content || []).map((c: any) => c.text || '').join('');
        const start = text.indexOf('['), end = text.lastIndexOf(']');
        parsed = JSON.parse(text.slice(start, end + 1));
      } catch { continue; }
      for (const r of parsed) {
        const v = verdicts.find(x => x.txn_id === Number(r.id));
        if (!v) continue;
        const conf = Math.max(0, Math.min(0.9, num(r.confidence)));   // the model never outranks a rule that pinned it
        const cand = v.candidates || {};
        const ids = (Array.isArray(r.match_ids) ? r.match_ids : []).map(Number);
        const catOk = !r.category || (cand.categories || []).includes(r.category) || (ctx.categories || []).some(c => c.name === r.category);
        const matches = r.kind === 'customer_payment'
          ? (cand.invoices || []).filter(x => ids.includes(x.id)).map(x => ({ type: 'invoice' as const, id: x.id, amount: x.balance, label: `${x.invoice_id || '#' + x.id} — ${x.customer_name || ''}` }))
          : r.kind === 'utility_incentive'
            ? (cand.claims || []).filter(x => ids.includes(x.id)).map(x => ({ type: 'utility_invoice' as const, id: x.id, amount: x.amount, label: `${x.utility_name || 'Utility'} claim #${x.id}` }))
            : [];
        if (conf > v.confidence || (matches.length && !v.matches.length)) {
          v.source = 'model';
          v.kind = r.kind || v.kind;
          if (catOk && r.category) v.category = r.category;
          if (matches.length) v.matches = matches;
          v.is_transfer = v.kind === 'transfer' || v.kind === 'stripe_payout';
          v.confidence = Math.round(conf * 100) / 100;
          v.reason = String(r.reason || v.reason).slice(0, 300);
          v.evidence = [...v.evidence, 'Frankie read the candidates and picked this'];
        }
        modelAnswered++;
      }
    }

    // ── store (review-only: verdict rows, nothing else) ──
    const upserts = verdicts.map(v => ({
      company_id, plaid_transaction_id: v.txn_id, kind: v.kind, category: v.category, tax_category: v.tax_category, is_transfer: v.is_transfer,
      matches: v.matches, job_id: v.job_id, confidence: v.confidence, evidence: v.evidence, reason: v.reason, source: v.source,
      candidates: v.candidates ? { invoices: (v.candidates.invoices || []).map(x => ({ id: x.id, invoice_id: x.invoice_id, customer_name: x.customer_name, balance: x.balance })), claims: (v.candidates.claims || []).map(x => ({ id: x.id, utility_name: x.utility_name, amount: x.amount, customer_name: x.customer_name })), categories: v.candidates.categories || [] } : null,
      status: 'proposed', run_id: runId, updated_at: new Date().toISOString(),
    }));
    // Keep decisions people already made: only rows still 'proposed' (or absent) are replaced.
    const { data: existing } = await sb.from('books_verdicts').select('plaid_transaction_id, status').eq('company_id', company_id).in('plaid_transaction_id', upserts.map(u => u.plaid_transaction_id));
    const decided = new Set(((existing || []) as any[]).filter(e => e.status !== 'proposed').map(e => e.plaid_transaction_id));
    const toWrite = upserts.filter(u => !decided.has(u.plaid_transaction_id));
    for (let i = 0; i < toWrite.length; i += 300) {
      const { error } = await sb.from('books_verdicts').upsert(toWrite.slice(i, i + 300), { onConflict: 'plaid_transaction_id' });
      if (error) return json({ error: `Could not store verdicts: ${error.message}` }, 500);
    }

    const summary = summarize(verdicts);
    return json({
      run_id: runId, judged: verdicts.length, stored: toWrite.length, kept_decided: decided.size,
      model: { asked: modelAsked, answered: modelAnswered, error: modelError },
      context: { open_invoices: openInvoices.length - phantomCount, phantom_paid_invoices: phantomCount, open_claims: openClaims.length, loans: ctx.loans?.length || 0, payroll_runs: payrollRuns.length, rules: ctx.rules?.length || 0, history_descriptors: ctx.history?.size || 0 },
      summary,
      sample: verdicts.filter(v => v.matches.length).slice(0, 5).map(v => ({ id: v.txn_id, kind: v.kind, confidence: v.confidence, reason: v.reason, matches: v.matches.map(m => m.label) })),
    });
  } catch (e) {
    console.error('books-deduce error:', e);
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

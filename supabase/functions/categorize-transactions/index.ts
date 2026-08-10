import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { callAnthropic } from "../_shared/anthropic.ts";
import { resolveIsTransfer } from "../_shared/transferRule.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Words that describe HOW money moved, not WHO it went to. A rule keyed on one
// of these matches half the bank feed.
//
// Learned from real damage: "draft" was learned as Subscriptions from a single
// confirm and then matched 107 transactions reading "Draft Withdrawal Draft
// #731" — $173,740.92 of check drafts booked as software subscriptions, one
// mass-accept away from the tax return. "mes" (3 characters) was learned as
// Cost of Goods Sold and caught "Fee Withdrawal" and "Deposit by Check".
const GENERIC_BANK_TERMS = new Set([
  'draft', 'check', 'cheque', 'deposit', 'withdrawal', 'transfer', 'fee', 'fees',
  'payment', 'pmt', 'ach', 'debit', 'credit', 'card', 'purchase', 'pos', 'atm',
  'wire', 'refund', 'reversal', 'adjustment', 'misc', 'other', 'online', 'mobile',
  'bank', 'branch', 'teller', 'service', 'charge', 'interest', 'balance',
]);

/** A pattern too short or too generic to key a rule on. */
export function isUnsafePattern(pattern: string): boolean {
  const p = String(pattern || '').trim().toLowerCase();
  if (p.length < 3) return true;
  if (GENERIC_BANK_TERMS.has(p)) return true;
  // Every word generic ("draft withdrawal", "check deposit") is just as bad.
  const words = p.split(/\s+/).filter(Boolean);
  if (words.length > 0 && words.every(w => GENERIC_BANK_TERMS.has(w))) return true;
  return false;
}

// AI Transaction Categorization via merchant rules + Claude (_shared/anthropic)
// Actions: categorize_batch, learn_rule, reconcile
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { action, company_id } = body;

    if (!action || !company_id) {
      return jsonResponse({ error: 'action and company_id are required' }, 400);
    }

    // ─── CATEGORIZE BATCH ───
    if (action === 'categorize_batch') {
      // Get uncategorized transactions
      const { data: transactions } = await supabase
        .from('plaid_transactions')
        .select('*')
        .eq('company_id', company_id)
        .is('ai_category', null)
        .is('user_category', null)
        .eq('confirmed', false)
        .order('date', { ascending: false })
        .limit(100);

      if (!transactions?.length) {
        return jsonResponse({ success: true, categorized: 0, message: 'No uncategorized transactions' });
      }

      // Get category rules
      const { data: rules } = await supabase
        .from('category_rules')
        .select('*')
        .eq('company_id', company_id)
        .order('priority', { ascending: false });

      // Get expense categories for context
      const { data: categories } = await supabase
        .from('expense_categories')
        .select('name, type')
        .order('sort_order');

      const expenseNames = (categories || []).filter(c => c.type === 'expense').map(c => c.name);
      const incomeNames = (categories || []).filter(c => c.type === 'income').map(c => c.name);
      const categoryNames = (categories || []).map(c => c.name);

      // Get active jobs for AI context
      const { data: jobs } = await supabase
        .from('jobs')
        .select('id, job_title, job_address, job_total, customer:customers!customer_id(id, name)')
        .eq('company_id', company_id)
        .in('status', ['Chillin', 'Scheduled', 'In Progress'])
        .order('created_at', { ascending: false })
        .limit(50);

      const jobsList = (jobs || []).map(j => ({
        id: j.id,
        title: j.job_title,
        customer: j.customer?.name || '',
        address: j.job_address || '',
        total: j.job_total
      }));

      // Phase 1: Apply rules
      const ruleMatched: number[] = [];
      const needsAI: Array<Record<string, unknown>> = [];

      for (const txn of transactions) {
        const merchant = (txn.merchant_name || txn.name || '').toLowerCase();
        let matched = false;

        for (const rule of (rules || [])) {
          const pattern = (rule.merchant_pattern || '').toLowerCase();
          if (!pattern) continue;
          // A rule learned from a generic banking word matches almost
          // everything. "draft" was learned as Subscriptions and hit 107 rows
          // reading "Draft Withdrawal Draft #731" — $173,740.92 of CHECK
          // DRAFTS booked as software subscriptions. Never apply these.
          if (isUnsafePattern(pattern)) continue;

          let isMatch = false;
          if (rule.match_type === 'exact') {
            isMatch = merchant === pattern;
          } else if (pattern.length <= 6) {
            // Short patterns match on word boundaries only — "mes" was
            // learned as Cost of Goods Sold and caught "Fee Withdrawal" and
            // "Deposit by Check". Same substring trap as the spec scrub.
            isMatch = new RegExp(`\\b${pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(merchant);
          } else {
            isMatch = merchant.includes(pattern);
          }

          if (isMatch) {
            await supabase.from('plaid_transactions').update({
              ai_category: rule.assigned_category,
              ai_tax_category: rule.assigned_tax_category || null,
              ai_confidence: 0.99,
            }).eq('id', txn.id);
            ruleMatched.push(txn.id);
            matched = true;
            break;
          }
        }

        if (!matched) {
          needsAI.push(txn);
        }
      }

      // Phase 2: AI categorization for remaining.
      //
      // This was gated on GEMINI_API_KEY and SILENTLY skipped the whole phase
      // when it was not set — no error, no log, a 200 reading
      // "ai_categorized: 0". It has read 0 for eight months: of 2,102
      // transactions only 110 ever got an AI suggestion, all in March. Tracy
      // has 1,143 unconfirmed with 1,132 carrying no suggestion at all, which
      // is why categorizing is "a struggle" — every one is hand-typed.
      //
      // Now on _shared/anthropic, like every other AI feature here: one
      // provider, metered into ai_usage, billing alerts, and a failure that
      // reports itself instead of returning success with nothing done.
      let aiCategorized = 0;
      let aiError: string | null = null;
      if (needsAI.length > 0) {
        // Process in batches of 50
        for (let i = 0; i < needsAI.length; i += 50) {
          const batch = needsAI.slice(i, i + 50);
          const txnList = batch.map(t => ({
            id: t.id,
            amount: t.amount,
            merchant: t.merchant_name || t.name || 'Unknown',
            date: t.date,
            plaid_category: t.plaid_personal_finance_category || (t.plaid_category || []).join(' > '),
          }));

          const prompt = `You are a bookkeeping assistant for a field services company (lighting, fleet maintenance, etc.).

Categorize each transaction into EXACTLY one of these categories. Do NOT make up category names.

For money OUT (positive amounts) — Expense categories: ${expenseNames.join(', ')}
Also allowed: Transfer, Owner Distribution, Loan Payment, Tax Payment

For money IN (negative amounts) — Income categories: ${incomeNames.join(', ')}
Also allowed: Transfer, Owner Contribution

Assign a tax category for IRS Form 1065 (partnership return). Use EXACTLY one of these:
- Line 9 - Salaries and wages
- Line 10 - Guaranteed payments
- Line 12 - Repairs and maintenance
- Line 13 - Bad debts
- Line 14 - Rent
- Line 15 - Taxes and licenses
- Line 16a - Depreciation
- Line 18 - Retirement plans
- Line 19 - Employee benefit programs
- Line 20 - Advertising
- Line 20 - Office expenses
- Line 20 - Auto expenses
- Line 20 - Utilities
- Line 20 - Insurance
- Line 20 - Travel
- Line 20 - Meals
- Line 20 - Contract labor
- Line 20 - Equipment rental
- Line 20 - Other deductions
- Not deductible
- Income

For each transaction, determine if it's likely a transfer between accounts (e.g., "Transfer to Savings", "Zelle to self").

Active jobs for this company:
${JSON.stringify(jobsList)}

For each transaction, try to match it to a job by:
- Merchant name matching customer name
- Transaction description mentioning job address or customer
- Amount patterns matching job total or typical job expenses
If you can match to a job, include job_id and job_confidence (0-1). If no match, set job_id to null.

Transactions:
${JSON.stringify(txnList)}

Return ONLY a JSON array with this structure for each transaction:
[{"id": number, "category": "string", "tax_category": "string", "form_1065_line": "string", "confidence": number (0-1), "is_transfer": boolean, "job_id": number|null, "job_confidence": number|null}]`;

          try {
            const ai = await callAnthropic(
              { feature: 'categorize-transactions', companyId: company_id },
              {
                model: 'claude-sonnet-4-6',
                max_tokens: 8192,
                temperature: 0,
                system: 'You are a bookkeeping assistant. Respond with ONLY a JSON array. No markdown fences, no explanation, no preamble.',
                // No assistant prefill — claude-sonnet-4-6 rejects it with a
                // 400 ("the conversation must end with a user message").
                messages: [{ role: 'user', content: prompt }],
              },
            );

            if (!ai.ok) {
              aiError = ai.raw || ai.friendly || 'AI call failed';
              console.error('[categorize-transactions] AI failed:', aiError);
              break;   // a key/billing problem will not fix itself on the next batch
            }

            const raw = ai.data?.content?.[0]?.text ?? '';
            // Tolerate a fence or stray prose around the array.
            const match = raw.match(/\[[\s\S]*\]/);
            const text = match ? match[0] : '';

            if (text) {
              const results = JSON.parse(text);
              for (const result of results) {
                await supabase.from('plaid_transactions').update({
                  ai_category: result.category,
                  ai_tax_category: result.tax_category,
                  ai_form_1065_line: result.form_1065_line,
                  ai_confidence: result.confidence,
                  // The model answers in two fields that can disagree — it says
                  // category "Transfer" and leaves is_transfer false. Reports
                  // read only the flag, so resolve them the same way the screen
                  // does or the AI quietly recreates the 48-row hole by hand.
                  is_transfer: resolveIsTransfer({ category: result.category, flagged: result.is_transfer }),
                  ai_job_id: result.job_id || null,
                  ai_job_confidence: result.job_confidence || null,
                }).eq('id', result.id);
                aiCategorized++;
              }
            }
          } catch (e) {
            aiError = (e as Error).message;
            console.error('[categorize-transactions] AI batch failed:', aiError);
          }
        }
      }

      return jsonResponse({
        success: true,
        categorized: ruleMatched.length + aiCategorized,
        rule_matched: ruleMatched.length,
        ai_categorized: aiCategorized,
        remaining: needsAI.length - aiCategorized,
      });
    }

    // ─── LEARN RULE ───
    if (action === 'learn_rule') {
      const { merchant_name, category, tax_category } = body;
      if (!merchant_name || !category) {
        return jsonResponse({ error: 'merchant_name and category are required' }, 400);
      }

      // Normalize merchant pattern
      const pattern = merchant_name.toLowerCase().trim();

      // Refuse to learn a pattern that would match half the bank feed. One
      // confirm on a transaction Plaid labelled "Draft" taught the rule
      // "draft -> Subscriptions", which then claimed 107 check drafts worth
      // $173,740.92. Learning has to be narrower than the damage it can do.
      if (isUnsafePattern(pattern)) {
        return jsonResponse({
          success: false,
          skipped: true,
          reason: `"${pattern}" is too generic to learn as a merchant rule — it would match unrelated transactions.`,
        });
      }

      // Check if rule exists
      const { data: existing } = await supabase
        .from('category_rules')
        .select('id')
        .eq('company_id', company_id)
        .ilike('merchant_pattern', pattern)
        .single();

      if (existing) {
        await supabase.from('category_rules').update({
          assigned_category: category,
          assigned_tax_category: tax_category || null,
        }).eq('id', existing.id);
      } else {
        await supabase.from('category_rules').insert({
          company_id,
          merchant_pattern: pattern,
          assigned_category: category,
          assigned_tax_category: tax_category || null,
          match_type: 'contains',
          priority: 0,
        });
      }

      // Also update all existing transactions with same merchant
      await supabase.from('plaid_transactions').update({
        user_category: category,
        user_tax_category: tax_category || null,
      })
        .eq('company_id', company_id)
        .ilike('merchant_name', `%${pattern}%`)
        .eq('confirmed', false);

      return jsonResponse({ success: true });
    }

    // ─── RECONCILE ───
    if (action === 'reconcile') {
      const { transaction_id, expense_id } = body;
      if (!transaction_id || !expense_id) {
        return jsonResponse({ error: 'transaction_id and expense_id are required' }, 400);
      }

      // Link transaction to expense
      const { error: txnErr } = await supabase.from('plaid_transactions').update({
        expense_id: expense_id,
      }).eq('id', transaction_id).eq('company_id', company_id);

      if (txnErr) return jsonResponse({ error: txnErr.message }, 500);

      // Link expense back to transaction
      const { error: expErr } = await supabase.from('expenses').update({
        plaid_transaction_id: transaction_id,
      }).eq('id', expense_id);

      if (expErr) return jsonResponse({ error: expErr.message }, 500);

      return jsonResponse({ success: true });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);

  } catch (error) {
    console.error('categorize-transactions error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

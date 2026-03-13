import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AI Transaction Categorization via Gemini + merchant rules
// Actions: categorize_batch, learn_rule
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') || Deno.env.get('VITE_GEMINI_API_KEY');

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
        .select('name')
        .order('sort_order');

      const categoryNames = (categories || []).map(c => c.name);

      // Phase 1: Apply rules
      const ruleMatched: number[] = [];
      const needsAI: Array<Record<string, unknown>> = [];

      for (const txn of transactions) {
        const merchant = (txn.merchant_name || txn.name || '').toLowerCase();
        let matched = false;

        for (const rule of (rules || [])) {
          const pattern = (rule.merchant_pattern || '').toLowerCase();
          if (!pattern) continue;

          let isMatch = false;
          if (rule.match_type === 'exact') {
            isMatch = merchant === pattern;
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

      // Phase 2: AI categorization for remaining
      let aiCategorized = 0;
      if (needsAI.length > 0 && GEMINI_API_KEY) {
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

Categorize each transaction and assign a tax category for IRS Form 1065 (partnership return).

Available expense categories: ${categoryNames.join(', ')}
If none fit, use a reasonable category name.

Standard 1065 line items:
- Line 10: Guaranteed payments
- Line 12: Repairs and maintenance
- Line 13: Bad debts
- Line 14: Rent
- Line 15: Taxes and licenses
- Line 16a: Depreciation
- Line 17: Depletion
- Line 18: Retirement plans
- Line 19: Employee benefit programs
- Line 20: Other deductions (utilities, insurance, office supplies, advertising, etc.)

For each transaction, determine if it's likely a transfer between accounts (e.g., "Transfer to Savings", "Zelle to self").

Transactions:
${JSON.stringify(txnList)}

Return ONLY a JSON array with this structure for each transaction:
[{"id": number, "category": "string", "tax_category": "string", "form_1065_line": "string", "confidence": number (0-1), "is_transfer": boolean}]`;

          try {
            const geminiRes = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: {
                    temperature: 0.1,
                    responseMimeType: 'application/json',
                  },
                }),
              }
            );

            const geminiData = await geminiRes.json();
            const text = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text;

            if (text) {
              const results = JSON.parse(text);
              for (const result of results) {
                await supabase.from('plaid_transactions').update({
                  ai_category: result.category,
                  ai_tax_category: result.tax_category,
                  ai_form_1065_line: result.form_1065_line,
                  ai_confidence: result.confidence,
                  is_transfer: result.is_transfer || false,
                }).eq('id', result.id);
                aiCategorized++;
              }
            }
          } catch (e) {
            console.error('Gemini categorization error:', e);
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

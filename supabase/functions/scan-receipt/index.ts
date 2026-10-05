// scan-receipt — Dougie reads a receipt, check, or payment document.
//
// Two modes:
//   (default)  a payment coming IN — check, money order, deposit slip. What
//              LeadPayments has always used: amount, payer, method, date.
//   'expense'  money going OUT — a store receipt or supplier invoice, for the
//              Expenses page, the job page, Field Scout and Books. Returns
//              the merchant, total, date, what was bought, the line items,
//              and which of the company's own expense categories it belongs
//              in (the caller passes the names; the pick is one of them or
//              null — never an invented name).
//
// Takes `image` {base64, mediaType} or `document` {base64} (a PDF). One file
// per call; the callers loop.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAnthropic } from "../_shared/anthropic.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const PAYMENT_PROMPT = `You are a receipt and check scanning assistant. Analyze this image of a receipt, check, money order, or payment document.

Extract the following information:
- amount: The payment amount (number only, no currency symbol)
- payment_method: The type of payment (check, cash, credit card, money order, wire transfer, ACH, Zelle, Venmo, PayPal, etc.)
- date: The date on the receipt/check (YYYY-MM-DD format)
- payer_name: The name of the person or business who made the payment
- business_name: The business name if visible
- receipt_number: Any receipt, check, or transaction number
- description: A brief description of what the payment is for
- notes: Any other relevant details (memo line on check, etc.)

If you cannot determine a field, set it to null.
Return ONLY valid JSON, no other text:
{
  "amount": <number or null>,
  "payment_method": "<string or null>",
  "date": "<YYYY-MM-DD or null>",
  "payer_name": "<string or null>",
  "business_name": "<string or null>",
  "receipt_number": "<string or null>",
  "description": "<string or null>",
  "notes": "<string or null>"
}`;

function expensePrompt(categories: string[]) {
  const list = categories.length ? categories.map(c => `"${c}"`).join(', ') : '(none provided)';
  return `You are Dougie, the document reader for a contractor's bookkeeping. This is a receipt or supplier invoice for something the company BOUGHT. Read it exactly; never guess a number that is not on the page.

Extract:
- business_name: the merchant or supplier (the store, not the customer)
- amount: the TOTAL paid, after tax, as a number. If several totals appear, the one the customer paid.
- subtotal: before tax, number or null
- tax: sales tax, number or null
- date: the purchase date, YYYY-MM-DD, or null
- receipt_number: receipt, invoice or transaction number, or null
- payment_method: how it was paid if shown (Visa, Mastercard, Amex, cash, check, account/charge), or null
- card_last4: the last four digits of the card if printed, or null
- description: what was bought, in at most eight plain words (e.g. "LED high bay fixtures and hangers", "diesel fuel")
- line_items: up to 25 rows of { "description", "quantity", "amount" } as printed; amount is the line total; skip subtotal/tax/total rows
- category: exactly ONE of the company's expense category names below that fits what was bought, or null if none fits. Materials, fixtures, parts, lumber and supplies installed on a job are "Job Materials" when that name exists; fuel is "Fuel"; a restaurant is "Meals"; tools under a few hundred dollars are "Small Tools & Consumables" when that name exists.
- job_hint: a job name, address or PO/job number printed on the receipt, or null

Company expense categories: ${list}

If you cannot read a field, set it to null. Return ONLY valid JSON, no other text:
{
  "business_name": "<string or null>",
  "amount": <number or null>,
  "subtotal": <number or null>,
  "tax": <number or null>,
  "date": "<YYYY-MM-DD or null>",
  "receipt_number": "<string or null>",
  "payment_method": "<string or null>",
  "card_last4": "<string or null>",
  "description": "<string or null>",
  "line_items": [{ "description": "<string>", "quantity": <number or null>, "amount": <number or null> }],
  "category": "<one of the names or null>",
  "job_hint": "<string or null>"
}`;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const { image, document, mode } = body;
    const expense = mode === 'expense';
    const categories: string[] = Array.isArray(body.categories)
      ? body.categories.map((c: unknown) => String(c)).filter(Boolean).slice(0, 120)
      : [];

    let fileBlock: Record<string, unknown> | null = null;
    if (document?.base64) {
      fileBlock = { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: document.base64 } };
    } else if (image?.base64) {
      fileBlock = { type: 'image', source: { type: 'base64', media_type: image.mediaType || 'image/jpeg', data: image.base64 } };
    }
    if (!fileBlock) return json({ success: false, error: 'No image or document provided' }, 400);

    const ai = await callAnthropic(
      { feature: expense ? 'dougie-receipt' : 'scan-receipt', companyId: body.company_id ? Number(body.company_id) : null, req },
      {
        model: 'claude-sonnet-4-6',
        max_tokens: expense ? 2048 : 1024,
        messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: expense ? expensePrompt(categories) : PAYMENT_PROMPT }] }],
      },
    );
    if (!ai.ok) return json({ success: false, error: ai.friendly, ai_unavailable: ai.unavailable === true }, 500);

    const content = ai.data?.content?.map((c: any) => c.text || '').join('') || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return json({ success: false, error: 'Could not parse extraction', raw: content });
    try {
      const extracted = JSON.parse(jsonMatch[0]);
      // The pick must be one of the names handed in; anything else is null so
      // a caller never writes a category the company does not have.
      if (expense && extracted.category != null && !categories.includes(String(extracted.category))) {
        const lower = String(extracted.category).toLowerCase();
        extracted.category = categories.find(c => c.toLowerCase() === lower) || null;
      }
      return json({ success: true, extracted });
    } catch (parseErr) {
      console.error('[ScanReceipt] JSON parse error:', parseErr);
      return json({ success: false, error: 'Failed to parse AI response', raw: content }, 500);
    }
  } catch (error) {
    console.error('[ScanReceipt] Error:', error);
    return json({ success: false, error: (error as Error).message }, 500);
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image } = await req.json();

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    if (!image || !image.base64) {
      return new Response(JSON.stringify({ success: false, error: 'No image provided' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const promptText = `You are a receipt and check scanning assistant. Analyze this image of a receipt, check, money order, or payment document.

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

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: image.mediaType || 'image/jpeg',
                data: image.base64
              }
            },
            { type: 'text', text: promptText }
          ]
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      console.error('[ScanReceipt] Claude API error:', data.error);
      return new Response(JSON.stringify({ success: false, error: data.error.message || 'AI analysis failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const content = data.content?.[0]?.text || '';
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      try {
        const extracted = JSON.parse(jsonMatch[0]);
        return new Response(JSON.stringify({ success: true, extracted }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      } catch (parseErr) {
        console.error('[ScanReceipt] JSON parse error:', parseErr);
        return new Response(JSON.stringify({ success: false, error: 'Failed to parse AI response', raw: content }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ success: false, error: 'Could not parse extraction', raw: content }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('[ScanReceipt] Error:', error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

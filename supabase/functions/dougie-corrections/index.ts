import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { corrections } = await req.json();

    if (!corrections || !Array.isArray(corrections) || corrections.length === 0) {
      return new Response(JSON.stringify({ saved: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const companyId = Deno.env.get('LENARD_COMPANY_ID');

    if (!key || !companyId) {
      return new Response(JSON.stringify({ error: 'Server configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Insert all corrections in one batch
    const rows = corrections.map((c: any) => ({
      company_id: parseInt(companyId),
      field_type: c.fieldType || 'fixture',
      field_name: c.fieldName || '',
      original_value: String(c.originalValue ?? ''),
      corrected_value: String(c.correctedValue ?? ''),
      context: c.context || null,
    }));

    const res = await fetch(`${SUPABASE_URL}/rest/v1/dougie_corrections`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify(rows),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('[Dougie Corrections] Insert error:', err);
      return new Response(JSON.stringify({ error: 'Failed to save corrections' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ saved: rows.length }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('[Dougie Corrections] Error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

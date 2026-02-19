import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function querySupabase(table: string, params: string = ''): Promise<any[]> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?${params}`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return [];
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
      }
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Fetch only SBE products (active, name contains SBE)
    const products = await querySupabase(
      'products_services',
      'active=eq.true&name=ilike.*SBE*&select=id,name,type,unit_price,cost,description&order=type,name'
    );

    return new Response(JSON.stringify({ success: true, products }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

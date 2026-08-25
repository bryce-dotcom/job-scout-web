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
    // Scope to the tenant this public agent belongs to, the same way
    // lenard-save, lenard-employees and lenard-projects all do. Without it
    // this returned every SMBE row in the database regardless of owner —
    // today that happens to be only company 3's, because the other tenant's
    // 131 SMBE rows are all inactive. That is luck, not isolation: the moment
    // they activate one it appears in someone else's product picker.
    const companyId = Deno.env.get('LENARD_COMPANY_ID');
    if (!companyId) {
      // Refuse rather than fall back to an unscoped query, which is exactly
      // the leak this filter exists to close.
      return new Response(JSON.stringify({ error: 'Server configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    const cid = parseInt(companyId);

    // Active SMBE products only. A deactivated product must never reach the
    // field: it is off the price book, and quoting from it produces a number
    // nobody can honour.
    const products = await querySupabase(
      'products_services',
      `company_id=eq.${cid}&active=eq.true&name=ilike.*SMBE*` +
      '&select=id,name,type,unit_price,cost,description&order=type,name&limit=2000'
    );

    return new Response(JSON.stringify({ success: true, products }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

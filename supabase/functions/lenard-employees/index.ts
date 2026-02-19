import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function querySupabase(baseUrl: string, table: string, key: string, params: string): Promise<any[]> {
  const url = `${baseUrl}/rest/v1/${table}?${params}`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${key}`, 'apikey': key },
  });
  if (!res.ok) {
    const errText = await res.text();
    console.error(`querySupabase failed: ${res.status} ${errText} for ${url}`);
    return [];
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const companyId = Deno.env.get('LENARD_COMPANY_ID');
    if (!key || !companyId) {
      return new Response(JSON.stringify({ error: 'Server configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch active employees — matches internal app: store.employees
    const employees = await querySupabase(
      SUPABASE_URL!, 'employees', key,
      `company_id=eq.${companyId}&active=eq.true&select=id,name,email,phone,role,business_unit&order=name`
    );

    return new Response(JSON.stringify({ success: true, employees }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

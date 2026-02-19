import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function querySupabase(baseUrl: string, table: string, key: string, params: string): Promise<any[]> {
  const res = await fetch(`${baseUrl}/rest/v1/${table}?${params}`, {
    headers: { 'Authorization': `Bearer ${key}`, 'apikey': key },
  });
  if (!res.ok) return [];
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

    // Fetch leads
    const leadParams = new URLSearchParams({
      company_id: `eq.${companyId}`,
      lead_source: 'eq.Lenard AZ SRP',
      select: 'id,customer_name,created_at,status,notes,phone,email,address',
      order: 'created_at.desc',
      limit: '50',
    });
    const leads = await querySupabase(SUPABASE_URL!, 'leads', key, leadParams.toString());

    // Fetch matching audits (linked by lead_id)
    const leadIds = leads.map((l: any) => l.id);
    let auditsMap: Record<number, any> = {};
    if (leadIds.length > 0) {
      const auditParams = new URLSearchParams({
        company_id: `eq.${companyId}`,
        lead_id: `in.(${leadIds.join(',')})`,
        select: 'id,lead_id,audit_id,status,total_existing_watts,total_proposed_watts,watts_reduced,estimated_rebate,annual_savings_kwh,annual_savings_dollars,est_project_cost,payback_months',
      });
      const audits = await querySupabase(SUPABASE_URL!, 'lighting_audits', key, auditParams.toString());
      for (const a of audits) {
        auditsMap[a.lead_id] = a;
      }
    }

    const projects = leads.map((l: any) => ({
      id: l.id,
      customerName: l.customer_name,
      phone: l.phone,
      email: l.email,
      address: l.address,
      createdAt: l.created_at,
      estimatedValue: 0,
      status: l.status,
      notes: l.notes,
      audit: auditsMap[l.id] || null,
    }));

    return new Response(JSON.stringify({ success: true, projects }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

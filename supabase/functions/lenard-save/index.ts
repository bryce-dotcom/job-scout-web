import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function supabasePost(url: string, key: string, body: any): Promise<any> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Supabase POST failed: ${err}`);
  }
  return res.json();
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const { customerName, phone, email, address, projectData, programType } = await req.json();
    if (!customerName) {
      return new Response(JSON.stringify({ error: 'Customer name is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const companyId = Deno.env.get('LENARD_COMPANY_ID');
    if (!key || !companyId) {
      return new Response(JSON.stringify({ error: 'Server configuration missing' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cid = parseInt(companyId);
    const pd = projectData || {};
    const lines = pd.lines || [];

    // 1. Create Lead
    const leadData = {
      company_id: cid,
      customer_name: customerName,
      phone: phone || null,
      email: email || null,
      address: address || null,
      status: 'New',
      lead_source: 'Lenard AZ SRP',
      service_type: 'Energy Efficiency',
      estimated_value: pd.totalIncentive || 0,
      notes: JSON.stringify(pd),
      utility_provider: 'SRP',
      property_type: programType === 'sbs' ? 'Commercial' : 'Small Business',
    };

    const [lead] = await supabasePost(`${SUPABASE_URL}/rest/v1/leads`, key, leadData);

    // 2. Create Lighting Audit linked to the lead
    const auditId = `AUD-${Date.now().toString(36).toUpperCase()}`;
    const totalExistW = lines.reduce((s: number, l: any) => s + ((l.existW || 0) * (l.qty || 0)), 0);
    const totalNewW = lines.reduce((s: number, l: any) => s + ((l.newW || 0) * (l.qty || 0)), 0);
    const totalFixtures = lines.reduce((s: number, l: any) => s + (l.qty || 0), 0);
    const wattsReduced = Math.max(0, totalExistW - totalNewW);
    const opHours = pd.operatingHours || 12;
    const opDays = pd.daysPerYear || 365;
    const rate = pd.energyRate || 0.10;
    const annualHours = opHours * opDays;
    const annualKwhSavings = (wattsReduced * annualHours) / 1000;
    const annualCostSavings = annualKwhSavings * rate;
    const projectCost = pd.projectCost || 0;
    const netCost = projectCost - (pd.totalIncentive || 0);
    const paybackYears = annualCostSavings > 0 ? netCost / annualCostSavings : 0;
    const roiPercent = netCost > 0 ? (annualCostSavings / netCost) * 100 : 0;

    const auditData = {
      company_id: cid,
      audit_id: auditId,
      lead_id: lead.id,
      facility_name: customerName,
      facility_address: address || null,
      facility_state: 'AZ',
      operating_hours_day: opHours,
      operating_days_year: opDays,
      utility_rate: rate,
      total_fixtures_current: totalFixtures,
      total_fixtures_proposed: totalFixtures,
      total_watts_current: totalExistW,
      total_watts_proposed: totalNewW,
      watts_reduction: wattsReduced,
      annual_kwh_savings: Math.round(annualKwhSavings * 100) / 100,
      annual_cost_savings: Math.round(annualCostSavings * 100) / 100,
      estimated_rebate: Math.round((pd.totalIncentive || 0) * 100) / 100,
      project_cost: Math.round(projectCost * 100) / 100,
      payback_years: Math.round(paybackYears * 100) / 100,
      roi_percent: Math.round(roiPercent * 100) / 100,
      status: 'Draft',
      notes: JSON.stringify(pd),
    };

    const [audit] = await supabasePost(`${SUPABASE_URL}/rest/v1/lighting_audits`, key, auditData);

    // 3. Create Audit Areas from line items
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const qty = l.qty || 1;
      const existW = l.existW || 0;
      const newW = l.newW || 0;
      const areaData = {
        company_id: cid,
        audit_id: audit.id,
        area_name: l.name || `Area ${i + 1}`,
        ceiling_height: l.height || null,
        notes: l.productName ? `SBE Product: ${l.productName}` : null,
        sort_order: i,
      };
      await supabasePost(`${SUPABASE_URL}/rest/v1/audit_areas`, key, areaData);
    }

    // 4. Store photos in Supabase Storage (if any)
    const photos = pd.photos || [];
    for (let i = 0; i < photos.length; i++) {
      try {
        const photoBase64 = photos[i];
        if (!photoBase64) continue;
        const binaryStr = atob(photoBase64);
        const bytes = new Uint8Array(binaryStr.length);
        for (let b = 0; b < binaryStr.length; b++) bytes[b] = binaryStr.charCodeAt(b);
        const filePath = `audits/${audit.id}/photo_${i}.jpg`;
        await fetch(`${SUPABASE_URL}/storage/v1/object/audit-photos/${filePath}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'apikey': key,
            'Content-Type': 'image/jpeg',
          },
          body: bytes,
        });
      } catch (_) {
        // Photo upload is best-effort; don't fail the save
      }
    }

    return new Response(JSON.stringify({ success: true, leadId: lead.id, auditId: audit.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

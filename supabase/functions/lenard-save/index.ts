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
    const { customerName, phone, email, address, city, state, zip, projectData, programType, leadOwnerId } = await req.json();
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
    const facilityState = state || 'AZ';
    const fullAddress = [address, city, state, zip].filter(Boolean).join(', ') || null;

    // --- Shared calculations (used by lead notes + audit) ---
    const totalFixtures = lines.reduce((s: number, l: any) => s + (l.qty || 0), 0);
    const totalExistW = lines.reduce((s: number, l: any) => s + ((l.existW || 0) * (l.qty || 0)), 0);
    const totalNewW = lines.reduce((s: number, l: any) => s + ((l.newW || 0) * (l.qty || 0)), 0);
    const wattsReduced = Math.max(0, totalExistW - totalNewW);
    const opHours = pd.operatingHours || 12;
    const opDays = pd.daysPerYear || 365;
    const rate = pd.energyRate || 0.10;
    const annualKwhSavings = (wattsReduced * opHours * opDays) / 1000;
    const annualDollarSavings = annualKwhSavings * rate;
    const projectCost = pd.projectCost || 0;
    const incentive = pd.totalIncentive || 0;
    const netCost = projectCost - incentive;
    const paybackMonths = annualDollarSavings > 0 ? (netCost / annualDollarSavings) * 12 : 0;

    // =====================================================
    // 0. Find or create Customer — matches Leads.jsx
    // =====================================================
    let customerId: number | null = null;
    const existingCustomers = await querySupabase(
      SUPABASE_URL!, 'customers', key,
      `company_id=eq.${cid}&name=ilike.${encodeURIComponent(customerName.trim())}&limit=1`
    );
    if (existingCustomers.length > 0) {
      customerId = existingCustomers[0].id;
    } else {
      const [newCustomer] = await supabasePost(`${SUPABASE_URL}/rest/v1/customers`, key, {
        company_id: cid,
        name: customerName.trim(),
        phone: phone || null,
        email: email || null,
        address: fullAddress,
      });
      customerId = newCustomer.id;
    }

    // =====================================================
    // 1. Create Lead — EXACT same columns as Leads.jsx handleSubmitLead()
    // =====================================================
    const noteLines = [
      `SRP ${programType === 'sbs' ? 'Standard Business' : 'Small Business'} Lighting Retrofit`,
      `${totalFixtures} fixtures | ${totalExistW}W existing → ${totalNewW}W LED | ${wattsReduced}W reduced`,
      '',
      ...lines.map((l: any, i: number) => `${i + 1}. ${l.name || 'Area'}: ${l.qty || 1}x ${l.existW || 0}W → ${l.newW || 0}W${l.fixtureCategory ? ` (${l.fixtureCategory})` : ''}${l.lightingType ? ` ${l.lightingType}` : ''}`),
      '',
      `Est. Incentive: $${incentive.toLocaleString()}`,
      projectCost ? `Project Cost: $${projectCost.toLocaleString()} | Net: $${netCost.toLocaleString()}` : '',
    ].filter(Boolean).join('\n');

    // Matches Leads.jsx payload exactly
    const [lead] = await supabasePost(`${SUPABASE_URL}/rest/v1/leads`, key, {
      company_id: cid,
      customer_name: customerName,
      business_name: null,
      email: email || null,
      phone: phone || null,
      address: fullAddress,
      service_type: 'Energy Efficiency',
      lead_source: 'Lenard AZ SRP',
      status: 'New',
      notes: noteLines,
      lead_owner_id: leadOwnerId ? parseInt(leadOwnerId) : null,
      updated_at: new Date().toISOString(),
    });

    // =====================================================
    // 2. Create Lighting Audit — EXACT same columns as NewLightingAudit.jsx handleSave()
    // =====================================================
    const auditId = `AUD-${Date.now().toString(36).toUpperCase()}`;

    // Matches NewLightingAudit.jsx auditData payload exactly
    const [audit] = await supabasePost(`${SUPABASE_URL}/rest/v1/lighting_audits`, key, {
      company_id: cid,
      audit_id: auditId,
      lead_id: lead.id,
      customer_id: customerId,
      address: fullAddress,
      city: city || null,
      state: facilityState,
      zip: zip || null,
      electric_rate: rate,
      operating_hours: opHours,
      operating_days: opDays,
      status: 'Draft',
      total_fixtures: Math.round(totalFixtures),
      total_existing_watts: Math.round(totalExistW),
      total_proposed_watts: Math.round(totalNewW),
      watts_reduced: Math.round(wattsReduced),
      annual_savings_kwh: Math.round(annualKwhSavings),
      annual_savings_dollars: Math.round(annualDollarSavings * 100) / 100,
      estimated_rebate: Math.round(incentive * 100) / 100,
      est_project_cost: Math.round(projectCost * 100) / 100,
      net_cost: Math.round(netCost * 100) / 100,
      payback_months: Math.round(paybackMonths * 10) / 10,
      notes: JSON.stringify(pd),
    });

    // =====================================================
    // 3. Create Audit Areas — EXACT same columns as NewLightingAudit.jsx area creation
    // =====================================================
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      const qty = l.qty || 1;
      const existW = l.existW || 0;
      const newW = l.newW || 0;

      // Matches NewLightingAudit.jsx audit_areas payload exactly
      await supabasePost(`${SUPABASE_URL}/rest/v1/audit_areas`, key, {
        company_id: cid,
        audit_id: audit.id,
        area_name: l.name || `Area ${i + 1}`,
        ceiling_height: l.height || null,
        fixture_category: l.fixtureCategory || null,
        lighting_type: l.lightingType || null,
        fixture_count: qty,
        existing_wattage: existW,
        led_wattage: newW,
        led_replacement_id: l.productId ? parseInt(l.productId) : null,
        total_existing_watts: qty * existW,
        total_led_watts: qty * newW,
        area_watts_reduced: (qty * existW) - (qty * newW),
        confirmed: l.confirmed || false,
        override_notes: l.overrideNotes || (l.productName ? `SBE Product: ${l.productName}` : null),
      });
    }

    // =====================================================
    // 4. Store photos in Supabase Storage (best-effort)
    // =====================================================
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
        // Photo upload is best-effort
      }
    }

    return new Response(JSON.stringify({ success: true, leadId: lead.id, auditId: audit.id, customerId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  round2,
  validateIntake,
  intakeQuoteRow,
  intakeLineRows,
} from "../_shared/estimateIntake.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Auto-infer the pre-LED existing wattage when a user picks an LED
// replacement product directly (via the product picker) without first
// choosing the existing-fixture preset. Without this, lines come in
// with existW=0 → wattsReduced=0 → annual savings=$0, even though the
// actual project HAS savings. Cole / Noah flagged 4 audits in this
// state — every line had a real product + newW + qty, but existing_wattage
// was 0 across the board.
//
// Estimates are CONSERVATIVE per fixture category — typical pre-LED
// equivalents based on industry-standard replacements. Better to
// understate savings than overstate. Real data (any line with a
// non-zero existW) is left alone.
function inferExistingWatts(category: string | null | undefined, newW: number): number {
  if (!newW || newW <= 0) return 0;
  const c = (category || '').toLowerCase();
  if (c.includes('high bay') || c.includes('highbay')) {
    if (newW <= 75)  return 175; // 175W MH
    if (newW <= 110) return 250; // 250W MH or 4L T5HO
    if (newW <= 150) return 400; // 400W MH or 6L T5HO
    if (newW <= 220) return 750; // 750W MH
    return 1000;                 // 1000W MH
  }
  if (c.includes('linear') || c.includes('panel') || c.includes('strip') || c.includes('troffer') || c.includes('wrap')) {
    if (newW <= 20) return 56;   // 2L T8 2ft
    if (newW <= 30) return 64;   // 2L T8 4ft
    if (newW <= 45) return 96;   // 3L T8 4ft
    if (newW <= 80) return 128;  // 4L T8 4ft / 2L T8 8ft
    return 172;                  // 4L T12 4ft
  }
  if (c.includes('wall pack') || c.includes('wallpack')) {
    if (newW <= 30)  return 100; // 100W MH
    if (newW <= 50)  return 175; // 175W MH
    return 250;                  // 250W MH
  }
  if (c.includes('area light') || c.includes('pole') || c.includes('shoebox') || c.includes('cobra')) {
    if (newW <= 75)  return 250; // 250W HPS
    if (newW <= 150) return 400; // 400W HPS / MH
    return 1000;                 // 1000W
  }
  if (c.includes('flood') || c.includes('canopy')) {
    if (newW <= 75)  return 175;
    if (newW <= 150) return 400;
    return 1000;
  }
  // Unknown category — conservative 1.5x newW.
  return Math.round(newW * 1.5);
}

// Build a human-readable estimate-line description that carries the audit
// detail reps kept losing on import: area/location, mounting height, the
// existing fixture being replaced, the LED wattage, and controls. Before
// this, the quote line showed only "<area> - LED Retrofit" with no
// description, so heights and product detail were dropped (Bryce ticket,
// est. 4418: "only showing the place, no heights or product detail").
function describeAuditLine(l: any): string {
  const parts: string[] = [];
  if (l.name) parts.push(String(l.name).trim());
  const h = Number(l.height) || 0;
  if (h > 0) parts.push(`${h} ft`);
  const existW = Number(l.existW) || 0;
  const newW = Number(l.newW) || 0;
  const exType = String(l.lightingType || l.fixtureCategory || '').trim();
  const existing = existW > 0 ? `${existW}W${exType ? ' ' + exType : ''}` : exType;
  const replacement = newW > 0 ? `${newW}W LED` : '';
  if (existing && replacement) parts.push(`${existing} → ${replacement}`);
  else if (existing) parts.push(`existing ${existing}`);
  else if (replacement) parts.push(replacement);
  let ctrl = String(l.controlsType || '').trim();
  if (ctrl && !/^(none|no|n\/?a)$/i.test(ctrl)) {
    // Uppercase short acronym codes (e.g. "lllc" -> "LLLC"); leave words alone.
    if (/^[a-z]{2,5}$/.test(ctrl)) ctrl = ctrl.toUpperCase();
    parts.push(`${ctrl} controls`);
  }
  return parts.join(' · ');
}

// Turn the client payload's lines into estimate-intake lines.
//
// Newer clients carry real per-line economics (unitPrice / productQty /
// lineTotal), so the estimate reconciles by construction and every line reads
// at the price actually quoted.
//
// Field devices on a cached bundle send only productPrice and qty, and their
// headline total may include a rep override, a per-line discount or a give-me
// adder that never arrived as a line. For those we still scale, exactly as
// before, rather than silently under-billing the customer. That path
// disappears the next time the device loads the app.
function intakeLinesFromPayload(lines: any[], quoteAmount: number, auditDbId: number | null) {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const carried = lines.some((l: any) => Number(l.unitPrice) > 0 || Number(l.lineTotal) > 0);
  const sumByPrice = lines.reduce((s: number, l: any) =>
    s + ((l.qty || 1) * (Number(l.productPrice) || 0)), 0);
  const scale = (!carried && sumByPrice > 0 && Math.abs(sumByPrice - quoteAmount) > 1)
    ? (quoteAmount / sumByPrice) : 1;

  return lines.map((l: any, i: number) => {
    const areaLabel = l.name || `Area ${i + 1}`;
    const quantity = carried ? (Number(l.productQty) || l.qty || 1) : (l.qty || 1);
    const price = carried ? (Number(l.unitPrice) || 0) : (Number(l.productPrice) || 0) * scale;
    const lineTotal = carried && Number(l.lineTotal) ? Number(l.lineTotal) : quantity * price;
    // The field tech's photo, on the line the customer reads. This is the
    // thing crews kept losing: a photo saved against the audit that no
    // estimate surface ever looked at.
    //
    // Stored as a full public URL, because that is what every other row in
    // quote_lines.photos holds and what the render surfaces use directly as an
    // <img src>. A bare storage path here would save silently and then show a
    // broken image — the same shape of bug as saving a photo where no viewer
    // reads it. audit-photos is public-read.
    const photos = (auditDbId && l.photoIndex != null && l.photoIndex >= 0)
      ? [`${SUPABASE_URL}/storage/v1/object/public/audit-photos/audits/${auditDbId}/photo_${l.photoIndex}.jpg`]
      : null;
    return {
      // Name the line by the LED product (the fixture being sold) so the
      // product detail is front-and-centre; fall back to the area.
      item_name: l.productName || `${areaLabel} - LED Retrofit`,
      description: describeAuditLine(l) || null,
      item_id: l.productId ? parseInt(l.productId) : null,
      quantity,
      price: round2(price),
      line_total: round2(lineTotal),
      notes: l.overrideNotes || null,
      photos: photos,
    };
  });
}

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

async function supabasePatch(baseUrl: string, table: string, key: string, id: number, body: any): Promise<any> {
  const res = await fetch(`${baseUrl}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
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
    throw new Error(`Supabase PATCH failed: ${err}`);
  }
  return res.json();
}

async function supabaseDelete(baseUrl: string, table: string, key: string, params: string): Promise<void> {
  await fetch(`${baseUrl}/rest/v1/${table}?${params}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${key}`, 'apikey': key },
  });
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
    const { customerName, phone, email, address, city, state, zip, meterNumber, ein, projectData, programType, leadOwnerId, existingLeadId, existingAuditId, signatureData } = await req.json();
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
    // Apply existing-wattage inference per line so users who picked an
    // LED product without recording the existing fixture still produce
    // a meaningful savings number. Inferred values are conservative
    // pre-LED equivalents based on fixture category + LED replacement
    // wattage. Lines with a real existW are left alone.
    let inferredAnyExistW = false;
    const enrichedLines = lines.map((l: any) => {
      const existW = l.existW || 0;
      const newW = l.newW || 0;
      if (existW === 0 && newW > 0) {
        const inferred = inferExistingWatts(l.fixtureCategory || '', newW);
        if (inferred > 0) {
          inferredAnyExistW = true;
          return { ...l, existW: inferred, _existWInferred: true };
        }
      }
      return l;
    });
    const totalFixtures = enrichedLines.reduce((s: number, l: any) => s + (l.qty || 0), 0);
    const totalExistW = enrichedLines.reduce((s: number, l: any) => s + ((l.existW || 0) * (l.qty || 0)), 0);
    const totalNewW = enrichedLines.reduce((s: number, l: any) => s + ((l.newW || 0) * (l.qty || 0)), 0);
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
    // 1. Create or Update Lead
    // =====================================================
    const noteLines = [
      programType === 'ut-rmp'
        ? 'Rocky Mountain Power Lighting Retrofit'
        : `SRP ${programType === 'sbs' ? 'Standard Business' : 'Small Business'} Lighting Retrofit`,
      `${totalFixtures} fixtures | ${totalExistW}W existing → ${totalNewW}W LED | ${wattsReduced}W reduced`,
      '',
      ...lines.map((l: any, i: number) => `${i + 1}. ${l.name || 'Area'}: ${l.qty || 1}x ${l.existW || 0}W → ${l.newW || 0}W${l.fixtureCategory ? ` (${l.fixtureCategory})` : ''}${l.lightingType ? ` ${l.lightingType}` : ''}`),
      '',
      `Est. Incentive: $${incentive.toLocaleString()}`,
      projectCost ? `Project Cost: $${projectCost.toLocaleString()} | Net: $${netCost.toLocaleString()}` : '',
    ].filter(Boolean).join('\n');

    let leadId: number;
    if (existingLeadId) {
      // Update existing lead
      const [updated] = await supabasePatch(SUPABASE_URL!, 'leads', key, existingLeadId, {
        customer_name: customerName,
        email: email || null,
        phone: phone || null,
        address: fullAddress,
        meter_number: meterNumber || null,
        ein: ein || null,
        notes: noteLines,
        lead_owner_id: leadOwnerId ? parseInt(leadOwnerId) : null,
        updated_at: new Date().toISOString(),
      });
      leadId = updated.id;
    } else {
      // Create new lead
      const [lead] = await supabasePost(`${SUPABASE_URL}/rest/v1/leads`, key, {
        company_id: cid,
        customer_name: customerName,
        business_name: null,
        email: email || null,
        phone: phone || null,
        address: fullAddress,
        meter_number: meterNumber || null,
        ein: ein || null,
        service_type: 'Energy Efficiency',
        lead_source: programType === 'ut-rmp' ? 'Lenard UT RMP' : 'Lenard AZ SRP',
        status: 'New',
        notes: noteLines,
        lead_owner_id: leadOwnerId ? parseInt(leadOwnerId) : null,
        updated_at: new Date().toISOString(),
      });
      leadId = lead.id;
    }

    // =====================================================
    // 2. Create or Update Lighting Audit
    // =====================================================
    const auditPayload = {
      address: fullAddress,
      city: city || null,
      state: facilityState,
      zip: zip || null,
      electric_rate: rate,
      operating_hours: opHours,
      operating_days: opDays,
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
    };

    let auditDbId: number;
    if (existingAuditId) {
      // Update existing audit
      const [updated] = await supabasePatch(SUPABASE_URL!, 'lighting_audits', key, existingAuditId, auditPayload);
      auditDbId = updated.id;

      // Delete old audit areas and re-create
      await supabaseDelete(SUPABASE_URL!, 'audit_areas', key, `audit_id=eq.${existingAuditId}`);
    } else {
      // Create new audit
      const newAuditId = `AUD-${Date.now().toString(36).toUpperCase()}`;
      const [audit] = await supabasePost(`${SUPABASE_URL}/rest/v1/lighting_audits`, key, {
        company_id: cid,
        audit_id: newAuditId,
        lead_id: leadId,
        customer_id: customerId,
        status: 'Draft',
        ...auditPayload,
      });
      auditDbId = audit.id;
    }

    // =====================================================
    // 3. Create Audit Areas
    // =====================================================
    for (let i = 0; i < enrichedLines.length; i++) {
      const l = enrichedLines[i];
      const qty = l.qty || 1;
      const existW = l.existW || 0;
      const newW = l.newW || 0;
      const inferred = !!l._existWInferred;

      // Build photo_path if this line has a photoIndex
      const photoPath = (l.photoIndex != null && l.photoIndex >= 0) ? `audits/${auditDbId}/photo_${l.photoIndex}.jpg` : null;

      // Tag the notes with [estimated existing watts] when we inferred so
      // the field tech / customer can see exactly which areas need
      // verification on a site visit.
      const baseNotes = l.overrideNotes || (l.productName ? `SBE Product: ${l.productName}` : null);
      const notesWithEstimate = inferred
        ? (baseNotes ? `${baseNotes} [existing watts estimated: ${existW}W]` : `[existing watts estimated: ${existW}W]`)
        : baseNotes;

      await supabasePost(`${SUPABASE_URL}/rest/v1/audit_areas`, key, {
        company_id: cid,
        audit_id: auditDbId,
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
        override_notes: notesWithEstimate,
        photo_path: photoPath,
        // Same photo, as a full public URL in the array every viewer reads.
        // photo_path alone is a bare storage path that only this function's
        // own conventions understand: FieldScout's area briefing and
        // areaAnnotations() both look at `photos`, so writing only photo_path
        // stored the picture where nothing would ever draw it.
        photos: photoPath ? [`${SUPABASE_URL}/storage/v1/object/public/audit-photos/${photoPath}`] : null,
        // What this area SOLD, not just what was surveyed. Without these the
        // money died here and every conversion re-invented it — which is how
        // estimate lines ended up at 3.27x the price book. Null for payloads
        // from a cached bundle that predates them; the quote still reconciles
        // because those clients also send no per-line economics.
        unit_price: l.unitPrice == null ? null : round2(l.unitPrice),
        product_qty: l.productQty == null ? null : Number(l.productQty),
        line_total: l.lineTotal == null ? null : round2(l.lineTotal),
        retrofit_type: l.retrofitType || null,
        lamps_per_fixture: l.lampsPerFixture == null ? null : Number(l.lampsPerFixture),
        // Only true when the product is itself sold per lamp. Defaults false:
        // absent evidence, never multiply.
        priced_per_lamp: l.pricedPerLamp === true,
      });
    }

    // =====================================================
    // 4. Store photos in Supabase Storage (best-effort)
    // =====================================================
    {
      const photos = pd.photos || [];
      if (photos.length > 0) {
        // Find how many photos already exist for this audit
        let startIndex = 0;
        try {
          const listRes = await fetch(`${SUPABASE_URL}/storage/v1/object/list/audit-photos`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${key}`,
              'apikey': key,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prefix: `audits/${auditDbId}/`, search: 'photo_' }),
          });
          if (listRes.ok) {
            const existing = await listRes.json();
            startIndex = (existing || []).filter((f: any) => f.name?.startsWith('photo_')).length;
          }
        } catch (_) { /* best-effort */ }

        for (let i = startIndex; i < photos.length; i++) {
          try {
            const photoBase64 = photos[i];
            if (!photoBase64) continue;
            const binaryStr = atob(photoBase64);
            const bytes = new Uint8Array(binaryStr.length);
            for (let b = 0; b < binaryStr.length; b++) bytes[b] = binaryStr.charCodeAt(b);
            const filePath = `audits/${auditDbId}/photo_${i}.jpg`;
            await fetch(`${SUPABASE_URL}/storage/v1/object/audit-photos/${filePath}`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${key}`,
                'apikey': key,
                'Content-Type': 'image/jpeg',
                'x-upsert': 'true',
              },
              body: bytes,
            });
          } catch (_) {
            // Photo upload is best-effort
          }
        }
      }
    }

    // =====================================================
    // 4b. Create file_attachments for photos so they show on Lead & Job
    // =====================================================
    {
      const photos = pd.photos || [];
      if (photos.length > 0) {
        // Check if existing lead already has a job linked
        let jobId: number | null = null;
        try {
          const jobs = await querySupabase(
            SUPABASE_URL!, 'jobs', key,
            `lead_id=eq.${leadId}&limit=1`
          );
          if (jobs.length > 0) jobId = jobs[0].id;
        } catch (_) { /* best-effort */ }

        // Check how many file_attachments already exist for this audit's photos
        const existingAtts = await querySupabase(
          SUPABASE_URL!, 'file_attachments', key,
          `company_id=eq.${cid}&lead_id=eq.${leadId}&storage_bucket=eq.audit-photos&order=created_at.asc`
        );
        const existingPaths = new Set(existingAtts.map((a: any) => a.file_path));

        for (let i = 0; i < photos.length; i++) {
          const filePath = `audits/${auditDbId}/photo_${i}.jpg`;
          if (existingPaths.has(filePath)) continue; // already tracked

          try {
            await supabasePost(`${SUPABASE_URL}/rest/v1/file_attachments`, key, {
              company_id: cid,
              lead_id: leadId,
              job_id: jobId,
              file_name: `Audit Photo ${i + 1}.jpg`,
              file_path: filePath,
              file_type: 'image/jpeg',
              storage_bucket: 'audit-photos',
            });
          } catch (_) { /* best-effort */ }
        }
      }
    }

    // =====================================================
    // 5. Store customer signature (best-effort)
    // =====================================================
    if (signatureData) {
      try {
        const raw = signatureData.replace(/^data:image\/png;base64,/, '');
        const binaryStr = atob(raw);
        const bytes = new Uint8Array(binaryStr.length);
        for (let b = 0; b < binaryStr.length; b++) bytes[b] = binaryStr.charCodeAt(b);
        const sigPath = `audits/${auditDbId}/customer_signature.png`;
        await fetch(`${SUPABASE_URL}/storage/v1/object/audit-photos/${sigPath}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${key}`,
            'apikey': key,
            'Content-Type': 'image/png',
            'x-upsert': 'true',
          },
          body: bytes,
        });
        await supabasePatch(SUPABASE_URL!, 'lighting_audits', key, auditDbId, {
          customer_signature: sigPath,
        });
      } catch (_) {
        // Signature upload is best-effort
      }
    }

    // =====================================================
    // 6. Auto-create Estimate so value flows through pipeline
    // =====================================================
    let quoteDbId: number | null = null;
    if (lines.length > 0 && projectCost > 0) {
      // Check if estimate already exists for this audit
      const existingQuotes = await querySupabase(
        SUPABASE_URL!, 'quotes', key,
        `audit_id=eq.${auditDbId}&limit=1`
      );

      if (existingQuotes.length === 0) {
        const quoteAmount = Math.round(projectCost * 100) / 100;
        // Build the estimate through the shared intake contract, the same one
        // Zach and Don use. Lenard wrote this first and the other two copied
        // it; the copies then drifted, which is why business_unit,
        // salesperson_id, service_type, estimate_name and summary were set by
        // some producers and not others. One shape now, in
        // _shared/estimateIntake.ts.
        const intake = {
          source: 'lenard',
          company_id: cid,
          lead_id: leadId,
          customer_id: customerId,
          salesperson_id: leadOwnerId ? parseInt(String(leadOwnerId)) : null,
          audit_id: auditDbId,
          audit_type: 'lighting',
          service_type: 'Lighting',
          business_unit: 'Energy Scout',
          estimate_name: `Lighting — ${customerName || 'Project'}`,
          summary: `${lines.length} area(s) · ${Math.round(wattsReduced)}W reduced · ${Math.round(annualKwhSavings)} kWh/yr`,
          // The customer signed a document showing this number, so it stays
          // authoritative even if rounding leaves the lines a cent adrift.
          quote_amount: quoteAmount,
          utility_incentive: incentive,
          status: 'Draft',
          lines: intakeLinesFromPayload(lines, quoteAmount, auditDbId),
          extras: Array.isArray(pd.extras) ? pd.extras : [],
        };

        const problems = validateIntake(intake as any);
        if (problems.length) {
          return new Response(JSON.stringify({ error: `Estimate intake rejected: ${problems.join('; ')}` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        const [newQuote] = await supabasePost(`${SUPABASE_URL}/rest/v1/quotes`, key,
          intakeQuoteRow(intake as any));
        quoteDbId = newQuote.id;

        const rows = intakeLineRows(intake as any, newQuote.id);
        const written = await supabasePost(`${SUPABASE_URL}/rest/v1/quote_lines`, key, rows);

        // A quote carrying a headline total with nothing itemised under it is
        // the worst possible shape for a document you hand a customer, because
        // it looks finished. Count what the database confirmed, and undo the
        // header rather than leave half a bid behind.
        if (!Array.isArray(written) || written.length !== rows.length) {
          await supabaseDelete(SUPABASE_URL!, 'quotes', key, `id=eq.${newQuote.id}`);
          return new Response(JSON.stringify({
            error: `Estimate lines failed, header rolled back: only ${Array.isArray(written) ? written.length : 0} of ${rows.length} lines were written. Nothing was left half-made.`,
          }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Link the quote to the lead, but deliberately do NOT advance the lead
        // to "Estimate Sent" the way Zach and Don do. Those push a finished bid
        // to the pipeline on purpose; Lenard auto-creates a Draft the moment
        // the audit is saved, and nothing has been sent to anyone yet.
        await supabasePatch(SUPABASE_URL!, 'leads', key, leadId, {
          quote_id: newQuote.id,
        });
      }
    }

    return new Response(JSON.stringify({ success: true, leadId, auditId: auditDbId, customerId, quoteId: quoteDbId }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

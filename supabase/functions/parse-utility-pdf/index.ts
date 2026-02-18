import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { encode as base64Encode, decode as base64Decode } from "https://deno.land/std@0.168.0/encoding/base64.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REBATE_PROGRAM_PROMPT = `You are a utility rebate document analyst. Extract every prescriptive measure line item from this PDF document.

For each measure found, extract:
- measure_name: exact name from the document (e.g. "T8 4ft Linear to LED Tube")
- measure_code: utility's internal code if present, or null
- measure_category: Lighting|HVAC|Motors|Refrigeration|Building Envelope
- measure_subcategory: Linear|High Bay|Low Bay|Outdoor Area|Outdoor Wall|Decorative|Refrigeration|VFD|RTU|Other
- baseline_equipment: what is being replaced (e.g. "T8 4ft 32W 2-lamp fluorescent")
- baseline_wattage: number or null
- replacement_equipment: what replaces it (e.g. "DLC-listed LED Tube Type A/B 18W")
- replacement_wattage: number or null
- incentive_amount: dollar amount (number)
- incentive_unit: per_fixture|per_lamp|per_watt_reduced|per_kw|flat|per_ton
- incentive_formula: formula if complex calculation, or null
- max_incentive: cap amount or null
- location_type: interior|exterior|parking|refrigerated or null
- application_type: retrofit|new_construction|both
- dlc_required: true/false
- dlc_tier: Standard|Premium or null
- energy_star_required: true/false
- hours_requirement: minimum annual hours or null
- source_page: page number where this measure appears
- notes: any special conditions or requirements

Extract EVERY line item — utilities often have 20-100+ individual measures per document. Do not summarize or skip any rows.

Return ONLY valid JSON:
{
  "prescriptive_measures": [...],
  "document_info": {
    "program_name": "string",
    "utility_name": "string",
    "effective_date": "string or null",
    "document_title": "string",
    "total_pages_analyzed": number
  }
}`;

const FORM_FIELD_ANALYSIS_PROMPT = `You are a utility rebate application form analyst. Given a list of PDF form field names, map each field to the most likely database data path.

Available data paths:
- customer.name — Customer/business name
- customer.email — Customer email
- customer.phone — Customer phone number
- customer.address — Customer mailing address
- audit.address — Project/service address
- audit.city — Project city
- audit.state — Project state
- audit.zip — Project zip code
- provider.provider_name — Utility company name
- provider.contact_phone — Utility contact phone
- salesperson.name — Sales representative name
- salesperson.phone — Sales rep phone
- salesperson.email — Sales rep email
- quote.quote_amount — Total project cost
- quote.utility_incentive — Estimated incentive/rebate amount
- quote.discount — Discount amount
- audit.total_fixtures — Total fixture count
- audit.total_existing_watts — Total existing wattage
- audit.total_proposed_watts — Total proposed wattage
- audit.annual_savings_kwh — Annual kWh savings
- audit.annual_savings_dollars — Annual dollar savings
- audit.estimated_rebate — Estimated rebate from audit
- audit_areas.fixture_count.sum — Sum of fixtures across all areas
- audit_areas.area_watts_reduced.sum — Sum of watts reduced across all areas
- today — Today's date (MM/DD/YYYY)

For each PDF field name, suggest the best matching data path. If no data path is a good match, use null.

Return ONLY valid JSON:
{
  "field_mappings": {
    "PDF Field Name": "data.path" or null,
    ...
  },
  "confidence_notes": {
    "PDF Field Name": "brief explanation of why this mapping was chosen",
    ...
  }
}`;

const RATE_SCHEDULE_PROMPT = `You are a utility rate tariff analyst. Extract all rate schedule information from this PDF document.

For each rate schedule/tier found, extract:
- schedule_name: name/number of the schedule (e.g. "Schedule 6 - General Service")
- customer_category: Residential|Small Commercial|Large Commercial|Industrial|Agricultural
- rate_type: Flat|Tiered|Time-of-Use|Seasonal|Demand
- rate_per_kwh: base rate in dollars (e.g. 0.0845 for 8.45 cents/kWh)
- peak_rate_per_kwh: on-peak rate or null
- off_peak_rate_per_kwh: off-peak rate or null
- summer_rate_per_kwh: summer rate or null
- winter_rate_per_kwh: winter rate or null
- demand_charge: $/kW charge or null
- min_demand_charge: minimum monthly demand charge or null
- customer_charge: fixed monthly charge or null
- time_of_use: true/false
- effective_date: date string or null
- source_url: leave empty string
- description: brief description
- notes: any special conditions, riders, or adjustments
- source_page: page number where this schedule appears

Extract ALL rate tiers, seasonal variants, and TOU periods as separate entries. Do not summarize.

Return ONLY valid JSON:
{
  "rate_schedules": [...],
  "document_info": {
    "utility_name": "string",
    "tariff_name": "string",
    "effective_date": "string or null",
    "document_title": "string",
    "total_pages_analyzed": number
  }
}`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      pdf_base64,
      pdf_url,
      document_type,
      program_name,
      provider_name,
      store_in_storage,
      storage_path,
      field_names
    } = await req.json();

    if (!document_type || !['rebate_program', 'rate_schedule', 'form', 'form_field_analysis'].includes(document_type)) {
      return new Response(JSON.stringify({ success: false, error: 'document_type must be "rebate_program", "rate_schedule", "form", or "form_field_analysis"' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    let pdfData = pdf_base64;
    let pdfBytes: Uint8Array | null = null;

    // If URL provided, fetch the PDF
    if (pdf_url && !pdfData) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const pdfResponse = await fetch(pdf_url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JobScout/1.0)' }
        });
        clearTimeout(timeout);

        if (!pdfResponse.ok) {
          const errMsg = pdfResponse.status === 404
            ? 'PDF not found — URL may be outdated'
            : pdfResponse.status === 403
            ? 'PDF access denied — website may block automated downloads'
            : `Failed to fetch PDF: ${pdfResponse.status}`;
          return new Response(JSON.stringify({ success: false, error: errMsg }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }

        pdfBytes = new Uint8Array(await pdfResponse.arrayBuffer());
        pdfData = base64Encode(pdfBytes);
      } catch (fetchErr) {
        return new Response(JSON.stringify({ success: false, error: `PDF fetch error: ${(fetchErr as Error).message}` }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }

    if (!pdfData) {
      return new Response(JSON.stringify({ success: false, error: 'Either pdf_base64 or pdf_url is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Validate size (<32MB base64)
    if (pdfData.length > 32 * 1024 * 1024) {
      return new Response(JSON.stringify({ success: false, error: 'PDF exceeds 32MB limit' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    // Upload to Supabase Storage if requested (direct REST API — no JS client needed)
    let storagePath: string | null = null;
    if (store_in_storage && storage_path) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

        // Use saved raw bytes, or decode from base64 using std library
        const binaryData = pdfBytes || base64Decode(pdfData);

        const uploadUrl = `${supabaseUrl}/storage/v1/object/utility-pdfs/${storage_path}`;
        const uploadRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${serviceRoleKey}`,
            'Content-Type': 'application/pdf',
            'x-upsert': 'true'
          },
          body: binaryData
        });

        if (!uploadRes.ok) {
          const errText = await uploadRes.text();
          console.error('Storage upload error:', uploadRes.status, errText);
        } else {
          storagePath = storage_path;
          console.log(`PDF uploaded to utility-pdfs/${storage_path}`);
        }
      } catch (storageErr) {
        console.error('Storage upload failed:', (storageErr as Error).message);
        // Continue — extraction is still valuable even if storage fails
      }
    }

    // For 'form' type (no field analysis), skip extraction — return PDF data + store
    if (document_type === 'form') {
      return new Response(JSON.stringify({
        success: true,
        document_type,
        storage_path: storagePath,
        pdf_base64: pdfData,
        results: null
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(JSON.stringify({ success: false, error: 'API key not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const systemPrompt = document_type === 'form_field_analysis'
      ? FORM_FIELD_ANALYSIS_PROMPT
      : document_type === 'rebate_program'
      ? REBATE_PROGRAM_PROMPT
      : RATE_SCHEDULE_PROMPT;

    let contextNote = '';
    if (program_name) contextNote += `\nProgram: ${program_name}`;
    if (provider_name) contextNote += `\nUtility Provider: ${provider_name}`;

    // Build user message content
    const userContent: Array<Record<string, unknown>> = [
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: pdfData
        }
      }
    ];

    if (document_type === 'form_field_analysis') {
      const fieldList = (field_names || []).join('\n- ');
      userContent.push({
        type: 'text',
        text: `This is a fillable utility rebate application PDF. Here are the form field names extracted from it:\n\n- ${fieldList}\n\nMap each field to the best matching database data path.${contextNote}\n\nReturn the structured JSON as specified.`
      });
    } else {
      userContent.push({
        type: 'text',
        text: `Extract all ${document_type === 'rebate_program' ? 'prescriptive measure line items' : 'rate schedule information'} from this PDF document.${contextNote}\n\nReturn the structured JSON as specified.`
      });
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-beta': 'pdfs-2024-09-25'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 64000,
        system: systemPrompt,
        messages: [{
          role: 'user',
          content: userContent
        }]
      })
    });

    const data = await response.json();

    if (data.error) {
      // Retry once on rate limit
      if (data.error.message?.includes('rate limit')) {
        console.log('Rate limited, waiting 61s before retry...');
        await new Promise(r => setTimeout(r, 61000));
        const retryResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'anthropic-beta': 'pdfs-2024-09-25'
          },
          body: JSON.stringify({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 64000,
            system: systemPrompt,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'document',
                  source: {
                    type: 'base64',
                    media_type: 'application/pdf',
                    data: pdfData
                  }
                },
                {
                  type: 'text',
                  text: `Extract all ${document_type === 'rebate_program' ? 'prescriptive measure line items' : 'rate schedule information'} from this PDF document.${contextNote}\n\nReturn the structured JSON as specified.`
                }
              ]
            }]
          })
        });
        const retryData = await retryResponse.json();
        if (retryData.error) {
          return new Response(JSON.stringify({ success: false, error: retryData.error.message || 'Anthropic API error (after retry)', storage_path: storagePath }), {
            status: 500,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        const retryContent = retryData.content?.[0]?.text || '';
        const retryJsonMatch = retryContent.match(/\{[\s\S]*\}/);
        if (retryJsonMatch) {
          const results = JSON.parse(retryJsonMatch[0]);
          return new Response(JSON.stringify({ success: true, document_type, results, storage_path: storagePath }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
      }

      return new Response(JSON.stringify({ success: false, error: data.error.message || 'Anthropic API error', storage_path: storagePath }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    const content = data.content?.[0]?.text || '';

    // Parse JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const results = JSON.parse(jsonMatch[0]);

      return new Response(JSON.stringify({ success: true, document_type, results, storage_path: storagePath }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ success: false, error: 'Could not parse extraction results', raw: content, storage_path: storagePath }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});

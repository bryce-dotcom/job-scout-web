import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { company_id, dry_run } = await req.json();
    if (!company_id) {
      return new Response(JSON.stringify({ error: 'company_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const results = {
      leads_updated_quote_amount: 0,
      estimates_created_from_audits: 0,
      quote_lines_created: 0,
      details: [] as string[],
    };

    // ─── Fix 1 (removed): there is no leads.quote_amount column ───
    // This synced a quote's amount onto the lead, but the select + update both
    // 400'd against a column that doesn't exist, so it never ran. The lead
    // links to its quote via quote_id; read the amount from quotes when needed.
    // leads_updated_quote_amount stays 0.

    // ─── Fix 2: Audits linked to leads that have no estimate yet ───
    const { data: auditsWithLeads } = await supabase
      .from('lighting_audits')
      .select('*')
      .eq('company_id', company_id)
      .not('lead_id', 'is', null);

    for (const audit of (auditsWithLeads || [])) {
      // Check if an estimate already exists for this audit
      const { data: existingQuote } = await supabase
        .from('quotes')
        .select('id')
        .eq('audit_id', audit.id)
        .limit(1);

      if (existingQuote && existingQuote.length > 0) continue; // Already has estimate

      // Fetch audit areas to create line items
      const { data: areas } = await supabase
        .from('audit_areas')
        .select('*')
        .eq('audit_id', audit.id);

      if (!areas || areas.length === 0) {
        results.details.push(
          `Audit ${audit.audit_id} (lead ${audit.lead_id}): skipped, no audit areas`
        );
        continue;
      }

      const quoteAmount = audit.est_project_cost || 0;

      if (!dry_run) {
        // Create the estimate
        const { data: newQuote, error: quoteErr } = await supabase
          .from('quotes')
          .insert({
            company_id: company_id,
            lead_id: audit.lead_id,
            audit_id: audit.id,
            audit_type: 'lighting',
            quote_amount: quoteAmount,
            utility_incentive: audit.estimated_rebate || 0,
            status: 'Draft',
          })
          .select()
          .single();

        if (quoteErr) {
          results.details.push(`Audit ${audit.audit_id}: ERROR creating estimate - ${quoteErr.message}`);
          continue;
        }

        // Create quote lines from audit areas
        for (const area of areas) {
          const qty = area.fixture_count || 1;
          const unitPrice = ((area.existing_wattage || 0) - (area.led_wattage || 0)) * 5;
          await supabase
            .from('quote_lines')
            .insert({
              company_id: company_id,
              quote_id: newQuote.id,
              item_name: `${area.area_name} - LED Retrofit`,
              item_id: area.led_replacement_id || null,
              quantity: qty,
              price: Math.round(unitPrice * 100) / 100,
              line_total: Math.round(qty * unitPrice * 100) / 100,
            });
          results.quote_lines_created++;
        }

        // Link the quote to the lead. (No quote_amount on leads — the amount
        // lives on the quote created above.)
        await supabase
          .from('leads')
          .update({
            quote_id: newQuote.id,
          })
          .eq('id', audit.lead_id);
      }

      results.estimates_created_from_audits++;
      results.details.push(
        `Audit ${audit.audit_id} → created estimate for lead ${audit.lead_id} with amount ${quoteAmount} (${areas.length} line items)`
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        dry_run: !!dry_run,
        ...results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

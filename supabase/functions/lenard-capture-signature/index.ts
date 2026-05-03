// Public-anon endpoint that captures a customer signature on a Lenard
// rebate intake lead WITHOUT giving anon direct write access to the
// leads table. Uses the service role inside the function to do the
// minimal write — anon caller never sees lead data.
//
// Body shape:
//   {
//     leadId:           number   (required, the lead being signed)
//     signatureBase64:  string   (required, "data:image/png;base64,...")
//     method:           string   (optional, "drawn" | "typed", default "drawn")
//     typedText:        string   (optional)
//   }
//
// Returns:
//   { success: true } on success
//   { error: '...' }  with 400/500 on failure

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
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json();
    const leadId = Number(body?.leadId);
    const signatureBase64: string | null = body?.signatureBase64 || null;
    const method: string = body?.method || 'drawn';
    const typedText: string | null = body?.typedText || null;

    if (!Number.isFinite(leadId) || leadId <= 0) {
      return json({ error: 'leadId is required' }, 400);
    }
    if (!signatureBase64 && !typedText) {
      return json({ error: 'signatureBase64 or typedText required' }, 400);
    }

    // Confirm the lead exists. We don't reveal much else — anon-style call.
    const { data: lead, error: leadErr } = await supabase
      .from('leads')
      .select('id, company_id')
      .eq('id', leadId)
      .maybeSingle();
    if (leadErr) return json({ error: leadErr.message }, 500);
    if (!lead) return json({ error: 'Lead not found' }, 404);

    let sigPath: string | null = null;
    if (signatureBase64) {
      try {
        const clean = signatureBase64.includes(',') ? signatureBase64.split(',').pop()! : signatureBase64;
        const bin = atob(clean);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        sigPath = `signatures/lead-${leadId}.png`;
        const { error: upErr } = await supabase.storage
          .from('project-documents')
          .upload(sigPath, bytes, { contentType: 'image/png', upsert: true });
        if (upErr) return json({ error: 'storage upload failed: ' + upErr.message }, 500);
      } catch (err) {
        return json({ error: 'signature decode failed: ' + (err as Error).message }, 400);
      }
    }

    const patch: Record<string, unknown> = {
      customer_signature_method: method,
      customer_signature_captured_at: new Date().toISOString(),
    };
    if (sigPath) patch.customer_signature_path = sigPath;
    if (typedText) patch.customer_signature_typed = typedText;

    // Update the lead
    const { error: updErr } = await supabase
      .from('leads')
      .update(patch)
      .eq('id', leadId);
    if (updErr) return json({ error: updErr.message }, 500);

    // Mirror to any linked jobs (same as the original inline flow)
    const { data: jobs } = await supabase
      .from('jobs')
      .select('id')
      .eq('lead_id', leadId)
      .eq('company_id', lead.company_id);
    if (jobs && jobs.length > 0) {
      await supabase
        .from('jobs')
        .update(patch)
        .eq('lead_id', leadId)
        .eq('company_id', lead.company_id);
    }

    return json({ success: true });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

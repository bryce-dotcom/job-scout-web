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

    const { token, approver_name, approver_email } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: 'Token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate token
    const { data: tokenRow, error: tokenError } = await supabase
      .from('customer_portal_tokens')
      .select('*')
      .eq('token', token)
      .single();

    if (tokenError || !tokenRow) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (tokenRow.is_revoked || new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link is no longer valid' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (tokenRow.document_type !== 'estimate') {
      return new Response(JSON.stringify({ error: 'Only estimates can be approved' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch the estimate and line items to compute hash
    const { data: estimate } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', tokenRow.document_id)
      .single();

    if (!estimate) {
      return new Response(JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: lines } = await supabase
      .from('quote_lines')
      .select('*')
      .eq('quote_id', estimate.id)
      .order('id');

    // Compute SHA-256 hash of document content
    const hashPayload = JSON.stringify({ estimate, lines: lines || [] });
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(hashPayload));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const documentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Get IP and user agent
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // Record approval
    const { error: approvalError } = await supabase
      .from('document_approvals')
      .insert({
        document_type: 'estimate',
        document_id: estimate.id,
        company_id: tokenRow.company_id,
        portal_token_id: tokenRow.id,
        approver_name: approver_name || null,
        approver_email: approver_email || null,
        ip_address: ipAddress,
        user_agent: userAgent,
        document_hash: documentHash
      });

    if (approvalError) {
      console.error('Approval insert error:', approvalError);
      return new Response(JSON.stringify({ error: 'Failed to record approval' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update estimate status to Approved
    await supabase
      .from('quotes')
      .update({ status: 'Approved', updated_at: new Date().toISOString() })
      .eq('id', estimate.id);

    // Update linked lead status to Won if lead_id exists
    if (estimate.lead_id) {
      await supabase
        .from('leads')
        .update({ status: 'Won', updated_at: new Date().toISOString() })
        .eq('id', estimate.lead_id);
    }

    return new Response(JSON.stringify({
      success: true,
      approval: {
        approved_at: new Date().toISOString(),
        approver_name,
        approver_email,
        document_hash: documentHash
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('approve-document error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

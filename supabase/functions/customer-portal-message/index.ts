// customer-portal-message: lets a customer reply through their portal link.
// Validates the portal token, then writes a message into estimate_messages.
// The rep sees it on the estimate page in real time.
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
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { token, action, body, from_name, from_email } = await req.json();

    if (!token) {
      return new Response(JSON.stringify({ error: 'token is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // For action 'list', body is optional. For default 'send' action, body is required.
    const isList = action === 'list';
    if (!isList && (!body || !String(body).trim())) {
      return new Response(JSON.stringify({ error: 'body is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Validate the portal token (estimate-only — invoices have their own flow)
    const { data: tokenRow, error: tokenError } = await supabase
      .from('customer_portal_tokens')
      .select('id, document_type, document_id, company_id, customer_id, is_revoked, expires_at')
      .eq('token', token)
      .single();

    if (tokenError || !tokenRow) {
      return new Response(JSON.stringify({ error: 'Invalid token' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (tokenRow.is_revoked) {
      return new Response(JSON.stringify({ error: 'This link has been revoked' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (tokenRow.document_type !== 'estimate') {
      return new Response(JSON.stringify({ error: 'Replies are only supported on estimate links right now' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // LIST: return all customer-visible messages for this estimate.
    // Internal notes are filtered out so the customer never sees them.
    if (isList) {
      const { data: msgs, error: listErr } = await supabase
        .from('estimate_messages')
        .select('id, from_role, from_name, channel, subject, body, created_at')
        .eq('quote_id', tokenRow.document_id)
        .eq('is_internal', false)
        .order('created_at', { ascending: true })
        .limit(200);
      if (listErr) {
        return new Response(JSON.stringify({ error: listErr.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ ok: true, messages: msgs || [] }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull a sane display name when the portal didn't pass one.
    let resolvedName = from_name;
    let resolvedEmail = from_email;
    if ((!resolvedName || !resolvedEmail) && tokenRow.customer_id) {
      const { data: c } = await supabase
        .from('customers')
        .select('name, business_name, email')
        .eq('id', tokenRow.customer_id)
        .single();
      if (!resolvedName) resolvedName = c?.business_name || c?.name || 'Customer';
      if (!resolvedEmail) resolvedEmail = c?.email || null;
    }

    const { data: msg, error: insErr } = await supabase
      .from('estimate_messages')
      .insert({
        quote_id: tokenRow.document_id,
        company_id: tokenRow.company_id,
        from_role: 'customer',
        from_name: resolvedName || 'Customer',
        from_email: resolvedEmail || null,
        channel: 'portal',
        body: String(body).trim(),
        metadata: { portal_token_id: tokenRow.id },
      })
      .select('id, created_at')
      .single();

    if (insErr) {
      console.error('[customer-portal-message] insert failed:', insErr);
      return new Response(JSON.stringify({ error: insErr.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ ok: true, message: msg }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[customer-portal-message] crashed:', err);
    return new Response(JSON.stringify({ error: String(err?.message || err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

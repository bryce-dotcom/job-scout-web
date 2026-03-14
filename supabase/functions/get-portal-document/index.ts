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

    const { token } = await req.json();

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

    if (tokenRow.is_revoked) {
      return new Response(JSON.stringify({ error: 'This link has been revoked' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link has expired' }),
        { status: 410, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Update access tracking
    await supabase
      .from('customer_portal_tokens')
      .update({
        accessed_at: new Date().toISOString(),
        access_count: (tokenRow.access_count || 0) + 1
      })
      .eq('id', tokenRow.id);

    // Fetch company info
    const { data: company } = await supabase
      .from('companies')
      .select('id, company_name, phone, address, owner_email, logo_url, google_place_id')
      .eq('id', tokenRow.company_id)
      .single();

    // Fetch customer info
    let customer = null;
    if (tokenRow.customer_id) {
      const { data: c } = await supabase
        .from('customers')
        .select('id, name, email, phone, address, business_name')
        .eq('id', tokenRow.customer_id)
        .single();
      customer = c;
    }

    let document = null;
    let lineItems: unknown[] = [];
    let approval = null;
    let paymentsData: unknown[] = [];

    if (tokenRow.document_type === 'estimate') {
      const { data: est } = await supabase
        .from('quotes')
        .select('*, lead:leads(id, customer_name, phone, email, address), customer:customers(id, name, email, phone, address, business_name)')
        .eq('id', tokenRow.document_id)
        .single();
      document = est;

      if (est) {
        const { data: lines } = await supabase
          .from('quote_lines')
          .select('*, item:products_services(id, name, description)')
          .eq('quote_id', est.id)
          .order('sort_order', { ascending: true });
        lineItems = lines || [];

        // Check for existing approval
        const { data: approvalData } = await supabase
          .from('document_approvals')
          .select('*')
          .eq('document_type', 'estimate')
          .eq('document_id', est.id)
          .order('approved_at', { ascending: false })
          .limit(1);
        approval = approvalData?.[0] || null;

        // Customer from estimate if not on token
        if (!customer && est.customer) customer = est.customer;
        if (!customer && est.lead) {
          customer = {
            name: est.lead.customer_name,
            email: est.lead.email,
            phone: est.lead.phone,
            address: est.lead.address
          };
        }
      }
    } else if (tokenRow.document_type === 'invoice') {
      const { data: inv } = await supabase
        .from('invoices')
        .select('*, customer:customers(id, name, email, phone, address), job:jobs(id, job_id, job_title)')
        .eq('id', tokenRow.document_id)
        .single();
      document = inv;

      if (inv) {
        // Fetch payments
        const { data: pays } = await supabase
          .from('payments')
          .select('*')
          .eq('invoice_id', inv.id)
          .order('date', { ascending: false });
        paymentsData = pays || [];

        if (!customer && inv.customer) customer = inv.customer;
      }
    }

    if (!document) {
      return new Response(JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch business unit settings if applicable
    let businessUnit = null;
    const buName = document.business_unit;
    if (buName && company) {
      const { data: buSetting } = await supabase
        .from('settings')
        .select('value')
        .eq('company_id', tokenRow.company_id)
        .eq('key', 'business_units')
        .single();

      if (buSetting?.value) {
        try {
          const units = JSON.parse(buSetting.value);
          businessUnit = units.find((u: { name: string }) => u.name === buName) || null;
        } catch { /* ignore */ }
      }
    }

    // Fetch payment config for portal display
    let paymentConfig = null;
    const { data: paymentSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', tokenRow.company_id)
      .eq('key', 'payment_config')
      .single();

    if (paymentSetting?.value) {
      try {
        const cfg = JSON.parse(paymentSetting.value);
        // Only expose safe fields (never send secrets to the portal)
        paymentConfig = {
          stripe_enabled: !!(cfg.stripe_enabled && cfg.stripe_secret_key),
          paypal_enabled: !!(cfg.paypal_enabled && cfg.paypal_client_id && cfg.paypal_secret),
          paypal_mode: cfg.paypal_mode || 'sandbox',
          bank_enabled: !!(cfg.bank_enabled && cfg.bank_name),
          bank_name: cfg.bank_name || null,
          bank_account_name: cfg.bank_account_name || null,
          bank_routing: cfg.bank_routing || null,
          bank_account: cfg.bank_account ? '****' + cfg.bank_account.slice(-4) : null,
          bank_instructions: cfg.bank_instructions || null,
          // Financing providers — only expose enabled flag (no keys)
          wisetack_enabled: !!(cfg.wisetack_enabled && cfg.wisetack_api_key && cfg.wisetack_merchant_id),
          greensky_enabled: !!(cfg.greensky_enabled && cfg.greensky_merchant_id),
          hearth_enabled: !!(cfg.hearth_enabled && cfg.hearth_partner_id),
          service_finance_enabled: !!(cfg.service_finance_enabled && cfg.service_finance_dealer_id),
        };
      } catch { /* ignore */ }
    }

    // Fetch invoice-specific settings (CC fee, payment preferences)
    let invoiceSettings = null;
    if (tokenRow.document_type === 'invoice') {
      const settingKeys = [
        'invoice_cc_fee_enabled',
        'invoice_cc_fee_percent',
        'invoice_accept_credit_card',
        'invoice_show_preferred_payment_note',
        'invoice_preferred_payment_note'
      ];
      const { data: invSettings } = await supabase
        .from('settings')
        .select('key, value')
        .eq('company_id', tokenRow.company_id)
        .in('key', settingKeys);

      if (invSettings && invSettings.length > 0) {
        const parsed: Record<string, unknown> = {};
        for (const s of invSettings) {
          try { parsed[s.key] = JSON.parse(s.value); } catch { parsed[s.key] = s.value; }
        }
        invoiceSettings = {
          cc_fee_enabled: parsed.invoice_cc_fee_enabled ?? true,
          cc_fee_percent: parsed.invoice_cc_fee_percent ?? 1.9,
          accept_credit_card: parsed.invoice_accept_credit_card ?? false,
          show_preferred_payment_note: parsed.invoice_show_preferred_payment_note ?? true,
          preferred_payment_note: parsed.invoice_preferred_payment_note ?? 'We accept ACH transfers, checks, and cash at no additional fee. Credit card payments include a {cc_fee_percent}% processing fee.',
        };
      }
    }

    return new Response(JSON.stringify({
      token_id: tokenRow.id,
      document_type: tokenRow.document_type,
      document,
      line_items: lineItems,
      company,
      customer,
      business_unit: businessUnit,
      approval,
      payments: paymentsData,
      payment_config: paymentConfig,
      google_place_id: company?.google_place_id || null,
      invoice_settings: invoiceSettings
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('get-portal-document error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

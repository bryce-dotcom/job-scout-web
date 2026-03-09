import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// QuickBooks Online OAuth 2.0 + data sync
// Actions: get_auth_url, exchange_code, refresh, disconnect, sync_invoices, sync_customers
serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const body = await req.json();
    const { action, company_id } = body;

    if (!action || !company_id) {
      return new Response(JSON.stringify({ error: 'action and company_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Get QB config from settings
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', company_id)
      .eq('key', 'quickbooks_config')
      .single();

    const config = setting?.value ? JSON.parse(setting.value) : {};

    // ─── GET AUTH URL ───
    if (action === 'get_auth_url') {
      const { redirect_uri } = body;

      if (!config.client_id || !config.client_secret) {
        return new Response(JSON.stringify({ error: 'QuickBooks Client ID and Client Secret are required. Configure them in Settings > Integrations.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const isProduction = config.environment === 'production';
      const authBase = isProduction
        ? 'https://appcenter.intuit.com/connect/oauth2'
        : 'https://appcenter.intuit.com/connect/oauth2';

      const scopes = 'com.intuit.quickbooks.accounting';
      const state = crypto.randomUUID();

      // Store state for CSRF verification
      await saveConfig(supabase, company_id, { ...config, oauth_state: state });

      const authUrl = `${authBase}?client_id=${encodeURIComponent(config.client_id)}&redirect_uri=${encodeURIComponent(redirect_uri)}&response_type=code&scope=${encodeURIComponent(scopes)}&state=${state}`;

      return new Response(JSON.stringify({ auth_url: authUrl, state }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── EXCHANGE CODE ───
    if (action === 'exchange_code') {
      const { code, realm_id, redirect_uri, state } = body;

      if (!code || !realm_id) {
        return new Response(JSON.stringify({ error: 'code and realm_id are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Verify state (CSRF protection)
      if (config.oauth_state && state !== config.oauth_state) {
        return new Response(JSON.stringify({ error: 'Invalid state parameter' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
      const credentials = btoa(`${config.client_id}:${config.client_secret}`);

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: redirect_uri || `${Deno.env.get('PORTAL_BASE_URL') || 'https://app.jobscout.com'}/settings?tab=integrations&qb_callback=true`,
        }),
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.access_token) {
        return new Response(JSON.stringify({ error: tokenData.error_description || 'Failed to exchange code' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // Store tokens
      const updatedConfig = {
        ...config,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        realm_id,
        token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + (tokenData.x_refresh_token_expires_in || 8726400) * 1000).toISOString(),
        connected: true,
        connected_at: new Date().toISOString(),
        oauth_state: null,
      };

      await saveConfig(supabase, company_id, updatedConfig);

      // Get company info from QBO to confirm connection
      let companyName = null;
      try {
        const isProduction = config.environment === 'production';
        const apiBase = isProduction
          ? 'https://quickbooks.api.intuit.com'
          : 'https://sandbox-quickbooks.api.intuit.com';

        const infoRes = await fetch(`${apiBase}/v3/company/${realm_id}/companyinfo/${realm_id}?minorversion=65`, {
          headers: {
            'Authorization': `Bearer ${tokenData.access_token}`,
            'Accept': 'application/json',
          },
        });
        if (infoRes.ok) {
          const infoData = await infoRes.json();
          companyName = infoData?.CompanyInfo?.CompanyName;
        }
      } catch { /* ignore */ }

      return new Response(JSON.stringify({ success: true, company_name: companyName, realm_id }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── REFRESH ───
    if (action === 'refresh') {
      if (!config.refresh_token) {
        return new Response(JSON.stringify({ error: 'No refresh token found. Please reconnect QuickBooks.' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
      const credentials = btoa(`${config.client_id}:${config.client_secret}`);

      const tokenRes = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: config.refresh_token,
        }),
      });

      const tokenData = await tokenRes.json();

      if (!tokenRes.ok || !tokenData.access_token) {
        await saveConfig(supabase, company_id, { ...config, connected: false });
        return new Response(JSON.stringify({ error: 'Token refresh failed. Please reconnect QuickBooks.', expired: true }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      await saveConfig(supabase, company_id, {
        ...config,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token || config.refresh_token,
        token_expires_at: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString(),
      });

      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── DISCONNECT ───
    if (action === 'disconnect') {
      // Revoke token if possible
      if (config.access_token) {
        try {
          await fetch('https://developer.api.intuit.com/v2/oauth2/tokens/revoke', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: config.access_token }),
          });
        } catch { /* best effort */ }
      }

      await saveConfig(supabase, company_id, {
        ...config,
        access_token: null,
        refresh_token: null,
        realm_id: null,
        connected: false,
        connected_at: null,
        token_expires_at: null,
        refresh_token_expires_at: null,
      });

      return new Response(JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── SYNC INVOICES ───
    if (action === 'sync_invoices') {
      const token = await getValidToken(supabase, company_id, config);
      if (!token) {
        return new Response(JSON.stringify({ error: 'QuickBooks not connected or token expired' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const isProduction = config.environment === 'production';
      const apiBase = isProduction
        ? 'https://quickbooks.api.intuit.com'
        : 'https://sandbox-quickbooks.api.intuit.com';

      // Fetch recent invoices from QBO
      const since = body.since || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const query = `SELECT * FROM Invoice WHERE MetaData.LastUpdatedTime >= '${since}' MAXRESULTS 100`;

      const qbRes = await fetch(
        `${apiBase}/v3/company/${config.realm_id}/query?query=${encodeURIComponent(query)}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!qbRes.ok) {
        const errData = await qbRes.text();
        return new Response(JSON.stringify({ error: `QBO query failed: ${errData}` }),
          { status: qbRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const qbData = await qbRes.json();
      const qbInvoices = qbData?.QueryResponse?.Invoice || [];

      // Map QBO invoices and upsert into our invoices table
      let synced = 0;
      let errors = 0;

      for (const qbInv of qbInvoices) {
        try {
          // Map QB customer to our customer if possible
          let customerId = null;
          if (qbInv.CustomerRef?.value) {
            const { data: cust } = await supabase
              .from('customers')
              .select('id')
              .eq('company_id', company_id)
              .eq('qb_customer_id', qbInv.CustomerRef.value)
              .single();
            customerId = cust?.id || null;
          }

          const invoiceData = {
            company_id,
            customer_id: customerId,
            amount: parseFloat(qbInv.TotalAmt) || 0,
            payment_status: mapQBPaymentStatus(qbInv.Balance, qbInv.TotalAmt),
            job_description: qbInv.Line
              ?.filter((l: Record<string, unknown>) => l.DetailType === 'SalesItemLineDetail')
              .map((l: Record<string, unknown>) => l.Description)
              .filter(Boolean)
              .join('; ') || null,
            qb_invoice_id: qbInv.Id,
            qb_sync_at: new Date().toISOString(),
          };

          // Upsert by qb_invoice_id
          const { data: existing } = await supabase
            .from('invoices')
            .select('id')
            .eq('company_id', company_id)
            .eq('qb_invoice_id', qbInv.Id)
            .single();

          if (existing) {
            await supabase.from('invoices').update(invoiceData).eq('id', existing.id);
          } else {
            await supabase.from('invoices').insert(invoiceData);
          }
          synced++;
        } catch (e) {
          console.error('Invoice sync error:', e);
          errors++;
        }
      }

      // Save last sync time
      await saveConfig(supabase, company_id, { ...config, last_invoice_sync: new Date().toISOString() });

      return new Response(JSON.stringify({ success: true, synced, errors, total: qbInvoices.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── SYNC CUSTOMERS ───
    if (action === 'sync_customers') {
      const token = await getValidToken(supabase, company_id, config);
      if (!token) {
        return new Response(JSON.stringify({ error: 'QuickBooks not connected or token expired' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const isProduction = config.environment === 'production';
      const apiBase = isProduction
        ? 'https://quickbooks.api.intuit.com'
        : 'https://sandbox-quickbooks.api.intuit.com';

      const since = body.since || new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const query = `SELECT * FROM Customer WHERE MetaData.LastUpdatedTime >= '${since}' MAXRESULTS 200`;

      const qbRes = await fetch(
        `${apiBase}/v3/company/${config.realm_id}/query?query=${encodeURIComponent(query)}&minorversion=65`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json',
          },
        }
      );

      if (!qbRes.ok) {
        const errData = await qbRes.text();
        return new Response(JSON.stringify({ error: `QBO query failed: ${errData}` }),
          { status: qbRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      const qbData = await qbRes.json();
      const qbCustomers = qbData?.QueryResponse?.Customer || [];

      let synced = 0;
      let errors = 0;

      for (const qbCust of qbCustomers) {
        try {
          const custData = {
            company_id,
            name: qbCust.DisplayName || `${qbCust.GivenName || ''} ${qbCust.FamilyName || ''}`.trim(),
            email: qbCust.PrimaryEmailAddr?.Address || null,
            phone: qbCust.PrimaryPhone?.FreeFormNumber || null,
            address: formatQBAddress(qbCust.BillAddr),
            business_name: qbCust.CompanyName || null,
            qb_customer_id: qbCust.Id,
            qb_sync_at: new Date().toISOString(),
          };

          // Upsert by qb_customer_id
          const { data: existing } = await supabase
            .from('customers')
            .select('id')
            .eq('company_id', company_id)
            .eq('qb_customer_id', qbCust.Id)
            .single();

          if (existing) {
            await supabase.from('customers').update(custData).eq('id', existing.id);
          } else {
            await supabase.from('customers').insert(custData);
          }
          synced++;
        } catch (e) {
          console.error('Customer sync error:', e);
          errors++;
        }
      }

      await saveConfig(supabase, company_id, { ...config, last_customer_sync: new Date().toISOString() });

      return new Response(JSON.stringify({ success: true, synced, errors, total: qbCustomers.length }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ─── STATUS ───
    if (action === 'status') {
      return new Response(JSON.stringify({
        connected: !!config.connected,
        realm_id: config.realm_id || null,
        connected_at: config.connected_at || null,
        last_invoice_sync: config.last_invoice_sync || null,
        last_customer_sync: config.last_customer_sync || null,
        environment: config.environment || 'sandbox',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('quickbooks-oauth error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

// ─── Helpers ───

async function saveConfig(supabase: ReturnType<typeof createClient>, companyId: string, config: Record<string, unknown>) {
  const valueStr = JSON.stringify(config);
  const { data: existing } = await supabase
    .from('settings')
    .select('id')
    .eq('company_id', companyId)
    .eq('key', 'quickbooks_config')
    .single();

  if (existing) {
    await supabase.from('settings').update({ value: valueStr }).eq('id', existing.id);
  } else {
    await supabase.from('settings').insert({ company_id: companyId, key: 'quickbooks_config', value: valueStr });
  }
}

async function getValidToken(
  supabase: ReturnType<typeof createClient>,
  companyId: string,
  config: Record<string, unknown>
): Promise<string | null> {
  if (!config.access_token || !config.connected) return null;

  // Check if token is expired
  if (config.token_expires_at && new Date(config.token_expires_at as string) < new Date()) {
    // Try refresh
    if (!config.refresh_token || !config.client_id || !config.client_secret) return null;

    const tokenUrl = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';
    const credentials = btoa(`${config.client_id}:${config.client_secret}`);

    const tokenRes = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: config.refresh_token as string,
      }),
    });

    const tokenData = await tokenRes.json();

    if (!tokenRes.ok || !tokenData.access_token) {
      await saveConfig(supabase, companyId, { ...config, connected: false });
      return null;
    }

    config.access_token = tokenData.access_token;
    config.refresh_token = tokenData.refresh_token || config.refresh_token;
    config.token_expires_at = new Date(Date.now() + (tokenData.expires_in || 3600) * 1000).toISOString();
    await saveConfig(supabase, companyId, config);

    return tokenData.access_token;
  }

  return config.access_token as string;
}

function mapQBPaymentStatus(balance: number, total: number): string {
  if (balance <= 0) return 'Paid';
  if (balance < total) return 'Partial';
  return 'Unpaid';
}

function formatQBAddress(addr: Record<string, string> | null): string | null {
  if (!addr) return null;
  const parts = [addr.Line1, addr.Line2, addr.City, addr.CountrySubDivisionCode, addr.PostalCode].filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
}

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const CC_API_BASE = 'https://api.cc.email/v3';
const CC_AUTH_BASE = 'https://authz.constantcontact.com/oauth2/default/v1';
const THROTTLE_MS = 250; // 4 requests/sec

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// Helper to query Supabase REST API
async function querySupabase(table: string, params: string = ''): Promise<any[]> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?${params}`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return [];
  try {
    const res = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${key}`,
        'apikey': key,
      }
    });
    if (!res.ok) return [];
    return res.json();
  } catch {
    return [];
  }
}

// Helper to write/update Supabase REST API
async function upsertSupabase(
  table: string,
  body: Record<string, unknown>,
  method: 'POST' | 'PATCH' = 'POST',
  params: string = ''
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const url = `${Deno.env.get('SUPABASE_URL')}/rest/v1/${table}?${params}`;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!key) return { ok: false, error: 'Missing service role key' };
  try {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${key}`,
      'apikey': key,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    };
    if (method === 'POST') {
      headers['Prefer'] = 'resolution=merge-duplicates,return=representation';
    }
    const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const errText = await res.text();
      return { ok: false, error: errText };
    }
    const data = await res.json();
    return { ok: true, data };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

// Helper to get valid CC access token (auto-refresh if expired)
async function getCcToken(companyId: number): Promise<string | null> {
  const integrations = await querySupabase('cc_integrations', `company_id=eq.${companyId}&select=*`);
  if (!integrations.length) return null;
  const integration = integrations[0];

  if (new Date(integration.token_expires_at) < new Date()) {
    // Token expired, refresh via cc-oauth function internally
    const refreshed = await refreshToken(integration, companyId);
    if (!refreshed) return null;
    return refreshed;
  }

  return integration.access_token;
}

// Refresh an expired token directly (avoids calling another edge function)
async function refreshToken(integration: any, companyId: number): Promise<string | null> {
  if (!integration.refresh_token) return null;

  const clientId = Deno.env.get('CC_CLIENT_ID') || '';
  const clientSecret = Deno.env.get('CC_CLIENT_SECRET') || '';
  const basicAuth = btoa(`${clientId}:${clientSecret}`);

  try {
    const tokenRes = await fetch(`${CC_AUTH_BASE}/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: integration.refresh_token,
      }).toString(),
    });

    if (!tokenRes.ok) {
      console.error('Token refresh failed:', tokenRes.status);
      await upsertSupabase(
        'cc_integrations',
        { status: 'expired', updated_at: new Date().toISOString() },
        'PATCH',
        `company_id=eq.${companyId}`
      );
      return null;
    }

    const tokenData = await tokenRes.json();
    const expiresIn = tokenData.expires_in || 7200;
    const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    await upsertSupabase(
      'cc_integrations',
      {
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        token_expires_at: tokenExpiresAt,
        status: 'active',
        updated_at: new Date().toISOString(),
      },
      'PATCH',
      `company_id=eq.${companyId}`
    );

    return tokenData.access_token;
  } catch (err) {
    console.error('Token refresh error:', (err as Error).message);
    return null;
  }
}

// Get or create a CC contact list by name
async function getOrCreateList(accessToken: string, listName: string): Promise<string | null> {
  try {
    // Check for existing list
    const listsRes = await fetch(`${CC_API_BASE}/contact_lists`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    if (listsRes.ok) {
      const listsData = await listsRes.json();
      const existing = (listsData.lists || []).find((l: any) => l.name === listName);
      if (existing) return existing.list_id;
    }

    // Create new list
    const createRes = await fetch(`${CC_API_BASE}/contact_lists`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: listName,
        description: `Auto-synced from Job Scout`,
        favorite: false,
      }),
    });

    if (createRes.ok) {
      const newList = await createRes.json();
      return newList.list_id;
    }

    console.error('Failed to create CC list:', createRes.status);
    return null;
  } catch (err) {
    console.error('List create/get error:', (err as Error).message);
    return null;
  }
}

// Create or update a contact in Constant Contact
async function syncContact(
  accessToken: string,
  email: string,
  firstName: string | null,
  lastName: string | null,
  phone: string | null,
  address: { street?: string; city?: string; state?: string; zip?: string } | null,
  listIds: string[]
): Promise<{ action: 'created' | 'updated' | 'error'; cc_contact_id?: string; error?: string }> {
  try {
    const contactBody: Record<string, unknown> = {
      email_address: { address: email, permission_to_send: 'implicit' },
      first_name: firstName || '',
      last_name: lastName || '',
      list_memberships: listIds,
    };

    if (phone) {
      contactBody.phone_numbers = [{ phone_number: phone, kind: 'main' }];
    }

    if (address && (address.street || address.city)) {
      contactBody.street_addresses = [{
        kind: 'main',
        street: address.street || '',
        city: address.city || '',
        state: address.state || '',
        postal_code: address.zip || '',
        country: 'US',
      }];
    }

    const res = await fetch(`${CC_API_BASE}/contacts/sign_up_form`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...contactBody,
        create_source: 'Account',
      }),
    });

    if (res.status === 200) {
      // Contact already existed — updated
      const data = await res.json();
      return { action: 'updated', cc_contact_id: data.contact_id };
    }

    if (res.status === 201) {
      // New contact created
      const data = await res.json();
      return { action: 'created', cc_contact_id: data.contact_id };
    }

    // Handle conflict (409) — contact exists, try update via PUT
    if (res.status === 409) {
      const conflictData = await res.json();
      const existingContactId = conflictData.contact_id;
      if (existingContactId) {
        return { action: 'updated', cc_contact_id: existingContactId };
      }
    }

    const errText = await res.text();
    return { action: 'error', error: `CC API ${res.status}: ${errText}` };
  } catch (err) {
    return { action: 'error', error: (err as Error).message };
  }
}

// ── Main Handler ─────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { company_id } = await req.json();

    if (!company_id) {
      return new Response(JSON.stringify({ success: false, error: 'company_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get CC access token
    const accessToken = await getCcToken(company_id);
    if (!accessToken) {
      return new Response(JSON.stringify({ success: false, error: 'No valid Constant Contact connection — please authorize first' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get or create CC lists
    const [customerListId, leadListId] = await Promise.all([
      getOrCreateList(accessToken, 'Job Scout Customers'),
      getOrCreateList(accessToken, 'Job Scout Leads'),
    ]);

    if (!customerListId || !leadListId) {
      return new Response(JSON.stringify({ success: false, error: 'Failed to create/get Constant Contact contact lists' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch customers with marketing opt-in and valid emails
    const customers = await querySupabase(
      'customers',
      `company_id=eq.${company_id}&marketing_opt_in=eq.true&email=neq.&email=not.is.null&select=id,name,contact_first_name,contact_last_name,email,phone,address,city,state,zip`
    );

    // Fetch leads with valid emails
    const leads = await querySupabase(
      'leads',
      `company_id=eq.${company_id}&email=neq.&email=not.is.null&select=id,customer_name,email,phone,address,city,state,zip`
    );

    // Fetch existing contact mappings to skip already-synced contacts
    const existingMaps = await querySupabase(
      'cc_contact_map',
      `company_id=eq.${company_id}&select=customer_id,lead_id,email,cc_contact_id`
    );
    const mappedEmails = new Set(existingMaps.map((m: any) => m.email?.toLowerCase()));

    const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };
    const errorDetails: string[] = [];

    // Sync customers
    for (const customer of customers) {
      if (!customer.email) { stats.skipped++; continue; }

      // Parse first/last name from contact fields or full name
      let firstName = customer.contact_first_name || '';
      let lastName = customer.contact_last_name || '';
      if (!firstName && customer.name) {
        const parts = customer.name.trim().split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }

      const result = await syncContact(
        accessToken,
        customer.email,
        firstName,
        lastName,
        customer.phone,
        { street: customer.address, city: customer.city, state: customer.state, zip: customer.zip },
        [customerListId]
      );

      if (result.action === 'error') {
        stats.errors++;
        errorDetails.push(`Customer ${customer.email}: ${result.error}`);
      } else {
        stats[result.action === 'created' ? 'created' : 'updated']++;

        // Update contact map
        if (result.cc_contact_id) {
          await upsertSupabase('cc_contact_map', {
            company_id,
            customer_id: customer.id,
            lead_id: null,
            cc_contact_id: result.cc_contact_id,
            email: customer.email.toLowerCase(),
            synced_at: new Date().toISOString(),
            sync_status: 'synced',
          }, 'POST', 'on_conflict=company_id,email');
        }
      }

      // Throttle to 4 requests/sec
      await wait(THROTTLE_MS);
    }

    // Sync leads
    for (const lead of leads) {
      if (!lead.email) { stats.skipped++; continue; }

      // Parse name from customer_name
      let firstName = '';
      let lastName = '';
      if (lead.customer_name) {
        const parts = lead.customer_name.trim().split(/\s+/);
        firstName = parts[0] || '';
        lastName = parts.slice(1).join(' ') || '';
      }

      const result = await syncContact(
        accessToken,
        lead.email,
        firstName,
        lastName,
        lead.phone,
        { street: lead.address, city: lead.city, state: lead.state, zip: lead.zip },
        [leadListId]
      );

      if (result.action === 'error') {
        stats.errors++;
        errorDetails.push(`Lead ${lead.email}: ${result.error}`);
      } else {
        stats[result.action === 'created' ? 'created' : 'updated']++;

        if (result.cc_contact_id) {
          await upsertSupabase('cc_contact_map', {
            company_id,
            customer_id: null,
            lead_id: lead.id,
            cc_contact_id: result.cc_contact_id,
            email: lead.email.toLowerCase(),
            synced_at: new Date().toISOString(),
            sync_status: 'synced',
          }, 'POST', 'on_conflict=company_id,email');
        }
      }

      await wait(THROTTLE_MS);
    }

    // Update last_contact_sync timestamp
    await upsertSupabase(
      'cc_integrations',
      { last_contact_sync: new Date().toISOString(), updated_at: new Date().toISOString() },
      'PATCH',
      `company_id=eq.${company_id}`
    );

    console.log(`Contact sync for company ${company_id}: created=${stats.created}, updated=${stats.updated}, skipped=${stats.skipped}, errors=${stats.errors}`);

    return new Response(JSON.stringify({
      success: true,
      ...stats,
      total_customers: customers.length,
      total_leads: leads.length,
      customer_list_id: customerListId,
      lead_list_id: leadListId,
      ...(errorDetails.length > 0 ? { error_details: errorDetails.slice(0, 10) } : {}),
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

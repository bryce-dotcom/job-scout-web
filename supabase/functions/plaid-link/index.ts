import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Plaid Link + Transaction Sync
// Actions: create_link_token, exchange_public_token, sync_transactions, get_accounts, disconnect, sync_all
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
      return jsonResponse({ error: 'action and company_id are required' }, 400);
    }

    // Get Plaid config from settings
    const { data: setting } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', company_id)
      .eq('key', 'plaid_config')
      .single();

    const config = setting?.value ? JSON.parse(setting.value) : {};

    // Use secrets if available, fall back to config
    const clientId = Deno.env.get('PLAID_CLIENT_ID') || config.client_id;
    const secret = Deno.env.get('PLAID_SECRET') || config.secret;
    const plaidEnv = Deno.env.get('PLAID_ENV') || config.environment || 'sandbox';
    const plaidBase = plaidEnv === 'production'
      ? 'https://production.plaid.com'
      : `https://${plaidEnv}.plaid.com`;

    // ─── CREATE LINK TOKEN ───
    if (action === 'create_link_token') {
      if (!clientId || !secret) {
        return jsonResponse({ error: 'Plaid Client ID and Secret are required. Configure them in Settings > Integrations or as edge function secrets.' }, 400);
      }

      const res = await fetch(`${plaidBase}/link/token/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          secret,
          user: { client_user_id: String(company_id) },
          client_name: 'JobScout',
          products: ['transactions'],
          country_codes: ['US'],
          language: 'en',
        }),
      });

      const data = await res.json();
      console.log('Plaid create_link_token response:', JSON.stringify({ ok: res.ok, status: res.status, data }));
      if (!res.ok || !data.link_token) {
        return jsonResponse({ error: data.error_message || data.display_message || JSON.stringify(data) || 'Failed to create link token' }, 400);
      }

      return jsonResponse({ link_token: data.link_token });
    }

    // ─── EXCHANGE PUBLIC TOKEN ───
    if (action === 'exchange_public_token') {
      const { public_token, institution } = body;
      if (!public_token) {
        return jsonResponse({ error: 'public_token is required' }, 400);
      }

      // Exchange for access token
      const exchangeRes = await fetch(`${plaidBase}/item/public_token/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, public_token }),
      });

      const exchangeData = await exchangeRes.json();
      if (!exchangeRes.ok || !exchangeData.access_token) {
        return jsonResponse({ error: exchangeData.error_message || 'Failed to exchange token' }, 400);
      }

      const accessToken = exchangeData.access_token;
      const itemId = exchangeData.item_id;

      // Get accounts
      const accountsRes = await fetch(`${plaidBase}/accounts/get`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, access_token: accessToken }),
      });

      const accountsData = await accountsRes.json();
      const accounts = accountsData.accounts || [];

      // Store item in config
      const updatedConfig = {
        ...config,
        items: {
          ...(config.items || {}),
          [itemId]: {
            access_token: accessToken,
            institution_name: institution?.name || 'Unknown',
            institution_id: institution?.institution_id || null,
            connected_at: new Date().toISOString(),
          }
        }
      };
      await saveConfig(supabase, company_id, updatedConfig);

      // Insert connected_accounts
      const inserted: Array<Record<string, unknown>> = [];
      for (const acct of accounts) {
        const row = {
          company_id,
          plaid_item_id: itemId,
          plaid_account_id: acct.account_id,
          institution_name: institution?.name || 'Unknown',
          institution_id: institution?.institution_id || null,
          account_name: acct.name,
          account_type: acct.type,
          account_subtype: acct.subtype,
          mask: acct.mask,
          current_balance: acct.balances?.current ?? null,
          available_balance: acct.balances?.available ?? null,
          currency_code: acct.balances?.iso_currency_code || 'USD',
          status: 'active',
        };

        // Upsert by plaid_account_id
        const { data: existing } = await supabase
          .from('connected_accounts')
          .select('id')
          .eq('plaid_account_id', acct.account_id)
          .single();

        if (existing) {
          await supabase.from('connected_accounts').update(row).eq('id', existing.id);
          inserted.push({ ...row, id: existing.id });
        } else {
          const { data: newRow } = await supabase.from('connected_accounts').insert(row).select().single();
          if (newRow) inserted.push(newRow);
        }

        // Also create/update matching bank_accounts row
        const bankRow = {
          company_id,
          name: `${institution?.name || 'Bank'} - ${acct.name} (${acct.mask})`,
          account_type: acct.type,
          current_balance: acct.balances?.current ?? 0,
          connected_account_id: existing?.id || inserted[inserted.length - 1]?.id,
        };

        const { data: existingBank } = await supabase
          .from('bank_accounts')
          .select('id')
          .eq('company_id', company_id)
          .ilike('name', `%${acct.mask}%`)
          .single();

        if (existingBank) {
          await supabase.from('bank_accounts').update(bankRow).eq('id', existingBank.id);
        } else {
          await supabase.from('bank_accounts').insert(bankRow);
        }
      }

      return jsonResponse({ success: true, accounts: inserted, item_id: itemId });
    }

    // ─── SYNC TRANSACTIONS ───
    if (action === 'sync_transactions') {
      const { connected_account_id } = body;

      // Get the connected account
      const { data: account } = await supabase
        .from('connected_accounts')
        .select('*')
        .eq('id', connected_account_id)
        .single();

      if (!account) return jsonResponse({ error: 'Account not found' }, 404);

      const item = config.items?.[account.plaid_item_id];
      if (!item?.access_token) return jsonResponse({ error: 'No access token for this account' }, 400);

      let cursor = account.sync_cursor || undefined;
      let added = 0;
      let modified = 0;
      let removed = 0;
      let hasMore = true;

      while (hasMore) {
        const syncBody: Record<string, unknown> = {
          client_id: clientId,
          secret,
          access_token: item.access_token,
        };
        if (cursor) syncBody.cursor = cursor;

        const syncRes = await fetch(`${plaidBase}/transactions/sync`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(syncBody),
        });

        const syncData = await syncRes.json();
        if (!syncRes.ok) {
          return jsonResponse({ error: syncData.error_message || 'Sync failed' }, 400);
        }

        // Process added transactions
        for (const txn of (syncData.added || [])) {
          const row = mapTransaction(txn, company_id, account.id);
          const { data: existing } = await supabase
            .from('plaid_transactions')
            .select('id')
            .eq('plaid_transaction_id', txn.transaction_id)
            .single();

          if (existing) {
            await supabase.from('plaid_transactions').update(row).eq('id', existing.id);
          } else {
            await supabase.from('plaid_transactions').insert(row);
          }
          added++;
        }

        // Process modified transactions
        for (const txn of (syncData.modified || [])) {
          const row = mapTransaction(txn, company_id, account.id);
          await supabase.from('plaid_transactions').update(row).eq('plaid_transaction_id', txn.transaction_id);
          modified++;
        }

        // Process removed transactions
        for (const txn of (syncData.removed || [])) {
          await supabase.from('plaid_transactions').delete().eq('plaid_transaction_id', txn.transaction_id);
          removed++;
        }

        cursor = syncData.next_cursor;
        hasMore = syncData.has_more;
      }

      // Update cursor and last_synced
      await supabase.from('connected_accounts').update({
        sync_cursor: cursor,
        last_synced: new Date().toISOString(),
      }).eq('id', connected_account_id);

      return jsonResponse({ success: true, added, modified, removed });
    }

    // ─── GET ACCOUNTS (refresh balances) ───
    if (action === 'get_accounts') {
      const results: Array<Record<string, unknown>> = [];

      // Get all active connected accounts for this company
      const { data: accounts } = await supabase
        .from('connected_accounts')
        .select('*')
        .eq('company_id', company_id)
        .eq('status', 'active');

      if (!accounts?.length) return jsonResponse({ accounts: [] });

      // Group by item_id
      const byItem: Record<string, typeof accounts> = {};
      for (const acct of accounts) {
        if (!byItem[acct.plaid_item_id]) byItem[acct.plaid_item_id] = [];
        byItem[acct.plaid_item_id].push(acct);
      }

      for (const [itemId, itemAccounts] of Object.entries(byItem)) {
        const item = config.items?.[itemId];
        if (!item?.access_token) continue;

        try {
          const res = await fetch(`${plaidBase}/accounts/get`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, secret, access_token: item.access_token }),
          });

          const data = await res.json();
          for (const acct of (data.accounts || [])) {
            const match = itemAccounts.find(a => a.plaid_account_id === acct.account_id);
            if (match) {
              await supabase.from('connected_accounts').update({
                current_balance: acct.balances?.current ?? null,
                available_balance: acct.balances?.available ?? null,
              }).eq('id', match.id);

              // Update bank_accounts too
              if (match.id) {
                await supabase.from('bank_accounts').update({
                  current_balance: acct.balances?.current ?? 0,
                }).eq('connected_account_id', match.id);
              }

              results.push({ ...match, current_balance: acct.balances?.current, available_balance: acct.balances?.available });
            }
          }
        } catch (e) {
          console.error(`Error refreshing item ${itemId}:`, e);
        }
      }

      return jsonResponse({ accounts: results });
    }

    // ─── DISCONNECT ───
    if (action === 'disconnect') {
      const { item_id } = body;
      if (!item_id) return jsonResponse({ error: 'item_id is required' }, 400);

      const item = config.items?.[item_id];
      if (item?.access_token) {
        try {
          await fetch(`${plaidBase}/item/remove`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId, secret, access_token: item.access_token }),
          });
        } catch { /* best effort */ }
      }

      // Mark accounts as disconnected
      await supabase.from('connected_accounts')
        .update({ status: 'disconnected' })
        .eq('company_id', company_id)
        .eq('plaid_item_id', item_id);

      // Remove from config
      const updatedItems = { ...(config.items || {}) };
      delete updatedItems[item_id];
      await saveConfig(supabase, company_id, { ...config, items: updatedItems });

      return jsonResponse({ success: true });
    }

    // ─── SYNC ALL ───
    if (action === 'sync_all') {
      const { data: accounts } = await supabase
        .from('connected_accounts')
        .select('id, plaid_item_id')
        .eq('company_id', company_id)
        .eq('status', 'active');

      if (!accounts?.length) return jsonResponse({ success: true, total_added: 0, total_modified: 0, accounts_synced: 0 });

      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;
      let synced = 0;

      for (const account of accounts) {
        const item = config.items?.[account.plaid_item_id];
        if (!item?.access_token) continue;

        let cursor = undefined;

        // Get current cursor
        const { data: fullAcct } = await supabase
          .from('connected_accounts')
          .select('sync_cursor')
          .eq('id', account.id)
          .single();
        cursor = fullAcct?.sync_cursor || undefined;

        let hasMore = true;
        while (hasMore) {
          const syncBody: Record<string, unknown> = {
            client_id: clientId,
            secret,
            access_token: item.access_token,
          };
          if (cursor) syncBody.cursor = cursor;

          const syncRes = await fetch(`${plaidBase}/transactions/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(syncBody),
          });

          const syncData = await syncRes.json();
          if (!syncRes.ok) break;

          for (const txn of (syncData.added || [])) {
            const row = mapTransaction(txn, company_id, account.id);
            const { data: existing } = await supabase
              .from('plaid_transactions')
              .select('id')
              .eq('plaid_transaction_id', txn.transaction_id)
              .single();

            if (existing) {
              await supabase.from('plaid_transactions').update(row).eq('id', existing.id);
            } else {
              await supabase.from('plaid_transactions').insert(row);
            }
            totalAdded++;
          }

          for (const txn of (syncData.modified || [])) {
            const row = mapTransaction(txn, company_id, account.id);
            await supabase.from('plaid_transactions').update(row).eq('plaid_transaction_id', txn.transaction_id);
            totalModified++;
          }

          for (const txn of (syncData.removed || [])) {
            await supabase.from('plaid_transactions').delete().eq('plaid_transaction_id', txn.transaction_id);
            totalRemoved++;
          }

          cursor = syncData.next_cursor;
          hasMore = syncData.has_more;
        }

        await supabase.from('connected_accounts').update({
          sync_cursor: cursor,
          last_synced: new Date().toISOString(),
        }).eq('id', account.id);

        synced++;
      }

      return jsonResponse({ success: true, total_added: totalAdded, total_modified: totalModified, total_removed: totalRemoved, accounts_synced: synced });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);

  } catch (error) {
    console.error('plaid-link error:', error);
    return jsonResponse({ error: error.message }, 500);
  }
});

// ─── Helpers ───

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

async function saveConfig(supabase: ReturnType<typeof createClient>, companyId: string, config: Record<string, unknown>) {
  const valueStr = JSON.stringify(config);
  const { data: existing } = await supabase
    .from('settings')
    .select('id')
    .eq('company_id', companyId)
    .eq('key', 'plaid_config')
    .single();

  if (existing) {
    await supabase.from('settings').update({ value: valueStr }).eq('id', existing.id);
  } else {
    await supabase.from('settings').insert({ company_id: companyId, key: 'plaid_config', value: valueStr });
  }
}

function mapTransaction(txn: Record<string, unknown>, companyId: string, connectedAccountId: number) {
  return {
    company_id: companyId,
    connected_account_id: connectedAccountId,
    plaid_transaction_id: txn.transaction_id,
    amount: txn.amount,
    date: txn.date,
    authorized_date: txn.authorized_date || null,
    merchant_name: txn.merchant_name || null,
    name: txn.name || null,
    plaid_category: txn.category || null,
    plaid_personal_finance_category: txn.personal_finance_category?.primary || null,
    pending: txn.pending || false,
  };
}

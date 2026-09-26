import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  groupByItem, pullItem, previewAttribution, buildAccountMap,
  attribute, itemCursor, mapTransaction, chunk,
} from "../_shared/plaidSync.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Plaid Link + Transaction Sync
// Actions: create_link_token, exchange_public_token, sync_transactions, get_accounts, disconnect, sync_all,
//          ach_details (admin-only: routing + account numbers via Plaid Auth, for payroll's ACH file)
// ach_details and update-mode link tokens return or use bank secrets, so the
// caller must be an admin OF THE COMPANY IN THE BODY — from the JWT, never
// from the body. Same shape as payroll-dd-export.
function jwtEmail(req: Request): string | null {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearers+/i, '').trim();
    const part = token.split('.')[1];
    if (!part) return null;
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
    const payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    return (payload?.email || '').toLowerCase() || null;
  } catch { return null; }
}

async function callerIsAdminOf(sb: any, req: Request, companyId: number): Promise<boolean> {
  const email = jwtEmail(req);
  if (!email) return false;
  const { data } = await sb.from('employees')
    .select('company_id, role, user_role, is_admin, is_developer')
    .ilike('email', email).eq('active', true).eq('company_id', companyId).limit(1);
  const e = data?.[0];
  if (!e) return false;
  return e.is_developer === true || e.is_admin === true
    || ['Admin', 'admin', 'Owner', 'owner'].includes(e.user_role)
    || ['Admin', 'Owner'].includes(e.role);
}

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

    // Plaid item health on every row of the item. A bank that needs a
    // re-login (ITEM_LOGIN_REQUIRED) used to fail silently: get_accounts
    // swallowed the error and returned [], the nightly cron logged a warning
    // nobody read, and Books kept showing the balances from the day the
    // login broke (HHH, 2026-09-23 → 25). Books reads these to say so.
    const stampItemError = async (itemId: string, err: { code?: string | null; message: string } | null) => {
      await supabase.from('connected_accounts').update(err
        ? { sync_error: err.message, sync_error_code: err.code || null, sync_error_at: new Date().toISOString() }
        : { sync_error: null, sync_error_code: null, sync_error_at: null })
        .eq('company_id', company_id).eq('plaid_item_id', itemId);
    };

    // A Plaid loan account is a loan in Books: one liabilities row per
    // account (keyed by plaid_account_id), balance mirrored from the account,
    // details (rate, next payment) from /liabilities/get when the lender
    // supports it. Books' LoansCard matches the payments in the bank feed.
    const LOAN_TYPE_BY_SUBTYPE: Record<string, string> = { auto: 'vehicle', mortgage: 'mortgage', 'home equity': 'line_of_credit', 'line of credit': 'line_of_credit', business: 'sba', commercial: 'sba', construction: 'sba', consumer: 'other', student: 'other', overdraft: 'line_of_credit', 'credit card': 'credit_card' };
    const upsertLoanRow = async (acct: Record<string, any>, connectedId: number | null, institutionName: string | null) => {
      const { data: existing } = await supabase.from('liabilities').select('id, source, name').eq('company_id', company_id).eq('plaid_account_id', acct.plaid_account_id || acct.account_id).limit(1);
      const balance = acct.current_balance ?? acct.balances?.current ?? null;
      const patch: Record<string, unknown> = {
        current_balance: balance == null ? undefined : Math.abs(Number(balance)),
        connected_account_id: connectedId, lender: institutionName || undefined, updated_at: new Date().toISOString(),
      };
      if (existing?.[0]) { await supabase.from('liabilities').update(patch).eq('id', existing[0].id); return existing[0].id; }
      const { data: row } = await supabase.from('liabilities').insert({
        company_id, name: acct.account_name || acct.name || 'Loan', lender: institutionName || null,
        liability_type: LOAN_TYPE_BY_SUBTYPE[String(acct.account_subtype || acct.subtype || '').toLowerCase()] || 'other',
        current_balance: balance == null ? 0 : Math.abs(Number(balance)), monthly_payment: 0, status: 'active', source: 'plaid',
        plaid_account_id: acct.plaid_account_id || acct.account_id, connected_account_id: connectedId, match_payee: institutionName || null,
      }).select('id').single();
      return row?.id ?? null;
    };
    const pullLoanDetails = async (accessToken: string, rows: Array<Record<string, any>>): Promise<{ updated: number; warning: string | null }> => {
      const res = await fetch(`${plaidBase}/liabilities/get`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: clientId, secret, access_token: accessToken }),
      });
      const data = await res.json();
      if (!res.ok || data.error_code) {
        // NO_LIABILITY_ACCOUNTS / PRODUCTS_NOT_SUPPORTED / not enabled: the
        // balance still mirrors from the account; only the detail is missing.
        return { updated: 0, warning: data.error_message || data.error_code || `Plaid returned ${res.status}` };
      }
      const byAccount = new Map<string, Record<string, unknown>>();
      for (const m of data.liabilities?.mortgage || []) byAccount.set(m.account_id, {
        interest_rate: m.interest_rate?.percentage ?? null, next_payment_due: m.next_payment_due_date || null, next_payment_amount: m.next_monthly_payment ?? null,
        last_payment_date: m.last_payment_date || null, last_payment_amount: m.last_payment_amount ?? null, origination_date: m.origination_date || null,
        original_principal: m.origination_principal_amount ?? null, term_months: m.loan_term ? parseInt(String(m.loan_term), 10) || null : null,
      });
      for (const s of data.liabilities?.student || []) byAccount.set(s.account_id, {
        interest_rate: s.interest_rate_percentage ?? null, next_payment_due: s.next_payment_due_date || null, next_payment_amount: s.minimum_payment_amount ?? null,
        last_payment_date: s.last_payment_date || null, last_payment_amount: s.last_payment_amount ?? null, origination_date: s.origination_date || null,
        original_principal: s.origination_principal_amount ?? null,
      });
      for (const c of data.liabilities?.credit || []) byAccount.set(c.account_id, {
        interest_rate: (c.aprs || []).find((a: any) => a.apr_type === 'purchase_apr')?.apr_percentage ?? c.aprs?.[0]?.apr_percentage ?? null,
        next_payment_due: c.next_payment_due_date || null, next_payment_amount: c.minimum_payment_amount ?? null,
        last_payment_date: c.last_payment_date || null, last_payment_amount: c.last_payment_amount ?? null,
      });
      let updated = 0;
      for (const r of rows) {
        const d = byAccount.get(r.plaid_account_id);
        if (!d) continue;
        const { error } = await supabase.from('liabilities').update({ ...d, updated_at: new Date().toISOString() }).eq('company_id', company_id).eq('plaid_account_id', r.plaid_account_id);
        if (!error) updated++;
      }
      return { updated, warning: null };
    };

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

      // Bryce: "you have the bank info when it was set up through Plaid —
      // make onboarding simple so the user only sets up the bank once." Auth
      // is what returns routing + account numbers. Optional on a new link so a
      // bank without Auth still links for Books; in update mode it is added to
      // the existing item so payroll can read the numbers without a re-link.
      const updateItemId = body.update_item_id ? String(body.update_item_id) : null;
      let updateAccessToken: string | null = null;
      if (updateItemId) {
        if (!(await callerIsAdminOf(supabase, req, Number(company_id)))) {
          return jsonResponse({ error: 'Only a company admin can update a bank link.' }, 403);
        }
        updateAccessToken = config.items?.[updateItemId]?.access_token || null;
        if (!updateAccessToken) return jsonResponse({ error: 'That bank link was not found.' }, 404);
      }
      const res = await fetch(`${plaidBase}/link/token/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          secret,
          user: { client_user_id: String(company_id) },
          client_name: 'JobScout',
          ...(updateAccessToken
            ? { access_token: updateAccessToken, ...(body.relink ? {} : { products: ['auth'] }) }
            : { products: ['transactions'], optional_products: ['auth', 'liabilities'] }),
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
        if (acct.type === 'loan') {
          await upsertLoanRow(acct, existing?.id || inserted[inserted.length - 1]?.id || null, institution?.name || null);
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

      // Syncing "one account" is not a thing Plaid offers: /transactions/sync is
      // per ITEM. Pretending otherwise is the original bug, so this pulls the
      // item and attributes every transaction to its real account — including
      // the siblings of the account that was asked for.
      const { data: siblings } = await supabase
        .from('connected_accounts')
        .select('id, plaid_item_id, plaid_account_id, account_name, sync_cursor')
        .eq('company_id', company_id)
        .eq('plaid_item_id', account.plaid_item_id)
        .eq('status', 'active')
        .order('id');

      const rows = siblings?.length ? siblings : [account];
      const pull = await pullItem({
        plaidBase,
        clientId,
        secret,
        accessToken: item.access_token,
        cursor: itemCursor(rows),
      });

      const accountMap = buildAccountMap(rows);
      const upserts: Array<Record<string, unknown>> = [];
      let unplaced = 0;
      for (const txn of [...pull.added, ...pull.modified]) {
        const connectedAccountId = attribute(txn, accountMap);
        if (connectedAccountId === null) { unplaced++; continue; }
        upserts.push(mapTransaction(txn, company_id, connectedAccountId));
      }
      for (const batch of chunk(upserts, 500)) {
        const { error: upErr } = await supabase
          .from('plaid_transactions')
          .upsert(batch, { onConflict: 'plaid_transaction_id' });
        if (upErr) return jsonResponse({ error: `Transaction write failed: ${upErr.message}` }, 500);
      }
      for (const batch of chunk(pull.removed, 200)) {
        await supabase.from('plaid_transactions').delete().in('plaid_transaction_id', batch);
      }

      await supabase.from('connected_accounts').update({
        sync_cursor: pull.nextCursor,
        last_synced: new Date().toISOString(),
      }).in('id', rows.map(r => r.id));

      return jsonResponse({
        success: true,
        added: pull.added.length,
        modified: pull.modified.length,
        removed: pull.removed.length,
        accounts_touched: rows.length,
        unattributed: unplaced,
      });
    }

    // ─── GET ACCOUNTS (refresh balances) ───
    // ─── ACH DETAILS (admin only) ───
    // Routing + account numbers for every linked depository account, via
    // Plaid Auth, so Payroll's ACH settings fill from the bank the company
    // already linked. Items linked before Auth was requested come back under
    // needs_relink with Plaid's reason; the client offers update mode.
    if (action === 'ach_details') {
      if (!(await callerIsAdminOf(supabase, req, Number(company_id)))) {
        return jsonResponse({ error: 'Only a company admin can read bank account numbers.' }, 403);
      }
      const items = (config.items || {}) as Record<string, any>;
      const accounts: Array<Record<string, unknown>> = [];
      const needsRelink: Array<Record<string, unknown>> = [];
      for (const [itemId, item] of Object.entries(items)) {
        if (!item?.access_token) continue;
        const r = await fetch(`${plaidBase}/auth/get`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: clientId, secret, access_token: item.access_token }),
        });
        const d = await r.json();
        if (!r.ok) {
          needsRelink.push({ item_id: itemId, institution_name: item.institution_name || 'Bank', error_code: d.error_code || null, error_message: d.error_message || d.display_message || null });
          continue;
        }
        const byId: Record<string, any> = {};
        for (const a of d.accounts || []) byId[a.account_id] = a;
        for (const n of d.numbers?.ach || []) {
          const a = byId[n.account_id] || {};
          if (a.type && a.type !== 'depository') continue;
          accounts.push({
            item_id: itemId,
            account_id: n.account_id,
            institution_name: item.institution_name || 'Bank',
            name: a.name || a.official_name || 'Account',
            mask: a.mask || null,
            subtype: a.subtype || null,
            routing: n.routing,
            account: n.account,
          });
        }
      }
      return jsonResponse({ accounts, needs_relink: needsRelink, linked_items: Object.keys(items).length });
    }

    if (action === 'get_accounts') {
      const results: Array<Record<string, unknown>> = [];
      const errors: Array<Record<string, unknown>> = [];

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
          if (!res.ok || data.error_code) {
            const message = data.error_message || data.display_message || data.error_code || `Plaid returned ${res.status}`;
            await stampItemError(itemId, { code: data.error_code || null, message });
            errors.push({ item: itemId, institution: itemAccounts[0]?.institution_name || null, error_code: data.error_code || null, error: message });
            continue;
          }
          await stampItemError(itemId, null);
          const refreshedAt = new Date().toISOString();
          for (const acct of (data.accounts || [])) {
            const match = itemAccounts.find(a => a.plaid_account_id === acct.account_id);
            if (match) {
              await supabase.from('connected_accounts').update({
                current_balance: acct.balances?.current ?? null,
                available_balance: acct.balances?.available ?? null,
                balance_synced_at: refreshedAt,
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

      return jsonResponse({ accounts: results, errors });
    }

    // ─── SYNC LIABILITIES (loans) ───
    // Mirror every connected loan account into liabilities and read the
    // lender's detail. Runs nightly from the cron after get_accounts, and on
    // demand from the Loans card.
    if (action === 'sync_liabilities') {
      const { data: loanAccts } = await supabase
        .from('connected_accounts')
        .select('id, plaid_item_id, plaid_account_id, institution_name, account_name, account_type, account_subtype, current_balance')
        .eq('company_id', company_id).eq('status', 'active').eq('account_type', 'loan').order('id');
      const warnings: string[] = [];
      let mirrored = 0;
      let updated = 0;
      const byItem: Record<string, typeof loanAccts> = {};
      for (const a of loanAccts || []) {
        await upsertLoanRow(a, a.id, a.institution_name);
        mirrored++;
        (byItem[a.plaid_item_id] ||= []).push(a);
      }
      for (const [itemId, rows] of Object.entries(byItem)) {
        const item = config.items?.[itemId];
        if (!item?.access_token) { warnings.push(`No access token for ${rows?.[0]?.institution_name || itemId}`); continue; }
        try {
          const r = await pullLoanDetails(item.access_token, rows || []);
          updated += r.updated;
          if (r.warning) warnings.push(`${rows?.[0]?.institution_name || itemId}: ${r.warning}`);
        } catch (e) {
          warnings.push(`${rows?.[0]?.institution_name || itemId}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      return jsonResponse({ success: true, loans_mirrored: mirrored, loans_updated: updated, warnings });
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

    // ─── SYNC PREVIEW (read-only) ───
    //
    // Answers one question without writing anything: which account SHOULD each
    // transaction be on? The stored attribution is wrong because the old
    // per-account loop stamped whichever row it was iterating, so this pulls the
    // item's full history, resolves each transaction through txn.account_id, and
    // reports the correct owner beside the count sitting in the table today.
    if (action === 'sync_preview') {
      const { data: accounts } = await supabase
        .from('connected_accounts')
        .select('id, plaid_account_id, plaid_item_id, account_name, sync_cursor')
        .eq('company_id', company_id)
        .eq('status', 'active')
        .order('id');

      if (!accounts?.length) return jsonResponse({ items: [], note: 'no active connected accounts' });

      // What the table says now.
      const stored: Record<string, number> = {};
      for (const a of accounts) {
        const { count } = await supabase
          .from('plaid_transactions')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', company_id)
          .eq('connected_account_id', a.id);
        stored[String(a.id)] = count || 0;
      }

      const out: Array<Record<string, unknown>> = [];
      for (const [itemId, rows] of groupByItem(accounts)) {
        const item = config.items?.[itemId];
        if (!item?.access_token) {
          out.push({ item: itemId, error: 'no access token' });
          continue;
        }
        try {
          // cursor omitted on purpose: a preview wants the whole history so the
          // per-account totals are comparable to what is stored.
          const pull = await pullItem({ plaidBase, clientId, secret, accessToken: item.access_token });
          const preview = previewAttribution([...pull.added, ...pull.modified], rows);
          out.push({
            item: itemId,
            institution: item.institution_name || null,
            pages: pull.pages,
            transactions: pull.added.length + pull.modified.length,
            unattributed: preview.unattributed,
            unknown_plaid_accounts: preview.unknownPlaidAccounts,
            accounts: preview.perAccount.map(a => ({
              account: a.name,
              should_have: a.correct,
              currently_has: stored[String(a.id)] ?? 0,
            })),
          });
        } catch (e) {
          out.push({ item: itemId, error: (e as Error).message });
        }
      }
      return jsonResponse({ dry_run: true, wrote_nothing: true, items: out });
    }

    // ─── SYNC ALL ───
    if (action === 'sync_all') {
      // plaid_account_id and sync_cursor are REQUIRED here: without the former
      // the account map is empty and every transaction is dropped as
      // unattributable, silently writing nothing. Ordered so a run is
      // reproducible — the old query had no ORDER BY, which is why which
      // accounts happened to sync was effectively random.
      const { data: accounts } = await supabase
        .from('connected_accounts')
        .select('id, plaid_item_id, plaid_account_id, account_name, sync_cursor')
        .eq('company_id', company_id)
        .eq('status', 'active')
        .order('id');

      if (!accounts?.length) return jsonResponse({ success: true, total_added: 0, total_modified: 0, accounts_synced: 0 });

      let totalAdded = 0;
      let totalModified = 0;
      let totalRemoved = 0;
      let synced = 0;

      // ONE pull per Plaid item, not per account. /transactions/sync takes an
      // access_token and returns the whole item, so calling it once per account
      // fetched the same data nine times over — and stamped it onto whichever
      // account row the loop was on. See _shared/plaidSync.ts.
      const warnings: string[] = [];
      const itemErrors: Array<Record<string, unknown>> = [];
      for (const [itemId, rows] of groupByItem(accounts)) {
        const item = config.items?.[itemId];
        if (!item?.access_token) {
          warnings.push(`No access token for item ${itemId} — reconnect it in Settings.`);
          continue;
        }

        let pull;
        try {
          pull = await pullItem({
            plaidBase,
            clientId,
            secret,
            accessToken: item.access_token,
            cursor: itemCursor(rows),
          });
        } catch (e) {
          // pullItem throws Plaid's error_message. Record it on the item so
          // Books can show a re-login button, and keep syncing the others.
          const message = e instanceof Error ? e.message : String(e);
          const code = /login|credential|MFA|user action/i.test(message) ? 'ITEM_LOGIN_REQUIRED' : null;
          await stampItemError(itemId, { code, message });
          warnings.push(`${item.institution_name || itemId}: ${message}`);
          itemErrors.push({ item: itemId, institution: item.institution_name || null, error_code: code, error: message });
          continue;
        }
        await stampItemError(itemId, null);

        const accountMap = buildAccountMap(rows);
        const upserts: Array<Record<string, unknown>> = [];
        let unplaced = 0;
        for (const txn of [...pull.added, ...pull.modified]) {
          const connectedAccountId = attribute(txn, accountMap);
          if (connectedAccountId === null) { unplaced++; continue; }
          upserts.push(mapTransaction(txn, company_id, connectedAccountId));
        }

        // Batched upsert on the unique plaid_transaction_id. The old path did a
        // SELECT then an INSERT/UPDATE per transaction — about 29,000 sequential
        // round trips for this item, which is why the sync timed out mid-loop
        // and most accounts never got a cursor at all.
        for (const batch of chunk(upserts, 500)) {
          const { error: upErr } = await supabase
            .from('plaid_transactions')
            .upsert(batch, { onConflict: 'plaid_transaction_id' });
          if (upErr) return jsonResponse({ error: `Transaction write failed: ${upErr.message}` }, 500);
        }
        for (const batch of chunk(pull.removed, 200)) {
          await supabase.from('plaid_transactions').delete().in('plaid_transaction_id', batch);
        }

        // The cursor is the ITEM's, so every row for the item carries it. Leave
        // one behind and the next sync re-pulls the whole history through that
        // row — which is how the re-stamping happened in the first place.
        await supabase.from('connected_accounts').update({
          sync_cursor: pull.nextCursor,
          last_synced: new Date().toISOString(),
        }).in('id', rows.map(r => r.id));

        totalAdded += pull.added.length;
        totalModified += pull.modified.length;
        totalRemoved += pull.removed.length;
        synced += rows.length;
        if (unplaced) {
          warnings.push(`${unplaced} transactions belong to accounts at ${item.institution_name || itemId} that are not connected here — reconnect to include them.`);
        }
      }

      // total_added / accounts_synced are read by the Settings toast — keep them.
      return jsonResponse({
        success: true,
        total_added: totalAdded,
        total_modified: totalModified,
        total_removed: totalRemoved,
        accounts_synced: synced,
        warnings,
        item_errors: itemErrors,
      });
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

// mapTransaction used to live here. It is imported from _shared/plaidSync.ts
// now, because the version here took the account to stamp as an argument and
// every caller passed the wrong one. One definition, and it can only be reached
// by resolving txn.account_id first.

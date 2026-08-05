import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import { resolveMatLabSplit, buildSummaryRows } from "../_shared/matLabCore.ts";
import { publicSheet } from "../_shared/specScrub.ts";

// The Material/Labor rule lives in _shared/matLabCore.ts, imported by both
// this function and the React app (via src/lib/materialLaborSplit.js). It was
// previously hand-copied here under a comment reading "keep the two in sync";
// they did not stay in sync, which is why Alayda kept reporting the summary
// invoice showing unsplit descriptions.

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
          // manufacturer / model_number / dlc_listing_number / datasheet_json
          // are selected ONLY to compute the scrubbed spec sheet below. They
          // are stripped before the response goes out — this payload is
          // readable in the customer's devtools, model_number embeds the maker
          // code, a DLC listing number is a public lookup that names them, and
          // datasheet_json.brand_terms is a literal list of their brands.
          .select('*, item:products_services(id, name, description, image_url, product_category, manufacturer, model_number, dlc_listing_number, datasheet_json)')
          .eq('quote_id', est.id)
          .order('sort_order', { ascending: true });

        // Compute the customer-safe spec sheet server-side, then DROP the
        // fields that identify the manufacturer. The customer gets specs and
        // never the maker. publicSheet is the same code the PDF and the
        // estimate preview use — see _shared/specScrub.ts.
        lineItems = (lines || []).map((l: any) => {
          const p = l.item;
          if (!p) return l;
          const specs = publicSheet(p.datasheet_json, p);
          const {
            manufacturer: _m, model_number: _mn, dlc_listing_number: _d, datasheet_json: _ds,
            ...safeItem
          } = p;
          return {
            ...l,
            item: safeItem,
            public_specs: specs.specs.length > 0
              ? { specs: specs.specs, applications: specs.applications, construction: specs.construction }
              : null,
          };
        });

        // Attach before/after photos per line. Christopher uploaded site
        // photos from the estimate page but the customer portal never
        // fetched them — the customer saw only line text. Pulls from
        // file_attachments matched on quote_line_id, then mints 7-day
        // signed URLs (bucket is private). Pre-sorted by created_at so
        // the order matches what the rep saw on the estimate page.
        if (lineItems.length > 0) {
          const lineIds = lineItems.map((l: any) => l.id);
          const { data: attRows } = await supabase
            .from('file_attachments')
            .select('id, quote_line_id, photo_context, file_path, file_name, storage_bucket, created_at')
            .in('quote_line_id', lineIds)
            .in('photo_context', ['line_before', 'line_after'])
            .order('created_at', { ascending: true });

          const byLine: Record<number, any[]> = {};
          for (const att of attRows || []) {
            const bucket = att.storage_bucket || 'project-documents';
            const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(att.file_path, 60 * 60 * 24 * 7);
            if (!signed?.signedUrl) continue;
            const arr = byLine[att.quote_line_id] || (byLine[att.quote_line_id] = []);
            arr.push({
              id: att.id,
              url: signed.signedUrl,
              photo_context: att.photo_context,
              file_name: att.file_name,
            });
          }
          lineItems = lineItems.map((l: any) => ({ ...l, line_photos: byLine[l.id] || [] }));
        }

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
        .select('*, customer:customers(id, name, email, phone, address), job:jobs(id, job_id, job_title, service_kind, parts_coverage, labor_coverage, coverage_notes, parent_job_id)')
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

        // Invoice line items for the two-section customer view (in-scope
        // utility project vs out-of-scope add-ons). Display columns only —
        // no cost/margin data is exposed on the public portal. Mirrors the
        // estimate line_items shape so the portal renders both the same way.
        const { data: invLines } = await supabase
          .from('invoice_lines')
          .select('id, description, quantity, unit_price, line_total, in_utility_scope, sort_order, item:products_services(id, name)')
          .eq('invoice_id', inv.id)
          .order('sort_order', { ascending: true });
        lineItems = invLines || [];

        // If this invoice has a parent (typically a deposit invoice rolled
        // into the customer balance invoice via discount_applied), fetch the
        // parent so the portal can show the deposit credit as its own line
        // instead of hiding it inside the bulk "discount" total.
        if (inv.parent_invoice_id) {
          const { data: parent } = await supabase
            .from('invoices')
            .select('id, invoice_id, amount, invoice_type, payment_status, created_at, updated_at')
            .eq('id', inv.parent_invoice_id)
            .single();
          if (parent) (document as Record<string, unknown>).parent_invoice = parent;
        }

        // Mode B (incentive-bearing) — fetch linked utility invoice and
        // precompute Materials / Labor split. Portal can't query
        // products_services anonymously, so we do the walk server-side and
        // return just the totals.
        const { data: linkedU } = await supabase
          .from('utility_invoices')
          .select('id, utility_name, amount, payment_status')
          .eq('invoice_id', inv.id)
          .maybeSingle();
        if (linkedU) {
          (document as Record<string, unknown>).linked_utility_invoice = linkedU;
        }

        // A manual Parts/Labor override wins over the computed split, and a
        // set override means the breakdown should show even with no utility
        // invoice linked. resolveMatLabSplit in _shared/matLabCore.ts is the
        // one place that rule lives now.
        const hasManualSplit = inv.parts_total_override != null && inv.labor_total_override != null;
        let splitLines: Array<{ item_id: number | null; line_total: number | null }> = [];
        let splitComps: Array<{ parent_product_id: number; component_product_id: number; quantity: number }> = [];
        let splitProds: Array<{ id: number; cost: number | null; material_or_labor: string | null }> = [];

        if (!hasManualSplit && linkedU) {
          const { data: lines } = await supabase
            .from('invoice_lines')
            .select('item_id, line_total, quantity')
            .eq('invoice_id', inv.id);
          if (lines && lines.length > 0) {
            splitLines = lines as typeof splitLines;
            const itemIds = [...new Set(lines.map((l) => l.item_id).filter(Boolean))];
            if (itemIds.length > 0) {
              const { data: comps } = await supabase
                .from('product_components')
                .select('parent_product_id, component_product_id, quantity')
                .in('parent_product_id', itemIds);
              splitComps = (comps || []) as typeof splitComps;
              const subIds = [
                ...new Set([...itemIds, ...(comps || []).map((c) => c.component_product_id)]),
              ];
              const { data: prods } = await supabase
                .from('products_services')
                .select('id, cost, material_or_labor')
                .in('id', subIds);
              splitProds = (prods || []) as typeof splitProds;
            }
          }
        }

        if (hasManualSplit || splitLines.length > 0) {
          (document as Record<string, unknown>).material_labor_split =
            resolveMatLabSplit(inv, splitLines, splitComps, splitProds);

          // THE FIX Alayda keeps reporting. The totals object above was always
          // right; the customer never saw it, because line_items still carried
          // the raw scope text ("Offices, Conference Room, Hall, Restrooms…").
          // On a summary-format invoice the customer is supposed to see two
          // rows — Material and Labor — so replace the lines with them.
          if (inv.summary_format) {
            const summaryRows = buildSummaryRows(inv, splitLines, splitComps, splitProds);
            // Empty means there was nothing to split; keep the real lines
            // rather than showing the customer two zero rows.
            if (summaryRows.length > 0) lineItems = summaryRows;
          }
        }
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

    // Pull the company's Google Review URL setting if set. Tenants
    // increasingly paste the short link from their Google Business
    // Profile (g.page/r/.../review or share.google/...) which is the
    // most reliable review-collection URL — preferred over building
    // the link from a Place ID. CustomerPortal uses this verbatim
    // when present, falling back to the Place ID construction.
    let googleReviewUrl: string | null = null;
    {
      const { data: reviewRow } = await supabase
        .from('settings')
        .select('value')
        .eq('company_id', tokenRow.company_id)
        .eq('key', 'google_review_url')
        .maybeSingle();
      if (reviewRow?.value) {
        let v: unknown = reviewRow.value;
        try { v = JSON.parse(v as string); } catch { /* keep raw */ }
        // Some older rows were saved as a JSON-encoded string twice — unwrap.
        if (typeof v === 'string') {
          const trimmed = v.trim();
          if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
            try { v = JSON.parse(trimmed); } catch { /* keep */ }
          }
          if (typeof v === 'string' && v.trim().startsWith('http')) {
            googleReviewUrl = v.trim();
          }
        }
      }
    }

    // Fetch invoice-specific settings (CC fee, payment preferences).
    // Also returned for estimates so the formal legal proposal's payment
    // section can use the same Stripe configuration as invoices.
    let invoiceSettings = null;
    {
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

    // Fetch saved payment methods for this customer (safe fields only)
    let savedPaymentMethods: unknown[] = [];
    if (tokenRow.customer_id && paymentConfig?.stripe_enabled) {
      const { data: savedCards } = await supabase
        .from('customer_payment_methods')
        .select('id, brand, last_four, exp_month, exp_year, is_default')
        .eq('company_id', tokenRow.company_id)
        .eq('customer_id', tokenRow.customer_id)
        .eq('status', 'active')
        .order('is_default', { ascending: false });
      savedPaymentMethods = savedCards || [];
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
      google_review_url: googleReviewUrl,
      invoice_settings: invoiceSettings,
      saved_payment_methods: savedPaymentMethods
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('get-portal-document error:', error);
    return new Response(JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

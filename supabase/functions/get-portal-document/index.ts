import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Same logic as src/lib/materialLaborSplit.js — duplicated here because edge
// functions can't easily share modules with the React app.
function computeMaterialLaborSplit(
  lines: Array<{ item_id: number | null; line_total: number | null }>,
  components: Array<{ parent_product_id: number; component_product_id: number; quantity: number }>,
  products: Array<{ id: number; cost: number | null; material_or_labor: string | null }>,
) {
  const productMap = new Map(products.map((p) => [p.id, p]));
  const componentsByParent = new Map<number, typeof components>();
  for (const c of components) {
    const arr = componentsByParent.get(c.parent_product_id) || [];
    arr.push(c);
    componentsByParent.set(c.parent_product_id, arr);
  }

  function classifyLine(itemId: number | null): { materialCost: number; laborCost: number; totalCost: number; unclassified: boolean } {
    const result = { materialCost: 0, laborCost: 0, totalCost: 0, unclassified: false };
    if (!itemId) { result.unclassified = true; return result; }
    const product = productMap.get(itemId);
    const children = componentsByParent.get(itemId) || [];
    if (children.length === 0) {
      if (!product) { result.unclassified = true; return result; }
      const cost = Number(product.cost) || 0;
      if (product.material_or_labor === 'material') result.materialCost = cost;
      else if (product.material_or_labor === 'labor') result.laborCost = cost;
      else result.unclassified = true;
      result.totalCost = cost;
      return result;
    }
    for (const c of children) {
      const sub = productMap.get(c.component_product_id);
      if (!sub) { result.unclassified = true; continue; }
      const subCost = (Number(sub.cost) || 0) * (Number(c.quantity) || 1);
      if (sub.material_or_labor === 'material') result.materialCost += subCost;
      else if (sub.material_or_labor === 'labor') result.laborCost += subCost;
      else {
        const sub2 = classifyLine(c.component_product_id);
        if (sub2.unclassified) result.unclassified = true;
        result.materialCost += sub2.materialCost * (Number(c.quantity) || 1);
        result.laborCost += sub2.laborCost * (Number(c.quantity) || 1);
      }
    }
    result.totalCost = result.materialCost + result.laborCost;
    return result;
  }

  let materials = 0, labor = 0, fallbackLineCount = 0;
  for (const line of lines) {
    const lineTotal = Number(line.line_total) || 0;
    if (lineTotal === 0) continue;
    const breakdown = classifyLine(line.item_id);
    if (breakdown.unclassified || breakdown.totalCost === 0) {
      materials += lineTotal * 0.7;
      labor += lineTotal * 0.3;
      fallbackLineCount++;
    } else {
      const matPct = breakdown.materialCost / breakdown.totalCost;
      materials += lineTotal * matPct;
      labor += lineTotal * (1 - matPct);
    }
  }
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return {
    materials: round2(materials),
    labor: round2(labor),
    total: round2(materials + labor),
    fallbackLineCount,
    totalLineCount: lines.length,
  };
}

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

        // Manual Parts/Labor override wins over the computed split — and a
        // set override means the user wants the breakdown shown even when
        // no utility invoice is linked. Mirrors resolveMatLabSplit in
        // src/lib/materialLaborSplit.js; keep the two in sync.
        const hasManualSplit = inv.parts_total_override != null && inv.labor_total_override != null;
        if (hasManualSplit) {
          const round2 = (n: number) => Math.round(n * 100) / 100;
          const materials = round2(Number(inv.parts_total_override) || 0);
          const labor = round2(Number(inv.labor_total_override) || 0);
          (document as Record<string, unknown>).material_labor_split = {
            materials,
            labor,
            total: round2(materials + labor),
            fallbackLineCount: 0,
            totalLineCount: 0,
            source: 'manual',
          };
        } else if (linkedU) {
          const { data: lines } = await supabase
            .from('invoice_lines')
            .select('item_id, line_total, quantity')
            .eq('invoice_id', inv.id);
          if (lines && lines.length > 0) {
            const itemIds = [...new Set(lines.map((l) => l.item_id).filter(Boolean))];
            if (itemIds.length > 0) {
              const { data: comps } = await supabase
                .from('product_components')
                .select('parent_product_id, component_product_id, quantity')
                .in('parent_product_id', itemIds);
              const subIds = [
                ...new Set([
                  ...itemIds,
                  ...(comps || []).map((c) => c.component_product_id),
                ]),
              ];
              const { data: prods } = await supabase
                .from('products_services')
                .select('id, cost, material_or_labor')
                .in('id', subIds);
              (document as Record<string, unknown>).material_labor_split = computeMaterialLaborSplit(
                lines as Array<{ item_id: number | null; line_total: number | null }>,
                (comps || []) as Array<{ parent_product_id: number; component_product_id: number; quantity: number }>,
                (prods || []) as Array<{ id: number; cost: number | null; material_or_labor: string | null }>,
              );
            }
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

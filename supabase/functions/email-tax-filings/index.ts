// email-tax-filings
// =====================================================================
// Bulk-email per-employee tax PDFs (W-2 Copy B, 1099-NEC Copy B) to
// each employee's email on file. Lets Alayda send 50+ W-2s in one
// click instead of one-at-a-time.
//
// Body: { company_id, kind: 'W-2'|'1099-NEC', year, employee_ids?: number[] }
//   - employee_ids omitted = all generated filings for kind+year
//   - Pulls each filing from payroll_tax_filings, generates a 5-min
//     signed URL, sends email via send-email function with PDF attached
//     (we link to the signed URL — Resend supports attachments but link
//     is cleaner + secure since URL expires)
//
// Returns per-employee delivery status so HR sees who got it + who failed.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { company_id, kind, year, employee_ids } = await req.json().catch(() => ({}));
    if (!company_id || !kind || !year) return json({ error: 'company_id, kind, year required' }, 400);
    if (!['W-2', '1099-NEC'].includes(kind)) return json({ error: 'kind must be W-2 or 1099-NEC' }, 400);

    const yearStart = `${year}-01-01`;

    // Pull non-superseded filings for this kind/year
    let query = supabase
      .from('payroll_tax_filings')
      .select('id, employee_id, pdf_storage_path, status')
      .eq('company_id', company_id)
      .eq('form_kind', kind)
      .eq('period_start', yearStart)
      .neq('status', 'superseded')
      .not('employee_id', 'is', null);
    if (Array.isArray(employee_ids) && employee_ids.length > 0) {
      query = query.in('employee_id', employee_ids);
    }
    const { data: filings, error: fErr } = await query;
    if (fErr) return json({ error: fErr.message }, 500);
    if (!filings || filings.length === 0) {
      return json({ ok: true, sent: 0, results: [], note: `No ${kind}s found for ${year}. Generate them first.` });
    }

    const empIds = filings.map((f: any) => f.employee_id);
    const { data: emps } = await supabase
      .from('employees')
      .select('id, name, email')
      .in('id', empIds);
    const empMap: Record<number, any> = {};
    for (const e of emps || []) empMap[e.id] = e;

    const { data: company } = await supabase
      .from('companies')
      .select('company_name, legal_name, owner_email, phone')
      .eq('id', company_id)
      .single();

    const fromName  = (company?.legal_name || company?.company_name || 'JobScout').replace(/[^\x20-\x7E]/g, '').trim();
    const subjectK  = kind === 'W-2' ? 'W-2' : '1099-NEC';
    const yearLabel = String(year);

    const results: any[] = [];
    for (const f of filings) {
      const emp = empMap[f.employee_id];
      if (!emp || !emp.email) {
        results.push({ employee_id: f.employee_id, name: emp?.name, status: 'skipped', reason: 'no email on file' });
        continue;
      }

      // Generate a long-lived signed URL (24h) so the email link works
      // for at least a day. Employees can re-request by replying to HR.
      const { data: urlData, error: urlErr } = await supabase.storage
        .from('project-documents')
        .createSignedUrl(f.pdf_storage_path, 60 * 60 * 24);
      if (urlErr || !urlData?.signedUrl) {
        results.push({ employee_id: f.employee_id, name: emp.name, status: 'failed', reason: 'signed URL failed: ' + (urlErr?.message || 'unknown') });
        continue;
      }

      const firstName = (emp.name || '').split(' ')[0] || 'there';
      const html = `
<!DOCTYPE html><html><body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f3f1ea;">
  <div style="max-width:560px;margin:0 auto;padding:32px 24px;background:#fff;border-radius:14px;margin-top:24px;">
    <h1 style="margin:0 0 12px;font-size:20px;color:#2c3530;">Your ${subjectK} for ${yearLabel}</h1>
    <p style="margin:0 0 18px;color:#4d5a52;line-height:1.55;">
      Hi ${firstName}, your ${subjectK} for tax year ${yearLabel} is ready. Tap below to download the PDF.
    </p>
    <p style="margin:24px 0;text-align:center;">
      <a href="${urlData.signedUrl}" style="display:inline-block;padding:14px 36px;background:#5a6349;color:#fff;text-decoration:none;font-weight:700;border-radius:10px;">Download ${subjectK}</a>
    </p>
    <p style="margin:0;color:#7d8a7f;font-size:12px;line-height:1.5;">
      This link is private to you and expires in 24 hours. Need a fresh copy? Reply to this email and HR will resend it. Save the PDF — you'll need it to file your tax return.
    </p>
  </div>
</body></html>`;

      try {
        const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({
            to: emp.email,
            subject: `Your ${subjectK} for ${yearLabel} — ${fromName}`,
            html,
            from: `${fromName} <invoices@appsannex.com>`,
            reply_to: company?.owner_email || undefined,
          }),
        });
        const body = await r.json().catch(() => null);
        if (!r.ok || body?.error) {
          results.push({ employee_id: f.employee_id, name: emp.name, status: 'failed', reason: `send-email ${r.status}: ${body?.error || ''}` });
        } else {
          results.push({ employee_id: f.employee_id, name: emp.name, status: 'sent', email: emp.email });
        }
      } catch (e) {
        results.push({ employee_id: f.employee_id, name: emp.name, status: 'failed', reason: String((e as Error).message || e) });
      }
    }

    const sent = results.filter(r => r.status === 'sent').length;
    const failed = results.filter(r => r.status === 'failed').length;
    const skipped = results.filter(r => r.status === 'skipped').length;
    return json({ ok: true, sent, failed, skipped, results });
  } catch (err) {
    console.error('[email-tax-filings] crashed:', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});

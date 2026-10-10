// send-paystubs
// =====================================================================
// Email (and optionally text) every stub of a payroll run to its employee.
//
// Bryce, 2026-10-10: "it's gotta be as good as Gusto." The browser has
// already rendered each stub to project-documents/paystubs/<company>/<run>/
// <stub>.pdf (src/lib/paystubDelivery.js). This attaches the PDF to an
// email through send-email (Resend) and, when the company has Twilio and
// the caller asked, texts a seven-day signed link through send-sms.
//
// Admin-gated by the caller's JWT (email → employees row with admin rights
// in that company). Records emailed_at / texted_at / delivery_note on each
// stub so the Inbox can show who got theirs.
//
// Body: { company_id, payroll_run_id, channels?: { email, sms }, force? }
//   force: resend stubs that were already sent.
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

function jwtEmail(req: Request): string | null {
  try {
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
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

const money = (n: number) => (Number(n) || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' });
const fmtDate = (d: string) => {
  const [y, m, dd] = String(d || '').slice(0, 10).split('-').map(Number);
  if (!y) return String(d || '');
  return new Date(y, m - 1, dd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function toBase64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const SITE_URL = Deno.env.get('SITE_URL') || 'https://jobscout.appsannex.com';
    const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const body = await req.json().catch(() => ({}));
    const companyId = Number(body.company_id);
    const runId = Number(body.payroll_run_id);
    const channels = { email: body.channels?.email !== false, sms: body.channels?.sms === true };
    const force = body.force === true;
    if (!companyId || !runId) return json({ error: 'company_id and payroll_run_id are required' }, 400);
    if (!(await callerIsAdminOf(sb, req, companyId))) return json({ error: 'Only a company admin can send paystubs.' }, 403);

    const [{ data: company }, { data: run }, { data: stubs }, { data: twilio }] = await Promise.all([
      sb.from('companies').select('id, company_name, legal_name, owner_email, phone').eq('id', companyId).maybeSingle(),
      sb.from('payroll_runs').select('id, period_start, period_end, pay_date').eq('id', runId).eq('company_id', companyId).maybeSingle(),
      sb.from('paystubs').select('id, employee_id, pdf_path, gross_pay, net_pay, pay_date, period_start, period_end, emailed_at, texted_at')
        .eq('company_id', companyId).eq('payroll_run_id', runId),
      sb.from('settings').select('value').eq('company_id', companyId).eq('key', 'twilio_config').maybeSingle(),
    ]);
    if (!run) return json({ error: 'Payroll run not found.' }, 404);
    const smsReady = channels.sms && !!twilio?.value;
    const live = (stubs || []).filter((s: any) => (Number(s.gross_pay) || 0) > 0);
    const ids = [...new Set(live.map((s: any) => s.employee_id))];
    const { data: emps } = await sb.from('employees').select('id, name, email, phone').in('id', ids);
    const empById: Record<number, any> = Object.fromEntries((emps || []).map((e: any) => [e.id, e]));

    const displayName = (company?.company_name || company?.legal_name || 'Payroll').replace(/[^\x20-\x7E]/g, '').trim() || 'Payroll';
    const period = `${fmtDate(run.period_start)} – ${fmtDate(run.period_end)}`;
    const payDay = fmtDate(run.pay_date);

    let emailed = 0, texted = 0;
    const skipped: Array<{ name: string; why: string }> = [];
    const failed: Array<{ name: string; why: string }> = [];

    for (const stub of live) {
      const emp = empById[stub.employee_id];
      const name = emp?.name || `Employee ${stub.employee_id}`;
      const patch: Record<string, unknown> = {};
      if (!stub.pdf_path) { skipped.push({ name, why: 'stub PDF not rendered' }); continue; }

      const wantEmail = channels.email && (force || !stub.emailed_at);
      const wantSms = smsReady && (force || !stub.texted_at);
      if (!wantEmail && !wantSms) continue;

      let pdfB64: string | null = null;
      if (wantEmail) {
        const { data: file, error: dlErr } = await sb.storage.from('project-documents').download(stub.pdf_path);
        if (dlErr || !file) { failed.push({ name, why: 'could not read the PDF' }); continue; }
        pdfB64 = toBase64(new Uint8Array(await file.arrayBuffer()));
      }

      if (wantEmail) {
        const to = String(emp?.email || '').trim();
        if (!to || !to.includes('@')) {
          skipped.push({ name, why: 'no email on file' });
          patch.delivery_note = 'No email on file';
        } else {
          const html = `
            <div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;color:#20261c">
              <h2 style="margin:0 0 6px;font-size:20px">Your paystub from ${displayName}</h2>
              <p style="margin:0 0 14px;color:#5d6a5e">Pay period ${period} · paid ${payDay}</p>
              <table style="border-collapse:collapse;font-size:15px">
                <tr><td style="padding:4px 18px 4px 0;color:#5d6a5e">Gross pay</td><td style="padding:4px 0;text-align:right"><b>${money(stub.gross_pay)}</b></td></tr>
                <tr><td style="padding:4px 18px 4px 0;color:#5d6a5e">Take-home</td><td style="padding:4px 0;text-align:right;color:#16a34a"><b>${money(stub.net_pay)}</b></td></tr>
              </table>
              <p style="margin:16px 0 0;font-size:14px">Your full paystub is attached. You can also find every paystub under <a href="${SITE_URL}/my-pay">My Pay</a> in JobScout.</p>
              <p style="margin:18px 0 0;font-size:12px;color:#7d8a7f">Sent by ${displayName} through JobScout. Questions about your pay go to the office, not to this email.</p>
            </div>`;
          const r = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
            body: JSON.stringify({
              to,
              from: `${displayName} Payroll <payroll@appsannex.com>`,
              subject: `Paystub for ${period} — ${displayName}`,
              html,
              attachments: [{ filename: `paystub-${String(run.pay_date).slice(0, 10)}.pdf`, content: pdfB64, content_type: 'application/pdf' }],
            }),
          });
          const res = await r.json().catch(() => ({}));
          if (r.ok && res?.success !== false && !res?.error) { emailed++; patch.emailed_at = new Date().toISOString(); patch.delivery_note = null; }
          else { failed.push({ name, why: 'email: ' + (res?.error || r.status) }); patch.delivery_note = 'Email failed: ' + (res?.error || r.status); }
        }
      }

      if (wantSms) {
        const to = String(emp?.phone || '').replace(/[^\d+]/g, '');
        if (!to) {
          skipped.push({ name, why: 'no phone on file' });
        } else {
          const { data: signed } = await sb.storage.from('project-documents').createSignedUrl(stub.pdf_path, 60 * 60 * 24 * 7);
          const link = signed?.signedUrl;
          if (!link) { failed.push({ name, why: 'could not make a stub link' }); }
          else {
            const r = await fetch(`${SUPABASE_URL}/functions/v1/send-sms`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${SERVICE_ROLE_KEY}` },
              body: JSON.stringify({
                company_id: companyId, to, employee_id: stub.employee_id, trigger: 'paystub',
                message: `${displayName}: your paystub for ${period} (paid ${payDay}) is ready. Take-home ${money(stub.net_pay)}. View it (link good for 7 days): ${link}`,
              }),
            });
            const res = await r.json().catch(() => ({}));
            if (r.ok && !res?.error) { texted++; patch.texted_at = new Date().toISOString(); }
            else failed.push({ name, why: 'text: ' + (res?.error || r.status) });
          }
        }
      }

      if (Object.keys(patch).length) await sb.from('paystubs').update(patch).eq('id', stub.id).eq('company_id', companyId);
    }

    return json({ ok: true, emailed, texted, skipped, failed, sms_configured: !!twilio?.value });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

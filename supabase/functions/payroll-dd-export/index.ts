// Direct-deposit export — builds a CSV of net pay + bank details for one
// payroll run, for the admin to upload to their business bank. JobScout does
// NOT originate the ACH; this is a bridge until a payroll-rail provider is
// embedded (see docs/ROADMAP.md #4).
//
// SECURITY: admin-gated (JWT email → employees role), company-scoped from the
// caller's JWT (never trust a company_id in the body). Returns full account
// numbers to the admin only — the file must be reviewed before it's used.
//
// Bank details come from the employee's signed direct-deposit authorization
// (signed_documents.values_snapshot, document_kind='direct_deposit_auth'),
// because the encrypted employee columns were never populated. Employees who
// never completed the onboarding portal have no DD on file and are flagged
// "pay by check".

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const jerr = (msg: string, status = 400) =>
  new Response(JSON.stringify({ error: msg }), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

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

async function resolveAdmin(sb: any, req: Request): Promise<{ email: string; companyId: number } | null> {
  const email = jwtEmail(req);
  if (!email) return null;
  const { data } = await sb.from('employees')
    .select('company_id, role, user_role, is_admin, is_developer')
    .ilike('email', email).eq('active', true).limit(1);
  const e = data?.[0];
  if (!e) return null;
  const admin = e.is_developer === true || e.is_admin === true
    || ['Admin', 'admin', 'Owner', 'owner'].includes(e.user_role)
    || ['Admin', 'Owner'].includes(e.role);
  if (!admin) return null;
  return { email, companyId: e.company_id };
}

const csvCell = (v: unknown) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const caller = await resolveAdmin(sb, req);
    if (!caller) return jerr('Only an admin can export payroll.', 403);
    const companyId = caller.companyId;

    const body = await req.json().catch(() => ({}));
    const runId = Number(body.payroll_run_id);
    if (!runId) return jerr('payroll_run_id required', 400);

    const { data: run } = await sb.from('payroll_runs')
      .select('id, pay_date').eq('id', runId).eq('company_id', companyId).maybeSingle();
    if (!run) return jerr('Payroll run not found.', 404);

    // Net pay per employee for this run.
    const { data: stubs } = await sb.from('paystubs')
      .select('employee_id, net_pay').eq('payroll_run_id', runId).eq('company_id', companyId);
    const netByEmp: Record<number, number> = {};
    for (const s of stubs || []) netByEmp[s.employee_id] = (netByEmp[s.employee_id] || 0) + Number(s.net_pay || 0);
    const empIds = Object.keys(netByEmp).map(Number).filter((id) => netByEmp[id] > 0);

    const { data: emps } = empIds.length
      ? await sb.from('employees').select('id, name, tax_classification').eq('company_id', companyId).in('id', empIds)
      : { data: [] };
    const empById: Record<number, any> = {};
    for (const e of emps || []) empById[e.id] = e;

    // Latest signed direct-deposit authorization per employee.
    const { data: dds } = empIds.length
      ? await sb.from('signed_documents')
          .select('employee_id, values_snapshot, created_at')
          .eq('company_id', companyId).eq('document_kind', 'direct_deposit_auth')
          .in('employee_id', empIds).order('created_at', { ascending: false })
      : { data: [] };
    const ddByEmp: Record<number, any> = {};
    for (const d of dds || []) if (!ddByEmp[d.employee_id]) ddByEmp[d.employee_id] = d.values_snapshot || {};

    // Build CSV — W-2 employees only (1099s aren't paid by payroll DD).
    const rows: string[][] = [['Employee', 'Routing Number', 'Account Number', 'Account Type', 'Net Amount', 'Status']];
    let missing = 0, included = 0;
    for (const id of empIds) {
      const e = empById[id] || {};
      if (e.tax_classification === '1099') continue;
      const amt = (Math.round(netByEmp[id] * 100) / 100).toFixed(2);
      const dd = ddByEmp[id];
      if (dd && dd.account_number && dd.routing_number) {
        rows.push([e.name || `Employee ${id}`, String(dd.routing_number), String(dd.account_number), dd.account_type || 'checking', amt, 'OK']);
        included++;
      } else {
        rows.push([e.name || `Employee ${id}`, '', '', '', amt, 'NO DIRECT DEPOSIT ON FILE — PAY BY CHECK']);
        missing++;
      }
    }

    const csv = rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
    const fname = `direct-deposit-${String(run.pay_date || 'run').slice(0, 10)}.csv`;
    return new Response(csv, {
      headers: {
        ...cors,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fname}"`,
        'X-DD-Included': String(included),
        'X-DD-Missing': String(missing),
      },
    });
  } catch (err) {
    return jerr((err as Error).message, 500);
  }
});

// employee-onboarding
// =====================================================================
// Public, token-gated API for the new-hire onboarding portal.
//
// Actions:
//   load     → fetch packet + employee + company (read-only, no PII like SSN)
//   save     → upsert one step's slice into packet.draft_data
//   sign     → create a signed_documents row for one form
//   finalize → mark packet completed, apply draft_data to employee row,
//              compute I-9 Section 2 deadline, schedule new-hire report
//
// Auth model: token → packet row. No login required (this is the magic
// link the new hire gets via SMS/email). Token expires in 14 days,
// scoped to one employee.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const body = await req.json().catch(() => ({}));
    const { token, action } = body;

    if (!token || !action) {
      return jsonRes({ error: 'token and action are required' }, 400);
    }

    // Validate token → load packet
    const { data: packet, error: tokenErr } = await supabase
      .from('employee_onboarding_packets')
      .select('*')
      .eq('token', token)
      .single();

    if (tokenErr || !packet) return jsonRes({ error: 'Invalid or expired link.' }, 404);
    if (packet.is_revoked)   return jsonRes({ error: 'This link has been revoked. Ask HR for a new one.' }, 403);
    if (new Date(packet.expires_at) < new Date()) {
      return jsonRes({ error: 'This link has expired. Ask HR to send a new one.' }, 410);
    }

    // ─── action: load ────────────────────────────────────────────────
    if (action === 'load') {
      // Mark opened_at first time, flip to in_progress
      if (!packet.opened_at) {
        await supabase
          .from('employee_onboarding_packets')
          .update({ opened_at: new Date().toISOString(), status: 'in_progress' })
          .eq('id', packet.id);
      }
      const [{ data: employee }, { data: company }, { data: trainingSetting }, { data: handbookSetting }, { data: icaSetting }] = await Promise.all([
        supabase
          .from('employees')
          .select('id, name, email, phone, hire_date, role, headshot_url, business_unit, tax_classification')
          .eq('id', packet.employee_id)
          .single(),
        supabase
          .from('companies')
          .select('id, company_name, logo_url, address, phone, owner_email, state_employer_id_state')
          .eq('id', packet.company_id)
          .single(),
        supabase
          .from('settings')
          .select('value')
          .eq('company_id', packet.company_id)
          .eq('key', 'onboarding_training_videos')
          .maybeSingle(),
        supabase
          .from('settings')
          .select('value')
          .eq('company_id', packet.company_id)
          .eq('key', 'onboarding_handbook')
          .maybeSingle(),
        supabase
          .from('settings')
          .select('value')
          .eq('company_id', packet.company_id)
          .eq('key', 'onboarding_ica')
          .maybeSingle(),
      ]);
      return jsonRes({
        ok: true,
        packet: {
          id: packet.id,
          status: packet.status,
          draft_data: packet.draft_data || {},
          completed_at: packet.completed_at,
          step_completion: extractStepCompletion(packet),
        },
        employee,
        company,
        training_videos: trainingSetting?.value || [],
        handbook: handbookSetting?.value || null,
        ica: icaSetting?.value || null,
      });
    }

    // ─── action: save (one step's slice) ─────────────────────────────
    if (action === 'save') {
      const { step, data } = body;
      if (!step) return jsonRes({ error: 'step is required' }, 400);

      // Merge into draft_data
      const next = { ...(packet.draft_data || {}), [step]: data };

      // Map step → completion column
      const stepColumn = stepToCompletionColumn(step);
      const update: Record<string, unknown> = {
        draft_data: next,
        status: 'in_progress',
      };
      if (stepColumn) update[stepColumn] = new Date().toISOString();

      const { error: updErr } = await supabase
        .from('employee_onboarding_packets')
        .update(update)
        .eq('id', packet.id);
      if (updErr) return jsonRes({ error: updErr.message }, 500);
      return jsonRes({ ok: true, draft_data: next });
    }

    // ─── action: sign (create a signed_documents row) ────────────────
    if (action === 'sign') {
      const { document_kind, document_label, signature_typed_name, signature_image_base64, consent_text, values_snapshot } = body;
      if (!document_kind || !signature_typed_name) {
        return jsonRes({ error: 'document_kind and signature_typed_name are required' }, 400);
      }
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
      const ua = req.headers.get('user-agent') || null;

      const { data: doc, error: docErr } = await supabase
        .from('signed_documents')
        .insert({
          company_id: packet.company_id,
          employee_id: packet.employee_id,
          onboarding_packet_id: packet.id,
          document_kind,
          document_label: document_label || document_kind,
          values_snapshot: values_snapshot || {},
          signature_typed_name,
          signature_image_base64: signature_image_base64 || null,
          signed_at: new Date().toISOString(),
          signer_ip: ip,
          signer_user_agent: ua,
          consent_text: consent_text || null,
          status: 'signed',
        })
        .select('id, document_kind, signed_at')
        .single();
      if (docErr) return jsonRes({ error: docErr.message }, 500);
      return jsonRes({ ok: true, document: doc });
    }

    // ─── action: finalize ────────────────────────────────────────────
    if (action === 'finalize') {
      const draft = packet.draft_data || {};

      // Build the employee update from the draft data
      const empUpdate: Record<string, unknown> = {};
      if (draft.personal) {
        const p = draft.personal;
        if (p.date_of_birth)  empUpdate.date_of_birth = p.date_of_birth;
        if (p.home_address)   empUpdate.home_address  = p.home_address;
        if (p.home_city)      empUpdate.home_city     = p.home_city;
        if (p.home_state)     empUpdate.home_state    = p.home_state;
        if (p.home_zip)       empUpdate.home_zip      = p.home_zip;
        if (p.phone)          empUpdate.phone         = p.phone;
      }
      if (draft.w4) {
        const w = draft.w4;
        if (w.filing_status)         empUpdate.w4_filing_status      = w.filing_status;
        if (w.multiple_jobs != null) empUpdate.w4_multiple_jobs      = !!w.multiple_jobs;
        if (w.dependents_amount != null)  empUpdate.w4_dependents_amount = Number(w.dependents_amount) || 0;
        if (w.other_income      != null)  empUpdate.w4_other_income      = Number(w.other_income)      || 0;
        if (w.deductions        != null)  empUpdate.w4_deductions        = Number(w.deductions)        || 0;
        if (w.extra_withholding != null)  empUpdate.w4_extra_withholding = Number(w.extra_withholding) || 0;
        empUpdate.w4_signed_at = new Date().toISOString().slice(0, 10);
      }
      if (draft.ssn?.value) {
        // Encrypt SSN via the public RPC (Vault-backed)
        const { data: enc, error: encErr } = await supabase.rpc('encrypt_ssn', { p_ssn: String(draft.ssn.value) });
        if (encErr) return jsonRes({ error: 'SSN encryption failed: ' + encErr.message }, 500);
        const digits = String(draft.ssn.value).replace(/\D/g, '');
        empUpdate.ssn_encrypted = enc;
        empUpdate.ssn_last4     = digits.slice(-4);
      }
      // 1099 EIN — encrypted via the parallel RPC, stored in the W-9
      // columns (kept separate from ssn_encrypted because contractors
      // may use either).
      if (draft.ein?.value) {
        const { data: enc, error: encErr } = await supabase.rpc('encrypt_ein', { p_ein: String(draft.ein.value) });
        if (encErr) return jsonRes({ error: 'EIN encryption failed: ' + encErr.message }, 500);
        const digits = String(draft.ein.value).replace(/\D/g, '');
        empUpdate.w9_ein_encrypted = enc;
        empUpdate.w9_ein_last4     = digits.slice(-4);
      }
      // W-9 fields (1099 path)
      if (draft.w9) {
        const w = draft.w9;
        if (w.legal_name)             empUpdate.w9_legal_name             = w.legal_name;
        if (w.business_name)          empUpdate.w9_business_name          = w.business_name;
        if (w.federal_classification) empUpdate.w9_federal_classification = w.federal_classification;
        if (w.other_classification)   empUpdate.w9_other_classification   = w.other_classification;
        if (w.exempt_payee_code)      empUpdate.w9_exempt_payee_code      = w.exempt_payee_code;
        if (w.tin_type)               empUpdate.w9_tin_type               = w.tin_type;
        empUpdate.w9_backup_withholding = !!w.backup_withholding;
        empUpdate.w9_signed_at = new Date().toISOString().slice(0, 10);
      }
      if (draft.direct_deposit) {
        const dd = draft.direct_deposit;
        if (dd.account_type) empUpdate.dd_account_type = dd.account_type;
        if (dd.account_number) {
          const acct = String(dd.account_number).replace(/\D/g, '');
          // Encrypted columns expect bytea — for v1 we just store the
          // last4 in plaintext and skip the bytea encryption (separate
          // RPC needed). Will wire encrypted columns in Sprint B.
          empUpdate.dd_account_last4 = acct.slice(-4);
        }
      }

      const { error: empUpdErr } = await supabase
        .from('employees')
        .update({ ...empUpdate, updated_at: new Date().toISOString() })
        .eq('id', packet.employee_id);
      if (empUpdErr) return jsonRes({ error: 'Apply to employee failed: ' + empUpdErr.message }, 500);

      // Compute I-9 Section 2 deadline (3 business days from hire date).
      // Skipped for 1099 contractors — I-9 doesn't apply.
      const { data: empRow } = await supabase
        .from('employees')
        .select('hire_date, tax_classification')
        .eq('id', packet.employee_id)
        .single();
      let i9Due: string | null = null;
      if (empRow?.hire_date && empRow?.tax_classification !== '1099') {
        const d = new Date(empRow.hire_date);
        let added = 0;
        while (added < 3) {
          d.setDate(d.getDate() + 1);
          if (d.getDay() !== 0 && d.getDay() !== 6) added++;
        }
        i9Due = d.toISOString().slice(0, 10);
      }

      const { error: pktErr } = await supabase
        .from('employee_onboarding_packets')
        .update({
          status: 'completed',
          completed_at: new Date().toISOString(),
          step_signed_completed_at: new Date().toISOString(),
          i9_section2_due_date: i9Due,
        })
        .eq('id', packet.id);
      if (pktErr) return jsonRes({ error: pktErr.message }, 500);

      // Kick off the PDF render in the background — don't make the
      // employee wait for it on the success screen. Failures here log
      // but don't fail finalize; HR can re-render from the panel.
      try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        // Fire and forget — we don't await this.
        fetch(`${SUPABASE_URL}/functions/v1/render-onboarding-pdfs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
            apikey: SERVICE_ROLE_KEY,
          },
          body: JSON.stringify({ packet_id: packet.id }),
        }).catch(err => console.warn('[onboarding] PDF render kick-off failed:', err));
      } catch (e) {
        console.warn('[onboarding] PDF render kick-off threw:', e);
      }

      return jsonRes({ ok: true });
    }

    return jsonRes({ error: 'unknown action: ' + action }, 400);
  } catch (err) {
    console.error('[employee-onboarding] crashed:', err);
    return jsonRes({ error: String((err as Error)?.message || err) }, 500);
  }
});

function stepToCompletionColumn(step: string): string | null {
  const map: Record<string, string> = {
    personal:           'step_personal_completed_at',
    w4:                 'step_w4_completed_at',
    w9:                 'step_w9_completed_at',
    state_w4:           'step_state_w4_completed_at',
    direct_deposit:     'step_direct_deposit_completed_at',
    i9_section1:        'step_i9_section1_completed_at',
    handbook:           'step_handbook_completed_at',
    emergency_contact:  'step_emergency_contact_completed_at',
    workers_comp:       'step_workers_comp_completed_at',
    background_check:   'step_background_check_completed_at',
    training:           'step_training_completed_at',
  };
  return map[step] || null;
}

function extractStepCompletion(packet: Record<string, unknown>) {
  return {
    personal:          !!packet.step_personal_completed_at,
    w4:                !!packet.step_w4_completed_at,
    state_w4:          !!packet.step_state_w4_completed_at,
    direct_deposit:    !!packet.step_direct_deposit_completed_at,
    i9_section1:       !!packet.step_i9_section1_completed_at,
    handbook:          !!packet.step_handbook_completed_at,
    emergency_contact: !!packet.step_emergency_contact_completed_at,
    workers_comp:      !!packet.step_workers_comp_completed_at,
    background_check:  !!packet.step_background_check_completed_at,
    training:          !!packet.step_training_completed_at,
    signed:            !!packet.step_signed_completed_at,
  };
}

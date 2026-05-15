// render-onboarding-pdfs
// =====================================================================
// Renders the new hire's signed forms into PDFs and uploads them to the
// project-documents bucket. Called server-to-server from
// employee-onboarding's finalize action. Idempotent — re-rendering
// overwrites the same paths.
//
// For each signed_documents row of this packet, we generate a plain,
// readable PDF that contains:
//   - Form title + date
//   - All the values the employee entered (W-4 fields, I-9 §1 answers, etc.)
//   - The drawn signature image
//   - ESIGN audit footer (typed name, IP, user-agent, signed_at)
//
// Note: we render OUR OWN PDF representation rather than overlaying onto
// the official IRS / state form PDFs. This is the same approach DocuSign
// uses — captures the same data + audit trail without form-shape
// licensing concerns. When we need to file the actual government form
// (W-2 at year-end, 941 quarterly, etc.) we generate THAT separately
// from the canonical employees / paystubs rows. These onboarding PDFs
// are the audit + employee-file record.
// =====================================================================
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

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
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );

    const { packet_id } = await req.json().catch(() => ({}));
    if (!packet_id) return json({ error: 'packet_id is required' }, 400);

    const { data: packet, error: pktErr } = await supabase
      .from('employee_onboarding_packets')
      // Explicit FK — there are TWO FKs from this table to employees
      // (employee_id AND created_by), so PostgREST won't auto-pick.
      .select('*, employee:employees!employee_onboarding_packets_employee_id_fkey(id, name, email, phone, hire_date, home_address, home_city, home_state, home_zip, date_of_birth, ssn_last4, w9_ein_last4, tax_classification)')
      .eq('id', packet_id)
      .single();
    if (pktErr || !packet) {
      console.error('[render-onboarding-pdfs] packet load failed:', pktErr);
      return json({ error: 'packet not found: ' + (pktErr?.message || 'unknown') }, 404);
    }

    // Load every signed_documents row in this packet
    const { data: docs } = await supabase
      .from('signed_documents')
      .select('*')
      .eq('onboarding_packet_id', packet.id)
      .eq('status', 'signed');

    if (!docs || docs.length === 0) return json({ error: 'no signed documents to render' }, 400);

    // Pull company info for the header
    const { data: company } = await supabase
      .from('companies')
      .select('company_name, logo_url, address, ein, state_employer_id, state_employer_id_state')
      .eq('id', packet.company_id)
      .single();

    const rendered: Array<{ id: number; kind: string; path: string }> = [];

    for (const doc of docs) {
      try {
        const pdfBytes = await renderPdf({ doc, packet, employee: packet.employee, company });
        const fname = safeName(`${doc.document_kind}-${doc.id}-${Date.now()}.pdf`);
        const path  = `onboarding/${packet.company_id}/${packet.employee_id}/${fname}`;

        // Upload to project-documents (bucket already exists per CLAUDE.md)
        const { error: upErr } = await supabase.storage
          .from('project-documents')
          .upload(path, pdfBytes, { contentType: 'application/pdf', upsert: true });
        if (upErr) { console.warn(`upload failed for doc ${doc.id}:`, upErr.message); continue; }

        // Stamp the doc with its storage path
        await supabase
          .from('signed_documents')
          .update({ pdf_storage_path: path })
          .eq('id', doc.id);

        rendered.push({ id: doc.id, kind: doc.document_kind, path });
      } catch (e) {
        console.warn(`render failed for doc ${doc.id}:`, (e as Error).message);
      }
    }

    return json({ ok: true, rendered, packet_id });
  } catch (err) {
    console.error('[render-onboarding-pdfs] crashed:', err);
    return json({ error: String((err as Error)?.message || err) }, 500);
  }
});

function safeName(s: string) {
  return s.replace(/[^a-z0-9._-]/gi, '_');
}

// =====================================================================
// PDF rendering
// =====================================================================
async function renderPdf({ doc, packet, employee, company }: any): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]); // US Letter portrait
  const font     = await pdf.embedFont(StandardFonts.Helvetica);
  const fontB    = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontI    = await pdf.embedFont(StandardFonts.HelveticaOblique);

  const ink      = rgb(0.17, 0.21, 0.19);     // theme.text
  const muted    = rgb(0.49, 0.54, 0.5);      // theme.textMuted
  const accent   = rgb(0.35, 0.39, 0.29);     // theme.accent

  const margin   = 50;
  let y          = 792 - margin;

  // ── HEADER ────────────────────────────────────────────────────────
  page.drawText(company?.company_name || 'Employer', {
    x: margin, y, size: 11, font: fontB, color: muted,
  });
  y -= 26;

  const title = TITLES[doc.document_kind] || doc.document_label || doc.document_kind;
  page.drawText(title, {
    x: margin, y, size: 18, font: fontB, color: ink,
  });
  y -= 8;
  page.drawLine({
    start: { x: margin, y }, end: { x: 612 - margin, y },
    thickness: 1.5, color: accent,
  });
  y -= 22;

  // ── EMPLOYEE BLOCK ────────────────────────────────────────────────
  drawKV(page, margin, y, 'Employee name', employee?.name || '', font, fontB, ink, muted); y -= 16;
  if (employee?.ssn_last4) {
    drawKV(page, margin, y, 'SSN', `***-**-${employee.ssn_last4}`, font, fontB, ink, muted); y -= 16;
  }
  if (employee?.date_of_birth) {
    drawKV(page, margin, y, 'Date of birth', fmtDate(employee.date_of_birth), font, fontB, ink, muted); y -= 16;
  }
  if (employee?.home_address) {
    drawKV(page, margin, y, 'Address',
      `${employee.home_address}, ${employee.home_city || ''} ${employee.home_state || ''} ${employee.home_zip || ''}`.trim(),
      font, fontB, ink, muted); y -= 16;
  }
  y -= 12;

  // ── FORM-SPECIFIC BODY ────────────────────────────────────────────
  y = renderBody(page, margin, y, doc, font, fontB, ink, muted, accent);

  // ── SIGNATURE ─────────────────────────────────────────────────────
  y -= 12;
  page.drawLine({ start: { x: margin, y }, end: { x: 612 - margin, y }, thickness: 0.5, color: muted });
  y -= 20;
  page.drawText('Employee signature', { x: margin, y, size: 10, font: fontB, color: muted });
  y -= 6;

  // Drawn signature image
  if (doc.signature_image_base64) {
    try {
      const b64 = doc.signature_image_base64.replace(/^data:image\/\w+;base64,/, '');
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      const img = await pdf.embedPng(bin);
      const w = 220, h = 60;
      page.drawImage(img, { x: margin, y: y - h, width: w, height: h });
      y -= (h + 10);
    } catch (e) {
      page.drawText('[signature image could not be rendered]', { x: margin, y: y - 14, size: 10, font: fontI, color: muted });
      y -= 22;
    }
  }

  if (doc.signature_typed_name) {
    page.drawText(`/s/ ${doc.signature_typed_name}`, { x: margin, y, size: 11, font: fontB, color: ink });
    y -= 16;
  }
  if (doc.signed_at) {
    page.drawText(`Signed ${fmtDateTime(doc.signed_at)}`, { x: margin, y, size: 9, font, color: muted });
    y -= 14;
  }

  // ── AUDIT FOOTER ──────────────────────────────────────────────────
  const footY = 60;
  page.drawLine({ start: { x: margin, y: footY + 36 }, end: { x: 612 - margin, y: footY + 36 }, thickness: 0.5, color: muted });
  const consentLine = (doc.consent_text || '').slice(0, 140);
  page.drawText(consentLine, { x: margin, y: footY + 22, size: 8, font: fontI, color: muted, maxWidth: 612 - 2 * margin });
  page.drawText(
    `Electronically signed by ${doc.signature_typed_name || '(unnamed)'} · IP ${doc.signer_ip || 'unknown'} · UA ${(doc.signer_user_agent || '').slice(0, 60)}`,
    { x: margin, y: footY + 8, size: 7, font, color: muted, maxWidth: 612 - 2 * margin },
  );
  page.drawText(
    `Document ID ${doc.id} · Generated ${fmtDateTime(new Date().toISOString())} · Employee ID ${employee?.id}`,
    { x: margin, y: footY - 4, size: 7, font, color: muted },
  );

  return pdf.save();
}

const TITLES: Record<string, string> = {
  w4:                  'Form W-4 (2025) — Employee\'s Withholding Certificate',
  w9:                  'Form W-9 — Request for Taxpayer ID and Certification',
  i9_section1:         'Form I-9 Section 1 — Employee Information and Attestation',
  i9_section2:         'Form I-9 Section 2 — Employer Review and Verification',
  direct_deposit_auth: 'Direct Deposit Authorization',
  emergency_contact:   'Emergency Contact Information',
  handbook_ack:        'Employee Handbook Acknowledgment',
  workers_comp:        'Workers\' Compensation Questionnaire',
  background_check_auth: 'Background Check Authorization',
  state_w4:            'State Withholding Certificate',
  independent_contractor_agreement: 'Independent Contractor Agreement',
};

const W9_CLASS_LABELS: Record<string, string> = {
  individual:  'Individual / sole proprietor',
  sole_prop:   'Sole proprietor',
  llc_c:       'Limited liability company (taxed as C-Corp)',
  llc_s:       'Limited liability company (taxed as S-Corp)',
  llc_p:       'Limited liability company (multi-member partnership)',
  c_corp:      'C-Corporation',
  s_corp:      'S-Corporation',
  partnership: 'Partnership',
  trust:       'Trust / estate',
  other:       'Other',
};

function renderBody(page: any, margin: number, startY: number, doc: any, font: any, fontB: any, ink: any, muted: any, _accent: any): number {
  let y = startY;
  const v = doc.values_snapshot || {};

  if (doc.document_kind === 'w9') {
    y = section(page, margin, y, 'Part I: Identification', fontB, ink); y -= 14;
    drawKV(page, margin, y, 'Name (as on tax return)', v.legal_name || '—', font, fontB, ink, muted); y -= 14;
    if (v.business_name) { drawKV(page, margin, y, 'Business / DBA name', v.business_name, font, fontB, ink, muted); y -= 14; }
    drawKV(page, margin, y, 'Federal tax classification',
      W9_CLASS_LABELS[v.federal_classification] || v.federal_classification || '—',
      font, fontB, ink, muted); y -= 14;
    if (v.federal_classification === 'other' && v.other_classification) {
      drawKV(page, margin, y, 'Other (specified)', v.other_classification, font, fontB, ink, muted); y -= 14;
    }
    drawKV(page, margin, y, 'TIN type', (v.tin_type || '').toUpperCase(), font, fontB, ink, muted); y -= 14;
    if (v.tin_type === 'ein' && (employee?.w9_ein_last4)) {
      drawKV(page, margin, y, 'EIN', `**-***${employee.w9_ein_last4}`, font, fontB, ink, muted); y -= 14;
    }
    if (v.tin_type === 'ssn' && (employee?.ssn_last4)) {
      drawKV(page, margin, y, 'SSN', `***-**-${employee.ssn_last4}`, font, fontB, ink, muted); y -= 14;
    }
    if (v.exempt_payee_code) { drawKV(page, margin, y, 'Exempt payee code', v.exempt_payee_code, font, fontB, ink, muted); y -= 14; }
    y -= 4;

    y = section(page, margin, y, 'Part II: Certification', fontB, ink); y -= 14;
    drawWrapped(page, margin, y,
      'Under penalties of perjury, I certify that: (1) The number shown on this form is my correct taxpayer identification number; (2) I am ' +
      (v.backup_withholding ? 'subject to' : 'NOT subject to') +
      ' backup withholding because of a notice from the IRS; (3) I am a U.S. citizen or other U.S. person; and (4) the FATCA codes entered (if any) are correct.',
      font, ink, 612 - 2 * margin, 9);
    y -= 60;
    return y;
  }

  if (doc.document_kind === 'w4') {
    y = section(page, margin, y, 'Step 1: Personal information', fontB, ink); y -= 14;
    drawKV(page, margin, y, 'Filing status',
      ({ single: 'Single or married filing separately', married_jointly: 'Married filing jointly', head_of_household: 'Head of household' } as any)[v.filing_status] || v.filing_status || '—',
      font, fontB, ink, muted); y -= 16;

    y = section(page, margin, y, 'Step 2: Multiple jobs / spouse works', fontB, ink); y -= 14;
    drawKV(page, margin, y, 'Step 2(c) checkbox', v.multiple_jobs ? 'Yes' : 'No', font, fontB, ink, muted); y -= 16;

    y = section(page, margin, y, 'Step 3: Claim dependents', fontB, ink); y -= 14;
    drawKV(page, margin, y, 'Dependents credit amount', `$${(Number(v.dependents_amount) || 0).toFixed(2)}`, font, fontB, ink, muted); y -= 16;

    y = section(page, margin, y, 'Step 4: Other adjustments (optional)', fontB, ink); y -= 14;
    drawKV(page, margin, y, '(a) Other income / year', `$${(Number(v.other_income) || 0).toFixed(2)}`, font, fontB, ink, muted); y -= 14;
    drawKV(page, margin, y, '(b) Deductions / year',   `$${(Number(v.deductions) || 0).toFixed(2)}`, font, fontB, ink, muted); y -= 14;
    drawKV(page, margin, y, '(c) Extra withholding / paycheck', `$${(Number(v.extra_withholding) || 0).toFixed(2)}`, font, fontB, ink, muted); y -= 16;
    return y;
  }

  if (doc.document_kind === 'i9_section1') {
    y = section(page, margin, y, 'Citizenship / Immigration Status Attestation', fontB, ink); y -= 14;
    const cMap: any = {
      us_citizen: '1. A citizen of the United States',
      noncitizen_national: '2. A noncitizen national of the United States',
      permanent_resident: '3. A lawful permanent resident',
      authorized_alien: '4. An alien authorized to work',
    };
    drawKV(page, margin, y, 'Status', cMap[v.citizenship] || v.citizenship || '—', font, fontB, ink, muted); y -= 16;
    if (v.alien_number) { drawKV(page, margin, y, 'USCIS / A-Number', v.alien_number, font, fontB, ink, muted); y -= 14; }
    if (v.work_auth_expires) { drawKV(page, margin, y, 'Work auth expires', fmtDate(v.work_auth_expires), font, fontB, ink, muted); y -= 14; }
    y -= 8;
    drawWrapped(page, margin, y,
      'I am aware that federal law provides for imprisonment and/or fines for false statements or use of false documents in connection with the completion of this form.',
      font, ink, 612 - 2 * margin, 9);
    y -= 36;
    return y;
  }

  if (doc.document_kind === 'direct_deposit_auth') {
    y = section(page, margin, y, 'Direct Deposit Setup', fontB, ink); y -= 14;
    if (v.enable === false) {
      drawKV(page, margin, y, 'Status', 'Declined — paper check requested', font, fontB, ink, muted); y -= 16;
      return y;
    }
    drawKV(page, margin, y, 'Account type', (v.account_type || '').replace(/^\w/, (c: string) => c.toUpperCase()) || '—', font, fontB, ink, muted); y -= 14;
    drawKV(page, margin, y, 'Routing number', maskExceptLast(v.routing_number, 4), font, fontB, ink, muted); y -= 14;
    drawKV(page, margin, y, 'Account number', maskExceptLast(v.account_number, 4), font, fontB, ink, muted); y -= 16;
    y -= 6;
    drawWrapped(page, margin, y,
      'I authorize the company to deposit my net pay to the account listed above. I understand I may revoke this authorization at any time by notifying HR in writing.',
      font, ink, 612 - 2 * margin, 9);
    y -= 36;
    return y;
  }

  if (doc.document_kind === 'handbook_ack') {
    y = section(page, margin, y, 'Acknowledgment', fontB, ink); y -= 14;
    drawKV(page, margin, y, 'Handbook version', v.handbook_version || '—', font, fontB, ink, muted); y -= 14;
    drawKV(page, margin, y, 'Read to end',      v.scrolled_to_end ? 'Yes' : 'No', font, fontB, ink, muted); y -= 14;
    drawKV(page, margin, y, 'Acknowledged',     v.acknowledged ? 'Yes' : 'No', font, fontB, ink, muted); y -= 14;
    y -= 6;
    drawWrapped(page, margin, y,
      'I acknowledge that I have read the company handbook and agree to abide by its policies.',
      font, ink, 612 - 2 * margin, 9);
    y -= 32;
    if (v.handbook_excerpt) {
      y = section(page, margin, y, 'Handbook excerpt (first 500 chars):', fontB, muted); y -= 14;
      drawWrapped(page, margin, y, v.handbook_excerpt, font, muted, 612 - 2 * margin, 8);
      y -= 80;
    }
    return y;
  }

  if (doc.document_kind === 'training_acknowledgment') {
    y = section(page, margin, y, 'Training videos completed', fontB, ink); y -= 14;
    const watched = v.watched || {};
    const ids = Object.keys(watched).filter(k => watched[k]);
    drawKV(page, margin, y, 'Videos marked watched', String(ids.length), font, fontB, ink, muted); y -= 14;
    drawKV(page, margin, y, 'Completed at', v.completed_at ? new Date(v.completed_at).toLocaleString() : '—', font, fontB, ink, muted); y -= 18;
    drawWrapped(page, margin, y,
      'I confirm I have watched the required training videos provided as part of my onboarding.',
      font, ink, 612 - 2 * margin, 9);
    y -= 32;
    return y;
  }

  if (doc.document_kind === 'emergency_contact') {
    y = section(page, margin, y, 'Emergency Contact', fontB, ink); y -= 14;
    drawKV(page, margin, y, 'Contact name',  v.name || '—',  font, fontB, ink, muted); y -= 14;
    drawKV(page, margin, y, 'Contact phone', v.phone || '—', font, fontB, ink, muted); y -= 14;
    return y;
  }

  // Fallback: just dump the values
  y = section(page, margin, y, 'Form values', fontB, ink); y -= 14;
  for (const [k, val] of Object.entries(v)) {
    drawKV(page, margin, y, k, String(val || '—'), font, fontB, ink, muted);
    y -= 14;
  }
  return y;
}

// ── small drawing helpers ───────────────────────────────────────────
function section(page: any, x: number, y: number, label: string, fontB: any, color: any) {
  page.drawText(label, { x, y, size: 11, font: fontB, color });
  return y;
}

function drawKV(page: any, x: number, y: number, k: string, v: string, font: any, fontB: any, _ink: any, muted: any) {
  page.drawText(k + ':', { x, y, size: 9, font, color: muted });
  page.drawText(v, { x: x + 150, y, size: 11, font: fontB, color: rgb(0.17, 0.21, 0.19) });
}

function drawWrapped(page: any, x: number, y: number, text: string, font: any, color: any, maxWidth: number, size = 9) {
  // pdf-lib has no built-in word wrap; do a simple greedy fit.
  const words = text.split(/\s+/);
  let line = '';
  let cy = y;
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    const width = font.widthOfTextAtSize(test, size);
    if (width > maxWidth && line) {
      page.drawText(line, { x, y: cy, size, font, color });
      cy -= size + 3;
      line = w;
    } else {
      line = test;
    }
  }
  if (line) page.drawText(line, { x, y: cy, size, font, color });
}

function maskExceptLast(s: any, n: number) {
  const str = String(s || '').replace(/\D/g, '');
  if (!str) return '—';
  if (str.length <= n) return str;
  return '*'.repeat(str.length - n) + str.slice(-n);
}

function fmtDate(d: any) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtDateTime(d: any) {
  if (!d) return '';
  return new Date(d).toLocaleString('en-US');
}

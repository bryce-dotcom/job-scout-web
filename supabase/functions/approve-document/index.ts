import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function base64ToBytes(b64: string): Uint8Array {
  const clean = b64.includes(',') ? b64.split(',').pop()! : b64
  const bin = atob(clean)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

/**
 * Stamp a gold "Certificate of Electronic Signature" block onto the last
 * page of a signed proposal PDF. Additive — the rest of the PDF is untouched.
 * Safe to call when any of the metadata is missing; the renderer just shows
 * a dash for the missing field rather than crashing.
 */
async function stampCertificateOnPdf(pdfBytes: Uint8Array, meta: {
  approverName?: string | null;
  approverEmail?: string | null;
  signatureMethod?: string | null;
  approvedAt: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  approvalId?: number | null;
  documentHash?: string | null;
  legalTermsHash?: string | null;
}): Promise<Uint8Array> {
  try {
    const pdfDoc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true })
    const pages = pdfDoc.getPages()
    if (pages.length === 0) return pdfBytes
    const last = pages[pages.length - 1]
    const { width, height } = last.getSize()

    const helv = await pdfDoc.embedFont(StandardFonts.Helvetica)
    const helvBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold)

    // Gold palette (matches proposalTheme.certGold*)
    const gold = rgb(212 / 255, 175 / 255, 55 / 255)
    const goldFill = rgb(250 / 255, 243 / 255, 219 / 255)
    const dark = rgb(44 / 255, 53 / 255, 48 / 255)
    const muted = rgb(125 / 255, 138 / 255, 127 / 255)

    const boxW = Math.min(width - 72, 480)
    const boxH = 130
    const boxX = (width - boxW) / 2
    const boxY = 50 // leave room for footer

    last.drawRectangle({
      x: boxX,
      y: boxY,
      width: boxW,
      height: boxH,
      color: goldFill,
      borderColor: gold,
      borderWidth: 1.2,
    })

    // Header
    last.drawText('ELECTRONICALLY SIGNED', {
      x: boxX + 16,
      y: boxY + boxH - 20,
      size: 12,
      font: helvBold,
      color: gold,
    })
    last.drawText('E-Sign Act Certificate of Authenticity', {
      x: boxX + 16,
      y: boxY + boxH - 34,
      size: 8,
      font: helv,
      color: muted,
    })

    // Two-column layout
    const colGap = 16
    const colW = (boxW - 32 - colGap) / 2
    const leftX = boxX + 16
    const rightX = leftX + colW + colGap

    const drawPair = (x: number, yOffset: number, label: string, value: string) => {
      last.drawText(label, { x, y: boxY + boxH - yOffset, size: 7, font: helvBold, color: muted })
      last.drawText(value || '-', { x, y: boxY + boxH - yOffset - 10, size: 9, font: helv, color: dark })
    }

    const ts = meta.approvedAt ? new Date(meta.approvedAt).toLocaleString('en-US', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZoneName: 'short',
    }) : '-'
    const methodLabel = meta.signatureMethod === 'drawn' ? 'Drawn' : meta.signatureMethod === 'typed' ? 'Typed' : 'Click-to-Approve'

    drawPair(leftX, 52, 'SIGNER NAME', meta.approverName || '-')
    drawPair(leftX, 78, 'SIGNER EMAIL', meta.approverEmail || '-')
    drawPair(leftX, 104, 'METHOD', methodLabel)

    drawPair(rightX, 52, 'SIGNED AT', ts)
    drawPair(rightX, 78, 'IP ADDRESS', meta.ipAddress || '-')
    drawPair(rightX, 104, 'APPROVAL ID', meta.approvalId ? String(meta.approvalId) : '-')

    // Hashes across the bottom (truncated, monospace-ish via courier)
    const courier = await pdfDoc.embedFont(StandardFonts.Courier)
    const hashY = boxY + 16
    last.drawText('DOC HASH:', { x: leftX, y: hashY + 8, size: 7, font: helvBold, color: muted })
    last.drawText((meta.documentHash || '-').slice(0, 24) + (meta.documentHash && meta.documentHash.length > 24 ? '…' : ''), {
      x: leftX + 45, y: hashY + 8, size: 7, font: courier, color: dark,
    })
    last.drawText('TERMS HASH:', { x: leftX, y: hashY, size: 7, font: helvBold, color: muted })
    last.drawText((meta.legalTermsHash || '-').slice(0, 24) + (meta.legalTermsHash && meta.legalTermsHash.length > 24 ? '…' : ''), {
      x: leftX + 55, y: hashY, size: 7, font: courier, color: dark,
    })

    // ESIGN Act reference line below the box
    last.drawText(
      'Captured per the U.S. Electronic Signatures in Global and National Commerce Act (15 U.S.C. \u00A7 7001 et seq.) and Utah Code \u00A7 46-4.',
      { x: boxX, y: boxY - 12, size: 6.5, font: helv, color: muted, maxWidth: boxW },
    )

    return await pdfDoc.save()
  } catch (err) {
    console.error('[approve-document] certificate stamp failed', err)
    return pdfBytes
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const {
      token,
      approver_name,
      approver_email,
      // Formal proposal additions — all optional, interactive flow sends none of these
      signature_method,           // 'drawn' | 'typed'
      signature_image_base64,     // PNG data url or raw base64 for drawn signatures
      signature_typed_text,       // typed name
      legal_terms_hash,           // sha256 hex of the terms at signing time
      signed_pdf_base64,          // final PDF rendered in the browser
    } = await req.json();

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

    if (tokenRow.is_revoked || new Date(tokenRow.expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: 'This link is no longer valid' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    if (tokenRow.document_type !== 'estimate') {
      return new Response(JSON.stringify({ error: 'Only estimates can be approved' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch the estimate and line items to compute hash
    const { data: estimate } = await supabase
      .from('quotes')
      .select('*')
      .eq('id', tokenRow.document_id)
      .single();

    if (!estimate) {
      return new Response(JSON.stringify({ error: 'Document not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: lines } = await supabase
      .from('quote_lines')
      .select('*')
      .eq('quote_id', estimate.id)
      .order('id');

    // Compute SHA-256 hash of document content
    const hashPayload = JSON.stringify({ estimate, lines: lines || [] });
    const encoder = new TextEncoder();
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(hashPayload));
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const documentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // Get IP and user agent
    const ipAddress = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown';
    const userAgent = req.headers.get('user-agent') || 'unknown';

    // --- Formal proposal: upload the drawn-signature image (if provided) ---
    let signatureImagePath: string | null = null
    if (signature_method === 'drawn' && signature_image_base64) {
      try {
        const bytes = base64ToBytes(signature_image_base64)
        const path = `signatures/${estimate.id}/${Date.now()}.png`
        const { error: upErr } = await supabase.storage
          .from('project-documents')
          .upload(path, bytes, { contentType: 'image/png', upsert: false })
        if (upErr) console.error('[approve-document] signature upload error', upErr)
        else signatureImagePath = path
      } catch (err) {
        console.error('[approve-document] signature decode error', err)
      }
    }

    // Record approval
    const { data: approvalInsert, error: approvalError } = await supabase
      .from('document_approvals')
      .insert({
        document_type: 'estimate',
        document_id: estimate.id,
        company_id: tokenRow.company_id,
        portal_token_id: tokenRow.id,
        approver_name: approver_name || null,
        approver_email: approver_email || null,
        ip_address: ipAddress,
        user_agent: userAgent,
        document_hash: documentHash,
        signature_image_path: signatureImagePath,
        signature_method: signature_method || null,
        signature_typed_text: signature_method === 'typed' ? (signature_typed_text || null) : null,
        legal_terms_hash: legal_terms_hash || null,
      })
      .select('id')
      .single();

    if (approvalError) {
      console.error('Approval insert error:', approvalError);
      return new Response(JSON.stringify({ error: 'Failed to record approval' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- Formal proposal: upload the signed PDF and link it to the estimate ---
    // We re-stamp the PDF server-side with a gold "Certificate of Electronic
    // Signature" block containing the real IP, user agent, approval id, and
    // hashes — none of which the client had before the approval was recorded.
    let signedAttachmentId: number | null = null
    if (signed_pdf_base64) {
      try {
        const rawPdfBytes = base64ToBytes(signed_pdf_base64)
        const stampedPdfBytes = await stampCertificateOnPdf(rawPdfBytes, {
          approverName: approver_name,
          approverEmail: approver_email,
          signatureMethod: signature_method || null,
          approvedAt: new Date().toISOString(),
          ipAddress,
          userAgent,
          approvalId: approvalInsert?.id || null,
          documentHash,
          legalTermsHash: legal_terms_hash || null,
        })
        const pdfBytes = stampedPdfBytes
        const pdfPath = `signed-proposals/${estimate.id}/${approvalInsert?.id || Date.now()}.pdf`
        const { error: pdfUpErr } = await supabase.storage
          .from('project-documents')
          .upload(pdfPath, pdfBytes, { contentType: 'application/pdf', upsert: true })
        if (pdfUpErr) {
          console.error('[approve-document] signed pdf upload error', pdfUpErr)
        } else {
          const { data: attRow, error: attErr } = await supabase
            .from('file_attachments')
            .insert({
              company_id: tokenRow.company_id,
              quote_id: estimate.id,
              file_name: `Signed_Proposal_${estimate.quote_id || estimate.id}.pdf`,
              file_path: pdfPath,
              file_type: 'application/pdf',
              file_size: pdfBytes.byteLength,
              storage_bucket: 'project-documents',
              photo_context: 'signed_proposal',
            })
            .select('id')
            .single()
          if (attErr) console.error('[approve-document] attachment insert error', attErr)
          else signedAttachmentId = attRow?.id ?? null
        }
      } catch (err) {
        console.error('[approve-document] signed pdf handling error', err)
      }
    }

    // Update estimate status to Approved (and attach the signed pdf pointer if we have one)
    const estimateUpdate: Record<string, unknown> = {
      status: 'Approved',
      updated_at: new Date().toISOString(),
    }
    if (signedAttachmentId) estimateUpdate.signed_proposal_attachment_id = signedAttachmentId
    await supabase.from('quotes').update(estimateUpdate).eq('id', estimate.id);

    // Canonical customer-signature columns: mirror whatever we just captured
    // onto the lead and job so attached W9s, credit apps, etc. can auto-stamp
    // without caring which document the customer signed on.
    const wroteSignature = !!(signature_method && (signatureImagePath || signature_typed_text))
    if (wroteSignature) {
      const signaturePatch: Record<string, unknown> = {
        customer_signature_path: signatureImagePath || null,
        customer_signature_typed: signature_method === 'typed' ? (signature_typed_text || null) : null,
        customer_signature_method: signature_method,
        customer_signature_captured_at: new Date().toISOString(),
      }
      if (estimate.lead_id) {
        const { error: sigLeadErr } = await supabase
          .from('leads')
          .update(signaturePatch)
          .eq('id', estimate.lead_id)
        if (sigLeadErr) console.error('[approve-document] lead signature update error', sigLeadErr)
      }
      if (estimate.job_id) {
        const { error: sigJobErr } = await supabase
          .from('jobs')
          .update(signaturePatch)
          .eq('id', estimate.job_id)
        if (sigJobErr) console.error('[approve-document] job signature update error', sigJobErr)
      }
    }

    // Update linked lead status to Won if lead_id exists
    if (estimate.lead_id) {
      await supabase
        .from('leads')
        .update({ status: 'Won', updated_at: new Date().toISOString() })
        .eq('id', estimate.lead_id);
    }

    // Broadcast an "Estimate Approved" notification to the whole company
    // so the rep team gets the toast + the salesperson who owns the quote
    // gets the owner-targeted confetti burst on their screen. Runs last so
    // the main approval work is already durable if this insert fails.
    try {
      let ownerName: string | null = null
      if (estimate.salesperson_id) {
        const { data: ownerRow } = await supabase
          .from('employees')
          .select('id, name')
          .eq('id', estimate.salesperson_id)
          .maybeSingle()
        ownerName = ownerRow?.name || null
      }
      const amount = parseFloat(String(estimate.quote_amount || 0)) || 0
      const { data: cust } = estimate.customer_id
        ? await supabase.from('customers').select('name, business_name').eq('id', estimate.customer_id).maybeSingle()
        : { data: null }
      const customerDisplayName = cust?.business_name || cust?.name || estimate.customer_name || '(Customer)'
      const amountStr = amount > 0 ? ` \u2014 $${amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : ''

      await supabase.from('company_notifications').insert({
        company_id: tokenRow.company_id,
        type: 'estimate_approved',
        title: 'Estimate Approved!',
        message: `${customerDisplayName}${amountStr} (${estimate.quote_id || `EST-${estimate.id}`})`,
        metadata: {
          quote_id: estimate.id,
          quote_number: estimate.quote_id || null,
          customer_name: customerDisplayName,
          amount,
          owner_employee_id: estimate.salesperson_id || null,
          owner_name: ownerName,
          source: 'portal',
          approver_name: approver_name || null,
          approver_method: signature_method || 'click_to_approve',
        },
        created_by: null, // portal approvals have no session user
      })
    } catch (notifErr) {
      console.error('[approve-document] notification insert failed', notifErr)
    }

    return new Response(JSON.stringify({
      success: true,
      approval: {
        id: approvalInsert?.id,
        approved_at: new Date().toISOString(),
        approver_name,
        approver_email,
        document_hash: documentHash,
        signature_method: signature_method || null,
        signed_proposal_attachment_id: signedAttachmentId,
      }
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error('approve-document error:', error);
    return new Response(JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});

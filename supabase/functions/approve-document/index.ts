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

    // Auto-create a job if one doesn't already exist. Without this the
    // estimate sits in "Approved" forever and never appears on the Sales
    // Won metric (which counts jobs, not approved quotes). Mirror what
    // EstimateDetail.handleConvertToJob does, simplified — line items + a
    // deposit invoice can be added later from the UI.
    let createdJobId: number | null = null
    try {
      if (!estimate.job_id) {
        // Resolve a real customer to attach to the job. Estimates that came
        // from a lead frequently have customer_id = null with all the
        // contact info living on the LEAD — approving then created a job
        // with no customer and blank name/phone/address (Doug: "customer
        // info not pulling through estimate -> job"). Find-or-create a
        // customer (identity-safe: email -> phone -> non-conflicting name,
        // mirroring src/lib/customerMatch.js) and stamp the contact fields.
        const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10)
        let resolvedCustomerId: number | null = estimate.customer_id || null
        let contactName = estimate.customer_name || ''
        let contactBusiness = ''
        let contactPhone = ''
        let contactAddress = ''

        let lead: { id: number; customer_name?: string; business_name?: string; email?: string; phone?: string; address?: string; customer_id?: number | null } | null = null
        if (estimate.lead_id) {
          const { data: leadRow } = await supabase
            .from('leads')
            .select('id, customer_name, business_name, email, phone, address, customer_id')
            .eq('id', estimate.lead_id)
            .maybeSingle()
          lead = leadRow || null
        }

        if (resolvedCustomerId) {
          const { data: c } = await supabase
            .from('customers').select('name, business_name, phone, address')
            .eq('id', resolvedCustomerId).maybeSingle()
          if (c) { contactName = c.name || contactName; contactBusiness = c.business_name || ''; contactPhone = c.phone || ''; contactAddress = c.address || '' }
        } else if (lead) {
          const e = String(lead.email || '').trim().toLowerCase()
          const p = digits(lead.phone)
          const nm = String(lead.customer_name || '').trim()
          let matchId: number | null = null
          if (e) {
            const { data } = await supabase.from('customers').select('id').eq('company_id', tokenRow.company_id).ilike('email', e).limit(1)
            if (data && data.length) matchId = data[0].id
          }
          if (!matchId && p.length >= 7) {
            const { data } = await supabase.from('customers').select('id, phone').eq('company_id', tokenRow.company_id).ilike('phone', `%${p.slice(-4)}%`).limit(25)
            const hit = (data || []).find((c: { phone?: string }) => digits(c.phone) === p)
            if (hit) matchId = hit.id
          }
          if (!matchId && nm) {
            const { data } = await supabase.from('customers').select('id, email, phone').eq('company_id', tokenRow.company_id).ilike('name', nm).limit(5)
            const safe = (data || []).find((c: { email?: string; phone?: string }) =>
              !(c.email && e && String(c.email).trim().toLowerCase() !== e) &&
              !(digits(c.phone) && p && digits(c.phone) !== p))
            if (safe) matchId = safe.id
          }
          if (matchId) {
            resolvedCustomerId = matchId
          } else {
            const { data: nc } = await supabase.from('customers').insert({
              company_id: tokenRow.company_id,
              name: nm || lead.business_name || 'Customer',
              business_name: lead.business_name || null,
              email: lead.email || null,
              phone: lead.phone || null,
              address: lead.address || null,
            }).select('id').single()
            if (nc) resolvedCustomerId = nc.id
          }
          contactName = nm; contactBusiness = lead.business_name || ''; contactPhone = lead.phone || ''; contactAddress = lead.address || ''
          // Link the lead to the customer so the rest of the system agrees.
          if (resolvedCustomerId && !lead.customer_id) {
            await supabase.from('leads').update({ customer_id: resolvedCustomerId }).eq('id', lead.id)
          }
        }

        const customerName = contactBusiness || contactName || 'Customer'
        const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`
        const { data: newJob, error: jobErr } = await supabase
          .from('jobs')
          .insert([{
            company_id: tokenRow.company_id,
            job_id: jobNumber,
            job_title: estimate.estimate_name || estimate.job_title || `${customerName} - Job`,
            customer_id: resolvedCustomerId,
            customer_name: contactName || customerName || null,
            job_address: contactAddress || null,
            phone: contactPhone || null,
            lead_id: estimate.lead_id ? parseInt(String(estimate.lead_id)) : null,
            salesperson_id: estimate.salesperson_id || null,
            quote_id: estimate.id,
            status: 'Chillin',
            start_date: estimate.service_date || new Date().toISOString(),
            job_total: parseFloat(String(estimate.quote_amount || 0)) || 0,
            utility_incentive: parseFloat(String(estimate.utility_incentive || 0)) || 0,
            // Combine estimate summary + notes + message so the job
            // page shows what was promised. Doug + Alayda's bug.
            details: [estimate.summary, estimate.notes, estimate.estimate_message].filter(Boolean).join('\n\n') || null,
            notes: [estimate.notes, estimate.summary].filter(Boolean).join('\n\n') || null,
            updated_at: new Date().toISOString(),
          }])
          .select('id')
          .single()
        if (jobErr) {
          console.error('[approve-document] job auto-create failed', jobErr)
        } else if (newJob?.id) {
          createdJobId = newJob.id
          // Link the new job back onto the quote so subsequent edits
          // (deposit photo, line items) find it.
          await supabase.from('quotes').update({ job_id: newJob.id }).eq('id', estimate.id)

          // Copy quote_lines → job_lines so the job shows the same line
          // items the customer accepted. Doug's Capital Lumber bug:
          // approved $54K quote with 2 line items, job_lines was empty.
          try {
            const { data: qLines } = await supabase
              .from('quote_lines')
              .select('company_id, item_id, item_name, description, quantity, price, line_total, total, discount, labor_cost, photos, notes, kind, taxable, unit_of_measure, sort_order, image_url')
              .eq('quote_id', estimate.id)
              .order('sort_order', { ascending: true, nullsFirst: false })

            if (qLines && qLines.length > 0) {
              const jobLineRows = qLines.map((ql: any, i: number) => ({
                company_id: ql.company_id || tokenRow.company_id,
                job_id: newJob.id,
                item_id: ql.item_id,
                item_name: ql.item_name,
                description: ql.description,
                quantity: ql.quantity,
                price: ql.price,
                total: ql.line_total ?? ql.total,
                totals: ql.line_total ?? ql.total,
                discount: ql.discount || 0,
                labor_cost: ql.labor_cost || 0,
                photos: ql.photos,
                notes: ql.notes,
                kind: ql.kind,
                taxable: ql.taxable,
                unit_of_measure: ql.unit_of_measure,
                // Preserve order — fall back to insertion index if sort_order missing
                job_line_id: `JL-${newJob.id}-${i + 1}`,
              }))
              const { error: lineErr } = await supabase.from('job_lines').insert(jobLineRows)
              if (lineErr) console.error('[approve-document] job_lines copy failed', lineErr)
              else console.log(`[approve-document] copied ${jobLineRows.length} quote_lines → job_lines for job ${newJob.id}`)
            }
          } catch (e) {
            console.error('[approve-document] job_lines copy exception', e)
          }
        }
      }
    } catch (e) {
      console.error('[approve-document] job auto-create exception', e)
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

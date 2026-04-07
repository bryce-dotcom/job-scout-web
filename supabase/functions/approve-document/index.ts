import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    let signedAttachmentId: number | null = null
    if (signed_pdf_base64) {
      try {
        const pdfBytes = base64ToBytes(signed_pdf_base64)
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

    // Update linked lead status to Won if lead_id exists
    if (estimate.lead_id) {
      await supabase
        .from('leads')
        .update({ status: 'Won', updated_at: new Date().toISOString() })
        .eq('id', estimate.lead_id);
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

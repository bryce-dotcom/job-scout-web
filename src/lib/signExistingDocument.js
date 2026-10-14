// Put the signature on a document that was created after the customer signed.
//
// The order of a real job is not the order the software assumed. A customer
// signs the proposal, the job starts, and only then does somebody work out
// which utility application and tax form this one needs and generate them.
// By that point the signature is nine days old and sitting on the job, and
// the new documents come out blank where it should be.
//
// Nothing here captures a signature. It takes the one the customer already
// gave — lib/customerSignature, the same source the proposal certificate was
// built from — and puts it where this document says signatures go
// (lib/signatureTargets). Re-signing is not re-consenting, so the audit trail
// records which signature was used and when it was applied.

import { supabase } from './supabase'
import { resolveCustomerSignature } from './customerSignature'
import { stampSignatureOnPdf } from './attachmentSignatureFiller'
import { signatureRects, describeSignability } from './signatureTargets'

const BUCKET = 'project-documents'

/** Is this attachment something we could sign at all? */
export function isSignablePdf(att) {
  if (!att) return false
  const name = String(att.file_name || '')
  const type = String(att.file_type || '')
  return type.includes('pdf') || /\.pdf$/i.test(name)
}

/**
 * Inspect an attachment: can it be signed, and does the customer have a
 * signature to put on it? Reads only — nothing is written.
 *
 * @returns {{ ok, signable, hasSignature, reason, rects, method, capturedAt }}
 */
export async function inspectDocumentForSigning(att, { jobId = null, leadId = null } = {}) {
  if (!isSignablePdf(att)) {
    return { ok: false, signable: false, hasSignature: false, reason: 'Only PDFs can be signed here.', rects: [] }
  }
  try {
    const { PDFDocument } = await import('pdf-lib')
    const { data: blob, error } = await supabase.storage.from(att.storage_bucket || BUCKET).download(att.file_path)
    if (error || !blob) return { ok: false, signable: false, hasSignature: false, reason: `Could not open the file: ${error?.message || 'not found'}`, rects: [] }

    const bytes = new Uint8Array(await blob.arrayBuffer())
    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const verdict = describeSignability(pdf, null)
    const sig = await resolveCustomerSignature({ jobId: jobId || att.job_id || null, leadId: leadId || att.lead_id || null })

    return {
      ok: true,
      signable: verdict.signable,
      hasSignature: !!sig.found,
      method: sig.method || null,
      capturedAt: sig.capturedAt || null,
      source: sig.source || null,
      reason: !verdict.signable
        ? verdict.reason
        : !sig.found
          ? 'This customer has not signed anything yet, so there is no signature to apply.'
          : verdict.reason,
      rects: signatureRects(pdf, null).rects,
    }
  } catch (err) {
    return { ok: false, signable: false, hasSignature: false, reason: err?.message || 'Could not read the document.', rects: [] }
  }
}

/**
 * Stamp the customer's signature onto an existing attachment.
 *
 * The signed file is uploaded beside the original and the attachment row is
 * repointed at it. The unsigned copy is left in storage rather than deleted:
 * it costs nothing to keep, and "what did this look like before we stamped
 * it" is exactly the question asked when a form is disputed.
 *
 * @param att      the file_attachments row
 * @param opts.jobId / opts.leadId  whose signature to use
 * @param opts.signatureFields      boxes placed by hand, if any
 * @returns {{ success, error?, fileName?, applied? }}
 */
export async function applySignatureToAttachment(att, { jobId = null, leadId = null, signatureFields = null } = {}) {
  if (!isSignablePdf(att)) return { success: false, error: 'Only PDFs can be signed here.' }

  try {
    const { PDFDocument } = await import('pdf-lib')
    const bucket = att.storage_bucket || BUCKET

    const { data: blob, error: dlErr } = await supabase.storage.from(bucket).download(att.file_path)
    if (dlErr || !blob) return { success: false, error: `Could not open the file: ${dlErr?.message || 'not found'}` }
    const bytes = new Uint8Array(await blob.arrayBuffer())

    const pdf = await PDFDocument.load(bytes, { ignoreEncryption: true })
    const { rects, source } = signatureRects(pdf, signatureFields)
    if (!rects.length) {
      return { success: false, error: describeSignability(pdf, signatureFields).reason }
    }

    const sig = await resolveCustomerSignature({ jobId: jobId || att.job_id || null, leadId: leadId || att.lead_id || null })
    if (!sig.found) return { success: false, error: 'This customer has not signed anything yet, so there is no signature to apply.' }

    const stamped = await stampSignatureOnPdf(bytes, {
      signatureBytes: sig.pngBytes,
      typedText: sig.typedText,
      signatureFields: rects,
    })

    const base = String(att.file_name || 'document').replace(/\.pdf$/i, '')
    const path = `${att.file_path.replace(/\.pdf$/i, '')}_signed_${Date.now()}.pdf`
    const { error: upErr } = await supabase.storage
      .from(bucket)
      .upload(path, new Blob([stamped], { type: 'application/pdf' }))
    if (upErr) return { success: false, error: `Upload failed: ${upErr.message}` }

    const { error: dbErr } = await supabase
      .from('file_attachments')
      .update({ file_path: path, file_size: stamped.byteLength || stamped.length })
      .eq('id', att.id)
    if (dbErr) return { success: false, error: `Could not update the document record: ${dbErr.message}` }

    return {
      success: true,
      fileName: `${base}.pdf`,
      applied: {
        places: rects.length,
        source,                       // 'configured' | 'detected'
        method: sig.method,           // 'drawn' | 'typed'
        signedAt: sig.capturedAt,
        from: sig.source,             // 'job' | 'lead'
      },
    }
  } catch (err) {
    return { success: false, error: err?.message || 'Could not sign the document.' }
  }
}

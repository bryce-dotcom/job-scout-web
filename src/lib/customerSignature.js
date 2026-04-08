// Canonical customer signature resolver.
//
// Reads the unified signature source on leads / jobs (populated by
// approve-document and the Lenard agents) and returns the decoded PNG
// bytes + metadata ready for a PDF stamper. Jobs win over leads so that
// the most recent signature a customer has given on the converted project
// is the one that ends up on new attachments.

import { supabase } from './supabase'

/**
 * Fetch the canonical customer signature for a lead/job/estimate.
 *
 * @param {Object} args
 * @param {number|null} args.jobId - Check jobs first if present
 * @param {number|null} args.leadId - Fall back to lead
 * @param {number|null} args.quoteId - Resolve lead/job from a quote if neither is provided
 * @returns {Promise<{
 *   found: boolean,
 *   method: 'drawn' | 'typed' | null,
 *   pngBytes: Uint8Array | null,
 *   typedText: string | null,
 *   capturedAt: string | null,
 *   storagePath: string | null,
 *   source: 'job' | 'lead' | null,
 * }>}
 */
export async function resolveCustomerSignature({ jobId = null, leadId = null, quoteId = null } = {}) {
  const empty = {
    found: false,
    method: null,
    pngBytes: null,
    typedText: null,
    capturedAt: null,
    storagePath: null,
    source: null,
  }

  // If only a quote id was passed, derive lead/job from it
  if (!jobId && !leadId && quoteId) {
    try {
      const { data } = await supabase
        .from('quotes')
        .select('lead_id, job_id')
        .eq('id', quoteId)
        .maybeSingle()
      if (data) {
        jobId = data.job_id || null
        leadId = data.lead_id || null
      }
    } catch (err) {
      console.warn('[resolveCustomerSignature] quote lookup failed', err)
    }
  }

  // Job wins over lead
  const readRow = async (table, id) => {
    if (!id) return null
    try {
      const { data } = await supabase
        .from(table)
        .select('customer_signature_path, customer_signature_typed, customer_signature_method, customer_signature_captured_at')
        .eq('id', id)
        .maybeSingle()
      return data || null
    } catch {
      return null
    }
  }

  const jobRow = await readRow('jobs', jobId)
  const row = (jobRow && (jobRow.customer_signature_path || jobRow.customer_signature_typed))
    ? { row: jobRow, source: 'job' }
    : null

  let resolved = row
  if (!resolved) {
    const leadRow = await readRow('leads', leadId)
    if (leadRow && (leadRow.customer_signature_path || leadRow.customer_signature_typed)) {
      resolved = { row: leadRow, source: 'lead' }
    }
  }

  if (!resolved) return empty

  const { row: r, source } = resolved
  const base = {
    found: true,
    method: r.customer_signature_method || null,
    pngBytes: null,
    typedText: r.customer_signature_typed || null,
    capturedAt: r.customer_signature_captured_at || null,
    storagePath: r.customer_signature_path || null,
    source,
  }

  if (r.customer_signature_path) {
    try {
      // Paths are stored in the project-documents bucket
      const { data: blob, error } = await supabase.storage
        .from('project-documents')
        .download(r.customer_signature_path)
      if (error) {
        console.warn('[resolveCustomerSignature] download error', error)
      } else if (blob) {
        const buf = await blob.arrayBuffer()
        base.pngBytes = new Uint8Array(buf)
      }
    } catch (err) {
      console.warn('[resolveCustomerSignature] download exception', err)
    }
  }

  return base
}

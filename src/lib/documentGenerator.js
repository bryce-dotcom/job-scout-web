import { supabase } from './supabase'
import { resolveAllMappings } from './dataPathResolver'
import { fillPdfForm } from './pdfFormFiller'
import { fillExcelTemplate, fillExcelCellMapping } from './excelTemplateFiller'

/**
 * Build a normalized data context for document template filling.
 * Matches the pattern from QuoteDetail.jsx line 126.
 */
export async function buildDataContext({ lead, job, audits, quotes, lineItems, appointment }) {
  const audit = audits?.[0] || null

  // Fetch audit_areas if we have an audit
  let areas = []
  if (audit?.id) {
    const { data } = await supabase
      .from('audit_areas')
      .select('*')
      .eq('audit_id', audit.id)
    areas = data || []
  }

  // Fetch utility provider if audit has one
  let provider = null
  if (audit?.utility_provider_id) {
    const { data } = await supabase
      .from('utility_providers')
      .select('*')
      .eq('id', audit.utility_provider_id)
      .single()
    provider = data
  }

  // Normalize customer from lead fields or job.customer join
  let customer = {}
  if (job?.customer) {
    const c = job.customer
    customer = {
      name: c.name || '',
      email: c.email || '',
      phone: c.phone || '',
      address: c.address || '',
      city: c.city || '',
      state: c.state || '',
      zip: c.zip || '',
      contact_name: c.contact_name || '',
      business_type: c.business_type || '',
      account_number: c.account_number || '',
    }
  } else if (lead) {
    customer = {
      name: lead.customer_name || '',
      email: lead.email || '',
      phone: lead.phone || '',
      address: lead.address || '',
    }
  }

  // Salesperson from job join or lead
  const salesperson = job?.salesperson || {}

  // Quote — use first quote if available
  const quote = quotes?.[0] || {}

  // Line items normalized
  const lines = (lineItems || []).map(li => ({
    item_name: li.item_name || li.item?.name || '',
    quantity: li.quantity || 0,
    price: li.price || 0,
    line_total: li.line_total || 0,
  }))

  // Build w9 convenience object from available customer/lead data
  const w9 = {
    name: customer.name || '',
    business_name: customer.name || '',
    tax_class: '',
    llc_class: '',
    other_class: '',
    exempt_payee: '',
    exempt_fatca: '',
    address: customer.address || '',
    city_state_zip: [customer.city, customer.state, customer.zip].filter(Boolean).join(', ') || '',
    account_numbers: customer.account_number || '',
    requester_name: '',
    ssn: '', ssn_1: '', ssn_2: '', ssn_3: '',
    ein: '', ein_1: '', ein_2: '',
    signature_date: new Date().toLocaleDateString('en-US'),
  }

  return {
    customer,
    audit: audit || {},
    quote,
    provider: provider || {},
    salesperson,
    audit_areas: areas,
    lines,
    appointment: appointment || {},
    lead: lead || {},
    job: job || {},
    w9,
  }
}

/**
 * Generate a filled document from a template and upload it as an attachment.
 *
 * @param {object} template - normalized template object (from document_templates or utility_forms)
 * @param {object} dataContext - from buildDataContext()
 * @param {object} opts - { entityType: 'lead'|'job', entityId, companyId, leadId }
 * @returns {{ success: boolean, fileName?: string, error?: string }}
 */
export async function generateAndUploadTemplate(template, dataContext, { entityType, entityId, companyId, leadId }) {
  try {
    const isUtility = template._source === 'utility_forms'
    const filePath = template.file_path || ''
    const fileName = template.file_name || template.form_name || 'document'
    const isExcel = /\.xlsx$/i.test(filePath) || /\.xlsx$/i.test(fileName)
    const ext = isExcel ? 'xlsx' : 'pdf'

    // Fetch template file bytes
    let fileBytes = null
    if (isUtility) {
      // Utility forms stored in utility-pdfs bucket (public)
      const { data } = supabase.storage.from('utility-pdfs').getPublicUrl(filePath)
      if (data?.publicUrl) {
        const res = await fetch(data.publicUrl)
        if (res.ok) fileBytes = new Uint8Array(await res.arrayBuffer())
      }
    } else {
      // Document templates stored in project-documents bucket (signed URL)
      const { data } = await supabase.storage.from('project-documents').createSignedUrl(filePath, 300)
      if (data?.signedUrl) {
        const res = await fetch(data.signedUrl)
        if (res.ok) fileBytes = new Uint8Array(await res.arrayBuffer())
      }
    }

    if (!fileBytes) {
      return { success: false, error: `Could not fetch template file: ${fileName}` }
    }

    // Resolve field mappings and fill
    const fieldMapping = template.field_mapping || {}
    let filledBytes

    if (isExcel) {
      const mode = fieldMapping._mode
      if (mode === 'cell-mapping') {
        filledBytes = fillExcelCellMapping(fileBytes, fieldMapping, dataContext)
      } else {
        filledBytes = fillExcelTemplate(fileBytes, dataContext)
      }
    } else {
      // PDF
      const fieldValues = resolveAllMappings(fieldMapping, dataContext)
      filledBytes = await fillPdfForm(fileBytes, fieldValues)
    }

    // Upload filled file
    const safeName = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9._-]/g, '_')
    const timestamp = Date.now()
    const uploadPath = `${entityType}s/${entityId}/${timestamp}_${safeName}.${ext}`

    const blob = new Blob([filledBytes], {
      type: isExcel
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf'
    })

    const { error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(uploadPath, blob)

    if (uploadError) {
      return { success: false, error: `Upload failed: ${uploadError.message}` }
    }

    // Insert file_attachments record
    const attachmentRecord = {
      company_id: companyId,
      file_name: `${safeName}.${ext}`,
      file_path: uploadPath,
      file_type: isExcel
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/pdf',
      file_size: filledBytes.byteLength || filledBytes.length,
      storage_bucket: 'project-documents',
    }

    if (entityType === 'lead') {
      attachmentRecord.lead_id = parseInt(entityId)
    } else if (entityType === 'job') {
      attachmentRecord.job_id = parseInt(entityId)
      if (leadId) attachmentRecord.lead_id = parseInt(leadId)
    }

    const { error: dbError } = await supabase.from('file_attachments').insert(attachmentRecord)
    if (dbError) {
      return { success: false, error: `DB record failed: ${dbError.message}` }
    }

    return { success: true, fileName: `${safeName}.${ext}` }
  } catch (err) {
    return { success: false, error: err.message || 'Unknown error' }
  }
}

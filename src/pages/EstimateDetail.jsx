import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { PAYMENT_METHODS } from '../lib/schema'
import ProductPickerModal from '../components/ProductPickerModal'
import { ArrowLeft, Plus, Trash2, Send, CheckCircle, XCircle, Briefcase, Calculator, FileText, Download, Settings, Mail, X, UserPlus, Paperclip, Copy, Camera, ChevronDown, ChevronRight } from 'lucide-react'
import { fillPdfForm, downloadPdf } from '../lib/pdfFormFiller'
import { resolveAllMappings } from '../lib/dataPathResolver'
import { generateEstimatePdf } from '../lib/estimatePdf'
import { toast } from '../lib/toast'

// Light theme fallback
const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

const statusColors = {
  'Draft': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
  'Sent': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
  'Approved': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Rejected': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' }
}

const DEFAULT_SETTINGS = {
  show_logo: true,
  show_company_address: true,
  show_company_phone: true,
  show_company_email: true,
  show_customer_company: true,
  show_line_descriptions: true,
  show_line_images: false,
  show_technician: true,
  show_service_date: true,
  pdf_layout: 'email',
  estimate_message: ''
}

export default function EstimateDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const products = useStore((state) => state.products)
  const employees = useStore((state) => state.employees)
  const prescriptiveMeasures = useStore((state) => state.prescriptiveMeasures)
  const leads = useStore((state) => state.leads)
  const fetchQuotes = useStore((state) => state.fetchQuotes)
  const fetchJobs = useStore((state) => state.fetchJobs)
  const fetchLeads = useStore((state) => state.fetchLeads)
  const createQuoteLine = useStore((state) => state.createQuoteLine)
  const deleteQuoteLine = useStore((state) => state.deleteQuoteLine)
  const updateQuote = useStore((state) => state.updateQuote)
  const deleteQuote = useStore((state) => state.deleteQuote)
  const updateLead = useStore((state) => state.updateLead)
  const settings = useStore((state) => state.settings)
  const businessUnits = useStore((state) => state.businessUnits)

  const [estimate, setEstimate] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showProductPicker, setShowProductPicker] = useState(false)
  const [calculatingIncentive, setCalculatingIncentive] = useState(false)
  const [rebateForms, setRebateForms] = useState([])
  const [fillingForm, setFillingForm] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showDepositModal, setShowDepositModal] = useState(false)
  const [showSendModal, setShowSendModal] = useState(false)
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [convertingToJob, setConvertingToJob] = useState(false)
  const [expandedLineId, setExpandedLineId] = useState(null)
  const [viewingPhoto, setViewingPhoto] = useState(null)
  const [showCreateLead, setShowCreateLead] = useState(false)
  const [creatingLead, setCreatingLead] = useState(false)
  const [newLeadForm, setNewLeadForm] = useState({
    customer_name: '',
    phone: '',
    email: '',
    address: '',
    business_name: ''
  })

  const [depositForm, setDepositForm] = useState({
    deposit_amount: '',
    deposit_method: '',
    deposit_date: new Date().toISOString().slice(0, 10),
    deposit_notes: ''
  })
  const [depositPhoto, setDepositPhoto] = useState(null) // { file, preview }
  const [depositPhotoUploading, setDepositPhotoUploading] = useState(false)
  const [sendEmail, setSendEmail] = useState('')

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Get company defaults for estimate settings
  const getEstimateDefaults = () => {
    const defaultsSetting = settings.find(s => s.key === 'estimate_defaults')
    if (defaultsSetting) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(defaultsSetting.value) }
      } catch { /* ignore */ }
    }
    return DEFAULT_SETTINGS
  }

  const getEffectiveSettings = () => {
    const defaults = getEstimateDefaults()
    if (estimate?.settings_overrides) {
      return { ...defaults, ...estimate.settings_overrides }
    }
    return defaults
  }

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchEstimateData()
  }, [companyId, id, navigate])

  const fetchEstimateData = async () => {
    setLoading(true)

    // Try with technician join first; if the column doesn't exist yet fall back
    let estimateData = null
    const baseSelect = '*, lead:leads(id, customer_name, phone, email, address), customer:customers(id, name, email, phone, address, business_name), salesperson:employees!salesperson_id(id, name)'
    const { data: d1, error: e1 } = await supabase
      .from('quotes')
      .select(baseSelect + ', technician:employees!technician_id(id, name)')
      .eq('id', id)
      .single()

    if (!e1) {
      estimateData = d1
    } else {
      // Fallback without technician join (column may not exist yet)
      const { data: d2 } = await supabase
        .from('quotes')
        .select(baseSelect)
        .eq('id', id)
        .single()
      estimateData = d2
    }

    if (estimateData) {
      setEstimate(estimateData)

      // Try ordering by sort_order; fall back to id if column doesn't exist yet
      let lines = null
      const { data: l1, error: lErr } = await supabase
        .from('quote_lines')
        .select('*, item:products_services(id, name, description)')
        .eq('quote_id', id)
        .order('sort_order', { ascending: true })
      if (!lErr) {
        lines = l1
      } else {
        const { data: l2 } = await supabase
          .from('quote_lines')
          .select('*, item:products_services(id, name, description)')
          .eq('quote_id', id)
          .order('id')
        lines = l2
      }

      setLineItems(lines || [])

      // Pre-fill send email from customer
      const custEmail = estimateData.customer?.email || estimateData.lead?.email || ''
      setSendEmail(estimateData.sent_to_email || custEmail)

      // Pre-fill create lead form from customer info
      const ci = estimateData.customer || estimateData.lead
      if (ci) {
        setNewLeadForm({
          customer_name: ci.name || ci.customer_name || '',
          phone: ci.phone || '',
          email: ci.email || '',
          address: ci.address || '',
          business_name: ci.business_name || ''
        })
      }

      // Fetch attachments linked to this estimate
      try {
        const { data: atts } = await supabase
          .from('file_attachments')
          .select('*')
          .eq('quote_id', id)
          .order('created_at', { ascending: false })
        setAttachments(atts || [])
      } catch {
        // quote_id column may not exist yet (migration not applied)
        setAttachments([])
      }

      // Load mapped rebate forms if estimate has an audit
      if (estimateData.audit_id) {
        const { data: audit } = await supabase
          .from('lighting_audits')
          .select('utility_provider_id')
          .eq('id', estimateData.audit_id)
          .single()
        if (audit?.utility_provider_id) {
          const { data: providerForms } = await supabase
            .from('utility_forms')
            .select('*')
            .eq('provider_id', audit.utility_provider_id)
            .eq('status', 'published')
          setRebateForms(providerForms || [])
        }
      }
    }

    setLoading(false)
  }

  const handleFillRebateForm = async (form) => {
    setFillingForm(true)
    try {
      const { data: audit } = await supabase
        .from('lighting_audits')
        .select('*')
        .eq('id', estimate.audit_id)
        .single()

      const { data: areas } = await supabase
        .from('audit_areas')
        .select('*')
        .eq('audit_id', estimate.audit_id)

      const { data: provider } = audit?.utility_provider_id
        ? await supabase.from('utility_providers').select('*').eq('id', audit.utility_provider_id).single()
        : { data: null }

      const customer = estimate.customer || estimate.lead
      const salesperson = estimate.salesperson

      const dataContext = {
        customer: {
          name: customer?.name || customer?.customer_name || '',
          email: customer?.email || '',
          phone: customer?.phone || '',
          address: customer?.address || '',
        },
        audit: audit || {},
        quote: estimate || {},
        provider: provider || {},
        salesperson: salesperson || {},
        audit_areas: areas || [],
        lines: lineItems.map(li => ({
          item_name: li.item_name || li.item?.name || '',
          quantity: li.quantity || 0,
          price: li.price || 0,
          line_total: li.line_total || 0,
        })),
      }

      const fieldValues = resolveAllMappings(form.field_mapping, dataContext)

      let pdfBytes = null
      if (form.form_file) {
        const { data } = supabase.storage.from('utility-pdfs').getPublicUrl(form.form_file)
        if (data?.publicUrl) {
          const res = await fetch(data.publicUrl)
          if (res.ok) pdfBytes = new Uint8Array(await res.arrayBuffer())
        }
      }
      if (!pdfBytes && form.form_url) {
        const res = await fetch(form.form_url)
        if (res.ok) pdfBytes = new Uint8Array(await res.arrayBuffer())
      }

      if (!pdfBytes) {
        alert('Could not fetch the PDF form. The file may need to be re-uploaded in the Data Console.')
        setFillingForm(false)
        return
      }

      const filledBytes = await fillPdfForm(pdfBytes, fieldValues)
      const providerSlug = (provider?.provider_name || 'form').replace(/[^a-zA-Z0-9]/g, '_')
      const customerSlug = (customer?.name || customer?.customer_name || 'customer').replace(/[^a-zA-Z0-9]/g, '_')
      const date = new Date().toISOString().slice(0, 10)
      downloadPdf(filledBytes, `${providerSlug}_${form.form_name.replace(/[^a-zA-Z0-9]/g, '_')}_${customerSlug}_${date}.pdf`)
    } catch (err) {
      alert('Error filling form: ' + err.message)
    }
    setFillingForm(false)
  }

  const handleDownloadBlankForm = async (form) => {
    setFillingForm(true)
    try {
      let pdfBytes = null
      if (form.form_file) {
        const { data } = supabase.storage.from('utility-pdfs').getPublicUrl(form.form_file)
        if (data?.publicUrl) {
          const res = await fetch(data.publicUrl)
          if (res.ok) pdfBytes = new Uint8Array(await res.arrayBuffer())
        }
      }
      if (!pdfBytes && form.form_url) {
        const res = await supabase.functions.invoke('parse-utility-pdf', {
          body: { pdf_url: form.form_url, document_type: 'form', store_in_storage: false }
        })
        if (res.data?.pdf_base64) {
          const binary = atob(res.data.pdf_base64)
          pdfBytes = new Uint8Array(binary.length)
          for (let i = 0; i < binary.length; i++) pdfBytes[i] = binary.charCodeAt(i)
        }
      }
      if (pdfBytes) {
        downloadPdf(pdfBytes, `${form.form_name.replace(/[^a-zA-Z0-9]/g, '_')}.pdf`)
      } else {
        alert('Could not download form PDF.')
      }
    } catch (err) {
      alert('Download error: ' + err.message)
    }
    setFillingForm(false)
  }

  const handleQuantityChange = async (line, newQty) => {
    const qty = Math.max(1, parseInt(newQty) || 1)
    const unitPrice = parseFloat(line.price) || 0
    const discount = parseFloat(line.discount) || 0
    const newTotal = (unitPrice * qty) - discount

    setLineItems(prev => prev.map(l => l.id === line.id ? { ...l, quantity: qty, line_total: newTotal } : l))

    await supabase.from('quote_lines').update({
      quantity: qty,
      line_total: newTotal
    }).eq('id', line.id)

    await updateEstimateTotal()
    await fetchEstimateData()
  }

  const handlePriceChange = async (line, newPrice) => {
    const basePrice = parseFloat(line.item?.price) || parseFloat(line.price) || 0
    const price = Math.max(basePrice, parseFloat(newPrice) || basePrice)
    const discount = parseFloat(line.discount) || 0
    const newTotal = (price * (line.quantity || 1)) - discount

    setLineItems(prev => prev.map(l => l.id === line.id ? { ...l, price, line_total: newTotal } : l))

    await supabase.from('quote_lines').update({
      price,
      line_total: newTotal
    }).eq('id', line.id)

    await updateEstimateTotal()
    await fetchEstimateData()
  }

  const handleDiscountChange = async (line, newDiscount) => {
    const discount = Math.max(0, parseFloat(newDiscount) || 0)
    const unitPrice = parseFloat(line.price) || 0
    const lineSubtotal = unitPrice * (line.quantity || 1)
    const cappedDiscount = Math.min(discount, lineSubtotal)
    const newTotal = lineSubtotal - cappedDiscount

    setLineItems(prev => prev.map(l => l.id === line.id ? { ...l, discount: cappedDiscount, line_total: newTotal } : l))

    await supabase.from('quote_lines').update({
      discount: cappedDiscount,
      line_total: newTotal
    }).eq('id', line.id)

    await updateEstimateTotal()
    await fetchEstimateData()
  }

  const handleLinePhotoUpload = async (lineId, e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop()
    const path = `estimates/${id}/lines/${lineId}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('project-documents')
      .upload(path, file)
    if (uploadErr) {
      toast.error('Photo upload failed: ' + uploadErr.message)
      return
    }

    const { data: urlData } = supabase.storage.from('project-documents').getPublicUrl(path)
    const photoUrl = urlData.publicUrl

    const line = lineItems.find(l => l.id === lineId)
    const updatedPhotos = [...(line?.photos || []), photoUrl]

    setLineItems(prev => prev.map(l => l.id === lineId ? { ...l, photos: updatedPhotos } : l))
    await supabase.from('quote_lines').update({ photos: updatedPhotos }).eq('id', lineId)
  }

  const handleLinePhotoDelete = async (lineId, photoUrl) => {
    const line = lineItems.find(l => l.id === lineId)
    const updatedPhotos = (line?.photos || []).filter(p => p !== photoUrl)

    setLineItems(prev => prev.map(l => l.id === lineId ? { ...l, photos: updatedPhotos } : l))
    await supabase.from('quote_lines').update({ photos: updatedPhotos }).eq('id', lineId)

    // Try to delete from storage (best effort)
    try {
      const url = new URL(photoUrl)
      const storagePath = url.pathname.split('/object/public/project-documents/')[1]
      if (storagePath) {
        await supabase.storage.from('project-documents').remove([decodeURIComponent(storagePath)])
      }
    } catch (_) { /* ignore storage cleanup errors */ }
  }

  const handleProductSelect = async (product, laborCost, totalPrice) => {
    setSaving(true)
    setShowProductPicker(false)

    await createQuoteLine({
      company_id: companyId,
      quote_id: id,
      item_id: product.id,
      quantity: 1,
      price: totalPrice,
      line_total: totalPrice
    })

    await updateEstimateTotal()
    await fetchEstimateData()
    setSaving(false)
  }

  const duplicateLineItem = async (line) => {
    setSaving(true)
    await createQuoteLine({
      company_id: companyId,
      quote_id: id,
      item_id: line.item_id,
      quantity: line.quantity,
      price: line.price,
      discount: line.discount || 0,
      line_total: line.line_total,
      notes: line.notes || null
    })
    await updateEstimateTotal()
    await fetchEstimateData()
    setSaving(false)
  }

  const handleLineNotesChange = async (line, newNotes) => {
    setLineItems(prev => prev.map(l => l.id === line.id ? { ...l, notes: newNotes } : l))
    await supabase.from('quote_lines').update({ notes: newNotes || null }).eq('id', line.id)
  }

  const removeLineItem = async (lineId) => {
    setSaving(true)
    await deleteQuoteLine(lineId)
    await updateEstimateTotal()
    await fetchEstimateData()
    setSaving(false)
  }

  const updateEstimateTotal = async () => {
    const allQuoteLines = useStore.getState().quoteLines || []
    const lines = allQuoteLines.filter(l => String(l.quote_id) === String(id))
    const total = lines.reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)
    await updateQuote(id, { quote_amount: total, updated_at: new Date().toISOString() })
  }

  const updateEstimateField = async (field, value) => {
    setSaving(true)
    setEstimate(prev => ({ ...prev, [field]: value }))
    await updateQuote(id, { [field]: value, updated_at: new Date().toISOString() })
    setSaving(false)
  }

  const updateMultipleFields = async (changes) => {
    setSaving(true)
    await updateQuote(id, { ...changes, updated_at: new Date().toISOString() })
    await fetchEstimateData()
    setSaving(false)
  }

  const sendEstimate = async () => {
    await updateQuote(id, { status: 'Sent', sent_date: new Date().toISOString(), updated_at: new Date().toISOString() })
    await fetchEstimateData()
    await fetchQuotes()
  }

  const rejectEstimate = async () => {
    await updateEstimateField('status', 'Rejected')
    await fetchQuotes()
  }

  // Approval + Deposit flow (approval only - no auto job creation)
  const handleApproveWithDeposit = async () => {
    setSaving(true)
    try {
      let photoUrl = null

      // Upload deposit photo if captured
      if (depositPhoto?.file) {
        const ext = depositPhoto.file.name.split('.').pop()
        const path = `estimates/${id}/deposit/${Date.now()}.${ext}`
        const { error: uploadErr } = await supabase.storage
          .from('project-documents')
          .upload(path, depositPhoto.file, { contentType: depositPhoto.file.type })
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from('project-documents').getPublicUrl(path)
          photoUrl = urlData.publicUrl
        }
      }

      const depositAmount = parseFloat(depositForm.deposit_amount) || 0

      const updates = {
        status: 'Approved',
        deposit_amount: depositAmount,
        deposit_method: depositForm.deposit_method || null,
        deposit_date: depositForm.deposit_date || null,
        deposit_notes: depositForm.deposit_notes || null,
        deposit_photo: photoUrl,
        updated_at: new Date().toISOString()
      }
      await updateQuote(id, updates)

      // Create a payment record linked to the estimate so it can be applied to invoice/job later
      if (depositAmount > 0) {
        const paymentId = `DEP-${Date.now().toString(36).toUpperCase()}`
        await supabase.from('payments').insert([{
          company_id: companyId,
          payment_id: paymentId,
          amount: depositAmount,
          date: depositForm.deposit_date || new Date().toISOString().split('T')[0],
          method: depositForm.deposit_method || null,
          status: 'Completed',
          notes: `Deposit for estimate ${estimate.quote_id}${depositForm.deposit_notes ? ' — ' + depositForm.deposit_notes : ''}`,
          is_deposit: true,
          quote_id: parseInt(id),
          receipt_photo: photoUrl
        }])
      }

      // Update linked lead status if exists
      if (estimate.lead_id) {
        await updateLead(estimate.lead_id, { status: 'Won', updated_at: new Date().toISOString() })
      }

      toast.success('Estimate approved!')
      setShowDepositModal(false)
      setDepositPhoto(null)
      await fetchEstimateData()
      await fetchQuotes()
    } catch (err) {
      toast.error('Error: ' + err.message)
    }
    setSaving(false)
  }

  const handleSkipDeposit = async () => {
    setSaving(true)
    try {
      const updates = {
        status: 'Approved',
        deposit_amount: 0,
        updated_at: new Date().toISOString()
      }
      await updateQuote(id, updates)

      if (estimate.lead_id) {
        await updateLead(estimate.lead_id, { status: 'Won', updated_at: new Date().toISOString() })
      }

      toast.success('Estimate approved!')
      setShowDepositModal(false)
      await fetchEstimateData()
      await fetchQuotes()
    } catch (err) {
      toast.error('Error: ' + err.message)
    }
    setSaving(false)
  }

  // Convert approved estimate to a Job
  const handleConvertToJob = async () => {
    if (!confirm('Convert this estimate to a Job?')) return
    setConvertingToJob(true)
    try {
      // 1. Find or create customer
      let customerId = estimate.customer_id || null
      const customerInfo = estimate.customer || estimate.lead
      const customerName = customerInfo?.name || customerInfo?.customer_name || ''

      if (!customerId && customerName) {
        const { data: existing } = await supabase
          .from('customers')
          .select('id')
          .eq('company_id', companyId)
          .ilike('name', customerName.trim())
          .limit(1)

        if (existing?.length > 0) {
          customerId = existing[0].id
        } else {
          const { data: newCust, error: custErr } = await supabase
            .from('customers')
            .insert({
              company_id: companyId,
              name: customerName.trim(),
              phone: customerInfo?.phone || null,
              email: customerInfo?.email || null,
              address: customerInfo?.address || null,
            })
            .select()
            .single()
          if (custErr) throw custErr
          customerId = newCust.id
        }
      }

      // 2. Create the job
      const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`
      const { data: newJob, error: jobError } = await supabase
        .from('jobs')
        .insert([{
          company_id: companyId,
          job_id: jobNumber,
          job_title: estimate.estimate_name || estimate.service_type || `${customerName} - Job`,
          customer_id: customerId,
          lead_id: estimate.lead_id ? parseInt(estimate.lead_id) : null,
          salesperson_id: estimate.salesperson_id || null,
          quote_id: estimate.id,
          job_address: customerInfo?.address || null,
          status: 'Scheduled',
          start_date: estimate.service_date || new Date().toISOString(),
          total_amount: subtotal - discount,
          utility_incentive: parseFloat(estimate.utility_incentive) || 0,
          details: estimate.summary || null,
          updated_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (jobError) throw jobError

      // 3. Copy quote lines to job lines
      if (lineItems.length > 0) {
        const jobLines = lineItems.map(line => ({
          company_id: companyId,
          job_id: newJob.id,
          item_id: line.item_id || null,
          quantity: line.quantity || 1,
          price: line.price || 0,
          total: line.line_total || 0,
          notes: line.notes || null,
          photos: line.photos || []
        }))
        await supabase.from('job_lines').insert(jobLines)
      }

      // 4. Link attachments to the new job
      if (attachments.length > 0) {
        for (const att of attachments) {
          await supabase
            .from('file_attachments')
            .update({ job_id: newJob.id })
            .eq('id', att.id)
        }
      }

      // 5. Link job back to estimate
      await updateQuote(id, { job_id: newJob.id, customer_id: customerId, updated_at: new Date().toISOString() })

      // 6. Update lead status if linked
      if (estimate.lead_id) {
        await updateLead(estimate.lead_id, {
          status: 'Job Scheduled',
          converted_customer_id: customerId,
          updated_at: new Date().toISOString()
        })
        await fetchLeads()
      }

      toast.success(`Job ${jobNumber} created!`)
      await fetchJobs()
      await fetchEstimateData()
      await fetchQuotes()
    } catch (err) {
      toast.error('Failed to convert: ' + err.message)
    }
    setConvertingToJob(false)
  }

  // Create a new lead from estimate
  const handleCreateLead = async (e) => {
    e.preventDefault()
    if (!newLeadForm.customer_name.trim()) {
      toast.error('Customer name is required.')
      return
    }
    setCreatingLead(true)
    try {
      const { data: newLead, error: leadErr } = await supabase
        .from('leads')
        .insert({
          company_id: companyId,
          customer_name: newLeadForm.customer_name.trim(),
          business_name: newLeadForm.business_name || null,
          phone: newLeadForm.phone || null,
          email: newLeadForm.email || null,
          address: newLeadForm.address || null,
          service_type: estimate.service_type || null,
          status: 'Quote Sent',
          salesperson_id: estimate.salesperson_id || null,
          quote_id: estimate.id,
          quote_amount: parseFloat(estimate.quote_amount) || 0,
          notes: estimate.summary || null
        })
        .select()
        .single()

      if (leadErr) throw leadErr

      // Link estimate to the new lead
      await updateQuote(id, { lead_id: newLead.id, updated_at: new Date().toISOString() })

      toast.success('Lead created and linked!')
      setShowCreateLead(false)
      await fetchLeads()
      await fetchEstimateData()
      await fetchQuotes()
    } catch (err) {
      toast.error('Failed to create lead: ' + err.message)
    }
    setCreatingLead(false)
  }

  // Look up the full business unit object by name
  const getBusinessUnitObject = () => {
    if (!estimate?.business_unit) return null
    const bu = (businessUnits || []).find(b => {
      const name = typeof b === 'string' ? b : b.name
      return name === estimate.business_unit
    })
    return bu && typeof bu === 'object' ? bu : null
  }

  // PDF Generation
  const handleGeneratePdf = async () => {
    if (!estimate.business_unit) {
      toast.error('Please select a Business Unit before generating a PDF.')
      return
    }
    setGeneratingPdf(true)
    try {
      const effectiveSettings = getEffectiveSettings()
      const buObject = getBusinessUnitObject()
      const pdfBlob = await generateEstimatePdf({
        estimate,
        lineItems,
        company,
        settings: effectiveSettings,
        layout: effectiveSettings.pdf_layout || 'email',
        businessUnit: buObject
      })

      // Upload to Supabase Storage
      const fileName = `estimates/${companyId}/${estimate.quote_id || estimate.id}_${Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true })

      if (uploadError) {
        // Still allow local download even if upload fails
        console.error('Upload error:', uploadError)
        toast.error('PDF generated but upload failed. Downloading locally.')
      } else {
        await updateQuote(id, { pdf_url: fileName, pdf_layout: effectiveSettings.pdf_layout })

        // Save as file_attachment linked to this estimate
        try {
          await supabase.from('file_attachments').insert({
            company_id: companyId,
            quote_id: parseInt(id),
            lead_id: estimate.lead_id ? parseInt(estimate.lead_id) : null,
            file_name: `${estimate.quote_id || 'estimate'}.pdf`,
            file_path: fileName,
            file_type: 'application/pdf',
            file_size: pdfBlob.size,
            storage_bucket: 'project-documents'
          })
        } catch {
          // quote_id column may not exist yet
        }

        toast.success('PDF generated and saved!')
      }

      // Download locally
      const url = URL.createObjectURL(pdfBlob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${estimate.quote_id || 'estimate'}.pdf`
      a.click()
      URL.revokeObjectURL(url)

      await fetchEstimateData()
    } catch (err) {
      toast.error('PDF generation failed: ' + err.message)
    }
    setGeneratingPdf(false)
  }

  const handleDownloadPdf = async () => {
    if (!estimate.pdf_url) return
    try {
      const { data } = await supabase.storage
        .from('project-documents')
        .download(estimate.pdf_url)
      if (data) {
        const url = URL.createObjectURL(data)
        const a = document.createElement('a')
        a.href = url
        a.download = `${estimate.quote_id || 'estimate'}.pdf`
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch (err) {
      toast.error('Download failed: ' + err.message)
    }
  }

  // Email sending
  const handleSendEmail = async () => {
    if (!sendEmail) {
      toast.error('Please enter a recipient email.')
      return
    }
    if (!estimate.business_unit) {
      toast.error('Please select a Business Unit before sending.')
      return
    }
    setSendingEmail(true)
    try {
      const buObject = getBusinessUnitObject()
      // Auto-generate PDF if none exists
      if (!estimate.pdf_url) {
        const effectiveSettings = getEffectiveSettings()
        const pdfBlob = await generateEstimatePdf({
          estimate,
          lineItems,
          company,
          settings: effectiveSettings,
          layout: effectiveSettings.pdf_layout || 'email',
          businessUnit: buObject
        })
        const fileName = `estimates/${companyId}/${estimate.quote_id || estimate.id}_${Date.now()}.pdf`
        await supabase.storage
          .from('project-documents')
          .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true })
        await updateQuote(id, { pdf_url: fileName })
        estimate.pdf_url = fileName
      }

      // Create portal token
      const { data: portalToken, error: tokenErr } = await supabase
        .from('customer_portal_tokens')
        .insert({
          document_type: 'estimate',
          document_id: estimate.id,
          company_id: companyId,
          customer_id: estimate.customer_id || null,
          expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
        })
        .select('token')
        .single()

      const portalUrl = portalToken?.token
        ? `${window.location.origin}/portal/${portalToken.token}`
        : null

      // Call edge function
      const { error: fnError } = await supabase.functions.invoke('send-estimate', {
        body: {
          company_id: companyId,
          estimate_id: estimate.id,
          recipient_email: sendEmail,
          pdf_storage_path: estimate.pdf_url,
          company_name: company?.company_name || '',
          estimate_number: estimate.quote_id || `EST-${estimate.id}`,
          portal_url: portalUrl,
          business_unit_name: buObject?.name || estimate.business_unit || '',
          business_unit_phone: buObject?.phone || company?.phone || '',
          business_unit_email: buObject?.email || company?.owner_email || '',
          business_unit_address: buObject?.address || company?.address || ''
        }
      })

      if (fnError) throw fnError

      // Update estimate
      await updateQuote(id, {
        status: estimate.status === 'Draft' ? 'Sent' : estimate.status,
        last_sent_at: new Date().toISOString(),
        sent_to_email: sendEmail,
        sent_date: estimate.sent_date || new Date().toISOString(),
        portal_token: portalToken?.token || null,
        updated_at: new Date().toISOString()
      })

      toast.success('Estimate sent successfully!')
      setShowSendModal(false)
      await fetchEstimateData()
      await fetchQuotes()
    } catch (err) {
      toast.error('Failed to send: ' + err.message)
    }
    setSendingEmail(false)
  }

  // Settings save
  const saveSettingsOverrides = async (newSettings) => {
    await updateQuote(id, { settings_overrides: newSettings, updated_at: new Date().toISOString() })
    await fetchEstimateData()
  }

  const calculateIncentive = async () => {
    if (!estimate.audit_id) {
      alert('This estimate is not linked to a lighting audit. Link an audit first to auto-calculate incentives.')
      return
    }
    if (!prescriptiveMeasures || prescriptiveMeasures.length === 0) {
      alert('No prescriptive measures data available. Enrich utility PDFs in the Data Console first.')
      return
    }

    setCalculatingIncentive(true)
    try {
      const { data: audit } = await supabase
        .from('lighting_audits')
        .select('*')
        .eq('id', estimate.audit_id)
        .single()

      if (!audit) {
        alert('Linked audit not found.')
        setCalculatingIncentive(false)
        return
      }

      const { data: areas } = await supabase
        .from('audit_areas')
        .select('*')
        .eq('audit_id', estimate.audit_id)

      if (!areas || areas.length === 0) {
        alert('No audit areas found for the linked audit.')
        setCalculatingIncentive(false)
        return
      }

      let totalIncentive = 0
      const today = new Date().toISOString().slice(0, 10)

      for (const area of areas) {
        const areaWattsReduced = (area.fixture_count || 0) * ((area.existing_wattage || 0) - (area.led_wattage || 0))

        const matches = prescriptiveMeasures.filter(pm => {
          if (pm.measure_category !== 'Lighting') return false
          if (pm.measure_subcategory?.toLowerCase() !== area.fixture_category?.toLowerCase()) return false
          if (pm.expiration_date && pm.expiration_date < today) return false
          const providerMatch = !audit.utility_provider_id || pm.program?.provider_id === audit.utility_provider_id
          return providerMatch
        })

        const match = matches.length > 0
          ? matches.reduce((best, pm) => {
              const diff = Math.abs((pm.baseline_wattage || 0) - (area.existing_wattage || 0))
              const bestDiff = Math.abs((best.baseline_wattage || 0) - (area.existing_wattage || 0))
              return diff < bestDiff ? pm : best
            })
          : null

        if (match) {
          const amount = match.incentive_amount || 0
          const unit = match.incentive_unit || 'per_fixture'
          let areaIncentive = 0
          if (unit === 'per_watt_reduced') {
            areaIncentive = areaWattsReduced * amount
          } else if (unit === 'per_fixture' || unit === 'per_lamp') {
            areaIncentive = (area.fixture_count || 0) * amount
          } else if (unit === 'per_kw') {
            areaIncentive = (areaWattsReduced / 1000) * amount
          } else {
            areaIncentive = amount
          }
          if (match.max_incentive && areaIncentive > match.max_incentive) {
            areaIncentive = match.max_incentive
          }
          totalIncentive += areaIncentive
        }
      }

      if (totalIncentive > 0) {
        await updateEstimateField('utility_incentive', Math.round(totalIncentive * 100) / 100)
      } else {
        alert('No matching prescriptive measures found for the audit fixture types.')
      }
    } catch (err) {
      alert('Error calculating incentive: ' + err.message)
    }
    setCalculatingIncentive(false)
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  // Styles
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard,
    outline: 'none'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  if (loading) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: theme.textMuted }}>Loading estimate...</p>
      </div>
    )
  }

  if (!estimate) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>Estimate not found</p>
        <button
          onClick={() => navigate('/estimates')}
          style={{
            color: theme.accent,
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            textDecoration: 'underline'
          }}
        >
          Back to Estimates
        </button>
      </div>
    )
  }

  const subtotal = lineItems.reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)
  const discount = parseFloat(estimate.discount) || 0
  const incentive = parseFloat(estimate.utility_incentive) || 0
  const total = subtotal - discount
  const outOfPocket = total - incentive

  const customerInfo = estimate.customer || estimate.lead
  const statusStyle = statusColors[estimate.status] || statusColors['Draft']

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <button
          onClick={() => navigate('/estimates')}
          style={{
            padding: '10px',
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            cursor: 'pointer',
            color: theme.textSecondary
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <div style={{ flex: 1 }}>
          <h1 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: theme.text
          }}>
            Estimate {estimate.quote_id || `#${estimate.id}`}
          </h1>
          <p style={{ fontSize: '14px', color: theme.textSecondary }}>
            {estimate.estimate_name || customerInfo?.name || customerInfo?.customer_name || 'No customer'}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{
            padding: '6px 14px',
            borderRadius: '20px',
            fontSize: '13px',
            fontWeight: '500',
            backgroundColor: statusStyle.bg,
            color: statusStyle.text
          }}>
            {estimate.status}
          </span>
          <button
            onClick={() => setShowSettingsModal(true)}
            title="Estimate Settings"
            style={{
              padding: '8px',
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              color: theme.textMuted,
              display: 'flex',
              alignItems: 'center'
            }}
          >
            <Settings size={18} />
          </button>
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 360px',
        gap: '24px'
      }}>
        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Customer Info */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{
                fontSize: '15px',
                fontWeight: '600',
                color: theme.text
              }}>
                Customer Information
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {estimate.lead_id ? (
                  <button
                    onClick={() => navigate(`/leads/${estimate.lead_id}`)}
                    style={{
                      fontSize: '12px',
                      color: theme.accent,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    View Lead
                  </button>
                ) : (
                  <button
                    onClick={() => setShowCreateLead(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      color: theme.accent,
                      background: 'none',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      padding: '4px 8px',
                      cursor: 'pointer'
                    }}
                  >
                    <UserPlus size={12} />
                    Create Lead
                  </button>
                )}
                {estimate.customer_id && (
                  <button
                    onClick={() => navigate(`/customers/${estimate.customer_id}`)}
                    style={{
                      fontSize: '12px',
                      color: theme.accent,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      textDecoration: 'underline'
                    }}
                  >
                    View Customer
                  </button>
                )}
              </div>
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px'
            }}>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Name</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                  {customerInfo?.name || customerInfo?.customer_name || '-'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Email</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                  {customerInfo?.email || '-'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Phone</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                  {customerInfo?.phone || '-'}
                </p>
              </div>
              <div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Address</p>
                <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                  {customerInfo?.address || '-'}
                </p>
              </div>
            </div>
          </div>

          {/* Estimate Details Card */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: '600',
              color: theme.text,
              marginBottom: '16px'
            }}>
              Estimate Details
            </h3>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px'
            }}>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Business Unit *</label>
                <select
                  value={estimate.business_unit || ''}
                  onChange={(e) => updateEstimateField('business_unit', e.target.value || null)}
                  style={{
                    ...inputStyle,
                    borderColor: !estimate.business_unit ? '#c25a5a' : theme.border
                  }}
                >
                  <option value="">-- Select Business Unit --</option>
                  {(businessUnits || []).map((bu, i) => {
                    const name = typeof bu === 'string' ? bu : bu.name
                    return <option key={i} value={name}>{name}</option>
                  })}
                </select>
                {!estimate.business_unit && (
                  <p style={{ fontSize: '11px', color: '#c25a5a', marginTop: '4px' }}>Required for generating PDF and sending</p>
                )}
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Estimate Name</label>
                <input
                  type="text"
                  value={estimate.estimate_name || ''}
                  onChange={(e) => updateEstimateField('estimate_name', e.target.value)}
                  placeholder="e.g. Kitchen Remodel, LED Retrofit"
                  style={inputStyle}
                />
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Summary / Scope</label>
                <textarea
                  value={estimate.summary || ''}
                  onChange={(e) => updateEstimateField('summary', e.target.value)}
                  rows={2}
                  placeholder="Brief description of the work..."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Estimate Date</label>
                <input
                  type="text"
                  value={estimate.created_at ? new Date(estimate.created_at).toLocaleDateString() : '-'}
                  readOnly
                  style={{ ...inputStyle, backgroundColor: theme.bg, cursor: 'default' }}
                />
              </div>
              <div>
                <label style={labelStyle}>Expiration Date</label>
                <input
                  type="date"
                  value={estimate.expiration_date || ''}
                  onChange={(e) => updateEstimateField('expiration_date', e.target.value || null)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Service Date</label>
                <input
                  type="date"
                  value={estimate.service_date || ''}
                  onChange={(e) => updateEstimateField('service_date', e.target.value || null)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Technician</label>
                <select
                  value={estimate.technician_id || ''}
                  onChange={(e) => updateEstimateField('technician_id', e.target.value || null)}
                  style={inputStyle}
                >
                  <option value="">-- Select --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ gridColumn: '1 / -1' }}>
                <label style={labelStyle}>Estimate Message</label>
                <textarea
                  value={estimate.estimate_message || ''}
                  onChange={(e) => updateEstimateField('estimate_message', e.target.value)}
                  rows={3}
                  placeholder="Message to display on the estimate for the customer..."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h3 style={{
                fontSize: '15px',
                fontWeight: '600',
                color: theme.text
              }}>
                Line Items
              </h3>
              <button
                onClick={() => setShowProductPicker(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                <Plus size={16} />
                Add Item
              </button>
            </div>

            {lineItems.length === 0 ? (
              <div style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: theme.textMuted
              }}>
                No line items yet. Add products or services to this estimate.
              </div>
            ) : (
              <>
                {/* Table Header */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '20px 2fr 1.5fr 80px 100px 90px 100px 72px',
                  gap: '12px',
                  padding: '12px 20px',
                  backgroundColor: theme.accentBg,
                  fontSize: '12px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px'
                }}>
                  <div></div>
                  <div>Item</div>
                  <div>Description</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                  <div style={{ textAlign: 'right' }}>Price</div>
                  <div style={{ textAlign: 'right' }}>Discount</div>
                  <div style={{ textAlign: 'right' }}>Total</div>
                  <div></div>
                </div>

                {/* Table Body */}
                {lineItems.map((line) => {
                  const photos = line.photos || []
                  const isExpanded = expandedLineId === line.id
                  return (
                    <div key={line.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <div
                        onClick={() => setExpandedLineId(isExpanded ? null : line.id)}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '20px 2fr 1.5fr 80px 100px 90px 100px 72px',
                          gap: '12px',
                          padding: '14px 20px',
                          alignItems: 'center',
                          cursor: 'pointer'
                        }}
                      >
                        <div style={{ color: theme.textMuted, display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px', margin: 0 }}>
                            {line.item?.name || line.item_name || 'Unknown'}
                          </p>
                          {photos.length > 0 && (
                            <span style={{ fontSize: '11px', backgroundColor: theme.accentBg, color: theme.accent, padding: '2px 6px', borderRadius: '10px', fontWeight: '600' }}>
                              <Camera size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} />{photos.length}
                            </span>
                          )}
                        </div>
                        <div>
                          <p style={{
                            fontSize: '12px',
                            color: theme.textMuted,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            margin: 0
                          }}>
                            {line.description || line.item?.description || '-'}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            min="1"
                            defaultValue={line.quantity}
                            onBlur={(e) => {
                              const val = parseInt(e.target.value) || 1
                              if (val !== line.quantity) handleQuantityChange(line, val)
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                            style={{
                              width: '56px',
                              padding: '4px 6px',
                              textAlign: 'right',
                              fontSize: '14px',
                              color: theme.textSecondary,
                              border: `1px solid ${theme.border}`,
                              borderRadius: '6px',
                              backgroundColor: theme.bgCard,
                              outline: 'none'
                            }}
                          />
                        </div>
                        <div style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            min={parseFloat(line.item?.price) || parseFloat(line.price) || 0}
                            step="0.01"
                            defaultValue={line.price}
                            key={`price-${line.id}-${line.price}`}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value)
                              const basePrice = parseFloat(line.item?.price) || parseFloat(line.price) || 0
                              if (val < basePrice) {
                                e.target.value = line.price
                                return
                              }
                              if (val !== parseFloat(line.price)) handlePriceChange(line, val)
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                            style={{
                              width: '80px',
                              padding: '4px 6px',
                              textAlign: 'right',
                              fontSize: '14px',
                              color: theme.textSecondary,
                              border: `1px solid ${theme.border}`,
                              borderRadius: '6px',
                              backgroundColor: theme.bgCard,
                              outline: 'none'
                            }}
                          />
                        </div>
                        <div style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            defaultValue={line.discount || ''}
                            placeholder="0"
                            key={`disc-${line.id}-${line.discount}`}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value) || 0
                              if (val !== (parseFloat(line.discount) || 0)) handleDiscountChange(line, val)
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                            style={{
                              width: '70px',
                              padding: '4px 6px',
                              textAlign: 'right',
                              fontSize: '14px',
                              color: (line.discount > 0) ? '#ef4444' : theme.textMuted,
                              border: `1px solid ${theme.border}`,
                              borderRadius: '6px',
                              backgroundColor: theme.bgCard,
                              outline: 'none'
                            }}
                          />
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: '500', color: theme.text }}>
                          {formatCurrency(line.line_total)}
                        </div>
                        <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }}>
                          <button
                            onClick={(e) => { e.stopPropagation(); duplicateLineItem(line) }}
                            title="Duplicate line"
                            style={{
                              padding: '6px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: theme.textMuted
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = theme.accentBg
                              e.currentTarget.style.color = theme.accent
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = theme.textMuted
                            }}
                          >
                            <Copy size={16} />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); removeLineItem(line.id) }}
                            title="Delete line"
                            style={{
                              padding: '6px',
                              backgroundColor: 'transparent',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: theme.textMuted
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.backgroundColor = '#fef2f2'
                              e.currentTarget.style.color = '#dc2626'
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.backgroundColor = 'transparent'
                              e.currentTarget.style.color = theme.textMuted
                            }}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {/* Expanded detail section: notes + photos */}
                      {isExpanded && (
                        <div style={{ padding: '8px 20px 14px', backgroundColor: theme.bg }}>
                          <div style={{ marginBottom: '10px' }}>
                            <input
                              type="text"
                              placeholder="Line item notes..."
                              defaultValue={line.notes || ''}
                              onBlur={(e) => {
                                const val = e.target.value.trim()
                                if (val !== (line.notes || '')) handleLineNotesChange(line, val)
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                              style={{
                                width: '100%',
                                padding: '4px 8px',
                                fontSize: '12px',
                                color: theme.textSecondary,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '6px',
                                backgroundColor: theme.bgCard,
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            Photos
                          </div>
                          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                            {photos.map((url, idx) => (
                              <div key={idx} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
                                <img
                                  src={url}
                                  alt={`Photo ${idx + 1}`}
                                  onClick={() => setViewingPhoto({ url, name: `${line.item?.name || line.item_name || 'Line'} Photo ${idx + 1}` })}
                                  style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                />
                                <button
                                  onClick={() => handleLinePhotoDelete(line.id, url)}
                                  style={{
                                    position: 'absolute', top: '2px', right: '2px',
                                    width: '20px', height: '20px', borderRadius: '50%',
                                    backgroundColor: 'rgba(220,38,38,0.85)', color: '#fff',
                                    border: 'none', cursor: 'pointer', fontSize: '12px',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                                  }}
                                >
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                            <label style={{
                              width: '72px', height: '72px', borderRadius: '8px',
                              border: `2px dashed ${theme.border}`, cursor: 'pointer',
                              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                              color: theme.textMuted, fontSize: '10px', gap: '2px',
                              backgroundColor: theme.bgCard
                            }}>
                              <Camera size={18} />
                              <span>Add</span>
                              <input
                                type="file"
                                accept="image/*"
                                capture="environment"
                                style={{ display: 'none' }}
                                onChange={(e) => handleLinePhotoUpload(line.id, e)}
                              />
                            </label>
                          </div>
                          {photos.length === 0 && (
                            <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>No photos yet. Click Add to attach.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>

          {/* Notes */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: '600',
              color: theme.text,
              marginBottom: '12px'
            }}>
              Notes
            </h3>
            <textarea
              value={estimate.notes || ''}
              onChange={(e) => updateEstimateField('notes', e.target.value)}
              rows={3}
              style={{
                ...inputStyle,
                resize: 'vertical'
              }}
              placeholder="Internal notes..."
            />
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Totals */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: '600',
              color: theme.text,
              marginBottom: '16px'
            }}>
              Estimate Summary
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '14px'
              }}>
                <span style={{ color: theme.textSecondary }}>Subtotal</span>
                <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(subtotal)}</span>
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '14px'
              }}>
                <span style={{ color: theme.textSecondary }}>Discount</span>
                <input
                  type="number"
                  value={estimate.discount || ''}
                  onChange={(e) => updateEstimateField('discount', e.target.value || 0)}
                  style={{
                    width: '100px',
                    padding: '6px 10px',
                    textAlign: 'right',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: theme.text,
                    backgroundColor: theme.bgCard
                  }}
                  step="0.01"
                />
              </div>

              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '14px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ color: theme.textSecondary }}>Utility Incentive</span>
                  {estimate.audit_id && (
                    <button
                      onClick={calculateIncentive}
                      disabled={calculatingIncentive || saving}
                      title="Auto-calculate from audit prescriptive measures"
                      style={{
                        padding: '3px 6px',
                        backgroundColor: '#4a7c59',
                        border: 'none',
                        borderRadius: '4px',
                        color: '#fff',
                        fontSize: '11px',
                        cursor: (calculatingIncentive || saving) ? 'not-allowed' : 'pointer',
                        opacity: (calculatingIncentive || saving) ? 0.6 : 1,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '3px'
                      }}
                    >
                      <Calculator size={12} />
                      {calculatingIncentive ? '...' : 'Calc'}
                    </button>
                  )}
                </div>
                <input
                  type="number"
                  value={estimate.utility_incentive || ''}
                  onChange={(e) => updateEstimateField('utility_incentive', e.target.value || 0)}
                  style={{
                    width: '100px',
                    padding: '6px 10px',
                    textAlign: 'right',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    fontSize: '14px',
                    color: theme.text,
                    backgroundColor: theme.bgCard
                  }}
                  step="0.01"
                />
              </div>

              <div style={{
                borderTop: `1px solid ${theme.border}`,
                paddingTop: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <span style={{ fontWeight: '600', color: theme.text }}>Total</span>
                <span style={{ fontSize: '20px', fontWeight: '600', color: theme.text }}>
                  {formatCurrency(total)}
                </span>
              </div>

              {incentive > 0 && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '14px',
                  color: '#4a7c59'
                }}>
                  <span>Out of Pocket</span>
                  <span style={{ fontWeight: '500' }}>{formatCurrency(outOfPocket)}</span>
                </div>
              )}

              {estimate.deposit_amount > 0 && (
                <div style={{
                  borderTop: `1px solid ${theme.border}`,
                  paddingTop: '8px',
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: '13px',
                  color: '#4a7c59'
                }}>
                  <span>Deposit Recorded</span>
                  <span style={{ fontWeight: '500' }}>{formatCurrency(estimate.deposit_amount)}</span>
                </div>
              )}
              {estimate.deposit_photo && (
                <div style={{ marginTop: '8px' }}>
                  <img
                    src={estimate.deposit_photo}
                    alt="Deposit receipt"
                    onClick={() => setViewingPhoto({ url: estimate.deposit_photo, name: 'Deposit Receipt' })}
                    style={{ width: '100%', maxHeight: '120px', objectFit: 'contain', borderRadius: '8px', border: `1px solid ${theme.border}`, cursor: 'pointer' }}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: '600',
              color: theme.text,
              marginBottom: '16px'
            }}>
              Actions
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {/* PDF Actions */}
              <button
                onClick={handleGeneratePdf}
                disabled={generatingPdf || saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  backgroundColor: 'transparent',
                  color: theme.accent,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: (generatingPdf || saving) ? 'not-allowed' : 'pointer',
                  opacity: (generatingPdf || saving) ? 0.6 : 1
                }}
              >
                <FileText size={18} />
                {generatingPdf ? 'Generating...' : 'Generate PDF'}
              </button>

              {estimate.pdf_url && (
                <button
                  onClick={handleDownloadPdf}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    backgroundColor: 'transparent',
                    color: theme.textSecondary,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  <Download size={18} />
                  Download PDF
                </button>
              )}

              {/* Send Email */}
              <button
                onClick={() => setShowSendModal(true)}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1
                }}
              >
                <Mail size={18} />
                Send Estimate
              </button>

              {/* Portal Link */}
              {estimate.portal_token && (
                <div style={{
                  padding: '10px 12px',
                  backgroundColor: theme.accentBg,
                  borderRadius: '8px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <span style={{ fontSize: '13px', color: theme.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    Portal link available
                  </span>
                  <button
                    onClick={() => {
                      const url = `${window.location.origin}/portal/${estimate.portal_token}`
                      navigator.clipboard.writeText(url)
                      toast.success('Portal link copied!')
                    }}
                    style={{
                      padding: '4px 10px',
                      backgroundColor: theme.accent,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                      cursor: 'pointer',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    Copy Link
                  </button>
                </div>
              )}

              {/* Status Actions */}
              {estimate.status === 'Draft' && (
                <button
                  onClick={sendEstimate}
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  }}
                >
                  <Send size={18} />
                  Mark as Sent
                </button>
              )}

              {estimate.status === 'Sent' && (
                <>
                  <button
                    onClick={() => setShowDepositModal(true)}
                    disabled={saving}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      backgroundColor: '#4a7c59',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    <CheckCircle size={18} />
                    Mark Approved
                  </button>
                  <button
                    onClick={rejectEstimate}
                    disabled={saving}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px 16px',
                      backgroundColor: '#8b5a5a',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: saving ? 'not-allowed' : 'pointer',
                      opacity: saving ? 0.6 : 1
                    }}
                  >
                    <XCircle size={18} />
                    Mark Rejected
                  </button>
                </>
              )}

              {estimate.status === 'Approved' && !estimate.job_id && (
                <button
                  onClick={handleConvertToJob}
                  disabled={convertingToJob || saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    backgroundColor: '#4a7c59',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: (convertingToJob || saving) ? 'not-allowed' : 'pointer',
                    opacity: (convertingToJob || saving) ? 0.6 : 1
                  }}
                >
                  <Briefcase size={18} />
                  {convertingToJob ? 'Converting...' : 'Convert to Job'}
                </button>
              )}

              {estimate.job_id && (
                <button
                  onClick={() => navigate(`/jobs/${estimate.job_id}`)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    padding: '12px 16px',
                    backgroundColor: '#7c6f4a',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  <Briefcase size={18} />
                  View Job
                </button>
              )}

              {rebateForms.length > 0 && (
                <>
                  <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '10px', marginTop: '4px' }}>
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '8px' }}>Rebate Forms</div>
                  </div>
                  {rebateForms.filter(f => f.field_mapping).map(form => (
                    <button
                      key={form.id}
                      onClick={() => handleFillRebateForm(form)}
                      disabled={fillingForm || saving}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px 16px',
                        backgroundColor: '#4a6b7c',
                        color: '#ffffff',
                        border: 'none',
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: (fillingForm || saving) ? 'not-allowed' : 'pointer',
                        opacity: (fillingForm || saving) ? 0.6 : 1
                      }}
                    >
                      <FileText size={16} />
                      {fillingForm ? 'Filling...' : `Fill ${form.form_name}`}
                    </button>
                  ))}
                  {rebateForms.filter(f => !f.field_mapping && (f.form_file || f.form_url)).map(form => (
                    <button
                      key={form.id}
                      onClick={() => handleDownloadBlankForm(form)}
                      disabled={fillingForm || saving}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '8px',
                        padding: '10px 16px',
                        backgroundColor: 'transparent',
                        color: theme.accent,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '8px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: (fillingForm || saving) ? 'not-allowed' : 'pointer',
                        opacity: (fillingForm || saving) ? 0.6 : 1
                      }}
                    >
                      <Download size={16} />
                      {form.form_name}
                    </button>
                  ))}
                </>
              )}

              {/* Delete */}
              <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '10px', marginTop: '4px' }}>
                <button
                  onClick={async () => {
                    if (!confirm('Delete this estimate? This cannot be undone.')) return
                    await deleteQuote(id)
                    await fetchQuotes()
                    navigate('/estimates')
                  }}
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '12px 16px',
                    backgroundColor: 'transparent',
                    color: '#dc2626',
                    border: `1px solid #fecaca`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = '#fef2f2' }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <Trash2 size={18} />
                  Delete Estimate
                </button>
              </div>
            </div>
          </div>

          {/* Attachments */}
          {attachments.length > 0 && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{
                fontSize: '15px',
                fontWeight: '600',
                color: theme.text,
                marginBottom: '12px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Paperclip size={16} />
                Attachments
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {attachments.map(att => (
                  <div
                    key={att.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '8px 10px',
                      backgroundColor: theme.bg,
                      borderRadius: '6px',
                      fontSize: '13px'
                    }}
                  >
                    <span style={{ color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                      {att.file_name}
                    </span>
                    <button
                      onClick={async () => {
                        const { data } = await supabase.storage.from(att.storage_bucket || 'project-documents').download(att.file_path)
                        if (data) {
                          const url = URL.createObjectURL(data)
                          const a = document.createElement('a')
                          a.href = url
                          a.download = att.file_name
                          a.click()
                          URL.revokeObjectURL(url)
                        }
                      }}
                      style={{
                        background: 'none',
                        border: 'none',
                        padding: '4px',
                        cursor: 'pointer',
                        color: theme.accent,
                        flexShrink: 0
                      }}
                    >
                      <Download size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Contract */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{
              fontSize: '15px',
              fontWeight: '600',
              color: theme.text,
              marginBottom: '12px'
            }}>
              Contract
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={estimate.contract_required || false}
                  onChange={(e) => updateEstimateField('contract_required', e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                />
                <span style={{ fontSize: '14px', color: theme.text }}>Contract Required</span>
              </label>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={estimate.contract_signed || false}
                  onChange={(e) => updateEstimateField('contract_signed', e.target.checked)}
                  style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                />
                <span style={{ fontSize: '14px', color: theme.text }}>Contract Signed</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Product Picker Modal */}
      <ProductPickerModal
        isOpen={showProductPicker}
        onClose={() => setShowProductPicker(false)}
        onSelect={handleProductSelect}
      />

      {/* Deposit / Approval Modal */}
      {showDepositModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            width: '100%',
            maxWidth: '450px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                Approve Estimate
              </h2>
              <button onClick={() => setShowDepositModal(false)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <p style={{ fontSize: '14px', color: theme.textSecondary }}>
                Record a deposit for this estimate, or skip to approve without a deposit.
              </p>

              <div>
                <label style={labelStyle}>Deposit Amount</label>
                <input
                  type="number"
                  value={depositForm.deposit_amount}
                  onChange={(e) => setDepositForm(prev => ({ ...prev, deposit_amount: e.target.value }))}
                  placeholder="0.00"
                  step="0.01"
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Payment Method</label>
                <select
                  value={depositForm.deposit_method}
                  onChange={(e) => setDepositForm(prev => ({ ...prev, deposit_method: e.target.value }))}
                  style={inputStyle}
                >
                  <option value="">-- Select --</option>
                  {PAYMENT_METHODS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Deposit Date</label>
                <input
                  type="date"
                  value={depositForm.deposit_date}
                  onChange={(e) => setDepositForm(prev => ({ ...prev, deposit_date: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div>
                <label style={labelStyle}>Deposit Notes</label>
                <textarea
                  value={depositForm.deposit_notes}
                  onChange={(e) => setDepositForm(prev => ({ ...prev, deposit_notes: e.target.value }))}
                  rows={2}
                  placeholder="Optional notes..."
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Photo capture */}
              <div>
                <label style={labelStyle}>Receipt / Check Photo</label>
                {depositPhoto ? (
                  <div style={{ position: 'relative', display: 'inline-block' }}>
                    <img
                      src={depositPhoto.preview}
                      alt="Deposit receipt"
                      style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', borderRadius: '8px', border: `1px solid ${theme.border}` }}
                    />
                    <button
                      type="button"
                      onClick={() => setDepositPhoto(null)}
                      style={{
                        position: 'absolute', top: '4px', right: '4px',
                        width: '24px', height: '24px', borderRadius: '50%',
                        backgroundColor: 'rgba(220,38,38,0.85)', color: '#fff',
                        border: 'none', cursor: 'pointer', fontSize: '14px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : (
                  <label style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '16px', border: `2px dashed ${theme.border}`, borderRadius: '8px',
                    cursor: 'pointer', color: theme.textMuted, fontSize: '14px',
                    backgroundColor: theme.bg
                  }}>
                    <Camera size={20} />
                    <span>Take Photo or Upload</span>
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: 'none' }}
                      onChange={(e) => {
                        const file = e.target.files?.[0]
                        if (file) {
                          setDepositPhoto({ file, preview: URL.createObjectURL(file) })
                        }
                      }}
                    />
                  </label>
                )}
              </div>

              {/* Apply to invoice/job info */}
              {(estimate.job_id || estimate.lead_id) && (
                <div style={{
                  padding: '10px 12px', borderRadius: '8px',
                  backgroundColor: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)',
                  fontSize: '13px', color: '#3b82f6'
                }}>
                  This deposit will be recorded as a payment and can be applied to the job invoice.
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  onClick={handleSkipDeposit}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent',
                    color: theme.text,
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  }}
                >
                  Skip Deposit
                </button>
                <button
                  onClick={handleApproveWithDeposit}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: '#4a7c59',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  }}
                >
                  {saving ? 'Approving...' : 'Approve & Record'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Preview & Send Modal */}
      {showSendModal && (
        <EstimatePreviewModal
          theme={theme}
          estimate={estimate}
          lineItems={lineItems}
          company={company}
          businessUnit={getBusinessUnitObject()}
          settings={getEffectiveSettings()}
          sendEmail={sendEmail}
          setSendEmail={setSendEmail}
          sendingEmail={sendingEmail}
          onSend={handleSendEmail}
          onClose={() => setShowSendModal(false)}
          inputStyle={inputStyle}
          labelStyle={labelStyle}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          theme={theme}
          settings={getEffectiveSettings()}
          defaults={getEstimateDefaults()}
          onSave={(newSettings) => {
            saveSettingsOverrides(newSettings)
            setShowSettingsModal(false)
          }}
          onClose={() => setShowSettingsModal(false)}
          inputStyle={inputStyle}
          labelStyle={labelStyle}
        />
      )}

      {/* Create Lead Modal */}
      {showCreateLead && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            width: '100%',
            maxWidth: '450px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                Create Lead from Estimate
              </h2>
              <button onClick={() => setShowCreateLead(false)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateLead} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
                Create a new lead linked to this estimate. The lead tracks the deal through the sales and delivery pipeline.
              </p>

              <div>
                <label style={labelStyle}>Customer Name *</label>
                <input
                  type="text"
                  value={newLeadForm.customer_name}
                  onChange={(e) => setNewLeadForm(prev => ({ ...prev, customer_name: e.target.value }))}
                  placeholder="Contact name"
                  style={inputStyle}
                  required
                />
              </div>
              <div>
                <label style={labelStyle}>Business Name</label>
                <input
                  type="text"
                  value={newLeadForm.business_name}
                  onChange={(e) => setNewLeadForm(prev => ({ ...prev, business_name: e.target.value }))}
                  placeholder="Company / business name"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input
                    type="text"
                    value={newLeadForm.phone}
                    onChange={(e) => setNewLeadForm(prev => ({ ...prev, phone: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    value={newLeadForm.email}
                    onChange={(e) => setNewLeadForm(prev => ({ ...prev, email: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label style={labelStyle}>Address</label>
                <input
                  type="text"
                  value={newLeadForm.address}
                  onChange={(e) => setNewLeadForm(prev => ({ ...prev, address: e.target.value }))}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateLead(false)}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent',
                    color: theme.text,
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creatingLead}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: creatingLead ? 'not-allowed' : 'pointer',
                    opacity: creatingLead ? 0.6 : 1
                  }}
                >
                  {creatingLead ? 'Creating...' : 'Create Lead'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Photo Lightbox */}
      {viewingPhoto && (
        <div onClick={() => setViewingPhoto(null)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <button onClick={() => setViewingPhoto(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: '#fff', fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2001 }}>
            <X size={22} />
          </button>
          <img src={viewingPhoto.url} alt={viewingPhoto.name} style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }} />
        </div>
      )}
    </div>
  )
}

// Settings Modal Component
function SettingsModal({ theme, settings, defaults, onSave, onClose, inputStyle, labelStyle }) {
  const [localSettings, setLocalSettings] = useState(settings)

  const toggle = (key) => {
    setLocalSettings(prev => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleStyle = (key) => ({
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '8px 0',
    cursor: 'pointer'
  })

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      zIndex: 50
    }}>
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
        width: '100%',
        maxWidth: '500px',
        maxHeight: '80vh',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px',
          borderBottom: `1px solid ${theme.border}`
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
            Estimate Settings
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
            <X size={20} />
          </button>
        </div>

        <div style={{ padding: '20px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '8px' }}>
            Override company defaults for this estimate. These settings affect PDF generation.
          </p>

          {[
            { key: 'show_logo', label: 'Show Company Logo' },
            { key: 'show_company_address', label: 'Show Company Address' },
            { key: 'show_company_phone', label: 'Show Company Phone' },
            { key: 'show_company_email', label: 'Show Company Email' },
            { key: 'show_customer_company', label: 'Show Customer Company Name' },
            { key: 'show_line_descriptions', label: 'Show Line Item Descriptions' },
            { key: 'show_line_images', label: 'Show Line Item Images' },
            { key: 'show_technician', label: 'Show Technician' },
            { key: 'show_service_date', label: 'Show Service Date' }
          ].map(item => (
            <label key={item.key} style={toggleStyle(item.key)}>
              <input
                type="checkbox"
                checked={localSettings[item.key] || false}
                onChange={() => toggle(item.key)}
                style={{ width: '16px', height: '16px', accentColor: theme.accent }}
              />
              <span style={{ fontSize: '14px', color: theme.text }}>{item.label}</span>
            </label>
          ))}

          <div style={{ marginTop: '8px' }}>
            <label style={labelStyle}>PDF Layout</label>
            <select
              value={localSettings.pdf_layout || 'email'}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, pdf_layout: e.target.value }))}
              style={inputStyle}
            >
              <option value="email">Email Optimized</option>
              <option value="envelope">Envelope Optimized</option>
            </select>
          </div>

          <div style={{ marginTop: '8px' }}>
            <label style={labelStyle}>Override Estimate Message</label>
            <textarea
              value={localSettings.estimate_message || ''}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, estimate_message: e.target.value }))}
              rows={3}
              placeholder="Leave blank to use estimate-level message"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
        </div>

        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${theme.border}`,
          display: 'flex',
          gap: '12px'
        }}>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '10px 16px',
              border: `1px solid ${theme.border}`,
              backgroundColor: 'transparent',
              color: theme.text,
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={() => onSave(localSettings)}
            style={{
              flex: 1,
              padding: '10px 16px',
              backgroundColor: theme.accent,
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            Save Settings
          </button>
        </div>
      </div>
    </div>
  )
}

// Live HTML preview of the estimate (mirrors PDF content)
function EstimatePreview({ estimate, lineItems, company, businessUnit, settings }) {
  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }
  const fmtDate = (d) => {
    if (!d) return ''
    try { return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) } catch { return '' }
  }

  // Resolve branding — BU with company fallback
  const brandName = businessUnit?.name || company?.company_name || 'Company'
  const brandAddress = businessUnit?.address || company?.address || ''
  const brandPhone = businessUnit?.phone || company?.phone || ''
  const brandEmail = businessUnit?.email || company?.owner_email || ''
  const brandLogo = businessUnit?.logo_url || company?.logo_url || ''

  const customer = estimate.customer || estimate.lead
  const subtotal = lineItems.reduce((sum, l) => sum + (parseFloat(l.line_total) || 0), 0)
  const discount = parseFloat(estimate.discount) || 0
  const incentive = parseFloat(estimate.utility_incentive) || 0
  const total = subtotal - discount
  const outOfPocket = total - incentive
  const message = estimate.estimate_message || settings.estimate_message || settings.default_message

  const thStyle = { textAlign: 'left', padding: '7px 10px', fontWeight: '600', color: '#fff', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }

  return (
    <div style={{
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      color: '#2c3530',
      fontSize: '13px',
      lineHeight: 1.5
    }}>
      {/* Top accent bar */}
      <div style={{ height: '3px', background: '#5a6349', borderRadius: '3px 3px 0 0', marginBottom: '20px' }} />

      {/* Header: Logo + Name (left)  |  Contact (right) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {brandLogo && settings.show_logo && (
            <img src={brandLogo} alt="" style={{ height: '40px', maxWidth: '80px', objectFit: 'contain' }} />
          )}
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: '#3e4532' }}>{brandName}</div>
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: '11px', color: '#7d8a7f', lineHeight: 1.6 }}>
          {settings.show_company_address && brandAddress && <div>{brandAddress}</div>}
          {settings.show_company_phone && brandPhone && <div>{brandPhone}</div>}
          {settings.show_company_email && brandEmail && <div>{brandEmail}</div>}
        </div>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid #d6cdb8', marginBottom: '14px' }} />

      {/* ESTIMATE title + number */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px' }}>
        <span style={{ fontSize: '22px', fontWeight: '700', color: '#3e4532', letterSpacing: '1px' }}>ESTIMATE</span>
        <span style={{ fontSize: '13px', fontWeight: '600', color: '#5a6349' }}>
          {estimate.quote_id || `EST-${estimate.id}`}
        </span>
      </div>

      {/* Two-column: Bill To (left) | Details (right) */}
      <div style={{ display: 'flex', gap: '24px', marginBottom: '14px' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '9px', fontWeight: '700', color: '#7d8a7f', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Bill To</div>
          <div style={{ fontWeight: '600', fontSize: '13px' }}>{customer?.name || customer?.customer_name || '—'}</div>
          {settings.show_customer_company && customer?.business_name && (
            <div style={{ color: '#7d8a7f', fontSize: '12px' }}>{customer.business_name}</div>
          )}
          {customer?.address && <div style={{ color: '#7d8a7f', fontSize: '12px' }}>{customer.address}</div>}
          {customer?.phone && <div style={{ color: '#7d8a7f', fontSize: '12px' }}>{customer.phone}</div>}
          {customer?.email && <div style={{ color: '#7d8a7f', fontSize: '12px' }}>{customer.email}</div>}
        </div>
        <div style={{ minWidth: '180px' }}>
          <div style={{ fontSize: '9px', fontWeight: '700', color: '#7d8a7f', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: '4px' }}>Details</div>
          <table style={{ fontSize: '12px', borderCollapse: 'collapse' }}>
            <tbody>
              <tr><td style={{ color: '#7d8a7f', padding: '2px 8px 2px 0' }}>Date</td><td style={{ fontWeight: '500' }}>{fmtDate(estimate.created_at) || '—'}</td></tr>
              {estimate.expiration_date && <tr><td style={{ color: '#7d8a7f', padding: '2px 8px 2px 0' }}>Expires</td><td style={{ fontWeight: '500' }}>{fmtDate(estimate.expiration_date)}</td></tr>}
              {settings.show_service_date && estimate.service_date && <tr><td style={{ color: '#7d8a7f', padding: '2px 8px 2px 0' }}>Service</td><td style={{ fontWeight: '500' }}>{fmtDate(estimate.service_date)}</td></tr>}
              {settings.show_technician && estimate.technician?.name && <tr><td style={{ color: '#7d8a7f', padding: '2px 8px 2px 0' }}>Technician</td><td style={{ fontWeight: '500' }}>{estimate.technician.name}</td></tr>}
              {estimate.status && <tr><td style={{ color: '#7d8a7f', padding: '2px 8px 2px 0' }}>Status</td><td style={{ fontWeight: '500' }}>{estimate.status}</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      {/* Estimate name & message */}
      {estimate.estimate_name && (
        <div style={{ fontSize: '14px', fontWeight: '700', marginBottom: '4px', color: '#2c3530' }}>{estimate.estimate_name}</div>
      )}
      {message && (
        <div style={{ fontSize: '12px', color: '#7d8a7f', marginBottom: '14px', whiteSpace: 'pre-wrap', fontStyle: 'italic' }}>{message}</div>
      )}

      {/* Line items table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: '12px' }}>
        <thead>
          <tr style={{ backgroundColor: '#5a6349', borderRadius: '4px' }}>
            <th style={thStyle}>Item</th>
            {settings.show_line_descriptions && <th style={thStyle}>Description</th>}
            <th style={{ ...thStyle, textAlign: 'right' }}>Qty</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Price</th>
            <th style={{ ...thStyle, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {lineItems.map((line, idx) => (
            <tr key={line.id} style={{ backgroundColor: idx % 2 === 0 ? '#f7f5ef' : '#fff', borderBottom: '1px solid #eee' }}>
              <td style={{ padding: '7px 10px', fontWeight: '500' }}>{line.item_name || line.item?.name || 'Item'}</td>
              {settings.show_line_descriptions && (
                <td style={{ padding: '7px 10px', color: '#7d8a7f' }}>
                  {line.description || line.item?.description || '—'}
                  {line.notes && <div style={{ fontSize: '11px', color: '#5a6349', fontStyle: 'italic', marginTop: '2px' }}>{line.notes}</div>}
                </td>
              )}
              <td style={{ padding: '7px 10px', textAlign: 'right' }}>{line.quantity || 0}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', color: '#7d8a7f' }}>{formatCurrency(line.price)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', fontWeight: '600' }}>{formatCurrency(line.line_total)}</td>
            </tr>
          ))}
          {lineItems.length === 0 && (
            <tr><td colSpan={settings.show_line_descriptions ? 5 : 4} style={{ padding: '20px 10px', textAlign: 'center', color: '#7d8a7f' }}>No line items</td></tr>
          )}
        </tbody>
      </table>

      {/* Totals */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px', fontSize: '12px' }}>
        <div style={{ display: 'flex', gap: '24px' }}>
          <span style={{ color: '#7d8a7f' }}>Subtotal</span>
          <span style={{ fontWeight: '500', minWidth: '80px', textAlign: 'right' }}>{formatCurrency(subtotal)}</span>
        </div>
        {discount > 0 && (
          <div style={{ display: 'flex', gap: '24px' }}>
            <span style={{ color: '#7d8a7f' }}>Discount</span>
            <span style={{ fontWeight: '500', minWidth: '80px', textAlign: 'right', color: '#4a7c59' }}>-{formatCurrency(discount)}</span>
          </div>
        )}
        {incentive > 0 && (
          <div style={{ display: 'flex', gap: '24px' }}>
            <span style={{ color: '#4a7c59' }}>Utility Incentive</span>
            <span style={{ fontWeight: '500', minWidth: '80px', textAlign: 'right', color: '#4a7c59' }}>-{formatCurrency(incentive)}</span>
          </div>
        )}
        {/* Total pill */}
        <div style={{
          marginTop: '6px',
          padding: '8px 16px',
          backgroundColor: '#5a6349',
          borderRadius: '6px',
          display: 'flex',
          gap: '24px',
          alignItems: 'center'
        }}>
          <span style={{ fontWeight: '700', fontSize: '14px', color: '#fff' }}>TOTAL</span>
          <span style={{ fontWeight: '700', fontSize: '14px', minWidth: '80px', textAlign: 'right', color: '#fff' }}>{formatCurrency(total)}</span>
        </div>
        {incentive > 0 && (
          <div style={{ display: 'flex', gap: '24px', color: '#4a7c59', marginTop: '4px' }}>
            <span style={{ fontWeight: '600' }}>Your Cost After Incentive</span>
            <span style={{ fontWeight: '600', minWidth: '80px', textAlign: 'right' }}>{formatCurrency(outOfPocket)}</span>
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ marginTop: '20px', paddingTop: '12px', borderTop: '1px solid #d6cdb8', textAlign: 'center' }}>
        <div style={{ fontSize: '12px', color: '#5a6349', fontWeight: '600' }}>Thank you for your business!</div>
        <div style={{ fontSize: '10px', color: '#7d8a7f', marginTop: '4px' }}>
          {[brandName, brandPhone, brandEmail].filter(Boolean).join('  |  ')}
        </div>
      </div>

      {/* Bottom accent bar */}
      <div style={{ height: '3px', background: '#5a6349', borderRadius: '0 0 3px 3px', marginTop: '16px' }} />
    </div>
  )
}

// Preview + Send modal with two steps
function EstimatePreviewModal({ theme, estimate, lineItems, company, businessUnit, settings, sendEmail, setSendEmail, sendingEmail, onSend, onClose, inputStyle, labelStyle }) {
  const [step, setStep] = useState('preview') // 'preview' | 'send'

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '16px',
      zIndex: 50
    }}>
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
        width: '100%',
        maxWidth: step === 'preview' ? '680px' : '420px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        transition: 'max-width 0.2s ease'
      }}>
        {/* Header */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '20px',
          borderBottom: `1px solid ${theme.border}`,
          flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {step === 'send' && (
              <button
                onClick={() => setStep('preview')}
                style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: theme.textSecondary, display: 'flex' }}
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
              {step === 'preview' ? 'Preview Estimate' : 'Send Estimate'}
            </h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
            <X size={20} />
          </button>
        </div>

        {step === 'preview' ? (
          <>
            {/* Preview content */}
            <div style={{
              flex: 1,
              overflowY: 'auto',
              padding: '24px',
              backgroundColor: '#f7f5ef'
            }}>
              <div style={{
                backgroundColor: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #d6cdb8',
                padding: '28px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
              }}>
                <EstimatePreview
                  estimate={estimate}
                  lineItems={lineItems}
                  company={company}
                  businessUnit={businessUnit}
                  settings={settings}
                />
              </div>
            </div>

            {/* Preview footer */}
            <div style={{
              padding: '16px 20px',
              borderTop: `1px solid ${theme.border}`,
              display: 'flex',
              gap: '12px',
              flexShrink: 0
            }}>
              <button
                onClick={onClose}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
              <button
                onClick={() => setStep('send')}
                style={{
                  flex: 1,
                  padding: '10px 16px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px'
                }}
              >
                <Send size={16} />
                Continue to Send
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Send form */}
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Recipient Email</label>
                <input
                  type="email"
                  value={sendEmail}
                  onChange={(e) => setSendEmail(e.target.value)}
                  placeholder="customer@example.com"
                  style={inputStyle}
                />
              </div>

              <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
                A PDF of the estimate shown in the preview will be generated and attached to the email.
              </p>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setStep('preview')}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent',
                    color: theme.text,
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Back
                </button>
                <button
                  onClick={onSend}
                  disabled={sendingEmail}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: sendingEmail ? 'not-allowed' : 'pointer',
                    opacity: sendingEmail ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  <Mail size={16} />
                  {sendingEmail ? 'Sending...' : 'Send Email'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

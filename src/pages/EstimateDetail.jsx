import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { PAYMENT_METHODS, EXPENSE_CATEGORIES } from '../lib/schema'
import ProductPickerModal from '../components/ProductPickerModal'
import { ArrowLeft, Plus, Trash2, Send, CheckCircle, XCircle, Briefcase, Calculator, FileText, Download, Settings, Mail, X, UserPlus, Paperclip, Copy, Camera, ChevronDown, ChevronRight, DollarSign, Eye, Receipt, Image, Upload } from 'lucide-react'
import FlowIndicator from '../components/FlowIndicator'
import DealBreadcrumb from '../components/DealBreadcrumb'
import { quoteStatusColors as statusColors } from '../lib/statusColors'
import { fillPdfForm, downloadPdf } from '../lib/pdfFormFiller'
import { resolveAllMappings } from '../lib/dataPathResolver'
import { generateEstimatePdf } from '../lib/estimatePdf'
import { toast } from '../lib/toast'
import { companyNotify } from '../lib/companyNotify'
import SignedProposalCard from '../components/SignedProposalCard'
import EmailDeliveryBadge from '../components/EmailDeliveryBadge'
import { buildDefaultTerms, DEFAULT_DOWN_PAYMENT_LABEL } from '../components/proposal/formalProposalDefaults'
import FormalTermsEditor from '../components/proposal/FormalTermsEditor'

const InteractiveProposal = lazy(() => import('../components/proposal/InteractiveProposal'))
const FormalProposal = lazy(() => import('../components/proposal/FormalProposal'))

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
  const user = useStore((state) => state.user)
  const companyId = useStore((state) => state.companyId)
  const company = useStore((state) => state.company)
  const products = useStore((state) => state.products)
  const employees = useStore((state) => state.employees)
  const prescriptiveMeasures = useStore((state) => state.prescriptiveMeasures)
  const leads = useStore((state) => state.leads)
  const customers = useStore((state) => state.customers)
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
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState(null)
  const [pdfPreviewBlob, setPdfPreviewBlob] = useState(null)
  const [sendingEmail, setSendingEmail] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [convertingToJob, setConvertingToJob] = useState(false)
  const [expandedLineId, setExpandedLineId] = useState(null)
  const [viewingPhoto, setViewingPhoto] = useState(null)
  const [showAssociateModal, setShowAssociateModal] = useState(false)
  const [associationType, setAssociationType] = useState('lead') // 'lead' | 'customer' | 'newLead'
  const [leadSearch, setLeadSearch] = useState('')
  const [customerSearch, setCustomerSearch] = useState('')
  const [selectedLeadId, setSelectedLeadId] = useState(null)
  const [selectedCustomerId, setSelectedCustomerId] = useState(null)
  const [creatingLead, setCreatingLead] = useState(false)
  const [newLeadForm, setNewLeadForm] = useState({
    customer_name: '',
    phone: '',
    email: '',
    address: '',
    business_name: ''
  })

  // Audit linking
  const [availableAudits, setAvailableAudits] = useState([])

  // Expense state
  const [quoteExpenses, setQuoteExpenses] = useState([])
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ amount: '', merchant: '', category: 'Cost of Sale', notes: '' })
  const [receiptUploading, setReceiptUploading] = useState(false)

  // Line photos (before/after via file_attachments) and notes photos
  const [linePhotos, setLinePhotos] = useState({}) // { [quote_line_id]: [file_attachment, ...] }
  const [notesPhotos, setNotesPhotos] = useState([])
  const [photoUploadTarget, setPhotoUploadTarget] = useState(null) // { lineId, context }
  const photoInputRef = useRef(null)
  const docInputRef = useRef(null)

  const [depositForm, setDepositForm] = useState({
    deposit_amount: '',
    deposit_method: '',
    deposit_date: new Date().toISOString().slice(0, 10),
    deposit_notes: ''
  })
  const [depositPhoto, setDepositPhoto] = useState(null) // { file, preview }
  const [depositPhotoUploading, setDepositPhotoUploading] = useState(false)
  const [sendEmail, setSendEmail] = useState('')
  const [sendSubject, setSendSubject] = useState('')
  const [sendAttachments, setSendAttachments] = useState([]) // [{ file, name, base64 }]

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

  const [isMobile, setIsMobile] = useState(false)

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

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

    try {
    // Try with technician join first; if the column doesn't exist yet fall back
    let estimateData = null
    const baseSelect = '*, lead:leads(id, customer_name, phone, email, address, status), customer:customers(id, name, email, phone, address, business_name), salesperson:employees!salesperson_id(id, name, phone, email)'
    const { data: d1, error: e1 } = await supabase
      .from('quotes')
      .select(baseSelect + ', technician:employees!quotes_technician_id_fkey(id, name)')
      .eq('id', id)
      .single()

    if (!e1) {
      estimateData = d1
    } else {
      // Fallback without technician join (column may not exist yet)
      const { data: d2, error: e2 } = await supabase
        .from('quotes')
        .select(baseSelect)
        .eq('id', id)
        .single()
      if (e2) console.error('[EstimateDetail] Fallback query also failed:', e2.message, e2)
      estimateData = d2
    }

    if (estimateData) {
      setEstimate(estimateData)

      // Try ordering by sort_order; fall back to id if column doesn't exist yet
      let lines = null
      const { data: l1, error: lErr } = await supabase
        .from('quote_lines')
        .select('*, item:products_services(id, name, description, unit_price, cost, markup_percent, spec_sheet_url, install_guide_url, dlc_document_url)')
        .eq('quote_id', id)
        .order('sort_order', { ascending: true })
      if (!lErr) {
        lines = l1
      } else {
        const { data: l2 } = await supabase
          .from('quote_lines')
          .select('*, item:products_services(id, name, description, unit_price, cost, markup_percent, spec_sheet_url, install_guide_url, dlc_document_url)')
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
        const allAtts = atts || []

        // Separate photo attachments from document attachments (same pattern as JobDetail)
        const isPhoto = (att) => att.photo_context && att.file_type?.startsWith('image/')
        setAttachments(allAtts.filter(a => !isPhoto(a)))

        // Group line photos by quote_line_id
        const grouped = {}
        const notePhotos = []
        for (const p of allAtts.filter(a => isPhoto(a))) {
          if (p.photo_context === 'notes') {
            notePhotos.push(p)
          } else if (p.quote_line_id) {
            if (!grouped[p.quote_line_id]) grouped[p.quote_line_id] = []
            grouped[p.quote_line_id].push(p)
          }
        }
        setLinePhotos(grouped)
        setNotesPhotos(notePhotos)
      } catch {
        // quote_id column may not exist yet (migration not applied)
        setAttachments([])
      }

      // Fetch expenses linked to this estimate
      const { data: expData } = await supabase
        .from('expenses')
        .select('*')
        .eq('quote_id', id)
        .eq('company_id', companyId)
        .order('created_at', { ascending: false })
      setQuoteExpenses(expData || [])

      // Fetch available audits for this lead/customer (for linking)
      const leadId = estimateData.lead_id
      const custId = estimateData.customer_id
      if (leadId || custId) {
        let auditQuery = supabase.from('lighting_audits').select('id, facility_name, total_fixtures, annual_savings_dollars, watts_reduced, created_at').eq('company_id', companyId)
        if (leadId && custId) {
          auditQuery = auditQuery.or(`lead_id.eq.${leadId},customer_id.eq.${custId}`)
        } else if (leadId) {
          auditQuery = auditQuery.eq('lead_id', leadId)
        } else {
          auditQuery = auditQuery.eq('customer_id', custId)
        }
        const { data: audits } = await auditQuery
        setAvailableAudits(audits || [])
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

    } catch (err) {
      console.error('[EstimateDetail] fetchEstimateData crashed:', err)
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

    const updatedLines = lineItems.map(l => l.id === line.id ? { ...l, quantity: qty, line_total: newTotal } : l)
    setLineItems(updatedLines)

    await supabase.from('quote_lines').update({
      quantity: qty,
      line_total: newTotal
    }).eq('id', line.id)

    await updateEstimateTotalFromLines(updatedLines)
  }

  const handlePriceChange = async (line, newPrice) => {
    const price = Math.max(0, parseFloat(newPrice) || 0)
    const discount = parseFloat(line.discount) || 0
    const newTotal = (price * (line.quantity || 1)) - discount

    const updatedLines = lineItems.map(l => l.id === line.id ? { ...l, price, line_total: newTotal } : l)
    setLineItems(updatedLines)

    await supabase.from('quote_lines').update({
      price,
      line_total: newTotal
    }).eq('id', line.id)

    await updateEstimateTotalFromLines(updatedLines)
  }

  const handleDiscountChange = async (line, newDiscount) => {
    const discount = Math.max(0, parseFloat(newDiscount) || 0)
    const unitPrice = parseFloat(line.price) || 0
    const lineSubtotal = unitPrice * (line.quantity || 1)
    const cappedDiscount = Math.min(discount, lineSubtotal)
    const newTotal = lineSubtotal - cappedDiscount

    const updatedLines = lineItems.map(l => l.id === line.id ? { ...l, discount: cappedDiscount, line_total: newTotal } : l)
    setLineItems(updatedLines)

    await supabase.from('quote_lines').update({
      discount: cappedDiscount,
      line_total: newTotal
    }).eq('id', line.id)

    await updateEstimateTotalFromLines(updatedLines)
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
      item_name: product.name,
      description: product.description || null,
      quantity: 1,
      price: totalPrice,
      line_total: totalPrice,
      labor_cost: laborCost || 0
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
      item_name: line.item_name || line.item?.name || null,
      description: line.description || null,
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

  const handleLineNameChange = async (line, newName) => {
    const name = newName.trim()
    if (!name) return
    setLineItems(prev => prev.map(l => l.id === line.id ? { ...l, item_name: name } : l))
    await supabase.from('quote_lines').update({ item_name: name }).eq('id', line.id)
  }

  const handleLineDescriptionChange = async (line, newDesc) => {
    setLineItems(prev => prev.map(l => l.id === line.id ? { ...l, description: newDesc } : l))
    await supabase.from('quote_lines').update({ description: newDesc || null }).eq('id', line.id)
  }

  const handleLineNotesChange = async (line, newNotes) => {
    setLineItems(prev => prev.map(l => l.id === line.id ? { ...l, notes: newNotes } : l))
    await supabase.from('quote_lines').update({ notes: newNotes || null }).eq('id', line.id)
  }

  const addCustomLineItem = async () => {
    setSaving(true)
    await createQuoteLine({
      company_id: companyId,
      quote_id: id,
      item_name: 'Custom Item',
      quantity: 1,
      price: 0,
      line_total: 0
    })
    await updateEstimateTotal()
    await fetchEstimateData()
    setSaving(false)
  }

  const removeLineItem = async (lineId) => {
    setSaving(true)
    await deleteQuoteLine(lineId)
    await updateEstimateTotal()
    await fetchEstimateData()
    setSaving(false)
  }

  // Safety guard: never silently clobber quote_amount with a smaller number
  // when the lines array might not be fully hydrated. If the computed total
  // drops by more than 50% compared to what's on file, the lines almost
  // certainly aren't loaded yet and we skip the write instead of corrupting
  // a real quote. (Fixed a regression where quote_amount got reset during a
  // partial state update.)
  const safeWriteQuoteAmount = async (computedTotal, sourceTag) => {
    const current = parseFloat(estimate?.quote_amount) || 0
    if (computedTotal <= 0 && current > 0) {
      console.warn(`[EstimateDetail] ${sourceTag}: refusing to overwrite $${current} with $0`)
      return
    }
    if (current > 100 && computedTotal < current * 0.5) {
      console.warn(`[EstimateDetail] ${sourceTag}: refusing shrink from $${current} → $${computedTotal} (lines likely not loaded)`)
      return
    }
    await updateQuote(id, { quote_amount: computedTotal, updated_at: new Date().toISOString() })
  }

  const updateEstimateTotal = async () => {
    const allQuoteLines = useStore.getState().quoteLines || []
    const lines = allQuoteLines.filter(l => String(l.quote_id) === String(id))
    const total = lines.reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)
    await safeWriteQuoteAmount(total, 'updateEstimateTotal')
  }

  // Compute total from local line items (avoids stale Zustand store reads during rapid edits)
  const updateEstimateTotalFromLines = async (lines) => {
    const total = lines.reduce((sum, line) => sum + (parseFloat(line.line_total) || 0), 0)
    const current = parseFloat(estimate?.quote_amount) || 0
    const safe = !(current > 100 && total < current * 0.5) && !(total <= 0 && current > 0)
    if (safe) {
      setEstimate(prev => prev ? { ...prev, quote_amount: total } : prev)
    }
    await safeWriteQuoteAmount(total, 'updateEstimateTotalFromLines')
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

  // Send to setter pipeline
  const handleSendToSetter = async () => {
    const name = estimate.estimate_name || customerInfo?.name || customerInfo?.customer_name || 'this estimate'
    const reason = window.prompt(`Why does ${name} need a meeting?\n\nAdd a note for the setter:`)
    if (reason === null) return
    const senderName = user?.name || 'Someone'
    const noteText = `Sent to setter by ${senderName} on ${new Date().toLocaleDateString()}${reason ? `: ${reason}` : ''}`

    if (estimate.lead_id) {
      const { data: leadData } = await supabase.from('leads').select('notes').eq('id', estimate.lead_id).single()
      const existingNotes = leadData?.notes ? `${leadData.notes}\n${noteText}` : noteText
      const { error } = await supabase.from('leads').update({ status: 'Contacted', notes: existingNotes, updated_at: new Date().toISOString() }).eq('id', estimate.lead_id)
      if (error) { toast.error('Error: ' + error.message); return }
    } else {
      const { error } = await supabase.from('leads').insert({
        company_id: companyId,
        customer_name: customerInfo?.name || customerInfo?.customer_name || name,
        email: customerInfo?.email || null,
        phone: customerInfo?.phone || null,
        address: customerInfo?.address || null,
        status: 'Contacted',
        lead_source: 'Existing Estimate',
        customer_id: estimate.customer_id || null,
        quote_id: estimate.id,
        notes: noteText
      })
      if (error) { toast.error('Error: ' + error.message); return }
    }
    toast.success('Sent to setter pipeline')
    navigate('/lead-setter')
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

      toast.success('Estimate approved! Ready to convert to a Job.', { duration: 5000 })

      const customerName = estimate.customer?.name || estimate.lead?.customer_name || 'Unknown'
      const amount = parseFloat(estimate.total) || 0
      const amountStr = amount > 0 ? ` — $${amount.toLocaleString()}` : ''
      companyNotify({
        companyId,
        type: 'estimate_won',
        title: 'Estimate Won!',
        message: `${customerName}${amountStr} (${estimate.quote_id})`,
        metadata: { quote_id: id, customer_name: customerName, amount },
        createdBy: user?.id
      })

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

      toast.success('Estimate approved! Ready to convert to a Job.', { duration: 5000 })

      const customerName = estimate.customer?.name || estimate.lead?.customer_name || 'Unknown'
      const amount = parseFloat(estimate.total) || 0
      const amountStr = amount > 0 ? ` — $${amount.toLocaleString()}` : ''
      companyNotify({
        companyId,
        type: 'estimate_won',
        title: 'Estimate Won!',
        message: `${customerName}${amountStr} (${estimate.quote_id})`,
        metadata: { quote_id: id, customer_name: customerName, amount },
        createdBy: user?.id
      })

      setShowDepositModal(false)
      await fetchEstimateData()
      await fetchQuotes()
    } catch (err) {
      toast.error('Error: ' + err.message)
    }
    setSaving(false)
  }

  // Document upload handler
  const handleUploadDocument = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `estimates/${id}/${Date.now()}_${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(filePath, file)

    if (uploadError) {
      toast.error('Upload failed: ' + uploadError.message)
      return
    }

    const { error: dbError } = await supabase.from('file_attachments').insert({
      company_id: companyId,
      quote_id: parseInt(id),
      lead_id: estimate.lead_id ? parseInt(estimate.lead_id) : null,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type || null,
      file_size: file.size,
      storage_bucket: 'project-documents'
    })

    if (dbError) {
      toast.error('Failed to save attachment: ' + dbError.message)
      return
    }
    await fetchEstimateData()
  }

  // Photo upload handler (before/after/notes - matches JobDetail pattern)
  const handleUploadPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !photoUploadTarget) return
    e.target.value = ''

    const { lineId, context } = photoUploadTarget
    setPhotoUploadTarget(null)

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const subPath = context === 'notes' ? 'notes' : `${context}/${lineId}`
    const filePath = `estimates/${id}/photos/${subPath}/${Date.now()}_${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(filePath, file)

    if (uploadError) {
      toast.error('Upload failed: ' + uploadError.message)
      return
    }

    const insertData = {
      company_id: companyId,
      quote_id: parseInt(id),
      lead_id: estimate.lead_id ? parseInt(estimate.lead_id) : null,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type || null,
      file_size: file.size,
      storage_bucket: 'project-documents',
      photo_context: context,
    }
    if (lineId && context !== 'notes') insertData.quote_line_id = lineId

    const { error: dbError } = await supabase.from('file_attachments').insert(insertData)
    if (dbError) {
      toast.error('Failed to save photo: ' + dbError.message)
      return
    }
    await fetchEstimateData()
  }

  const handleDeletePhoto = async (att) => {
    if (!confirm('Delete this photo?')) return
    await supabase.from('file_attachments').delete().eq('id', att.id)
    await supabase.storage.from(att.storage_bucket).remove([att.file_path])
    await fetchEstimateData()
  }

  const triggerPhotoInput = (lineId, context) => {
    setPhotoUploadTarget({ lineId, context })
    setTimeout(() => photoInputRef.current?.click(), 50)
  }

  // PhotoThumbnail and AddPhotoButton (matches JobDetail)
  const PhotoThumbnail = ({ att, theme: t, onView, onDelete }) => {
    const [thumbUrl, setThumbUrl] = useState(null)
    useEffect(() => {
      let cancelled = false
      supabase.storage.from(att.storage_bucket).createSignedUrl(att.file_path, 3600).then(({ data }) => {
        if (!cancelled && data?.signedUrl) setThumbUrl(data.signedUrl)
      })
      return () => { cancelled = true }
    }, [att.id])
    return (
      <div style={{ position: 'relative', width: '64px', height: '64px', flexShrink: 0 }}>
        {thumbUrl ? (
          <img src={thumbUrl} alt={att.file_name} onClick={() => onView({ url: thumbUrl, name: att.file_name })}
            style={{ width: '64px', height: '64px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer', border: `1px solid ${t.border}` }} />
        ) : (
          <div style={{ width: '64px', height: '64px', borderRadius: '8px', backgroundColor: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Image size={20} color={t.textMuted} />
          </div>
        )}
        <button onClick={(e) => { e.stopPropagation(); onDelete(att) }}
          style={{ position: 'absolute', top: '-4px', right: '-4px', width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#dc2626', color: '#fff', border: 'none', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>
          {'\u2715'}
        </button>
      </div>
    )
  }

  const AddPhotoButton = ({ theme: t, onClick }) => (
    <button onClick={onClick} style={{ width: '64px', height: '64px', borderRadius: '8px', border: `2px dashed ${t.border}`, backgroundColor: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', color: t.textMuted, flexShrink: 0 }}>
      <Camera size={18} />
      <span style={{ fontSize: '10px' }}>Add</span>
    </button>
  )

  // Expense handlers
  const fetchQuoteExpenses = async () => {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('quote_id', id)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    setQuoteExpenses(data || [])
  }

  const handleAddQuoteExpense = async () => {
    if (!expenseForm.amount) return
    await supabase.from('expenses').insert([{
      company_id: companyId,
      quote_id: parseInt(id),
      lead_id: estimate.lead_id ? parseInt(estimate.lead_id) : null,
      amount: parseFloat(expenseForm.amount) || 0,
      category: expenseForm.category || 'Cost of Sale',
      vendor: expenseForm.merchant || null,
      description: expenseForm.notes || null,
      date: new Date().toISOString().split('T')[0]
    }])
    await fetchQuoteExpenses()
    setExpenseForm({ amount: '', merchant: '', category: 'Cost of Sale', notes: '' })
    setShowAddExpense(false)
  }

  const handleDeleteQuoteExpense = async (expId) => {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', expId)
    await fetchQuoteExpenses()
  }

  const handleQuoteReceiptCapture = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !estimate) return
    setReceiptUploading(true)

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `estimates/${id}/receipts/${timestamp}_${safeName}`

    const { error: uploadErr } = await supabase.storage
      .from('project-documents')
      .upload(storagePath, file, { contentType: file.type })

    if (uploadErr) {
      console.error('Receipt upload failed:', uploadErr)
      setReceiptUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('project-documents').getPublicUrl(storagePath)

    await supabase.from('expenses').insert([{
      company_id: companyId,
      quote_id: parseInt(id),
      lead_id: estimate.lead_id ? parseInt(estimate.lead_id) : null,
      amount: 0,
      category: 'Cost of Sale',
      date: new Date().toISOString().split('T')[0],
      description: 'Receipt capture',
      receipt_url: urlData.publicUrl,
      receipt_storage_path: storagePath,
      source: 'receipt'
    }])

    await fetchQuoteExpenses()
    setReceiptUploading(false)
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
          job_total: subtotal - discount,
          utility_incentive: parseFloat(estimate.utility_incentive) || 0,
          details: estimate.summary || null,
          updated_at: new Date().toISOString()
        }])
        .select()
        .single()

      if (jobError) throw jobError

      // 2b. Create a Deposit Invoice if the formal proposal has a
      //     down payment configured. Standard construction practice:
      //     deposit gets its own invoice so the bookkeeper has somewhere
      //     to apply the customer's check. The invoice is created in the
      //     regular `invoices` table with `invoice_type='deposit'`.
      //     Utility invoices (separate table) are untouched.
      try {
        const formalCfg = estimate.settings_overrides?.formal_proposal || {}
        const dpLabel = formalCfg.down_payment_label || 'Deposit'
        const dpRaw = parseFloat(formalCfg.down_payment_amount) || 0
        const dpIsPercent = !!formalCfg.down_payment_is_percent
        const contractTotal = subtotal - (parseFloat(estimate.discount) || 0)
        const dpAmount = dpIsPercent
          ? Math.round(contractTotal * (dpRaw / 100) * 100) / 100
          : dpRaw

        if (dpAmount > 0) {
          const invNumber = `INV-DEP-${Date.now().toString(36).toUpperCase()}`
          const { data: depositInvoice, error: depInvErr } = await supabase
            .from('invoices')
            .insert([{
              company_id: companyId,
              job_id: newJob.id,
              customer_id: customerId,
              invoice_id: invNumber,
              amount: dpAmount,
              payment_status: 'Draft',
              invoice_type: 'deposit',
              business_unit: estimate.business_unit || null,
              job_description: `${dpLabel} for ${estimate.estimate_name || estimate.quote_id || 'project'}`,
              notes: `Auto-generated deposit invoice from ${estimate.quote_id || `EST-${estimate.id}`}. ${dpLabel} due upon acceptance per formal proposal.`,
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            }])
            .select()
            .single()

          if (depInvErr) {
            console.error('[convertToJob] deposit invoice insert failed', depInvErr)
          } else if (depositInvoice) {
            // If the rep already captured a deposit payment on the
            // estimate via the existing Deposit Modal, the payments row
            // will have is_deposit=true and quote_id=estimate.id. Link
            // it to the new invoice and mark the invoice Paid/Partial.
            const { data: existingPayment } = await supabase
              .from('payments')
              .select('id, amount')
              .eq('company_id', companyId)
              .eq('quote_id', estimate.id)
              .eq('is_deposit', true)
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()

            if (existingPayment?.id) {
              const paidAmount = parseFloat(existingPayment.amount) || 0
              await supabase
                .from('payments')
                .update({ invoice_id: depositInvoice.id, job_id: newJob.id })
                .eq('id', existingPayment.id)

              if (paidAmount >= dpAmount - 0.01) {
                await supabase
                  .from('invoices')
                  .update({ payment_status: 'Paid', updated_at: new Date().toISOString() })
                  .eq('id', depositInvoice.id)
              } else if (paidAmount > 0) {
                await supabase
                  .from('invoices')
                  .update({ payment_status: 'Partial', updated_at: new Date().toISOString() })
                  .eq('id', depositInvoice.id)
              }
            }

            toast.success(`${dpLabel} invoice ${invNumber} created: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dpAmount)}`)
          }
        }
      } catch (depErr) {
        console.error('[convertToJob] deposit invoice step failed', depErr)
      }

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
        const { data: createdJobLines } = await supabase.from('job_lines').insert(jobLines).select('id')

        // Map quote_line_id → job_line_id for photo carry-forward
        if (createdJobLines?.length) {
          for (let i = 0; i < lineItems.length; i++) {
            const quoteLineId = lineItems[i].id
            const jobLineId = createdJobLines[i]?.id
            if (quoteLineId && jobLineId) {
              await supabase
                .from('file_attachments')
                .update({ job_id: newJob.id, job_line_id: jobLineId })
                .eq('quote_line_id', quoteLineId)
                .eq('company_id', companyId)
            }
          }
        }
      }

      // 4. Link document attachments to the new job
      if (attachments.length > 0) {
        for (const att of attachments) {
          await supabase
            .from('file_attachments')
            .update({ job_id: newJob.id })
            .eq('id', att.id)
        }
      }

      // 4b. Carry the signed formal proposal to the new job
      if (estimate.signed_proposal_attachment_id) {
        await supabase
          .from('file_attachments')
          .update({ job_id: newJob.id })
          .eq('id', estimate.signed_proposal_attachment_id)
        await supabase
          .from('jobs')
          .update({ signed_proposal_attachment_id: estimate.signed_proposal_attachment_id })
          .eq('id', newJob.id)
      }

      // 4c. Carry canonical customer signature from the lead to the job
      //     so any signable document generated on the job auto-stamps it.
      if (estimate.lead_id) {
        try {
          const { data: leadSig } = await supabase
            .from('leads')
            .select('customer_signature_path, customer_signature_typed, customer_signature_method, customer_signature_captured_at')
            .eq('id', estimate.lead_id)
            .maybeSingle()
          if (leadSig && (leadSig.customer_signature_path || leadSig.customer_signature_typed)) {
            await supabase
              .from('jobs')
              .update({
                customer_signature_path: leadSig.customer_signature_path || null,
                customer_signature_typed: leadSig.customer_signature_typed || null,
                customer_signature_method: leadSig.customer_signature_method || null,
                customer_signature_captured_at: leadSig.customer_signature_captured_at || null,
              })
              .eq('id', newJob.id)
          }
        } catch (sigErr) {
          console.warn('[convertToJob] signature carry-over failed', sigErr)
        }
      }

      // Also carry notes photos forward
      if (notesPhotos.length > 0) {
        for (const p of notesPhotos) {
          await supabase
            .from('file_attachments')
            .update({ job_id: newJob.id })
            .eq('id', p.id)
        }
      }

      // 5. Carry quote expenses forward to the new job
      await supabase
        .from('expenses')
        .update({ job_id: newJob.id })
        .eq('quote_id', estimate.id)
        .eq('company_id', companyId)

      // Also carry lead expenses forward (ones not already on a job)
      if (estimate.lead_id) {
        await supabase
          .from('expenses')
          .update({ job_id: newJob.id })
          .eq('lead_id', estimate.lead_id)
          .is('job_id', null)
          .eq('company_id', companyId)
      }

      // 6. Link job back to estimate
      await updateQuote(id, { job_id: newJob.id, customer_id: customerId, updated_at: new Date().toISOString() })

      // 7. Update lead status if linked
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

  // Associate estimate with existing lead, existing customer, or new lead
  const handleAssociate = async (e) => {
    e.preventDefault()
    setCreatingLead(true)
    try {
      if (associationType === 'lead') {
        if (!selectedLeadId) {
          toast.error('Please select a lead.')
          setCreatingLead(false)
          return
        }
        await updateQuote(id, { lead_id: selectedLeadId, updated_at: new Date().toISOString() })
        toast.success('Lead linked!')
      } else if (associationType === 'customer') {
        if (!selectedCustomerId) {
          toast.error('Please select a customer.')
          setCreatingLead(false)
          return
        }
        await updateQuote(id, { customer_id: selectedCustomerId, updated_at: new Date().toISOString() })
        toast.success('Customer linked!')
      } else if (associationType === 'newLead') {
        if (!newLeadForm.customer_name.trim()) {
          toast.error('Customer name is required.')
          setCreatingLead(false)
          return
        }
        const leadNumber = `LEAD-${Date.now().toString(36).toUpperCase()}`
        const { data: newLead, error: leadErr } = await supabase
          .from('leads')
          .insert({
            company_id: companyId,
            lead_id: leadNumber,
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
        await updateQuote(id, { lead_id: newLead.id, updated_at: new Date().toISOString() })
        toast.success('Lead created and linked!')
        await fetchLeads()
      }

      setShowAssociateModal(false)
      setNewLeadForm({ customer_name: '', phone: '', email: '', address: '', business_name: '' })
      setAssociationType('lead')
      setLeadSearch('')
      setCustomerSearch('')
      setSelectedLeadId(null)
      setSelectedCustomerId(null)
      await fetchEstimateData()
      await fetchQuotes()
    } catch (err) {
      toast.error('Failed: ' + err.message)
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

      // Show preview instead of immediately saving
      const url = URL.createObjectURL(pdfBlob)
      setPdfPreviewBlob(pdfBlob)
      setPdfPreviewUrl(url)
    } catch (err) {
      toast.error('PDF generation failed: ' + err.message)
    }
    setGeneratingPdf(false)
  }

  const handleDiscardPdfPreview = () => {
    if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    setPdfPreviewUrl(null)
    setPdfPreviewBlob(null)
  }

  const handleSavePdfPreview = async () => {
    if (!pdfPreviewBlob) return
    setGeneratingPdf(true)
    try {
      const effectiveSettings = getEffectiveSettings()
      const fileName = `estimates/${companyId}/${estimate.quote_id || estimate.id}_${Date.now()}.pdf`
      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(fileName, pdfPreviewBlob, { contentType: 'application/pdf', upsert: true })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        toast.error('Upload failed. Downloading locally instead.')
      } else {
        await updateQuote(id, { pdf_url: fileName, pdf_layout: effectiveSettings.pdf_layout })

        try {
          await supabase.from('file_attachments').insert({
            company_id: companyId,
            quote_id: parseInt(id),
            lead_id: estimate.lead_id ? parseInt(estimate.lead_id) : null,
            file_name: `${estimate.quote_id || 'estimate'}.pdf`,
            file_path: fileName,
            file_type: 'application/pdf',
            file_size: pdfPreviewBlob.size,
            storage_bucket: 'project-documents'
          })
        } catch {
          // quote_id column may not exist yet
        }

        toast.success('PDF saved to documents!')
      }

      // Also download locally
      const a = document.createElement('a')
      a.href = pdfPreviewUrl
      a.download = `${estimate.quote_id || 'estimate'}.pdf`
      a.click()

      handleDiscardPdfPreview()
      await fetchEstimateData()
    } catch (err) {
      toast.error('Save failed: ' + err.message)
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
    if (!estimate.customer_id && !estimate.lead_id) {
      toast.error('Please link this estimate to a customer or lead before sending. (No customer attached.)')
      return
    }
    if (!lineItems || lineItems.length === 0) {
      toast.error('Please add at least one line item before sending.')
      return
    }
    setSendingEmail(true)
    try {
      const buObject = getBusinessUnitObject()
      const presMode = estimate.settings_overrides?.presentation_mode || 'pdf'

      // Only the PDF presentation mode needs a physical PDF attachment.
      // Interactive and formal modes use the portal link, no attachment.
      if (presMode === 'pdf') {
        // Verify the existing pdf_url actually exists in storage — if the
        // file was deleted or the path is stale, regenerate instead of
        // passing a dead reference to the edge function.
        let needNewPdf = !estimate.pdf_url
        if (estimate.pdf_url) {
          const { data: existsCheck } = await supabase.storage
            .from('project-documents')
            .createSignedUrl(estimate.pdf_url, 60)
          if (!existsCheck?.signedUrl) needNewPdf = true
        }

        if (needNewPdf) {
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
          const { error: upErr } = await supabase.storage
            .from('project-documents')
            .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true })
          if (upErr) throw new Error('PDF upload failed: ' + upErr.message)
          await updateQuote(id, { pdf_url: fileName })
          estimate.pdf_url = fileName
        }
      }

      // Create portal token (new token every send so we can revoke old ones later)
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
      if (tokenErr) throw new Error('Portal token creation failed: ' + tokenErr.message)

      const siteUrl = 'https://jobscout.appsannex.com'
      const portalUrl = portalToken?.token
        ? `${siteUrl}/portal/${portalToken.token}`
        : null

      // Resolve customer display — business_name first, then individual name
      const custRecord = estimate.customer || estimate.lead || {}
      const custName = custRecord.business_name || custRecord.name || custRecord.customer_name || ''

      // Resolve best-available phone: business unit → company → estimate owner (salesperson)
      let ownerPhone = ''
      try {
        if (estimate.salesperson_id) {
          const { data: sp } = await supabase.from('employees').select('phone').eq('id', estimate.salesperson_id).maybeSingle()
          ownerPhone = sp?.phone || ''
        }
      } catch { /* ignore */ }

      // Resolve logo URL (mirror invoice flow)
      let logoUrl = buObject?.logo_url || ''
      if (!logoUrl) {
        const logoSetting = useStore.getState().settings?.find?.(s => s.key === 'company_logo_url')
        logoUrl = logoSetting?.value || company?.logo_url || ''
      }

      // Summary numbers — mirror the EstimateDetail summary exactly
      const subtotalCalc = (lineItems || []).reduce((sum, l) => sum + (parseFloat(l.line_total) || 0), 0)
      const discountCalc = parseFloat(estimate.discount) || 0
      const incentiveCalc = parseFloat(estimate.utility_incentive) || 0
      const contractTotal = subtotalCalc - discountCalc
      const netAfterIncentive = Math.max(0, contractTotal - incentiveCalc)
      const formalCfg = estimate.settings_overrides?.formal_proposal || {}
      const dpRaw = parseFloat(formalCfg.down_payment_amount) || 0
      const dpAmount = formalCfg.down_payment_is_percent ? +(contractTotal * (dpRaw / 100)).toFixed(2) : dpRaw
      const dpLabel = formalCfg.down_payment_label || 'Deposit'

      // Call edge function via direct fetch so we can read the actual
      // error body instead of the generic "non-2xx status code" wrapper
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-estimate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify({
          company_id: companyId,
          estimate_id: estimate.id,
          recipient_email: sendEmail,
          pdf_storage_path: estimate.pdf_url,
          company_name: company?.company_name || '',
          estimate_number: estimate.quote_id || `EST-${estimate.id}`,
          portal_url: portalUrl,
          logo_url: logoUrl,
          business_unit_name: buObject?.name || estimate.business_unit || '',
          business_unit_phone: buObject?.phone || company?.phone || ownerPhone || '',
          business_unit_email: buObject?.email || company?.owner_email || '',
          business_unit_address: buObject?.address || company?.address || '',
          presentation_mode: presMode,
          customer_name: custName,
          subtotal: subtotalCalc,
          discount: discountCalc,
          utility_incentive: incentiveCalc,
          contract_total: contractTotal,
          net_after_incentive: netAfterIncentive,
          down_payment_label: dpLabel,
          down_payment_amount: dpAmount,
          custom_subject: sendSubject || undefined,
          extra_attachments: sendAttachments.length > 0 ? sendAttachments.map(a => ({ filename: a.name, content: a.base64 })) : undefined,
        }),
      })
      const sendData = await sendRes.json().catch(() => ({}))
      if (!sendRes.ok || sendData?.error) {
        throw new Error(sendData?.error || `send-estimate HTTP ${sendRes.status}`)
      }

      // Update estimate (capture Resend email_id for delivery tracking,
      // same pattern InvoiceDetail uses)
      await updateQuote(id, {
        status: estimate.status === 'Draft' ? 'Sent' : estimate.status,
        last_sent_at: new Date().toISOString(),
        sent_to_email: sendEmail,
        sent_date: estimate.sent_date || new Date().toISOString(),
        portal_token: portalToken?.token || null,
        email_id: sendData?.emailId || null,
        email_status: 'sent',
        email_status_at: new Date().toISOString(),
        email_bounce_reason: null,
        email_opened_at: null,
        email_clicked_at: null,
        updated_at: new Date().toISOString()
      })

      toast.success('Estimate sent successfully!')
      setShowSendModal(false)
      setSendSubject('')
      setSendAttachments([])
      await fetchEstimateData()
      await fetchQuotes()
    } catch (err) {
      toast.error('Failed to send: ' + err.message)
    }
    setSendingEmail(false)
  }

  // Settings save — updates local state immediately without triggering a full reload
  const saveSettingsOverrides = async (newSettings, { silent } = {}) => {
    await updateQuote(id, { settings_overrides: newSettings, updated_at: new Date().toISOString() })
    if (silent) {
      // Update local estimate state directly (avoids loading flash that unmounts modals)
      setEstimate(prev => prev ? { ...prev, settings_overrides: newSettings } : prev)
    } else {
      await fetchEstimateData()
    }
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
      <div style={{ padding: isMobile ? '16px' : '24px' }}>
        <p style={{ color: theme.textMuted }}>Loading estimate...</p>
      </div>
    )
  }

  if (!estimate) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px' }}>
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
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Hidden photo input for before/after/notes uploads */}
      <input type="file" ref={photoInputRef} accept="image/*" multiple style={{ display: 'none' }} onChange={handleUploadPhoto} />

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
            fontSize: isMobile ? '20px' : '24px',
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
          <select
            value={estimate.status}
            onChange={async (e) => {
              const newStatus = e.target.value
              if (newStatus === estimate.status) return
              if (newStatus === 'Approved') {
                setShowDepositModal(true)
              } else if (newStatus === 'Sent') {
                await sendEstimate()
              } else if (newStatus === 'Rejected') {
                await rejectEstimate()
              } else {
                await updateEstimateField('status', newStatus)
                await fetchQuotes()
              }
            }}
            style={{
              padding: '6px 28px 6px 14px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '500',
              backgroundColor: statusStyle.bg,
              color: statusStyle.text,
              border: 'none',
              cursor: 'pointer',
              appearance: 'none',
              WebkitAppearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='${encodeURIComponent(statusStyle.text)}'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 10px center',
              minHeight: '32px'
            }}
          >
            {['Draft', 'Sent', 'Negotiation', 'Approved', 'Rejected'].map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
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
          <button
            onClick={handleSendToSetter}
            style={{ padding: '8px 14px', backgroundColor: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap' }}
          >
            <UserPlus size={16} /> Send to Setter
          </button>
        </div>
      </div>

      {/* Signed formal proposal on file — shows as soon as the customer signs */}
      {estimate.signed_proposal_attachment_id && (
        <SignedProposalCard
          attachmentId={estimate.signed_proposal_attachment_id}
          quoteId={estimate.id}
          theme={theme}
        />
      )}

      {/* Email delivery tracking (same tracker used on invoices) */}
      <EmailDeliveryBadge record={estimate} theme={theme} />

      {/* Flow context - only when linked to a lead */}
      {estimate.lead_id && estimate.lead?.status && (
        <FlowIndicator currentStatus={estimate.lead.status} showCompact={isMobile} />
      )}
      {estimate.lead_id && (
        <DealBreadcrumb
          current="quote"
          leadId={estimate.lead_id}
          quoteId={estimate.id}
          customerId={estimate.customer_id}
          jobId={estimate.job_id}
        />
      )}

      {/* Next Step hint for Draft/Sent */}
      {(estimate.status === 'Draft' || estimate.status === 'Sent') && !estimate.job_id && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: 'rgba(59,130,246,0.06)',
          border: '1px solid rgba(59,130,246,0.15)',
          borderRadius: '8px',
          marginBottom: '16px',
          fontSize: '13px',
          color: theme.textSecondary
        }}>
          <CheckCircle size={16} color="#3b82f6" />
          <span>
            {estimate.status === 'Draft'
              ? 'Next: Mark as Sent, then Approve to convert to a Job.'
              : 'Next: Approve this estimate to convert it to a Job.'}
          </span>
          <button
            onClick={() => estimate.status === 'Draft' ? sendEstimate() : setShowDepositModal(true)}
            style={{
              marginLeft: 'auto',
              padding: '6px 14px',
              backgroundColor: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '500',
              whiteSpace: 'nowrap',
              minHeight: '32px'
            }}
          >
            {estimate.status === 'Draft' ? 'Mark as Sent' : 'Approve Now'}
          </button>
        </div>
      )}

      {/* Next Step: Convert to Job banner - when Approved and no job yet */}
      {estimate.status === 'Approved' && !estimate.job_id && (
        <div style={{
          display: 'flex',
          alignItems: isMobile ? 'flex-start' : 'center',
          flexDirection: isMobile ? 'column' : 'row',
          gap: isMobile ? '12px' : '16px',
          padding: '16px 20px',
          backgroundColor: 'rgba(34,197,94,0.08)',
          border: '1px solid rgba(34,197,94,0.25)',
          borderRadius: '12px',
          marginBottom: '24px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '50%',
              backgroundColor: '#dcfce7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0
            }}>
              <CheckCircle size={20} color="#16a34a" />
            </div>
            <div>
              <div style={{ fontSize: '15px', fontWeight: '600', color: '#166534' }}>Estimate Approved</div>
              <div style={{ fontSize: '13px', color: '#4d7c0f' }}>Ready to convert to a job and start delivery</div>
            </div>
          </div>
          <button
            onClick={handleConvertToJob}
            disabled={convertingToJob}
            style={{
              padding: '12px 24px',
              backgroundColor: convertingToJob ? '#9ca3af' : '#16a34a',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: convertingToJob ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              minHeight: '44px',
              whiteSpace: 'nowrap',
              width: isMobile ? '100%' : 'auto',
              justifyContent: 'center'
            }}
          >
            <Briefcase size={18} />
            {convertingToJob ? 'Converting...' : 'Convert to Job'}
          </button>
        </div>
      )}

      {/* View Job banner - when already converted */}
      {estimate.job_id && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '12px 16px',
          backgroundColor: 'rgba(90,99,73,0.08)',
          border: `1px solid rgba(90,99,73,0.2)`,
          borderRadius: '8px',
          marginBottom: '24px'
        }}>
          <div style={{ flex: 1, fontSize: '13px', color: theme.textSecondary }}>
            This estimate has been converted to a job.
          </div>
          <button
            onClick={() => navigate(`/jobs/${estimate.job_id}`)}
            style={{
              padding: '8px 16px',
              backgroundColor: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              minHeight: '36px',
              whiteSpace: 'nowrap'
            }}
          >
            <Eye size={14} />
            View Job
          </button>
        </div>
      )}

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
                {estimate.lead_id && (
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
                {!estimate.lead_id && !estimate.customer_id && (
                  <button
                    onClick={() => setShowAssociateModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '12px',
                      color: '#fff',
                      backgroundColor: theme.accent,
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      cursor: 'pointer',
                      fontWeight: '500'
                    }}
                  >
                    <UserPlus size={12} />
                    Link Lead / Customer
                  </button>
                )}
                {(estimate.lead_id || estimate.customer_id) && (
                  <button
                    onClick={() => setShowAssociateModal(true)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '11px',
                      color: theme.textMuted,
                      background: 'none',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      padding: '4px 8px',
                      cursor: 'pointer'
                    }}
                  >
                    Change
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
                  type="date"
                  value={estimate.created_at ? estimate.created_at.slice(0, 10) : ''}
                  onChange={(e) => updateEstimateField('created_at', e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Sent Date</label>
                <input
                  type="date"
                  value={estimate.sent_date ? estimate.sent_date.slice(0, 10) : ''}
                  onChange={(e) => updateEstimateField('sent_date', e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Approved Date</label>
                <input
                  type="date"
                  value={estimate.approved_date ? estimate.approved_date.slice(0, 10) : ''}
                  onChange={(e) => updateEstimateField('approved_date', e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null)}
                  style={inputStyle}
                />
              </div>
              <div>
                <label style={labelStyle}>Rejected Date</label>
                <input
                  type="date"
                  value={estimate.rejected_date ? estimate.rejected_date.slice(0, 10) : ''}
                  onChange={(e) => updateEstimateField('rejected_date', e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null)}
                  style={inputStyle}
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
              <div style={{ display: 'flex', gap: '8px' }}>
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
                  Add Product
                </button>
                <button
                  onClick={addCustomLineItem}
                  disabled={saving}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 12px',
                    backgroundColor: theme.bg,
                    color: theme.textSecondary,
                    border: `1px solid ${theme.border}`,
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer'
                  }}
                >
                  <Plus size={16} />
                  Custom Line
                </button>
              </div>
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
                  const attPhotoCount = (linePhotos[line.id] || []).length
                  const totalPhotoCount = photos.length + attPhotoCount
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
                            {line.item_name || line.item?.name || 'Custom Item'}
                          </p>
                          {totalPhotoCount > 0 && (
                            <span style={{ fontSize: '11px', backgroundColor: theme.accentBg, color: theme.accent, padding: '2px 6px', borderRadius: '10px', fontWeight: '600' }}>
                              <Camera size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} />{totalPhotoCount}
                            </span>
                          )}
                        </div>
                        <div>
                          <p style={{
                            fontSize: '12px',
                            color: (line.description || line.item?.description) ? theme.textSecondary : theme.textMuted,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            margin: 0,
                            fontStyle: (line.description || line.item?.description) ? 'normal' : 'italic'
                          }}>
                            {line.description || line.item?.description || 'Click to add description'}
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
                            min="0"
                            step="0.01"
                            defaultValue={line.price}
                            key={`price-${line.id}-${line.price}`}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value) || 0
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
                      {/* Expanded detail section: name, description, notes + photos */}
                      {isExpanded && (
                        <div style={{ padding: '8px 20px 14px', backgroundColor: theme.bg }}>
                          {/* Editable Name */}
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>Item Name</label>
                            <input
                              type="text"
                              defaultValue={line.item_name || line.item?.name || ''}
                              key={`name-${line.id}-${line.item_name}`}
                              onBlur={(e) => {
                                const val = e.target.value.trim()
                                const current = line.item_name || line.item?.name || ''
                                if (val && val !== current) handleLineNameChange(line, val)
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                fontSize: '13px',
                                fontWeight: '500',
                                color: theme.text,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '6px',
                                backgroundColor: theme.bgCard,
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                          {/* Editable Description */}
                          <div style={{ marginBottom: '8px' }}>
                            <label style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>Description</label>
                            <textarea
                              defaultValue={line.description || line.item?.description || ''}
                              key={`desc-${line.id}-${line.description}`}
                              placeholder="Add a description for this line item..."
                              rows={2}
                              onBlur={(e) => {
                                const val = e.target.value.trim()
                                const current = line.description || line.item?.description || ''
                                if (val !== current) handleLineDescriptionChange(line, val)
                              }}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                fontSize: '12px',
                                color: theme.textSecondary,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '6px',
                                backgroundColor: theme.bgCard,
                                outline: 'none',
                                boxSizing: 'border-box',
                                resize: 'vertical'
                              }}
                            />
                          </div>
                          {/* Notes */}
                          <div style={{ marginBottom: '10px' }}>
                            <label style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px', display: 'block' }}>Internal Notes</label>
                            <input
                              type="text"
                              placeholder="Internal notes (not shown on estimate)..."
                              defaultValue={line.notes || ''}
                              onBlur={(e) => {
                                const val = e.target.value.trim()
                                if (val !== (line.notes || '')) handleLineNotesChange(line, val)
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
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
                          {/* Labor cost info */}
                          {line.labor_cost > 0 && (
                            <div style={{ marginBottom: '10px', padding: '8px 10px', backgroundColor: 'rgba(139,92,246,0.08)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <DollarSign size={12} style={{ color: '#8b5cf6' }} />
                              <span style={{ fontSize: '12px', color: '#8b5cf6', fontWeight: '500' }}>
                                Labor cost: ${parseFloat(line.labor_cost).toFixed(2)}
                              </span>
                            </div>
                          )}
                          {/* Product Documents (spec sheets, install guides) */}
                          {(line.item?.spec_sheet_url || line.item?.install_guide_url || line.item?.dlc_document_url) && (
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Documents</div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {line.item.spec_sheet_url && (
                                  <a href={line.item.spec_sheet_url} target="_blank" rel="noopener noreferrer" style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                                    backgroundColor: theme.accentBg, color: theme.accent, borderRadius: '6px',
                                    fontSize: '12px', fontWeight: '500', textDecoration: 'none', border: `1px solid ${theme.border}`
                                  }}>
                                    <FileText size={14} /> Spec Sheet
                                  </a>
                                )}
                                {line.item.install_guide_url && (
                                  <a href={line.item.install_guide_url} target="_blank" rel="noopener noreferrer" style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                                    backgroundColor: theme.accentBg, color: theme.accent, borderRadius: '6px',
                                    fontSize: '12px', fontWeight: '500', textDecoration: 'none', border: `1px solid ${theme.border}`
                                  }}>
                                    <FileText size={14} /> Install Guide
                                  </a>
                                )}
                                {line.item.dlc_document_url && (
                                  <a href={line.item.dlc_document_url} target="_blank" rel="noopener noreferrer" style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                                    backgroundColor: 'rgba(59,130,246,0.08)', color: '#3b82f6', borderRadius: '6px',
                                    fontSize: '12px', fontWeight: '500', textDecoration: 'none', border: '1px solid rgba(59,130,246,0.2)'
                                  }}>
                                    <FileText size={14} /> DLC Certificate
                                  </a>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Source/Audit Photos (stored on quote_lines.photos JSON) */}
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Photos</div>
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
                                  multiple
                                  style={{ display: 'none' }}
                                  onChange={(e) => handleLinePhotoUpload(line.id, e)}
                                />
                              </label>
                            </div>
                            {photos.length === 0 && (
                              <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>No photos yet. Click Add to attach.</p>
                            )}
                          </div>
                          {/* Before Photos (file_attachments) */}
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Before</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {((linePhotos[line.id] || []).filter(p => p.photo_context === 'line_before')).map(photo => (
                                <PhotoThumbnail key={photo.id} att={photo} theme={theme} onView={setViewingPhoto} onDelete={handleDeletePhoto} />
                              ))}
                              <AddPhotoButton theme={theme} onClick={() => triggerPhotoInput(line.id, 'line_before')} />
                            </div>
                          </div>
                          {/* After (Completion) Photos */}
                          <div>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>After (Completion)</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {((linePhotos[line.id] || []).filter(p => p.photo_context === 'line_after')).map(photo => (
                                <PhotoThumbnail key={photo.id} att={photo} theme={theme} onView={setViewingPhoto} onDelete={handleDeletePhoto} />
                              ))}
                              <AddPhotoButton theme={theme} onClick={() => triggerPhotoInput(line.id, 'line_after')} />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
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

              {/* Manual Annual Savings */}
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '14px'
              }}>
                <span style={{ color: theme.textSecondary }}>Annual Savings</span>
                <input
                  type="number"
                  value={estimate.manual_annual_savings || ''}
                  onChange={(e) => updateEstimateField('manual_annual_savings', e.target.value || 0)}
                  placeholder={estimate.audit_id ? 'From audit' : '0'}
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

              {/* Audit Link */}
              <div style={{
                borderTop: `1px solid ${theme.border}`,
                paddingTop: '10px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}>
                <span style={{ fontSize: '13px', color: theme.textSecondary, whiteSpace: 'nowrap' }}>Lighting Audit</span>
                {estimate.audit_id ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'flex-end' }}>
                    <span style={{ fontSize: '13px', color: '#4a7c59', fontWeight: '500' }}>Linked (#{estimate.audit_id})</span>
                    <button onClick={async () => {
                      await supabase.from('quotes').update({ audit_id: null }).eq('id', estimate.id)
                      await fetchEstimateData()
                      toast.success('Audit unlinked')
                    }} style={{ padding: '2px 6px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '4px', fontSize: '10px', color: theme.textMuted, cursor: 'pointer' }}>
                      Unlink
                    </button>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, justifyContent: 'flex-end' }}>
                    {availableAudits.length > 0 ? (
                      <select
                        value=""
                        onChange={async (e) => {
                          if (!e.target.value) return
                          await supabase.from('quotes').update({ audit_id: parseInt(e.target.value) }).eq('id', estimate.id)
                          await fetchEstimateData()
                          toast.success('Audit linked! Savings data will be used in proposals.')
                        }}
                        style={{ fontSize: '12px', padding: '4px 8px', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, backgroundColor: theme.bgCard, maxWidth: '200px' }}
                      >
                        <option value="">Link audit...</option>
                        {availableAudits.map(a => (
                          <option key={a.id} value={a.id}>
                            #{a.id} — {a.total_fixtures || '?'} fixtures{a.annual_savings_dollars ? `, $${Math.round(a.annual_savings_dollars)}/yr` : ''}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span style={{ fontSize: '11px', color: theme.textMuted, fontStyle: 'italic' }}>No audits for this lead</span>
                    )}
                    <button onClick={async () => {
                      // Create a new audit from the line items
                      const customer = estimate.customer || estimate.lead
                      const { data: newAudit, error } = await supabase.from('lighting_audits').insert({
                        company_id: companyId,
                        lead_id: estimate.lead_id || null,
                        customer_id: estimate.customer_id || null,
                        facility_name: customer?.business_name || customer?.customer_name || customer?.name || 'Facility',
                        address: customer?.address || '',
                        status: 'In Progress',
                        total_fixtures: lineItems.reduce((sum, li) => sum + (parseInt(li.quantity) || 0), 0),
                        created_at: new Date().toISOString(),
                      }).select().single()
                      if (error) { toast.error('Failed to create audit'); return }
                      // Link it
                      await supabase.from('quotes').update({ audit_id: newAudit.id }).eq('id', estimate.id)
                      await fetchEstimateData()
                      toast.success('Audit created and linked! Fill in fixture details in the Lighting Audit page.')
                    }} title="Create a new audit for this project"
                      style={{ padding: '4px 8px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '5px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      + New Audit
                    </button>
                  </div>
                )}
              </div>

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
                {generatingPdf ? 'Generating...' : 'Preview PDF'}
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

              {/* Send / Proposal */}
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
                <Send size={18} />
                Create Proposal
              </button>

              {/* Formal Legal Proposal — reuses the Create Proposal preview+send modal
                  with presentation_mode pre-set to 'formal' */}
              <button
                onClick={async () => {
                  const current = getEffectiveSettings()
                  await saveSettingsOverrides({ ...current, presentation_mode: 'formal' }, { silent: true })
                  setShowSendModal(true)
                }}
                disabled={saving}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  padding: '12px 16px',
                  backgroundColor: 'transparent',
                  color: theme.accent,
                  border: `1.5px solid ${theme.accent}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '600',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.6 : 1
                }}
              >
                <FileText size={18} />
                Formal Legal Proposal
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

          {/* Expenses */}
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <DollarSign size={15} style={{ color: theme.accent }} />
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: 0 }}>Expenses ({quoteExpenses.length})</h3>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <input type="file" accept="image/*" style={{ display: 'none' }} id="quote-receipt-input" onChange={handleQuoteReceiptCapture} />
                <button onClick={() => document.getElementById('quote-receipt-input')?.click()} disabled={receiptUploading} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '6px 10px', backgroundColor: theme.accentBg, color: theme.accent, border: `1px solid ${theme.accent}`, borderRadius: '6px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', minHeight: '32px', opacity: receiptUploading ? 0.6 : 1 }}>
                  <Camera size={12} />{receiptUploading ? '...' : 'Receipt'}
                </button>
                <button onClick={() => setShowAddExpense(!showAddExpense)} style={{ display: 'flex', alignItems: 'center', gap: '3px', padding: '6px 10px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', fontWeight: '500', cursor: 'pointer', minHeight: '32px' }}>
                  <Plus size={12} />Add
                </button>
              </div>
            </div>
            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '10px', lineHeight: '1.4' }}>Track costs (meals, travel, etc.). These follow to the job on conversion.</div>
            {showAddExpense && (
              <div style={{ padding: '10px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}`, marginBottom: '10px' }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '8px' }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.text, marginBottom: '3px' }}>Amount</label>
                      <input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm(f => ({ ...f, amount: e.target.value }))} placeholder="0.00" style={{ width: '100%', padding: '8px 10px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.text, marginBottom: '3px' }}>Merchant</label>
                      <input type="text" value={expenseForm.merchant} onChange={(e) => setExpenseForm(f => ({ ...f, merchant: e.target.value }))} placeholder="Store name" style={{ width: '100%', padding: '8px 10px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                    </div>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.text, marginBottom: '3px' }}>Category</label>
                    <select value={expenseForm.category} onChange={(e) => setExpenseForm(f => ({ ...f, category: e.target.value }))} style={{ width: '100%', padding: '8px 10px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }}>
                      {EXPENSE_CATEGORIES.map(c => (<option key={c} value={c}>{c}</option>))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: '500', color: theme.text, marginBottom: '3px' }}>Notes</label>
                    <input type="text" value={expenseForm.notes} onChange={(e) => setExpenseForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" style={{ width: '100%', padding: '8px 10px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button onClick={handleAddQuoteExpense} style={{ padding: '8px 14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer', minHeight: '36px' }}>Save</button>
                  <button onClick={() => setShowAddExpense(false)} style={{ padding: '8px 12px', backgroundColor: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '12px', cursor: 'pointer', minHeight: '36px' }}>Cancel</button>
                </div>
              </div>
            )}
            {quoteExpenses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '12px 0', color: theme.textMuted, fontSize: '12px' }}>No expenses yet</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {quoteExpenses.map(exp => (
                  <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', backgroundColor: theme.bg, borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                    {exp.receipt_url && (<img src={exp.receipt_url} alt="receipt" onClick={() => setViewingPhoto({ url: exp.receipt_url, name: 'Receipt' })} style={{ width: '36px', height: '36px', objectFit: 'cover', borderRadius: '4px', cursor: 'pointer', border: `1px solid ${theme.border}`, flexShrink: 0 }} />)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{exp.vendor || exp.description || 'Expense'}</div>
                      <div style={{ fontSize: '10px', color: theme.textMuted }}>{exp.category || 'Uncategorized'}</div>
                    </div>
                    <div style={{ fontWeight: '600', color: theme.text, fontSize: '13px', flexShrink: 0 }}>${(parseFloat(exp.amount) || 0).toFixed(2)}</div>
                    <button onClick={() => handleDeleteQuoteExpense(exp.id)} style={{ padding: '4px', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><Trash2 size={12} /></button>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 10px', fontSize: '12px', fontWeight: '600', color: theme.text, borderTop: `1px solid ${theme.border}`, marginTop: '4px' }}>
                  <span>Total</span>
                  <span>${quoteExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0).toFixed(2)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Notes */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Notes</h3>
            <textarea
              value={estimate.notes || ''}
              onChange={(e) => updateEstimateField('notes', e.target.value)}
              rows={4}
              style={{
                ...inputStyle,
                resize: 'vertical'
              }}
              placeholder="Add notes..."
            />
            {/* Notes photos */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginTop: '12px' }}>
              {notesPhotos.map(photo => (
                <PhotoThumbnail key={photo.id} att={photo} theme={theme} onView={setViewingPhoto} onDelete={handleDeletePhoto} />
              ))}
              <AddPhotoButton theme={theme} onClick={() => triggerPhotoInput(null, 'notes')} />
            </div>
          </div>

          {/* Documents */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
              <Paperclip size={16} color={theme.textMuted} />
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, flex: 1, margin: 0 }}>Documents ({attachments.length})</h3>
              <input type="file" ref={docInputRef} style={{ display: 'none' }} onChange={handleUploadDocument} />
              <button
                onClick={() => docInputRef.current?.click()}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 10px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500'
                }}
              >
                <Upload size={14} />
                Upload
              </button>
            </div>
            {attachments.length === 0 ? (
              <p style={{ fontSize: '13px', color: theme.textMuted }}>No documents attached yet. Upload files or they will appear from audit and contract workflows.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {attachments.map(att => {
                  const ext = (att.file_name || '').split('.').pop()?.toLowerCase()
                  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
                  const sizeKB = att.file_size ? Math.round(att.file_size / 1024) : null
                  return (
                    <div key={att.id} style={{
                      padding: '10px 12px',
                      backgroundColor: theme.bg,
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px'
                    }}>
                      {isImage && att.storage_bucket ? (
                        <img
                          src={`${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${att.storage_bucket}/${att.file_path}`}
                          alt={att.file_name}
                          style={{
                            width: '48px', height: '48px',
                            objectFit: 'cover',
                            borderRadius: '6px',
                            flexShrink: 0,
                            border: `1px solid ${theme.border}`
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '48px', height: '48px',
                          borderRadius: '6px',
                          backgroundColor: theme.accentBg,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          flexShrink: 0
                        }}>
                          <FileText size={20} color={theme.textMuted} />
                        </div>
                      )}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {att.file_name}
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>
                          {ext?.toUpperCase()}{sizeKB ? ` — ${sizeKB} KB` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
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
                            color: theme.accent
                          }}
                        >
                          <Download size={14} />
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm('Delete this document?')) return
                            await supabase.from('file_attachments').delete().eq('id', att.id)
                            await supabase.storage.from(att.storage_bucket || 'project-documents').remove([att.file_path])
                            await fetchEstimateData()
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            padding: '4px',
                            cursor: 'pointer',
                            color: theme.textMuted
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '450px',
            maxHeight: '90vh',
            overflowY: 'auto'
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
          onClose={() => { setShowSendModal(false); fetchEstimateData() }}
          inputStyle={inputStyle}
          labelStyle={labelStyle}
          onSettingsUpdate={saveSettingsOverrides}
          customer={estimate?.customer || estimate?.lead}
          sendSubject={sendSubject}
          setSendSubject={setSendSubject}
          sendAttachments={sendAttachments}
          setSendAttachments={setSendAttachments}
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
          estimate={estimate}
          lineItems={lineItems}
          company={company}
          customer={estimate?.customer || estimate?.lead}
          onSettingsUpdate={saveSettingsOverrides}
        />
      )}


      {/* Associate Lead/Customer Modal */}
      {showAssociateModal && (
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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '480px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                Link to Lead or Customer
              </h2>
              <button onClick={() => setShowAssociateModal(false)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAssociate} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {/* 3-way toggle */}
              <div>
                <label style={labelStyle}>Associate With</label>
                <div style={{ display: 'flex', borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
                  {[
                    { key: 'lead', label: 'Existing Lead' },
                    { key: 'customer', label: 'Customer' },
                    { key: 'newLead', label: 'New Lead' }
                  ].map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setAssociationType(opt.key)}
                      style={{
                        flex: 1,
                        padding: '10px 8px',
                        fontSize: '13px',
                        fontWeight: associationType === opt.key ? '600' : '400',
                        backgroundColor: associationType === opt.key ? theme.accent : 'transparent',
                        color: associationType === opt.key ? '#ffffff' : theme.textSecondary,
                        border: 'none',
                        cursor: 'pointer',
                        borderRight: opt.key !== 'newLead' ? `1px solid ${theme.border}` : 'none'
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Existing Lead picker - searchable */}
              {associationType === 'lead' && (() => {
                const q = leadSearch.toLowerCase().trim()
                const filtered = q ? leads.filter(l => [l.customer_name, l.business_name, l.lead_id, l.address, l.phone, l.email].filter(Boolean).join(' ').toLowerCase().includes(q)) : leads.slice(0, 20)
                const selLead = selectedLeadId ? leads.find(l => l.id === selectedLeadId) : null
                return (
                  <div>
                    <label style={labelStyle}>Search Leads</label>
                    <input type="text" value={leadSearch} onChange={(e) => { setLeadSearch(e.target.value); setSelectedLeadId(null) }} placeholder="Type name, address, phone, email..." autoFocus style={inputStyle} />
                    {selLead && (
                      <div style={{ marginTop: '8px', padding: '10px 12px', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle size={16} color="#16a34a" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{selLead.customer_name || selLead.business_name}</div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>{[selLead.address, selLead.phone].filter(Boolean).join(' \xb7 ')}</div>
                        </div>
                        <button type="button" onClick={() => { setSelectedLeadId(null); setLeadSearch('') }} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: theme.textMuted }}><X size={14} /></button>
                      </div>
                    )}
                    {!selectedLeadId && (
                      <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '6px', border: filtered.length ? `1px solid ${theme.border}` : 'none', borderRadius: '8px' }}>
                        {filtered.length === 0 && q && (<div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>No leads found</div>)}
                        {filtered.map(l => (
                          <button key={l.id} type="button" onClick={() => { setSelectedLeadId(l.id); setLeadSearch(l.customer_name || l.business_name || '') }} style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '10px 12px', background: 'none', border: 'none', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', textAlign: 'left', minHeight: '44px', justifyContent: 'center' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.accentBg }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>{l.customer_name || l.business_name || l.lead_id}</div>
                            <div style={{ fontSize: '11px', color: theme.textMuted }}>{[l.address, l.phone, l.email].filter(Boolean).join(' \xb7 ') || 'No details'}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* Existing Customer picker - searchable */}
              {associationType === 'customer' && (() => {
                const q = customerSearch.toLowerCase().trim()
                const filtered = q ? customers.filter(c => [c.name, c.business_name, c.company_name, c.address, c.phone, c.email].filter(Boolean).join(' ').toLowerCase().includes(q)) : customers.slice(0, 20)
                const selCust = selectedCustomerId ? customers.find(c => c.id === selectedCustomerId) : null
                return (
                  <div>
                    <label style={labelStyle}>Search Customers</label>
                    <input type="text" value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomerId(null) }} placeholder="Type name, address, phone, email..." autoFocus style={inputStyle} />
                    {selCust && (
                      <div style={{ marginTop: '8px', padding: '10px 12px', backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.25)', borderRadius: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <CheckCircle size={16} color="#16a34a" />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{selCust.name || selCust.company_name}</div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>{[selCust.address, selCust.phone].filter(Boolean).join(' \xb7 ')}</div>
                        </div>
                        <button type="button" onClick={() => { setSelectedCustomerId(null); setCustomerSearch('') }} style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: theme.textMuted }}><X size={14} /></button>
                      </div>
                    )}
                    {!selectedCustomerId && (
                      <div style={{ maxHeight: '200px', overflowY: 'auto', marginTop: '6px', border: filtered.length ? `1px solid ${theme.border}` : 'none', borderRadius: '8px' }}>
                        {filtered.length === 0 && q && (<div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>No customers found</div>)}
                        {filtered.map(c => (
                          <button key={c.id} type="button" onClick={() => { setSelectedCustomerId(c.id); setCustomerSearch(c.name || c.company_name || '') }} style={{ display: 'flex', flexDirection: 'column', gap: '2px', width: '100%', padding: '10px 12px', background: 'none', border: 'none', borderBottom: `1px solid ${theme.border}`, cursor: 'pointer', textAlign: 'left', minHeight: '44px', justifyContent: 'center' }} onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = theme.accentBg }} onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>{c.name || c.company_name || `Customer #${c.id}`}</div>
                            <div style={{ fontSize: '11px', color: theme.textMuted }}>{[c.address, c.phone, c.email].filter(Boolean).join(' \xb7 ') || 'No details'}</div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* New Lead inline fields */}
              {associationType === 'newLead' && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: '12px',
                  padding: '14px', borderRadius: '8px',
                  backgroundColor: theme.accentBg, border: `1px solid ${theme.border}`
                }}>
                  <div>
                    <label style={labelStyle}>Customer Name *</label>
                    <input
                      type="text"
                      value={newLeadForm.customer_name}
                      onChange={(e) => setNewLeadForm(prev => ({ ...prev, customer_name: e.target.value }))}
                      placeholder="Business or person name"
                      style={inputStyle}
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
                        type="tel"
                        value={newLeadForm.phone}
                        onChange={(e) => setNewLeadForm(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="(555) 555-5555"
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input
                        type="email"
                        value={newLeadForm.email}
                        onChange={(e) => setNewLeadForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="email@example.com"
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
                      placeholder="Street address"
                      style={inputStyle}
                    />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                <button
                  type="button"
                  onClick={() => setShowAssociateModal(false)}
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
                  {creatingLead ? 'Saving...' : associationType === 'newLead' ? 'Create & Link' : 'Link'}
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
          <img
            src={viewingPhoto.url}
            alt={viewingPhoto.name}
            onClick={(e) => e.stopPropagation()}
            onError={(e) => { e.target.style.display = 'none'; e.target.insertAdjacentHTML('afterend', '<div style="color:#fff;font-size:16px;text-align:center">Image failed to load</div>') }}
            style={{ maxWidth: '90vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', cursor: 'default' }}
          />
        </div>
      )}
    </div>
  )
}

// Settings Modal Component
// In-modal formal proposal preview + inline editor. Rendered inside
// EstimatePreviewModal when mode === 'formal'. Left pane = live FormalProposal
// preview (what the customer will see). Right pane = editor for down payment
// label/amount and legal terms. Saves on blur via onSettingsUpdate.
function FormalPreviewPane({ theme, estimate, lineItems, company, businessUnit, customer, settings, onSettingsUpdate }) {
  const formal = settings?.formal_proposal || {}
  const [label, setLabel] = useState(formal.down_payment_label || DEFAULT_DOWN_PAYMENT_LABEL)
  const [amount, setAmount] = useState(formal.down_payment_amount ?? '')
  const [isPercent, setIsPercent] = useState(!!formal.down_payment_is_percent)
  const [terms, setTerms] = useState(formal.legal_terms_md || '')
  const [rev, setRev] = useState(0)
  const [showTermsEditor, setShowTermsEditor] = useState(false)

  // Parse the same company settings rows the invoice portal reads so the
  // preview shows the real Stripe/ACH buttons the customer will see (instead
  // of the "Online payment not yet configured" fallback).
  const storeSettings = useStore((s) => s.settings) || []
  const { previewPaymentConfig, previewInvoiceSettings } = useMemo(() => {
    const getParsed = (key) => {
      const row = storeSettings.find((s) => s.key === key)
      if (!row?.value) return null
      try { return JSON.parse(row.value) } catch { return row.value }
    }
    const cfgRow = storeSettings.find((s) => s.key === 'payment_config')
    let cfg = null
    if (cfgRow?.value) { try { cfg = JSON.parse(cfgRow.value) } catch { /* ignore */ } }
    const paymentConfig = cfg ? {
      stripe_enabled: !!(cfg.stripe_enabled && cfg.stripe_secret_key),
      paypal_enabled: !!(cfg.paypal_enabled && cfg.paypal_client_id && cfg.paypal_secret),
      bank_enabled: !!(cfg.bank_enabled && cfg.bank_name),
      bank_name: cfg.bank_name || null,
      bank_account_name: cfg.bank_account_name || null,
      bank_routing: cfg.bank_routing || null,
      bank_account: cfg.bank_account ? '****' + String(cfg.bank_account).slice(-4) : null,
      bank_instructions: cfg.bank_instructions || null,
    } : {}
    const invoiceSettings = {
      cc_fee_enabled: getParsed('invoice_cc_fee_enabled') ?? true,
      cc_fee_percent: getParsed('invoice_cc_fee_percent') ?? 1.9,
      accept_credit_card: getParsed('invoice_accept_credit_card') ?? false,
      show_preferred_payment_note: getParsed('invoice_show_preferred_payment_note') ?? true,
      preferred_payment_note: getParsed('invoice_preferred_payment_note')
        || 'We accept ACH transfers, checks, and cash at no additional fee. Credit card payments include a {cc_fee_percent}% processing fee.',
    }
    return { previewPaymentConfig: paymentConfig, previewInvoiceSettings: invoiceSettings }
  }, [storeSettings])

  // When the user edits terms/amount we save into settings_overrides.formal_proposal.
  // Silent save keeps the preview responsive without re-fetching the whole estimate.
  const persist = async (patch) => {
    if (!onSettingsUpdate) return
    const next = {
      ...settings,
      presentation_mode: 'formal',
      formal_proposal: {
        ...(settings.formal_proposal || {}),
        down_payment_label: label,
        down_payment_amount: amount === '' ? null : parseFloat(amount),
        down_payment_is_percent: isPercent,
        legal_terms_md: terms,
        ...patch,
      },
    }
    await onSettingsUpdate(next, { silent: true })
    setRev((r) => r + 1)
  }

  const resetTerms = async () => {
    setTerms('')
    await persist({ legal_terms_md: '' })
  }

  // Data shape that FormalProposal expects (same as CustomerPortal)
  const previewData = {
    document: {
      ...estimate,
      settings_overrides: {
        ...(estimate.settings_overrides || {}),
        presentation_mode: 'formal',
        formal_proposal: {
          ...(settings.formal_proposal || {}),
          down_payment_label: label,
          down_payment_amount: amount === '' ? null : parseFloat(amount),
          down_payment_is_percent: isPercent,
          legal_terms_md: terms,
        },
      },
    },
    line_items: (lineItems || []).map(li => ({ ...li, total: li.line_total || li.total })),
    company: company || {},
    customer: customer ? {
      ...customer,
      name: customer.name || customer.customer_name || '',
      business_name: customer.business_name || '',
    } : {},
    business_unit: businessUnit || null,
    approval: null,
    payment_config: previewPaymentConfig,
    invoice_settings: previewInvoiceSettings,
    // Pass the salesperson's phone as fallback so FormalProposal's
    // letterhead can show it when neither business unit nor company has one
    owner_phone: estimate?.salesperson?.phone || '',
  }

  return (
    <>
    <div style={{ display: 'flex', gap: 0, height: '100%', minHeight: 420 }}>
      {/* Left: live preview with a floating Edit Contract pill */}
      <div style={{ flex: 1, overflowY: 'auto', minWidth: 0, backgroundColor: '#f7f5ef', position: 'relative' }}>
        <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}>Loading formal proposal...</div>}>
          <FormalProposal
            key={rev}
            data={previewData}
            approverName=""
            setApproverName={() => {}}
            approverEmail=""
            setApproverEmail={() => {}}
            approvalSuccess={false}
            onSubmitSignedApproval={async () => {}}
            onPay={() => {}}
          />
        </Suspense>
        {/* Floating Edit Contract pill — always visible while scrolling the preview */}
        <button
          type="button"
          onClick={() => setShowTermsEditor(true)}
          style={{
            position: 'sticky',
            bottom: 20,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '12px 22px',
            borderRadius: 999,
            border: 'none',
            background: 'linear-gradient(135deg, #5a6349 0%, #4a5239 100%)',
            color: '#ffffff',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 10px 30px rgba(44,53,48,0.35)',
            marginTop: 24,
            marginBottom: 24,
            zIndex: 5,
          }}
        >
          <FileText size={16} />
          Edit Contract Language
        </button>
      </div>

      {/* Right: inline editor */}
      <div style={{
        width: '340px',
        flexShrink: 0,
        borderLeft: `1px solid ${theme.border}`,
        backgroundColor: theme.bgCard,
        overflowY: 'auto',
        padding: '16px',
      }}>
        <p style={{ fontSize: '11px', fontWeight: '600', color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px' }}>
          Formal Agreement
        </p>

        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: theme.textSecondary, marginBottom: 4 }}>Down Payment Label</label>
        <input
          type="text"
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          onBlur={() => persist({ down_payment_label: label })}
          placeholder="Deposit, Retainer, Mobilization Fee..."
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14, marginBottom: 10, boxSizing: 'border-box', color: theme.text, backgroundColor: theme.bg }}
        />

        <label style={{ display: 'block', fontSize: '11px', fontWeight: 600, color: theme.textSecondary, marginBottom: 4 }}>Down Payment Amount</label>
        <input
          type="number"
          min="0"
          step="0.01"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          onBlur={() => persist({ down_payment_amount: amount === '' ? null : parseFloat(amount) })}
          placeholder="0.00"
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.border}`, fontSize: 14, marginBottom: 8, boxSizing: 'border-box', color: theme.text, backgroundColor: theme.bg }}
        />

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 8, border: `1px solid ${theme.border}`, backgroundColor: theme.bg, cursor: 'pointer', marginBottom: 14 }}>
          <input
            type="checkbox"
            checked={isPercent}
            onChange={(e) => { setIsPercent(e.target.checked); persist({ down_payment_is_percent: e.target.checked }) }}
            style={{ width: 16, height: 16, accentColor: theme.accent }}
          />
          <span style={{ fontSize: 13, color: theme.text }}>Treat amount as % of total</span>
        </label>

        {/* Big, obvious Edit Contract button — opens a full-screen editor */}
        <button
          type="button"
          onClick={() => setShowTermsEditor(true)}
          style={{
            width: '100%',
            padding: '14px 16px',
            borderRadius: 10,
            border: `1.5px solid ${theme.accent}`,
            background: theme.accentBg,
            color: theme.accent,
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            marginBottom: 10,
          }}
        >
          <FileText size={16} />
          Edit Contract Language
        </button>
        <p style={{ fontSize: 11, color: theme.textMuted, margin: '0 0 12px', lineHeight: 1.5, textAlign: 'center' }}>
          Add, remove, or rewrite any section of the legal terms. Changes save automatically and show in the preview immediately.
        </p>

        <div style={{ marginTop: 8, padding: '10px 12px', border: `1px dashed ${theme.border}`, borderRadius: 8, background: theme.bg }}>
          <div style={{ fontSize: 11, color: theme.textMuted }}>Current contract length</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: theme.text }}>
            {terms ? `${terms.length.toLocaleString()} chars` : 'Using default template'}
          </div>
          <button
            type="button"
            onClick={resetTerms}
            style={{ background: 'none', border: 'none', color: theme.accent, fontSize: 11, fontWeight: 600, cursor: 'pointer', padding: 0, marginTop: 6 }}
          >
            Reset to default template
          </button>
        </div>
      </div>
    </div>

    {/* Section-based contract editor — easy add/remove/reorder clauses */}
    <FormalTermsEditor
      open={showTermsEditor}
      initialMarkdown={terms}
      onClose={() => setShowTermsEditor(false)}
      onSave={async (newMarkdown) => {
        setTerms(newMarkdown)
        await persist({ legal_terms_md: newMarkdown })
        toast.success('Contract saved')
      }}
      defaultsInput={{
        company,
        customer,
        quote: estimate,
        lineItems,
        downPaymentLabel: label,
        downPaymentAmount: amount === '' ? 0 : parseFloat(amount) || 0,
      }}
    />
    </>
  )
}

// Standalone modal that hosts the formal proposal editor. Triggered by the
// "Formal Legal Proposal" button on the estimate page so reps don't need to
// dig into the Settings gear to set up a formal contract.
function FormalProposalModal({ theme, initialSettings, onSave, onClose, inputStyle, labelStyle, estimate }) {
  const [localSettings, setLocalSettings] = useState(initialSettings)
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      // Flip presentation mode to formal and persist whatever the rep entered
      const next = { ...localSettings, presentation_mode: 'formal' }
      await onSave(next)
    } finally {
      setSaving(false)
    }
  }

  const portalUrl = estimate?.portal_token
    ? `${window.location.origin}/portal/${estimate.portal_token}`
    : null

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15,20,17,0.55)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
        zIndex: 1000,
      }}
    >
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '14px',
        border: `1px solid ${theme.border}`,
        width: '100%',
        maxWidth: '720px',
        maxHeight: '90vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
      }}>
        <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 700, color: theme.text }}>Formal Legal Proposal</h3>
              <p style={{ margin: '4px 0 0', fontSize: '12px', color: theme.textMuted }}>
                Configure the contract language, down payment, and signature block. Save to enable the formal customer portal view.
              </p>
            </div>
            <button
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: 6 }}
            >
              <X size={20} />
            </button>
          </div>
        </div>

        <div style={{ padding: '20px 24px', overflowY: 'auto', flex: 1 }}>
          <FormalProposalEditor
            localSettings={localSettings}
            setLocalSettings={setLocalSettings}
            theme={theme}
            labelStyle={labelStyle}
            inputStyle={inputStyle}
          />
          {portalUrl && (
            <div style={{
              marginTop: 14,
              padding: '10px 12px',
              backgroundColor: theme.accentBg,
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}>
              <span style={{ fontSize: 12, color: theme.textSecondary, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {portalUrl}
              </span>
              <button
                onClick={() => { navigator.clipboard.writeText(portalUrl); toast.success('Portal link copied!') }}
                style={{ padding: '4px 10px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer' }}
              >
                Copy Link
              </button>
            </div>
          )}
          {!portalUrl && (
            <p style={{ marginTop: 12, fontSize: 12, color: theme.textMuted }}>
              Use the Create Proposal button after saving to generate a portal link for the customer.
            </p>
          )}
        </div>

        <div style={{ padding: '16px 24px', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{ padding: '10px 18px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{ padding: '10px 18px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}
          >
            {saving ? 'Saving...' : 'Save Formal Proposal'}
          </button>
        </div>
      </div>
    </div>
  )
}

// Formal proposal editor — lives inside SettingsModal when presentation_mode === 'formal'
function FormalProposalEditor({ localSettings, setLocalSettings, theme, labelStyle, inputStyle }) {
  const formal = localSettings.formal_proposal || {}

  const update = (patch) => {
    setLocalSettings(prev => ({
      ...prev,
      formal_proposal: { ...(prev.formal_proposal || {}), ...patch },
    }))
  }

  const resetTerms = () => {
    update({ legal_terms_md: '' }) // empty = portal will rebuild from defaults
  }

  return (
    <div style={{
      marginTop: '12px',
      padding: '16px',
      backgroundColor: 'rgba(90,99,73,0.06)',
      borderRadius: '10px',
      border: `1px solid ${theme.border}`,
    }}>
      <p style={{ fontSize: '13px', fontWeight: '600', color: theme.text, margin: '0 0 6px' }}>
        Formal Legal Proposal
      </p>
      <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 12px', lineHeight: 1.5 }}>
        The customer will see a top-to-bottom contract, sign it (drawn or typed), and optionally pay.
        A PDF of the signed document is archived automatically and travels with the estimate when it becomes a job.
      </p>

      <label style={labelStyle}>Down Payment Label</label>
      <input
        type="text"
        value={formal.down_payment_label || DEFAULT_DOWN_PAYMENT_LABEL}
        onChange={(e) => update({ down_payment_label: e.target.value })}
        placeholder="e.g. Deposit, Project Retainer, Mobilization Fee"
        style={inputStyle}
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '8px' }}>
        <div>
          <label style={labelStyle}>Down Payment Amount</label>
          <input
            type="number"
            min="0"
            step="0.01"
            value={formal.down_payment_amount ?? ''}
            onChange={(e) => update({ down_payment_amount: e.target.value === '' ? null : parseFloat(e.target.value) })}
            placeholder="0.00"
            style={inputStyle}
          />
        </div>
        <div>
          <label style={labelStyle}>&nbsp;</label>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: '8px', backgroundColor: theme.bg, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={!!formal.down_payment_is_percent}
              onChange={(e) => update({ down_payment_is_percent: e.target.checked })}
              style={{ width: '16px', height: '16px', accentColor: theme.accent }}
            />
            <span style={{ fontSize: '13px', color: theme.text }}>Treat as % of total</span>
          </label>
        </div>
      </div>

      <div style={{ marginTop: '10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <label style={labelStyle}>Legal Terms (Markdown)</label>
          <button
            type="button"
            onClick={resetTerms}
            style={{ background: 'none', border: 'none', color: theme.accent, fontSize: '11px', fontWeight: 600, cursor: 'pointer', padding: 0 }}
          >
            Reset to default
          </button>
        </div>
        <textarea
          value={formal.legal_terms_md || ''}
          onChange={(e) => update({ legal_terms_md: e.target.value })}
          rows={12}
          placeholder="Leave blank to use the default legal template. Edit here to customize scope, warranty, dispute resolution, etc."
          style={{ ...inputStyle, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px', resize: 'vertical' }}
        />
        <p style={{ fontSize: '11px', color: theme.textMuted, margin: '6px 0 0' }}>
          Markdown is supported. Leave blank to auto-generate from defaults at send time.
        </p>
      </div>
    </div>
  )
}

function SettingsModal({ theme, settings, defaults, onSave, onClose, inputStyle, labelStyle, estimate, lineItems, company, customer, onSettingsUpdate }) {
  const [localSettings, setLocalSettings] = useState(settings)
  const [generatingProposal, setGeneratingProposal] = useState(false)

  const handleGenerateProposal = async () => {
    setGeneratingProposal(true)
    try {
      const brandName = estimate?.business_unit || company?.company_name || ''

      // Fetch audit data if linked
      let auditData = null
      let auditAreasData = null
      if (estimate?.audit_id) {
        const { data: audit } = await supabase
          .from('lighting_audits')
          .select('*')
          .eq('id', estimate.audit_id)
          .single()
        if (audit) {
          auditData = {
            annual_savings_kwh: audit.annual_savings_kwh || 0,
            annual_savings_dollars: audit.annual_savings_dollars || 0,
            electric_rate: audit.electric_rate || 0,
            operating_hours: audit.operating_hours || 0,
            operating_days: audit.operating_days || 0,
            total_existing_watts: audit.total_existing_watts || 0,
            total_proposed_watts: audit.total_proposed_watts || 0,
            watts_reduced: audit.watts_reduced || 0,
            total_fixtures: audit.total_fixtures || 0,
            estimated_rebate: audit.estimated_rebate || 0,
          }
          const { data: areas } = await supabase
            .from('audit_areas')
            .select('*')
            .eq('audit_id', estimate.audit_id)
          if (areas?.length) {
            auditAreasData = areas.map(a => ({
              area_name: a.area_name || a.name || 'Area',
              fixture_count: a.fixture_count || 0,
              existing_wattage: a.existing_wattage || 0,
              led_wattage: a.led_wattage || 0,
              total_existing_watts: a.total_existing_watts || 0,
              total_led_watts: a.total_led_watts || 0,
              area_watts_reduced: a.area_watts_reduced || 0,
              ceiling_height: a.ceiling_height || '',
              fixture_category: a.fixture_category || '',
              area_rebate_estimate: a.area_rebate_estimate || 0,
            }))
          }
        }
      }

      // Get proposal notes
      const storeSettings = useStore.getState().settings || []
      const defaultsSetting = storeSettings.find(s => s.key === 'estimate_defaults')
      let proposalNotes = ''
      if (defaultsSetting) {
        try {
          const parsed = JSON.parse(defaultsSetting.value)
          proposalNotes = parsed.proposal_notes || ''
        } catch {}
      }

      const { error, data } = await supabase.functions.invoke('generate-proposal-layout', {
        body: {
          estimate_id: estimate?.id,
          company_name: brandName,
          customer_name: customer?.business_name || customer?.name || '',
          customer_address: customer?.address || '',
          estimate_message: estimate?.estimate_message || '',
          line_items: (lineItems || []).map(li => ({
            item_name: li.item_name || li.description,
            description: li.description,
            quantity: li.quantity,
            price: li.price,
            total: li.line_total || li.total,
            category: li.category,
          })),
          total: lineItems?.reduce((sum, li) => sum + (parseFloat(li.line_total || li.total) || 0), 0) || 0,
          utility_incentive: estimate?.utility_incentive || 0,
          discount: estimate?.discount || 0,
          manual_annual_savings: estimate?.manual_annual_savings || 0,
          audit_data: auditData,
          audit_areas_data: auditAreasData,
          proposal_notes: proposalNotes,
          include_tiers: localSettings.include_tiers || false,
        }
      })
      if (error) throw error
      if (data?.proposal_layout) {
        const updated = { ...localSettings, presentation_mode: 'interactive', proposal_layout: data.proposal_layout }
        setLocalSettings(updated)
        // Save immediately so the layout is persisted
        await onSettingsUpdate(updated, { silent: true })
        toast.success('Proposal layout generated!')
      }
    } catch (err) {
      toast.error('Failed to generate proposal: ' + err.message)
    }
    setGeneratingProposal(false)
  }

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
            <label style={labelStyle}>Presentation Mode</label>
            <select
              value={localSettings.presentation_mode || 'pdf'}
              onChange={(e) => setLocalSettings(prev => ({ ...prev, presentation_mode: e.target.value }))}
              style={inputStyle}
            >
              <option value="pdf">PDF Document</option>
              <option value="interactive">Interactive Proposal</option>
              <option value="formal">Formal Legal Proposal</option>
            </select>
            {localSettings.presentation_mode === 'interactive' && (
              <p style={{ fontSize: '12px', color: theme.textMuted, margin: '6px 0 0', lineHeight: 1.5 }}>
                Customer portal will show an animated, chart-rich scrolling proposal instead of the standard view.
                Use "Generate with AI" below to create compelling section copy.
              </p>
            )}
            {localSettings.presentation_mode === 'formal' && (
              <p style={{ fontSize: '12px', color: theme.textMuted, margin: '6px 0 0', lineHeight: 1.5 }}>
                Customer portal will show a top-to-bottom legal document with customizable terms,
                a named down payment, and a binding digital signature. Edit the details in the card below.
              </p>
            )}
          </div>

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

          {/* Formal Proposal editor (legal terms + named down payment) */}
          {localSettings.presentation_mode === 'formal' && (
            <FormalProposalEditor
              localSettings={localSettings}
              setLocalSettings={setLocalSettings}
              theme={theme}
              labelStyle={labelStyle}
              inputStyle={inputStyle}
            />
          )}

          {/* Generate Proposal with AI */}
          {localSettings.presentation_mode === 'interactive' && (
            <div style={{
              marginTop: '12px',
              padding: '16px',
              backgroundColor: 'rgba(90,99,73,0.06)',
              borderRadius: '10px',
              border: `1px solid ${theme.border}`,
            }}>
              <p style={{ fontSize: '13px', fontWeight: '600', color: theme.text, margin: '0 0 6px' }}>
                Interactive Proposal
              </p>
              <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 12px', lineHeight: 1.5 }}>
                {localSettings.proposal_layout
                  ? `Layout generated ${new Date(localSettings.proposal_layout.generated_at).toLocaleDateString()}. Regenerate to update.`
                  : 'Generate compelling copy and layout sections using AI based on your line items and estimate details.'}
              </p>
              <label style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', marginBottom: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={localSettings.include_tiers || false}
                  onChange={e => setLocalSettings(prev => ({ ...prev, include_tiers: e.target.checked }))}
                  style={{ width: '16px', height: '16px', accentColor: theme.accent, marginTop: '2px', flexShrink: 0 }}
                />
                <div>
                  <span style={{ fontSize: '13px', color: theme.text, fontWeight: '500' }}>
                    Include Good / Better / Best pricing tiers
                  </span>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px', lineHeight: 1.4 }}>
                    Optional — adds tiered pricing packages for upsell opportunities. Best for upgrades, retrofits, and projects with add-on options.
                  </div>
                </div>
              </label>
              <button
                onClick={handleGenerateProposal}
                disabled={generatingProposal}
                style={{
                  width: '100%',
                  padding: '10px 16px',
                  backgroundColor: generatingProposal ? theme.textMuted : theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: generatingProposal ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                }}
              >
                {generatingProposal ? 'Generating...' : 'Generate with AI'}
              </button>
            </div>
          )}
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
function EstimatePreviewModal({ theme, estimate, lineItems, company, businessUnit, settings, sendEmail, setSendEmail, sendingEmail, onSend, onClose, inputStyle, labelStyle, onSettingsUpdate, customer, sendSubject, setSendSubject, sendAttachments, setSendAttachments }) {
  const [step, setStep] = useState('preview') // 'preview' | 'send'
  const [mode, setMode] = useState(settings.presentation_mode || 'pdf')
  const [generating, setGenerating] = useState(false)
  const [proposalLayout, setProposalLayout] = useState(settings.proposal_layout || null)
  const [editingField, setEditingField] = useState(null) // e.g. 'hero.heading', '2.content'
  const [editValue, setEditValue] = useState('')
  const [aiDirection, setAiDirection] = useState('')
  const [showDirectionInput, setShowDirectionInput] = useState(false)
  const [fullPreview, setFullPreview] = useState(false)
  const [includeTiers, setIncludeTiers] = useState(settings.include_tiers || false)
  const [editPanel, setEditPanel] = useState(null) // index of section being edited

  const formatCurrency = (v) => {
    if (!v && v !== 0) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v)
  }

  const startEdit = (fieldKey, currentValue) => {
    setEditingField(fieldKey)
    setEditValue(currentValue || '')
  }

  const saveEdit = async () => {
    if (!editingField || !proposalLayout) return
    const updated = JSON.parse(JSON.stringify(proposalLayout))
    const [indexOrKey, field] = editingField.split('.')

    if (indexOrKey === 'hero') {
      const hero = updated.sections.find(s => s.type === 'hero')
      if (hero) hero[field] = editValue
    } else if (indexOrKey === 'approval') {
      const approval = updated.sections.find(s => s.type === 'approval')
      if (approval) approval[field] = editValue
    } else {
      const idx = parseInt(indexOrKey)
      if (!isNaN(idx) && updated.sections[idx]) {
        updated.sections[idx][field] = editValue
      }
    }

    setProposalLayout(updated)
    setEditingField(null)
    setEditValue('')
    if (onSettingsUpdate) {
      await onSettingsUpdate({ ...settings, proposal_layout: updated }, { silent: true })
    }
  }

  const cancelEdit = () => {
    setEditingField(null)
    setEditValue('')
  }

  const handleModeChange = async (newMode) => {
    setMode(newMode)
    if (onSettingsUpdate) {
      await onSettingsUpdate({ ...settings, presentation_mode: newMode }, { silent: true })
    }
  }

  const handleGenerate = async (direction) => {
    setGenerating(true)
    try {
      const brandName = businessUnit?.name || company?.company_name || ''

      // Fetch real audit data if estimate is linked to a lighting audit
      let auditData = null
      let auditAreasData = null
      if (estimate?.audit_id) {
        const { data: audit } = await supabase
          .from('lighting_audits')
          .select('*')
          .eq('id', estimate.audit_id)
          .single()
        if (audit) {
          auditData = {
            annual_savings_kwh: audit.annual_savings_kwh || 0,
            annual_savings_dollars: audit.annual_savings_dollars || 0,
            electric_rate: audit.electric_rate || 0,
            operating_hours: audit.operating_hours || 0,
            operating_days: audit.operating_days || 0,
            total_existing_watts: audit.total_existing_watts || 0,
            total_proposed_watts: audit.total_proposed_watts || 0,
            watts_reduced: audit.watts_reduced || 0,
            total_fixtures: audit.total_fixtures || 0,
            estimated_rebate: audit.estimated_rebate || 0,
          }
          const { data: areas } = await supabase
            .from('audit_areas')
            .select('*')
            .eq('audit_id', estimate.audit_id)
          if (areas?.length) {
            auditAreasData = areas.map(a => ({
              area_name: a.area_name || a.name || 'Area',
              fixture_count: a.fixture_count || 0,
              existing_wattage: a.existing_wattage || 0,
              led_wattage: a.led_wattage || 0,
              total_existing_watts: a.total_existing_watts || 0,
              total_led_watts: a.total_led_watts || 0,
              area_watts_reduced: a.area_watts_reduced || 0,
              ceiling_height: a.ceiling_height || '',
              fixture_category: a.fixture_category || '',
              area_rebate_estimate: a.area_rebate_estimate || 0,
            }))
          }
        }
      }

      // Get proposal notes + EOS data from company settings
      const storeSettings = useStore.getState().settings || []
      const defaultsSetting = storeSettings.find(s => s.key === 'estimate_defaults')
      let proposalNotes = ''
      if (defaultsSetting) {
        try {
          const parsed = JSON.parse(defaultsSetting.value)
          proposalNotes = parsed.proposal_notes || ''
        } catch {}
      }

      // Gather EOS strategy data for the proposal
      const parseEos = (key) => {
        const s = storeSettings.find(st => st.key === key)
        if (!s?.value) return null
        try { return JSON.parse(s.value) } catch { return null }
      }
      const rawEos = {
        core_values: parseEos('eos_core_values'),
        core_focus: parseEos('eos_core_focus'),
        marketing_strategy: parseEos('eos_marketing_strategy'),
        ten_year_target: parseEos('eos_ten_year_target'),
        three_year_picture: parseEos('eos_three_year_picture'),
      }
      // Only send EOS data if there's something meaningful
      const eosData = Object.values(rawEos).some(v => v) ? rawEos : null

      const { error, data } = await supabase.functions.invoke('generate-proposal-layout', {
        body: {
          estimate_id: estimate?.id,
          company_name: brandName,
          customer_name: customer?.business_name || customer?.name || '',
          customer_address: customer?.address || '',
          estimate_message: estimate?.estimate_message || '',
          line_items: (lineItems || []).map(li => ({
            item_name: li.item_name || li.description,
            description: li.description,
            quantity: li.quantity,
            price: li.price,
            total: li.line_total || li.total,
            category: li.category,
          })),
          total: lineItems?.reduce((sum, li) => sum + (parseFloat(li.line_total || li.total) || 0), 0) || 0,
          utility_incentive: estimate?.utility_incentive || 0,
          discount: estimate?.discount || 0,
          user_direction: direction || '',
          existing_layout: direction && direction !== '__fresh__' && proposalLayout ? proposalLayout : null,
          manual_annual_savings: estimate?.manual_annual_savings || 0,
          audit_data: auditData,
          audit_areas_data: auditAreasData,
          proposal_notes: proposalNotes,
          include_tiers: includeTiers || settings.include_tiers || false,
          eos_data: eosData,
        }
      })
      if (error) throw error
      if (data?.proposal_layout) {
        setProposalLayout(data.proposal_layout)
        setAiDirection('')
        setShowDirectionInput(false)
        const updated = { ...settings, presentation_mode: 'interactive', proposal_layout: data.proposal_layout }
        if (onSettingsUpdate) await onSettingsUpdate(updated, { silent: true })
        toast.success('Proposal generated!')
      }
    } catch (err) {
      toast.error('Failed to generate: ' + err.message)
    }
    setGenerating(false)
  }

  const logoUrl = businessUnit?.logo_url || company?.logo_url
  const custName = customer?.business_name || customer?.name || ''
  const sections = proposalLayout?.sections || []
  const heroSection = sections.find(s => s.type === 'hero')
  const approvalSection = sections.find(s => s.type === 'approval')
  const contentSections = sections.filter(s => s.type !== 'hero' && s.type !== 'approval')

  const sectionLabel = (type) => ({
    executive_summary: 'Executive Summary',
    problem_statement: 'The Challenge',
    solution_overview: 'Proposed Solution',
    line_items: 'Line Items',
    cost_breakdown: 'Investment Breakdown',
    savings_timeline: 'Savings Over Time',
    roi_summary: 'ROI Summary',
    utility_incentive: 'Utility Incentive',
    warranty: 'Product Warranty',
    why_us: 'Why Choose Us',
    team: 'Your Team',
  }[type] || type)

  // Build data object for InteractiveProposal (same shape as CustomerPortal passes)
  const proposalPreviewData = proposalLayout ? {
    document: {
      ...estimate,
      settings_overrides: {
        ...(estimate.settings_overrides || {}),
        presentation_mode: 'interactive',
        proposal_layout: proposalLayout,
      },
    },
    line_items: (lineItems || []).map(li => ({
      ...li,
      total: li.line_total || li.total,
    })),
    company: company || {},
    customer: customer ? {
      ...customer,
      business_name: customer.business_name || customer.customer_name || customer.name || '',
      name: customer.name || customer.customer_name || '',
    } : {},
    business_unit: businessUnit || null,
    approval: null,
  } : null

  if (fullPreview) {
    return (
      <div style={{
        position: 'fixed', inset: 0, backgroundColor: '#f7f5ef',
        zIndex: 60, display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          padding: '8px 16px', backgroundColor: '#2c3530', color: '#fff',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0,
        }}>
          <span style={{ fontSize: '13px', fontWeight: '600' }}>Customer Preview</span>
          <button onClick={() => setFullPreview(false)}
            style={{ padding: '4px 14px', backgroundColor: 'rgba(255,255,255,0.15)', color: '#fff', border: '1px solid rgba(255,255,255,0.3)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>
            Close Preview
          </button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Suspense fallback={<div style={{ textAlign: 'center', padding: '60px 20px', color: '#7d8a7f' }}>Loading proposal...</div>}>
            <InteractiveProposal
              data={proposalPreviewData}
              onApprove={() => {}}
              approverName=""
              setApproverName={() => {}}
              approverEmail=""
              setApproverEmail={() => {}}
              approvalSuccess={false}
            />
          </Suspense>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 50
    }}>
      <div style={{
        backgroundColor: theme.bgCard, borderRadius: '16px',
        boxShadow: '0 20px 40px rgba(0,0,0,0.15)', width: '100%',
        maxWidth: step === 'preview' ? (mode === 'formal' ? '1040px' : mode === 'interactive' && proposalLayout ? '960px' : '680px') : '420px',
        maxHeight: '90vh', display: 'flex', flexDirection: 'column',
        transition: 'max-width 0.2s ease'
      }}>
        {/* Header with mode toggle */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            {step === 'send' && (
              <button onClick={() => setStep('preview')}
                style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', color: theme.textSecondary, display: 'flex' }}>
                <ArrowLeft size={18} />
              </button>
            )}
            {step === 'preview' ? (
              <div style={{
                display: 'flex', backgroundColor: theme.bg, borderRadius: '8px',
                border: `1px solid ${theme.border}`, overflow: 'hidden',
              }}>
                {[['pdf', 'PDF'], ['interactive', 'Interactive'], ['formal', 'Formal Legal']].map(([val, label]) => (
                  <button key={val} onClick={() => handleModeChange(val)}
                    style={{
                      padding: '7px 14px', fontSize: '13px', fontWeight: '500', border: 'none', cursor: 'pointer',
                      backgroundColor: mode === val ? theme.accent : 'transparent',
                      color: mode === val ? '#fff' : theme.textSecondary,
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
                {mode === 'formal' ? 'Send Formal Proposal' : mode === 'interactive' ? 'Send Proposal' : 'Send Estimate'}
              </h2>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
            <X size={20} />
          </button>
        </div>

        {step === 'preview' ? (
          <>
            {/* Cost summary bar — always visible */}
            {(() => {
              const subtotal = (lineItems || []).reduce((sum, li) => sum + (parseFloat(li.line_total || li.total) || 0), 0)
              const discount = parseFloat(estimate.discount) || 0
              const incentive = parseFloat(estimate.utility_incentive) || 0
              const total = subtotal - discount
              const netCost = total - incentive
              return (
                <div style={{
                  padding: '10px 20px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0,
                  display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center',
                  backgroundColor: theme.bg,
                }}>
                  <div>
                    <span style={{ fontSize: '11px', color: theme.textMuted, display: 'block' }}>Subtotal</span>
                    <span style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>{formatCurrency(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div>
                      <span style={{ fontSize: '11px', color: theme.textMuted, display: 'block' }}>Discount</span>
                      <span style={{ fontSize: '15px', fontWeight: '600', color: '#c25a5a' }}>-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  {incentive > 0 && (
                    <div>
                      <span style={{ fontSize: '11px', color: theme.textMuted, display: 'block' }}>Incentive</span>
                      <span style={{ fontSize: '15px', fontWeight: '600', color: '#4a7c59' }}>-{formatCurrency(incentive)}</span>
                    </div>
                  )}
                  <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
                    <span style={{ fontSize: '11px', color: theme.textMuted, display: 'block' }}>
                      {incentive > 0 ? 'Net Cost' : 'Total'}
                    </span>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: theme.accent }}>{formatCurrency(incentive > 0 ? netCost : total)}</span>
                  </div>
                </div>
              )
            })()}

            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', backgroundColor: '#f7f5ef' }}>
              {mode === 'formal' ? (
                <FormalPreviewPane
                  theme={theme}
                  estimate={estimate}
                  lineItems={lineItems}
                  company={company}
                  businessUnit={businessUnit}
                  customer={customer}
                  settings={settings}
                  onSettingsUpdate={onSettingsUpdate}
                />
              ) : mode === 'interactive' ? (
                proposalLayout ? (
                  <div style={{ display: 'flex', gap: '0', height: '100%' }}>
                    {/* Left: Real InteractiveProposal */}
                    <div style={{ flex: 1, overflowY: 'auto', minWidth: 0 }}>
                      <Suspense fallback={<div style={{ textAlign: 'center', padding: '40px', color: theme.textMuted }}>Loading proposal...</div>}>
                        <InteractiveProposal
                          data={proposalPreviewData}
                          onApprove={() => {}}
                          approverName=""
                          setApproverName={() => {}}
                          approverEmail=""
                          setApproverEmail={() => {}}
                          approvalSuccess={false}
                        />
                      </Suspense>
                    </div>
                    {/* Right: Edit panel */}
                    <div style={{
                      width: '280px', flexShrink: 0, borderLeft: `1px solid ${theme.border}`,
                      backgroundColor: theme.bgCard, overflowY: 'auto', padding: '12px',
                    }}>
                      <p style={{ fontSize: '11px', fontWeight: '600', color: theme.accent, textTransform: 'uppercase', letterSpacing: '0.5px', margin: '0 0 12px' }}>
                        Edit Sections
                      </p>
                      {/* Hero edits */}
                      {heroSection && (
                        <div style={{ marginBottom: '12px', padding: '8px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                          <p style={{ fontSize: '10px', fontWeight: '600', color: theme.textMuted, margin: '0 0 6px', textTransform: 'uppercase' }}>Hero</p>
                          <input
                            value={editingField === 'hero.heading' ? editValue : (heroSection.heading || '')}
                            onFocus={() => startEdit('hero.heading', heroSection.heading)}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            placeholder="Heading"
                            style={{ width: '100%', fontSize: '12px', padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: '6px', marginBottom: '6px', boxSizing: 'border-box', outline: 'none', color: theme.text, backgroundColor: '#fff' }}
                          />
                          <input
                            value={editingField === 'hero.subheading' ? editValue : (heroSection.subheading || '')}
                            onFocus={() => startEdit('hero.subheading', heroSection.subheading)}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            placeholder="Subheading"
                            style={{ width: '100%', fontSize: '11px', padding: '5px 8px', border: `1px solid ${theme.border}`, borderRadius: '6px', boxSizing: 'border-box', outline: 'none', color: theme.textSecondary, backgroundColor: '#fff' }}
                          />
                        </div>
                      )}
                      {/* Content section edits */}
                      {sections.map((s, i) => {
                        if (s.type === 'hero' || s.type === 'approval' || s.content == null) return null
                        const fieldKey = `${i}.content`
                        return (
                          <div key={i} style={{ marginBottom: '10px', padding: '8px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                            <p style={{ fontSize: '10px', fontWeight: '600', color: theme.textMuted, margin: '0 0 4px', textTransform: 'uppercase' }}>
                              {sectionLabel(s.type)}
                            </p>
                            <textarea
                              value={editingField === fieldKey ? editValue : (s.content || '')}
                              onFocus={() => startEdit(fieldKey, s.content)}
                              onChange={(e) => setEditValue(e.target.value)}
                              onBlur={saveEdit}
                              rows={3}
                              style={{ width: '100%', fontSize: '11px', padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: '6px', boxSizing: 'border-box', outline: 'none', resize: 'vertical', lineHeight: 1.4, fontFamily: 'inherit', color: theme.text, backgroundColor: '#fff' }}
                            />
                          </div>
                        )
                      })}
                      {/* Approval CTA edit */}
                      {approvalSection && (
                        <div style={{ marginBottom: '10px', padding: '8px', backgroundColor: theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
                          <p style={{ fontSize: '10px', fontWeight: '600', color: theme.textMuted, margin: '0 0 4px', textTransform: 'uppercase' }}>CTA Button Text</p>
                          <input
                            value={editingField === 'approval.cta_text' ? editValue : (approvalSection.cta_text || 'Approve This Proposal')}
                            onFocus={() => startEdit('approval.cta_text', approvalSection.cta_text || 'Approve This Proposal')}
                            onChange={(e) => setEditValue(e.target.value)}
                            onBlur={saveEdit}
                            style={{ width: '100%', fontSize: '12px', padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: '6px', boxSizing: 'border-box', outline: 'none', color: theme.text, backgroundColor: '#fff' }}
                          />
                        </div>
                      )}

                      {/* AI tools at bottom of edit panel */}
                      <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '12px', marginTop: '8px' }}>
                        {showDirectionInput ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <textarea
                              value={aiDirection}
                              onChange={(e) => setAiDirection(e.target.value)}
                              placeholder="e.g. Make it more formal, emphasize energy savings..."
                              rows={2}
                              autoFocus
                              style={{ width: '100%', fontSize: '11px', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '6px', padding: '6px 8px', outline: 'none', resize: 'none', lineHeight: 1.4, fontFamily: 'inherit', boxSizing: 'border-box', backgroundColor: '#fff' }}
                            />
                            <div style={{ display: 'flex', gap: '6px' }}>
                              <button onClick={() => { setShowDirectionInput(false); setAiDirection('') }}
                                style={{ padding: '5px 10px', backgroundColor: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '10px', cursor: 'pointer' }}>
                                Cancel
                              </button>
                              <button onClick={() => handleGenerate(aiDirection.trim() || '')} disabled={generating}
                                style={{ flex: 1, padding: '5px 10px', backgroundColor: generating ? theme.textMuted : theme.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '10px', fontWeight: '500', cursor: generating ? 'not-allowed' : 'pointer' }}>
                                {generating ? 'Regenerating...' : 'Refine'}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                            <button onClick={() => { setProposalLayout(null); handleGenerate('__fresh__') }} disabled={generating}
                              style={{ width: '100%', padding: '7px 12px', backgroundColor: 'transparent', color: theme.error || '#8b5a5a', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '11px', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.5 : 1 }}>
                              {generating ? 'Generating...' : 'Start Fresh'}
                            </button>
                            <button onClick={() => setShowDirectionInput(true)}
                              style={{ width: '100%', padding: '7px 12px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>
                              Refine with AI
                            </button>
                            <button onClick={() => setFullPreview(true)}
                              style={{ width: '100%', padding: '7px 12px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight: '600' }}>
                              Preview as Customer
                            </button>
                          </div>
                        )}
                        {/* Tiers toggle */}
                        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '10px', cursor: 'pointer' }}>
                          <input type="checkbox" checked={includeTiers} onChange={e => setIncludeTiers(e.target.checked)}
                            style={{ width: '14px', height: '14px', accentColor: theme.accent, flexShrink: 0 }} />
                          <div>
                            <span style={{ fontSize: '10px', color: theme.textSecondary, display: 'block' }}>Good / Better / Best tiers</span>
                            {includeTiers && !sections.some(s => s.type === 'pricing_tiers') && (
                              <span style={{ fontSize: '9px', color: theme.warning || '#eab308' }}>Click "Start Fresh" to add tiers</span>
                            )}
                          </div>
                        </label>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* No layout yet */
                  <div style={{
                    backgroundColor: '#fff', borderRadius: '10px', border: '1px solid #d6cdb8',
                    padding: '48px 24px', textAlign: 'center',
                  }}>
                    <FileText size={36} color={theme.textMuted} style={{ marginBottom: '12px' }} />
                    <p style={{ color: theme.text, fontWeight: '600', fontSize: '16px', margin: '0 0 6px' }}>
                      Create Interactive Proposal
                    </p>
                    <p style={{ color: theme.textMuted, fontSize: '13px', margin: '0 0 16px', lineHeight: 1.6, maxWidth: '360px', marginLeft: 'auto', marginRight: 'auto' }}>
                      AI will write compelling copy for each section based on your line items and estimate details.
                    </p>
                    <textarea
                      value={aiDirection}
                      onChange={(e) => setAiDirection(e.target.value)}
                      placeholder="Optional: give the AI direction — e.g. emphasize urgency, focus on energy savings, keep it short and punchy..."
                      rows={2}
                      style={{
                        width: '100%', maxWidth: '360px', fontSize: '12px', color: theme.text,
                        border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '8px 10px',
                        outline: 'none', resize: 'none', lineHeight: 1.5, fontFamily: 'inherit',
                        boxSizing: 'border-box', marginBottom: '16px', backgroundColor: theme.bgCard,
                      }}
                    />
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', marginBottom: '16px', cursor: 'pointer' }}>
                      <input type="checkbox" checked={includeTiers} onChange={e => setIncludeTiers(e.target.checked)}
                        style={{ width: '16px', height: '16px', accentColor: theme.accent }} />
                      <span style={{ fontSize: '13px', color: theme.textSecondary }}>Include Good / Better / Best pricing tiers</span>
                    </label>
                    <button onClick={() => handleGenerate(aiDirection)} disabled={generating}
                      style={{
                        padding: '12px 32px', backgroundColor: generating ? theme.textMuted : theme.accent,
                        color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '600',
                        cursor: generating ? 'not-allowed' : 'pointer',
                      }}>
                      {generating ? 'Generating proposal...' : 'Generate with AI'}
                    </button>
                  </div>
                )
              ) : (
                <div style={{
                  backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #d6cdb8',
                  padding: '28px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)'
                }}>
                  <EstimatePreview estimate={estimate} lineItems={lineItems} company={company} businessUnit={businessUnit} settings={settings} />
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: '12px', flexShrink: 0 }}>
              <button onClick={onClose}
                style={{ padding: '10px 16px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.text, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                Close
              </button>
              {/* Save without sending — attaches the current formal proposal
                  config to the estimate AND generates a draft PDF that
                  lands in the Documents section so the rep can see / print
                  / download it locally without waiting for the customer to
                  sign on the portal. */}
              <button onClick={async () => {
                  try {
                    // 1) Persist settings_overrides so the config sticks
                    if (onSettingsUpdate) {
                      await onSettingsUpdate({ ...settings, presentation_mode: mode }, { silent: false })
                    }

                    // 2) For formal mode, also generate a draft PDF and
                    //    attach it to the estimate documents.
                    if (mode === 'formal' && estimate?.id) {
                      try {
                        const formalCfg = settings?.formal_proposal || {}
                        const dpLabel = formalCfg.down_payment_label || 'Deposit'
                        const dpRaw = parseFloat(formalCfg.down_payment_amount) || 0
                        const subtotalCalc = (lineItems || []).reduce((s, l) => s + (parseFloat(l.line_total || l.total) || 0), 0)
                        const contractTotalCalc = subtotalCalc - (parseFloat(estimate.discount) || 0)
                        const dpAmount = formalCfg.down_payment_is_percent ? +(contractTotalCalc * (dpRaw / 100)).toFixed(2) : dpRaw

                        const legalTerms = formalCfg.legal_terms_md || buildDefaultTerms({
                          company,
                          customer,
                          quote: estimate,
                          lineItems,
                          downPaymentLabel: dpLabel,
                          downPaymentAmount: dpAmount,
                        })

                        const enc = new TextEncoder()
                        const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(legalTerms))
                        const legalTermsHash = Array.from(new Uint8Array(hashBuf)).map(b => b.toString(16).padStart(2, '0')).join('')

                        const { generateSignedProposalPdf } = await import('../lib/signedProposalPdf')
                        const pdfBlob = await generateSignedProposalPdf({
                          quote: estimate,
                          lineItems,
                          company,
                          customer,
                          legalTerms,
                          signature: {}, // draft — no signature yet
                          approver: {},
                          approvedAt: null,
                          legalTermsHash,
                          downPaymentLabel: dpLabel,
                          downPaymentAmount: dpAmount,
                          businessUnit,
                        })

                        const ts = Date.now()
                        const storagePath = `formal-drafts/${estimate.id}/${ts}.pdf`
                        const { error: upErr } = await supabase.storage
                          .from('project-documents')
                          .upload(storagePath, pdfBlob, { contentType: 'application/pdf', upsert: false })

                        if (upErr) throw upErr

                        const fileName = `Formal_Proposal_${estimate.quote_id || `EST-${estimate.id}`}_Draft.pdf`
                        const { error: insErr } = await supabase
                          .from('file_attachments')
                          .insert({
                            company_id: estimate.company_id,
                            quote_id: estimate.id,
                            file_name: fileName,
                            file_path: storagePath,
                            file_type: 'application/pdf',
                            file_size: pdfBlob.size,
                            storage_bucket: 'project-documents',
                            photo_context: 'formal_draft',
                          })

                        if (insErr) throw insErr
                      } catch (pdfErr) {
                        console.error('[formal draft pdf]', pdfErr)
                        toast.error('Saved settings but PDF draft failed: ' + (pdfErr?.message || 'unknown'))
                        onClose?.()
                        return
                      }
                    }

                    toast.success(mode === 'formal'
                      ? 'Formal proposal draft saved to estimate documents'
                      : 'Draft saved')
                    onClose?.()
                  } catch (err) {
                    toast.error('Save failed: ' + (err?.message || 'unknown'))
                  }
                }}
                style={{
                  flex: 1, padding: '10px 16px', backgroundColor: 'transparent', color: theme.accent,
                  border: `1px solid ${theme.accent}`, borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                }}>
                {mode === 'formal' ? 'Save to Estimate' : 'Save Draft'}
              </button>
              <button onClick={() => setStep('send')}
                disabled={mode === 'interactive' && !proposalLayout}
                style={{
                  flex: 1, padding: '10px 16px', backgroundColor: theme.accent, color: '#fff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                  cursor: (mode === 'interactive' && !proposalLayout) ? 'not-allowed' : 'pointer',
                  opacity: (mode === 'interactive' && !proposalLayout) ? 0.5 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                <Send size={16} />
                Continue to Send
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div>
              <label style={labelStyle}>Recipient Email</label>
              <input type="email" value={sendEmail} onChange={(e) => setSendEmail(e.target.value)} placeholder="customer@example.com" style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>Subject Line <span style={{ color: theme.textMuted, fontWeight: '400' }}>(optional)</span></label>
              <input type="text" value={sendSubject} onChange={(e) => setSendSubject(e.target.value)}
                placeholder={mode === 'formal' ? `Formal Proposal from ${company?.company_name || 'Company'}` : mode === 'interactive' ? `Your Proposal from ${company?.company_name || 'Company'}` : `Estimate from ${company?.company_name || 'Company'}`}
                style={inputStyle} />
            </div>

            <div>
              <label style={labelStyle}>Attachments <span style={{ color: theme.textMuted, fontWeight: '400' }}>(spec sheets, documents)</span></label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {sendAttachments.map((att, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 10px', backgroundColor: theme.bg, borderRadius: '6px', border: `1px solid ${theme.border}` }}>
                    <Paperclip size={14} style={{ color: theme.textMuted }} />
                    <span style={{ fontSize: '13px', color: theme.text, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{att.name}</span>
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>{(att.file.size / 1024).toFixed(0)} KB</span>
                    <button onClick={() => setSendAttachments(prev => prev.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: theme.textMuted }}>
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <label style={{
                  display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                  border: `1px dashed ${theme.border}`, borderRadius: '6px', cursor: 'pointer',
                  fontSize: '13px', color: theme.accent, background: 'transparent'
                }}>
                  <Paperclip size={14} />
                  Add File
                  <input type="file" multiple style={{ display: 'none' }} onChange={(e) => {
                    Array.from(e.target.files).forEach(file => {
                      const reader = new FileReader()
                      reader.onload = () => {
                        const base64 = reader.result.split(',')[1]
                        setSendAttachments(prev => [...prev, { file, name: file.name, base64 }])
                      }
                      reader.readAsDataURL(file)
                    })
                    e.target.value = ''
                  }} />
                </label>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 14px', backgroundColor: (mode === 'interactive' || mode === 'formal') ? 'rgba(90,99,73,0.08)' : theme.bg, borderRadius: '8px', border: `1px solid ${theme.border}` }}>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: (mode === 'interactive' || mode === 'formal') ? theme.accent : theme.textMuted }} />
              <p style={{ fontSize: '13px', color: theme.textSecondary, margin: 0 }}>
                {mode === 'formal'
                  ? 'Customer will receive a link to a formal legal contract they can sign and pay from.'
                  : mode === 'interactive'
                  ? 'Customer will receive a link to an interactive proposal.'
                  : 'A PDF will be generated and attached to the email.'}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '12px' }}>
              <button onClick={() => setStep('preview')}
                style={{ flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.text, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>
                Back
              </button>
              <button onClick={onSend} disabled={sendingEmail}
                style={{
                  flex: 1, padding: '10px 16px', backgroundColor: theme.accent, color: '#fff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                  cursor: sendingEmail ? 'not-allowed' : 'pointer', opacity: sendingEmail ? 0.6 : 1,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                }}>
                <Mail size={16} />
                {sendingEmail ? 'Sending...' : (mode === 'formal' ? 'Send Formal Proposal' : mode === 'interactive' ? 'Send Proposal' : 'Send Email')}
              </button>
            </div>
          </div>
        )}
      </div>

    </div>
  )
}

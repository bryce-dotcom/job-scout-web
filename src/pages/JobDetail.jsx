import { useState, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import HelpBadge from '../components/HelpBadge'
import DealBreadcrumb from '../components/DealBreadcrumb'
import {
  ArrowLeft, Plus, Trash2, MapPin, Clock, FileText, ExternalLink,
  Play, CheckCircle, Pencil, X, DollarSign, Calendar, User, Building2,
  Edit2, Save, AlertCircle, GripVertical, CheckCircle2, Paperclip, Download, Upload,
  Package, Loader, Check, Info, Eye, Zap
} from 'lucide-react'
import { buildDataContext, generateAndUploadTemplate } from '../lib/documentGenerator'

const CATEGORY_COLORS = {
  CONTRACT: { bg: '#dcfce7', text: '#166534' },
  APPLICATION: { bg: '#dbeafe', text: '#1e40af' },
  TAX: { bg: '#f3e8ff', text: '#6b21a8' },
  PERMIT: { bg: '#ffedd5', text: '#9a3412' },
  PROPOSAL: { bg: '#e0e7ff', text: '#3730a3' },
  CUSTOM: { bg: '#fef9c3', text: '#854d0e' }
}

const getTemplateKey = (t) => t._source === 'utility_forms' ? `uf_${t._sourceId}` : `dt_${t.id}`
const getPackageKey = (p) => p.source_table === 'utility_forms' ? `uf_${p.template_id}` : `dt_${p.template_id}`

// Default status colors (fallback when store is empty)
const defaultSectionStatusColors = {
  'Not Started': '#9ca3af',
  'In Progress': '#3b82f6',
  'Complete': '#22c55e',
  'Verified': '#8b5cf6'
}

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
  'Scheduled': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
  'In Progress': { bg: 'rgba(194,139,56,0.12)', text: '#c28b38' },
  'Completed': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Cancelled': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
  'On Hold': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' }
}

export default function JobDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const products = useStore((state) => state.products)
  const employees = useStore((state) => state.employees)
  const timeLogs = useStore((state) => state.timeLogs)
  const fetchJobs = useStore((state) => state.fetchJobs)
  const fetchTimeLogs = useStore((state) => state.fetchTimeLogs)
  const isAdmin = useStore((state) => state.isAdmin)
  const storeJobSectionStatuses = useStore((state) => state.jobSectionStatuses)

  // Normalize section statuses from store
  const sectionStatuses = (storeJobSectionStatuses || []).map((s, idx) => {
    if (typeof s === 'string') {
      return { id: s, name: s, color: defaultSectionStatusColors[s] || '#9ca3af' }
    }
    return { id: s.id || s.name, name: s.name, color: s.color || defaultSectionStatusColors[s.name] || '#9ca3af' }
  })

  // Fallback if store is empty
  const effectiveSectionStatuses = sectionStatuses.length > 0 ? sectionStatuses : [
    { id: 'Not Started', name: 'Not Started', color: '#9ca3af' },
    { id: 'In Progress', name: 'In Progress', color: '#3b82f6' },
    { id: 'Complete', name: 'Complete', color: '#22c55e' },
    { id: 'Verified', name: 'Verified', color: '#8b5cf6' }
  ]

  // Get section status color from store
  const getSectionStatusColor = (status) => {
    const found = effectiveSectionStatuses.find(s => s.id === status || s.name === status)
    if (found) return { bg: found.color + '20', text: found.color }
    return { bg: '#f3f4f6', text: '#6b7280' }
  }

  // Get gantt color for section
  const getGanttColor = (status) => {
    const found = effectiveSectionStatuses.find(s => s.id === status || s.name === status)
    return found?.color || '#9ca3af'
  }

  const [job, setJob] = useState(null)
  const [lineItems, setLineItems] = useState([])
  const [jobTimeLogs, setJobTimeLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)
  const [showAddTime, setShowAddTime] = useState(false)
  const [newLine, setNewLine] = useState({ item_id: '', quantity: 1 })
  const [newTime, setNewTime] = useState({ employee_id: '', hours: '', category: 'Regular', notes: '' })
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState({})
  const [isMobile, setIsMobile] = useState(false)
  const [leadMeter, setLeadMeter] = useState(null)
  const [leadEin, setLeadEin] = useState(null)
  const [jobInvoices, setJobInvoices] = useState([])
  const [jobUtilityInvoices, setJobUtilityInvoices] = useState([])

  // Section state
  const [sections, setSections] = useState([])
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [editingSection, setEditingSection] = useState(null)
  const [sectionForm, setSectionForm] = useState({
    name: '',
    description: '',
    percent_of_job: '',
    assigned_to: '',
    estimated_hours: '',
    scheduled_date: '',
    status: 'Not Started'
  })
  const [sectionFormError, setSectionFormError] = useState('')
  const ganttRef = useRef(null)
  const fileInputRef = useRef(null)

  // Document viewer state
  const [viewingDoc, setViewingDoc] = useState(null) // { url, name }

  // Generate from Library state
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [libraryTemplates, setLibraryTemplates] = useState([])
  const [packageTemplateKeys, setPackageTemplateKeys] = useState([])
  const [selectedTemplates, setSelectedTemplates] = useState(new Set())
  const [generating, setGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState('')

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchJobData()
    fetchTimeLogs()
  }, [companyId, id, navigate])

  useEffect(() => {
    // Filter time logs for this job
    setJobTimeLogs(timeLogs.filter(t => t.job_id === parseInt(id)))
  }, [timeLogs, id])

  const fetchJobData = async () => {
    setLoading(true)

    const { data: jobData } = await supabase
      .from('jobs')
      .select('*, customer:customers!customer_id(id, name, email, phone, address, business_name), salesperson:employees!salesperson_id(id, name), quote:quotes!quote_id(id, quote_id), pm:employees!jobs_pm_id_fkey(id, name)')
      .eq('id', id)
      .single()

    if (jobData) {
      setJob(jobData)
      setFormData(jobData)

      // Fetch lead's meter_number and ein if linked
      if (jobData.lead_id) {
        const { data: leadData } = await supabase
          .from('leads')
          .select('meter_number, ein')
          .eq('id', jobData.lead_id)
          .single()
        if (leadData) {
          setLeadMeter(leadData.meter_number || null)
          setLeadEin(leadData.ein || null)
        }
      }

      const { data: lines } = await supabase
        .from('job_lines')
        .select('*, item:products_services(id, name, description)')
        .eq('job_id', id)
        .order('id')

      setLineItems(lines || [])

      // Fetch sections
      const { data: sectionsData } = await supabase
        .from('job_sections')
        .select('*, assigned_employee:employees!job_sections_assigned_to_fkey(id, name)')
        .eq('job_id', id)
        .eq('company_id', companyId)
        .order('sort_order')

      setSections(sectionsData || [])

      // Fetch invoices linked to this job
      const { data: invoicesData } = await supabase
        .from('invoices')
        .select('id, invoice_id, amount, payment_status, created_at')
        .eq('job_id', id)
        .order('created_at', { ascending: false })
      setJobInvoices(invoicesData || [])

      // Fetch utility invoices linked to this job
      const { data: utilInvoicesData } = await supabase
        .from('utility_invoices')
        .select('id, amount, payment_status, utility_name, created_at')
        .eq('job_id', id)
        .order('created_at', { ascending: false })
      setJobUtilityInvoices(utilInvoicesData || [])

      // Fetch file attachments linked to this job (by job_id or by lead_id)
      const jobIdFilter = supabase.from('file_attachments').select('*').eq('job_id', id).order('created_at', { ascending: false })
      const { data: byJob } = await jobIdFilter
      if (byJob?.length) {
        setAttachments(byJob)
      } else if (jobData.lead_id) {
        const { data: byLead } = await supabase.from('file_attachments').select('*').eq('lead_id', jobData.lead_id).order('created_at', { ascending: false })
        setAttachments(byLead || [])
      } else {
        setAttachments([])
      }
    }

    setLoading(false)
  }

  const addLineItem = async () => {
    if (!newLine.item_id) return

    const product = products.find(p => p.id === parseInt(newLine.item_id))
    if (!product) return

    setSaving(true)

    const lineTotal = (product.unit_price || 0) * newLine.quantity

    await supabase.from('job_lines').insert([{
      company_id: companyId,
      job_id: parseInt(id),
      item_id: product.id,
      quantity: newLine.quantity,
      price: product.unit_price,
      total: lineTotal
    }])

    await fetchJobData()
    setNewLine({ item_id: '', quantity: 1 })
    setShowAddLine(false)
    setSaving(false)
  }

  const removeLineItem = async (lineId) => {
    setSaving(true)
    await supabase.from('job_lines').delete().eq('id', lineId)
    await fetchJobData()
    setSaving(false)
  }

  const addTimeEntry = async () => {
    if (!newTime.employee_id || !newTime.hours) return

    setSaving(true)

    await supabase.from('time_log').insert([{
      company_id: companyId,
      job_id: parseInt(id),
      employee_id: parseInt(newTime.employee_id),
      hours: parseFloat(newTime.hours),
      category: newTime.category,
      notes: newTime.notes || null,
      date: new Date().toISOString().split('T')[0]
    }])

    await fetchTimeLogs()
    setNewTime({ employee_id: '', hours: '', category: 'Regular', notes: '' })
    setShowAddTime(false)
    setSaving(false)
  }

  const copyFromQuote = async () => {
    if (!job.quote_id) return
    if (!confirm('Copy line items from the linked quote?')) return

    setSaving(true)

    const { data: quoteLines } = await supabase
      .from('quote_lines')
      .select('*')
      .eq('quote_id', job.quote_id)

    if (quoteLines && quoteLines.length > 0) {
      const jobLines = quoteLines.map(ql => ({
        company_id: companyId,
        job_id: parseInt(id),
        item_id: ql.item_id,
        quantity: ql.quantity,
        price: ql.price,
        total: ql.line_total || ql.total
      }))

      await supabase.from('job_lines').insert(jobLines)
      await fetchJobData()
    }

    setSaving(false)
  }

  const updateJobStatus = async (newStatus) => {
    setSaving(true)
    const updateData = {
      status: newStatus,
      updated_at: new Date().toISOString()
    }

    if (newStatus === 'In Progress' && !job.start_date) {
      updateData.start_date = new Date().toISOString()
    }
    if (newStatus === 'Completed') {
      updateData.end_date = new Date().toISOString()
    }

    await supabase.from('jobs').update(updateData).eq('id', id)

    // Sync job status → lead status through delivery pipeline
    if (job.lead_id) {
      const statusMap = {
        'Scheduled': 'Job Scheduled',
        'In Progress': 'In Progress',
        'Completed': 'Job Complete',
        'On Hold': 'Job Scheduled',
        'Cancelled': 'Lost'
      }
      const newLeadStatus = statusMap[newStatus]
      if (newLeadStatus) {
        await supabase.from('leads').update({ status: newLeadStatus, updated_at: new Date().toISOString() }).eq('id', job.lead_id)
      }
    }

    await fetchJobData()
    await fetchJobs()
    setSaving(false)
  }

  const handleSave = async () => {
    setSaving(true)
    await supabase.from('jobs').update({
      job_title: formData.job_title,
      job_address: formData.job_address,
      start_date: formData.start_date,
      end_date: formData.end_date,
      assigned_team: formData.assigned_team,
      allotted_time_hours: formData.allotted_time_hours,
      details: formData.details,
      notes: formData.notes,
      updated_at: new Date().toISOString()
    }).eq('id', id)
    await fetchJobData()
    await fetchJobs()
    setEditMode(false)
    setSaving(false)
  }

  const generateInvoice = async () => {
    if (!confirm('Generate invoice from this job?')) return

    setSaving(true)

    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`
    const subtotal = lineItems.reduce((sum, line) => sum + (parseFloat(line.total) || 0), 0)
    const discount = parseFloat(job.discount) || 0
    const total = subtotal - discount

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert([{
        company_id: companyId,
        invoice_id: invoiceNumber,
        job_id: parseInt(id),
        customer_id: job.customer_id,
        amount: total,
        discount_applied: discount,
        payment_status: 'Pending',
        job_description: job.job_title
      }])
      .select()
      .single()

    if (!error && invoice) {
      await supabase.from('jobs').update({
        invoice_status: 'Invoiced',
        updated_at: new Date().toISOString()
      }).eq('id', id)

      // Sync to lead pipeline
      if (job.lead_id) {
        await supabase.from('leads').update({ status: 'Invoiced', updated_at: new Date().toISOString() }).eq('id', job.lead_id)
      }

      await fetchJobData()
      navigate(`/invoices/${invoice.id}`)
    }

    setSaving(false)
  }

  const createCustomerInvoice = async () => {
    if (!job.lead_id) return
    setSaving(true)

    try {
      // Fetch the lighting audit linked to this job's lead
      const { data: audits } = await supabase
        .from('lighting_audits')
        .select('*')
        .eq('lead_id', job.lead_id)
        .order('created_at', { ascending: false })
        .limit(1)

      const audit = audits?.[0]
      if (!audit) {
        const { toast } = await import('../lib/toast')
        toast.error('No lighting audit found for this lead')
        setSaving(false)
        return
      }

      // Parse the notes JSON to get Give Me adjustments
      let additionalOOP = 0
      try {
        const pd = JSON.parse(audit.notes || '{}')
        additionalOOP = pd.giveMe?.additionalOOP || 0
      } catch (_) { /* notes may not be JSON */ }

      // Customer-presented numbers
      const projectCost = audit.est_project_cost || 0
      const customerIncentive = (audit.estimated_rebate || 0) - additionalOOP
      const customerOOP = (audit.net_cost || 0) + additionalOOP

      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`

      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert([{
          company_id: companyId,
          invoice_id: invoiceNumber,
          job_id: parseInt(id),
          customer_id: job.customer_id,
          amount: customerOOP,
          discount_applied: customerIncentive,
          payment_status: 'Pending',
          job_description: `Lighting Project — $${Math.round(projectCost).toLocaleString()} project, $${Math.round(customerIncentive).toLocaleString()} incentive`
        }])
        .select()
        .single()

      const { toast } = await import('../lib/toast')
      if (error) {
        toast.error('Failed to create customer invoice: ' + error.message)
      } else {
        await supabase.from('jobs').update({
          invoice_status: 'Invoiced',
          updated_at: new Date().toISOString()
        }).eq('id', id)

        if (job.lead_id) {
          await supabase.from('leads').update({ status: 'Invoiced', updated_at: new Date().toISOString() }).eq('id', job.lead_id)
        }

        await fetchJobData()
        toast.success('Customer invoice created')
      }
    } catch (err) {
      const { toast } = await import('../lib/toast')
      toast.error('Error creating customer invoice')
    }

    setSaving(false)
  }

  const createUtilityInvoice = async () => {
    if (!job.lead_id) return
    setSaving(true)

    try {
      // Fetch the lighting audit linked to this job's lead
      const { data: audits } = await supabase
        .from('lighting_audits')
        .select('*, utility_provider:utility_providers!lighting_audits_utility_provider_id_fkey(id, provider_name)')
        .eq('lead_id', job.lead_id)
        .order('created_at', { ascending: false })
        .limit(1)

      const audit = audits?.[0]
      if (!audit) {
        const { toast } = await import('../lib/toast')
        toast.error('No lighting audit found for this lead')
        setSaving(false)
        return
      }

      const utilityName = audit.utility_provider?.provider_name || 'Utility'
      const totalFixtures = audit.total_fixtures || 0
      const incentive = audit.estimated_rebate || 0

      const { error } = await supabase
        .from('utility_invoices')
        .insert([{
          company_id: companyId,
          job_id: parseInt(id),
          lead_id: job.lead_id,
          customer_name: job.customer?.name || '',
          utility_name: utilityName,
          amount: incentive,
          project_cost: audit.est_project_cost || 0,
          incentive_amount: incentive,
          net_cost: audit.net_cost || 0,
          payment_status: 'Pending',
          notes: `Lighting Audit — ${totalFixtures} fixtures, ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(incentive)} incentive`
        }])

      const { toast } = await import('../lib/toast')
      if (error) {
        toast.error('Failed to create utility rebate: ' + error.message)
      } else {
        toast.success('Utility rebate created')
        await fetchJobData()
      }
    } catch (err) {
      const { toast } = await import('../lib/toast')
      toast.error('Error creating utility rebate')
    }

    setSaving(false)
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  const formatDateTime = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleString()
  }

  const openMap = (address) => {
    if (address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank')
    }
  }

  // Section management functions
  const calculateSectionProgress = () => {
    if (sections.length === 0) return 0
    const completedPercent = sections
      .filter(s => s.status === 'Complete' || s.status === 'Verified')
      .reduce((sum, s) => sum + (parseFloat(s.percent_of_job) || 0), 0)
    return Math.min(100, completedPercent)
  }

  const getTotalSectionPercent = (excludeSectionId = null) => {
    return sections
      .filter(s => s.id !== excludeSectionId)
      .reduce((sum, s) => sum + (parseFloat(s.percent_of_job) || 0), 0)
  }

  const getRemainingSectionPercent = () => {
    const total = getTotalSectionPercent(editingSection?.id)
    return Math.max(0, 100 - total)
  }

  const validateSectionForm = () => {
    if (!sectionForm.name.trim()) {
      setSectionFormError('Section name is required')
      return false
    }

    const percent = parseFloat(sectionForm.percent_of_job) || 0
    const currentTotal = getTotalSectionPercent(editingSection?.id)
    const newTotal = currentTotal + percent

    if (percent < 0 || percent > 100) {
      setSectionFormError('Percent must be between 0 and 100')
      return false
    }

    if (newTotal > 100) {
      setSectionFormError(`Total would be ${newTotal}%. Max is 100%. ${getRemainingSectionPercent()}% available.`)
      return false
    }

    setSectionFormError('')
    return true
  }

  const handleSaveSection = async () => {
    if (!validateSectionForm()) return
    setSaving(true)

    const sectionData = {
      company_id: companyId,
      job_id: parseInt(id),
      name: sectionForm.name.trim(),
      description: sectionForm.description.trim() || null,
      percent_of_job: parseFloat(sectionForm.percent_of_job) || 0,
      assigned_to: sectionForm.assigned_to ? parseInt(sectionForm.assigned_to) : null,
      estimated_hours: sectionForm.estimated_hours ? parseFloat(sectionForm.estimated_hours) : null,
      scheduled_date: sectionForm.scheduled_date || null,
      status: sectionForm.status,
      updated_at: new Date().toISOString()
    }

    if (editingSection) {
      await supabase.from('job_sections').update(sectionData).eq('id', editingSection.id)
    } else {
      sectionData.sort_order = sections.length
      await supabase.from('job_sections').insert(sectionData)
    }

    setShowSectionModal(false)
    setEditingSection(null)
    resetSectionForm()
    await fetchJobData()
    setSaving(false)
  }

  const handleDeleteSection = async (sectionId) => {
    if (!confirm('Delete this section?')) return
    setSaving(true)
    await supabase.from('job_sections').delete().eq('id', sectionId)
    await fetchJobData()
    setSaving(false)
  }

  const updateSectionStatus = async (sectionId, newStatus) => {
    setSaving(true)
    await supabase
      .from('job_sections')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', sectionId)
    await fetchJobData()
    setSaving(false)
  }

  const resetSectionForm = () => {
    setSectionForm({
      name: '',
      description: '',
      percent_of_job: '',
      assigned_to: '',
      estimated_hours: '',
      scheduled_date: '',
      status: 'Not Started'
    })
    setSectionFormError('')
  }

  const openAddSection = () => {
    resetSectionForm()
    setEditingSection(null)
    setShowSectionModal(true)
  }

  const openEditSection = (section) => {
    setEditingSection(section)
    setSectionForm({
      name: section.name || '',
      description: section.description || '',
      percent_of_job: section.percent_of_job?.toString() || '',
      assigned_to: section.assigned_to?.toString() || '',
      estimated_hours: section.estimated_hours?.toString() || '',
      scheduled_date: section.scheduled_date || '',
      status: section.status || 'Not Started'
    })
    setSectionFormError('')
    setShowSectionModal(true)
  }

  // Upload a document
  const handleUploadDocument = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const filePath = `jobs/${id}/${Date.now()}_${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(filePath, file)

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message)
      return
    }

    const { error: dbError } = await supabase.from('file_attachments').insert({
      company_id: companyId,
      job_id: parseInt(id),
      lead_id: job.lead_id || null,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type || null,
      file_size: file.size,
      storage_bucket: 'project-documents'
    })

    if (dbError) {
      alert('Failed to save attachment record: ' + dbError.message)
      return
    }

    await fetchJobData()
  }

  // Delete an attachment
  const handleDeleteAttachment = async (att) => {
    if (!confirm(`Delete "${att.file_name}"?`)) return

    await supabase.from('file_attachments').delete().eq('id', att.id)
    await supabase.storage.from(att.storage_bucket).remove([att.file_path])

    await fetchJobData()
  }

  // Fetch library templates and supplementary data when generate modal opens
  const handleOpenGenerateModal = async () => {
    setShowGenerateModal(true)

    // Fetch templates
    const [templatesRes, utilityFormsRes, packagesRes] = await Promise.all([
      supabase
        .from('document_templates')
        .select('*')
        .eq('company_id', companyId)
        .order('category'),
      supabase
        .from('utility_forms')
        .select('*')
        .eq('status', 'published'),
      supabase
        .from('doc_package_items')
        .select('*')
        .eq('company_id', companyId)
        .order('sort_order', { ascending: true })
    ])

    // Normalize utility_forms into same shape
    const utilityTemplates = (utilityFormsRes.data || []).map(uf => {
      const mapping = uf.field_mapping || {}
      const fieldCount = Object.keys(mapping).length
      const mappedCount = Object.values(mapping).filter(v => v).length
      return {
        id: `uf_${uf.id}`,
        _source: 'utility_forms',
        _sourceId: uf.id,
        company_id: uf.company_id,
        form_name: uf.form_name,
        form_code: uf.form_type || '',
        category: (uf.form_type || 'APPLICATION').toUpperCase(),
        file_path: uf.form_file || '',
        file_name: uf.form_name,
        file_size: null,
        field_count: fieldCount,
        field_mapping: mapping,
        status: mappedCount >= fieldCount && fieldCount > 0 ? 'Ready' : (fieldCount === 0 ? 'Ready' : 'Pending'),
        is_custom: false,
        created_at: uf.created_at,
        updated_at: uf.updated_at
      }
    })

    const allTemplates = [...(templatesRes.data || []), ...utilityTemplates]
    setLibraryTemplates(allTemplates)

    // Fetch supplementary data via lead_id for package matching
    let serviceType = null
    if (job?.lead_id) {
      const { data: leadData } = await supabase
        .from('leads')
        .select('service_type')
        .eq('id', job.lead_id)
        .single()
      serviceType = leadData?.service_type || null
    }

    const pkgItems = packagesRes.data || []
    const matchingPkg = serviceType
      ? pkgItems.filter(p => p.service_type === serviceType)
      : []
    const pkgKeys = matchingPkg.map(getPackageKey)
    setPackageTemplateKeys(pkgKeys)

    if (pkgKeys.length > 0) {
      const preSelected = new Set()
      for (const t of allTemplates) {
        if (pkgKeys.includes(getTemplateKey(t))) preSelected.add(getTemplateKey(t))
      }
      setSelectedTemplates(preSelected)
    } else {
      setSelectedTemplates(new Set())
    }
  }

  const handleGenerateSelected = async () => {
    if (selectedTemplates.size === 0) return
    setGenerating(true)

    const templatesToGenerate = libraryTemplates.filter(t => selectedTemplates.has(getTemplateKey(t)))

    // Fetch supplementary data for data context
    let audits = []
    let quotes = []
    if (job?.lead_id) {
      const [auditsRes, quotesRes] = await Promise.all([
        supabase.from('lighting_audits').select('*').eq('lead_id', job.lead_id),
        job.quote?.id
          ? supabase.from('quotes').select('*').eq('id', job.quote.id)
          : supabase.from('quotes').select('*').eq('lead_id', job.lead_id).order('created_at', { ascending: false }).limit(1)
      ])
      audits = auditsRes.data || []
      quotes = quotesRes.data || []
    }

    const dataContext = await buildDataContext({
      lead: null,
      job,
      audits,
      quotes,
      lineItems: lineItems || [],
      appointment: null
    })

    let successCount = 0
    let errorCount = 0

    for (let i = 0; i < templatesToGenerate.length; i++) {
      setGenerateProgress(`Generating ${i + 1} of ${templatesToGenerate.length}...`)
      const result = await generateAndUploadTemplate(templatesToGenerate[i], dataContext, {
        entityType: 'job',
        entityId: id,
        companyId,
        leadId: job?.lead_id || null
      })
      if (result.success) successCount++
      else {
        errorCount++
        const { toast } = await import('../lib/toast')
        toast.error(`Failed: ${templatesToGenerate[i].form_name} — ${result.error}`)
      }
    }

    setGenerating(false)
    setGenerateProgress('')
    setShowGenerateModal(false)

    if (successCount > 0) {
      const { toast } = await import('../lib/toast')
      toast.success(`Generated ${successCount} document${successCount > 1 ? 's' : ''}`)
      await fetchJobData()
    }
    if (errorCount > 0 && successCount === 0) {
      const { toast } = await import('../lib/toast')
      toast.error('All document generations failed')
    }
  }

  const handleDeleteJob = async () => {
    if (!confirm('Permanently delete this job and all its line items and sections?')) return
    setSaving(true)
    // Nullify job_id on tables that would block deletion (no CASCADE)
    await Promise.all([
      supabase.from('time_log').update({ job_id: null }).eq('job_id', id),
      supabase.from('expenses').update({ job_id: null }).eq('job_id', id),
      supabase.from('invoices').update({ job_id: null }).eq('job_id', id),
      supabase.from('utility_invoices').update({ job_id: null }).eq('job_id', id),
    ])
    const { error } = await supabase.from('jobs').delete().eq('id', id)
    setSaving(false)
    if (error) {
      const { toast } = await import('../lib/toast')
      toast.error('Failed to delete job: ' + error.message)
      return
    }
    await fetchJobs()
    navigate('/jobs')
  }

  // Mini Gantt helpers
  const getGanttDateRange = () => {
    const dates = sections.filter(s => s.scheduled_date).map(s => new Date(s.scheduled_date))
    if (dates.length === 0) {
      const today = new Date()
      return { start: new Date(today.setDate(today.getDate() - 3)), end: new Date(today.setDate(today.getDate() + 17)), days: 14 }
    }
    const min = new Date(Math.min(...dates))
    const max = new Date(Math.max(...dates))
    min.setDate(min.getDate() - 2)
    max.setDate(max.getDate() + 5)
    const days = Math.ceil((max - min) / (1000 * 60 * 60 * 24))
    return { start: min, end: max, days: Math.max(days, 14) }
  }

  const getSectionGanttPosition = (section) => {
    if (!section.scheduled_date) return null
    const { start, days } = getGanttDateRange()
    const sectionDate = new Date(section.scheduled_date)
    const daysDiff = Math.floor((sectionDate - start) / (1000 * 60 * 60 * 24))
    const hours = parseFloat(section.estimated_hours) || 4
    const widthDays = Math.max(0.5, hours / 8)
    const dayWidth = 100 / days
    return { left: `${daysDiff * dayWidth}%`, width: `${Math.max(widthDays * dayWidth, 3)}%` }
  }

  const sectionProgress = calculateSectionProgress()
  const totalSectionPercent = getTotalSectionPercent()

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
        <p style={{ color: theme.textMuted }}>Loading job...</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div style={{ padding: '24px' }}>
        <p style={{ color: '#dc2626', marginBottom: '16px' }}>Job not found</p>
        <button onClick={() => navigate('/jobs')} style={{ color: theme.accent, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
          Back to Jobs
        </button>
      </div>
    )
  }

  const subtotal = lineItems.reduce((sum, line) => sum + (parseFloat(line.total) || 0), 0)
  const discount = parseFloat(job.discount) || 0
  const incentive = parseFloat(job.utility_incentive) || 0
  const total = subtotal - discount
  const outOfPocket = total - incentive

  const totalHoursWorked = jobTimeLogs.reduce((sum, t) => sum + (parseFloat(t.hours) || 0), 0)
  const allottedHours = parseFloat(job.allotted_time_hours) || 0
  const progressPercent = allottedHours > 0 ? Math.min(100, (totalHoursWorked / allottedHours) * 100) : 0

  const statusStyle = statusColors[job.status] || statusColors['Scheduled']

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button
          onClick={() => navigate('/jobs')}
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
          <p style={{ fontSize: '13px', color: theme.accent, fontWeight: '600' }}>{job.job_id}</p>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            {job.job_title || 'Untitled Job'}
          </h1>
        </div>
        <span style={{
          padding: '6px 14px',
          borderRadius: '20px',
          fontSize: '13px',
          fontWeight: '500',
          backgroundColor: statusStyle.bg,
          color: statusStyle.text
        }}>
          {job.status}
        </span>
      </div>

      {/* Deal Breadcrumb */}
      <DealBreadcrumb
        current="job"
        leadId={job.lead_id}
        quoteId={job.quote_id}
        customerId={job.customer_id}
        jobId={job.id}
      />

      {/* Section Progress Bar */}
      {sections.length > 0 && (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          padding: '20px',
          border: `1px solid ${theme.border}`,
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Section Progress</span>
            <span style={{ fontSize: '14px', fontWeight: '600', color: sectionProgress === 100 ? '#22c55e' : theme.accent }}>
              {Math.round(sectionProgress)}%
            </span>
          </div>
          <div style={{
            height: '12px',
            backgroundColor: theme.border,
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <div style={{
              height: '100%',
              width: `${sectionProgress}%`,
              backgroundColor: sectionProgress === 100 ? '#22c55e' : theme.accent,
              borderRadius: '6px',
              transition: 'width 0.3s ease'
            }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '12px', color: theme.textMuted }}>
            <span>{sections.filter(s => s.status === 'Complete' || s.status === 'Verified').length} of {sections.length} sections complete</span>
            <span style={{ color: totalSectionPercent === 100 ? '#22c55e' : totalSectionPercent > 100 ? '#ef4444' : theme.textMuted }}>
              {totalSectionPercent}% allocated
            </span>
          </div>
        </div>
      )}

      {/* Sections & Mini Gantt */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        padding: '20px',
        border: `1px solid ${theme.border}`,
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '8px', margin: 0 }}>
            <CheckCircle2 size={18} />
            Sections ({sections.length})
            <HelpBadge text="Break job into trackable sections. Total percent must equal 100%." />
          </h3>
          <button
            onClick={openAddSection}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 14px',
              minHeight: '44px',
              backgroundColor: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} />
            Add Section
          </button>
        </div>

        {/* Percent allocation warning */}
        {totalSectionPercent !== 100 && sections.length > 0 && (
          <div style={{
            padding: '12px 16px',
            backgroundColor: totalSectionPercent > 100 ? '#fef2f2' : '#fefce8',
            borderRadius: '8px',
            marginBottom: '16px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} style={{ color: totalSectionPercent > 100 ? '#ef4444' : '#eab308' }} />
            <span style={{ fontSize: '13px', color: totalSectionPercent > 100 ? '#dc2626' : '#ca8a04' }}>
              {totalSectionPercent > 100
                ? `Total allocation is ${totalSectionPercent}% (exceeds 100%)`
                : `Total allocation is ${totalSectionPercent}%. ${100 - totalSectionPercent}% remaining.`}
            </span>
          </div>
        )}

        {/* Mini Gantt */}
        {sections.filter(s => s.scheduled_date).length > 0 && (
          <div ref={ganttRef} style={{ overflowX: 'auto', marginBottom: '16px', WebkitOverflowScrolling: 'touch' }}>
            <div style={{ minWidth: isMobile ? '500px' : '100%', padding: '8px', backgroundColor: theme.bg, borderRadius: '8px' }}>
              {/* Timeline Header */}
              <div style={{ display: 'flex', borderBottom: `1px solid ${theme.border}`, marginBottom: '8px', paddingBottom: '6px' }}>
                {(() => {
                  const { start, days } = getGanttDateRange()
                  const cols = []
                  for (let i = 0; i < days; i++) {
                    const d = new Date(start)
                    d.setDate(d.getDate() + i)
                    const isToday = d.toDateString() === new Date().toDateString()
                    cols.push(
                      <div key={i} style={{
                        flex: 1,
                        textAlign: 'center',
                        fontSize: '8px',
                        color: isToday ? theme.accent : theme.textMuted,
                        fontWeight: isToday ? '600' : '400'
                      }}>
                        {d.getDate()}
                      </div>
                    )
                  }
                  return cols
                })()}
              </div>
              {/* Section Rows */}
              {sections.map(section => {
                const pos = getSectionGanttPosition(section)
                const color = getGanttColor(section.status)
                return (
                  <div key={section.id} style={{ position: 'relative', height: '24px', marginBottom: '4px' }}>
                    {pos ? (
                      <div
                        style={{
                          position: 'absolute',
                          left: pos.left,
                          width: pos.width,
                          top: '2px',
                          height: '20px',
                          backgroundColor: color,
                          borderRadius: '3px',
                          padding: '2px 4px',
                          overflow: 'hidden',
                          cursor: 'pointer'
                        }}
                        onClick={() => openEditSection(section)}
                        title={`${section.name} - ${section.status}`}
                      >
                        <div style={{ fontSize: '9px', fontWeight: '500', color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {section.name}
                        </div>
                      </div>
                    ) : (
                      <div style={{ padding: '3px 8px', fontSize: '10px', color: theme.textMuted, fontStyle: 'italic' }}>
                        {section.name} (unscheduled)
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Sections List */}
        {sections.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '32px 20px', color: theme.textMuted }}>
            <CheckCircle2 size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
            <div style={{ fontSize: '13px' }}>No sections yet. Break this job into trackable sections.</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {sections.map(section => {
              const statusColor = getSectionStatusColor(section.status)
              return (
                <div
                  key={section.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '12px',
                    backgroundColor: theme.bg,
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    flexWrap: isMobile ? 'wrap' : 'nowrap'
                  }}
                >
                  <div style={{ flex: 1, minWidth: isMobile ? '100%' : 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>{section.name}</span>
                      <span style={{
                        padding: '2px 8px',
                        backgroundColor: statusColor.bg,
                        color: statusColor.text,
                        borderRadius: '4px',
                        fontSize: '10px',
                        fontWeight: '500'
                      }}>
                        {section.status}
                      </span>
                    </div>
                    <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '11px', color: theme.textMuted }}>
                      <span style={{ fontWeight: '500', color: theme.accent }}>{section.percent_of_job || 0}%</span>
                      {section.assigned_employee && <span>{section.assigned_employee.name}</span>}
                      {section.scheduled_date && <span>{new Date(section.scheduled_date).toLocaleDateString()}</span>}
                      {section.estimated_hours && <span>{section.estimated_hours}h</span>}
                    </div>
                  </div>
                  <select
                    value={section.status}
                    onChange={(e) => updateSectionStatus(section.id, e.target.value)}
                    style={{
                      padding: '6px 8px',
                      minHeight: '36px',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      backgroundColor: theme.bgCard,
                      color: theme.text,
                      fontSize: '11px',
                      cursor: 'pointer'
                    }}
                  >
                    {effectiveSectionStatuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => openEditSection(section)}
                    style={{
                      padding: '8px',
                      minWidth: '36px',
                      minHeight: '36px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      color: theme.textSecondary,
                      cursor: 'pointer'
                    }}
                  >
                    <Edit2 size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteSection(section.id)}
                    style={{
                      padding: '8px',
                      minWidth: '36px',
                      minHeight: '36px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '6px',
                      color: '#ef4444',
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 360px', gap: '24px' }}>
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
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Job Details</h3>
              <button
                onClick={() => setEditMode(!editMode)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px'
                }}
              >
                <Pencil size={14} />
                {editMode ? 'Cancel' : 'Edit'}
              </button>
            </div>

            {editMode ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Job Title</label>
                  <input type="text" value={formData.job_title || ''} onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Address</label>
                  <input type="text" value={formData.job_address || ''} onChange={(e) => setFormData(prev => ({ ...prev, job_address: e.target.value }))} style={inputStyle} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="datetime-local" value={formData.start_date ? formData.start_date.slice(0, 16) : ''} onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Allotted Hours</label>
                    <input type="number" value={formData.allotted_time_hours || ''} onChange={(e) => setFormData(prev => ({ ...prev, allotted_time_hours: e.target.value }))} step="0.25" style={inputStyle} />
                  </div>
                </div>
                <div>
                  <label style={labelStyle}>Details</label>
                  <textarea value={formData.details || ''} onChange={(e) => setFormData(prev => ({ ...prev, details: e.target.value }))} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <button onClick={handleSave} disabled={saving} style={{
                  padding: '10px 16px', backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                  cursor: saving ? 'not-allowed' : 'pointer', opacity: saving ? 0.6 : 1
                }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Customer</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.customer?.name || '-'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Phone</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.customer?.phone || '-'}</p>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Address</p>
                  {job.job_address ? (
                    <button
                      onClick={() => openMap(job.job_address)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '6px',
                        color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '500'
                      }}
                    >
                      <MapPin size={14} />
                      {job.job_address}
                      <ExternalLink size={12} />
                    </button>
                  ) : (
                    <p style={{ fontSize: '14px', color: theme.text }}>-</p>
                  )}
                </div>
                {leadMeter && (
                  <div>
                    <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Meter #</p>
                    <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{leadMeter}</p>
                  </div>
                )}
                {leadEin && (
                  <div>
                    <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>EIN</p>
                    <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{leadEin}</p>
                  </div>
                )}
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Start Date</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatDateTime(job.start_date)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Assigned Team</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.assigned_team || '-'}</p>
                </div>
                {job.details && (
                  <div style={{ gridColumn: '1 / -1' }}>
                    <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Details</p>
                    <p style={{ fontSize: '14px', color: theme.text }}>{job.details}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Line Items */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: `1px solid ${theme.border}`
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Job Lines</h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                {job.quote_id && lineItems.length === 0 && (
                  <button onClick={copyFromQuote} disabled={saving} style={{
                    display: 'flex', alignItems: 'center', gap: '6px',
                    padding: '8px 12px', backgroundColor: theme.accentBg, color: theme.accent,
                    border: 'none', borderRadius: '6px', fontSize: '13px', cursor: 'pointer'
                  }}>
                    <FileText size={16} />
                    Copy from Quote
                  </button>
                )}
                <button onClick={() => setShowAddLine(true)} style={{
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '8px 12px', backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                }}>
                  <Plus size={16} />
                  Add Item
                </button>
              </div>
            </div>

            {lineItems.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: theme.textMuted }}>
                No line items yet.
              </div>
            ) : (
              <>
                <div style={{
                  display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px 40px', gap: '12px',
                  padding: '12px 20px', backgroundColor: theme.accentBg,
                  fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px'
                }}>
                  <div>Item</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                  <div style={{ textAlign: 'right' }}>Price</div>
                  <div style={{ textAlign: 'right' }}>Total</div>
                  <div></div>
                </div>
                {lineItems.map((line) => (
                  <div key={line.id} style={{
                    display: 'grid', gridTemplateColumns: '2fr 80px 100px 100px 40px', gap: '12px',
                    padding: '14px 20px', borderBottom: `1px solid ${theme.border}`, alignItems: 'center'
                  }}>
                    <div>
                      <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>{line.item?.name || 'Unknown'}</p>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '14px', color: theme.textSecondary }}>{line.quantity}</div>
                    <div style={{ textAlign: 'right', fontSize: '14px', color: theme.textSecondary }}>{formatCurrency(line.price)}</div>
                    <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatCurrency(line.total)}</div>
                    <div style={{ textAlign: 'right' }}>
                      <button onClick={() => removeLineItem(line.id)} style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: theme.textMuted }}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                <div style={{ padding: '16px 20px', backgroundColor: theme.accentBg }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <span style={{ color: theme.textSecondary }}>Subtotal</span>
                    <span style={{ fontWeight: '500', color: theme.text }}>{formatCurrency(subtotal)}</span>
                  </div>
                  {discount > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <span style={{ color: theme.textSecondary }}>Discount</span>
                      <span style={{ color: '#dc2626' }}>-{formatCurrency(discount)}</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '8px', borderTop: `1px solid ${theme.border}` }}>
                    <span style={{ fontWeight: '600', color: theme.text }}>Total</span>
                    <span style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>{formatCurrency(total)}</span>
                  </div>
                  {incentive > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', color: '#4a7c59' }}>
                      <span>Out of Pocket</span>
                      <span style={{ fontWeight: '500' }}>{formatCurrency(outOfPocket)}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Time Tracking */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '16px 20px', borderBottom: `1px solid ${theme.border}`
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Time Tracking</h3>
              <button onClick={() => setShowAddTime(true)} style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '8px 12px', backgroundColor: theme.accent, color: '#ffffff',
                border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
              }}>
                <Plus size={16} />
                Add Time
              </button>
            </div>

            {/* Progress Bar */}
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                <span style={{ fontSize: '13px', color: theme.textSecondary }}>{totalHoursWorked.toFixed(1)}h worked</span>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>{allottedHours}h allotted</span>
              </div>
              <div style={{ height: '8px', backgroundColor: theme.accentBg, borderRadius: '4px', overflow: 'hidden' }}>
                <div style={{
                  height: '100%',
                  width: `${progressPercent}%`,
                  backgroundColor: progressPercent > 100 ? '#dc2626' : theme.accent,
                  borderRadius: '4px',
                  transition: 'width 0.3s'
                }} />
              </div>
            </div>

            {jobTimeLogs.length === 0 ? (
              <div style={{ padding: '32px 20px', textAlign: 'center', color: theme.textMuted }}>
                No time entries yet.
              </div>
            ) : (
              <div>
                {jobTimeLogs.map((entry) => (
                  <div key={entry.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '12px 20px', borderBottom: `1px solid ${theme.border}`
                  }}>
                    <div>
                      <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>{entry.employee?.name || 'Unknown'}</p>
                      <p style={{ fontSize: '12px', color: theme.textMuted }}>{formatDate(entry.date)} - {entry.category}</p>
                    </div>
                    <span style={{ fontSize: '15px', fontWeight: '500', color: theme.text }}>{entry.hours}h</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Actions */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Actions</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {job.status === 'Scheduled' && (
                <button onClick={() => updateJobStatus('In Progress')} disabled={saving} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px 16px', backgroundColor: '#c28b38', color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  <Play size={18} />
                  Start Job
                </button>
              )}
              {job.status === 'In Progress' && (
                <button onClick={() => updateJobStatus('Completed')} disabled={saving} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px 16px', backgroundColor: '#4a7c59', color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  <CheckCircle size={18} />
                  Mark Completed
                </button>
              )}
              {job.status === 'Completed' && job.invoice_status !== 'Invoiced' && job.invoice_status !== 'Paid' && jobInvoices.length === 0 && (
                <button onClick={generateInvoice} disabled={saving} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px 16px', backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  <DollarSign size={18} />
                  Generate Invoice
                </button>
              )}
              <button style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px 16px', backgroundColor: theme.accentBg, color: theme.accent,
                border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
              }}>
                <FileText size={18} />
                Generate Work Order
              </button>
              {job.lead_id && jobInvoices.length === 0 && (
                <button onClick={createCustomerInvoice} disabled={saving} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px 16px', backgroundColor: theme.accentBg, color: theme.accent,
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  <DollarSign size={18} />
                  Create Customer Invoice
                </button>
              )}
              {job.lead_id && jobUtilityInvoices.length === 0 && (
                <button onClick={createUtilityInvoice} disabled={saving} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                  padding: '12px 16px', backgroundColor: 'rgba(212,148,10,0.12)', color: '#d4940a',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                }}>
                  <Zap size={18} />
                  Create Utility Rebate
                </button>
              )}
              {isAdmin && (
                <>
                  <div style={{ borderTop: `1px solid ${theme.border}`, margin: '6px 0' }} />
                  <button onClick={handleDeleteJob} disabled={saving} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '12px 16px', backgroundColor: 'rgba(220,38,38,0.10)', color: '#dc2626',
                    border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                  }}>
                    <Trash2 size={18} />
                    Delete Job
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Linked Quote */}
          {job.quote && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Linked Quote</h3>
              <button onClick={() => navigate(`/quotes/${job.quote_id}`)} style={{
                color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontSize: '14px', textDecoration: 'underline'
              }}>
                {job.quote.quote_id}
              </button>
            </div>
          )}

          {/* Linked Invoices */}
          {(jobInvoices.length > 0 || jobUtilityInvoices.length > 0) && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
                Invoices ({jobInvoices.length + jobUtilityInvoices.length})
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {jobInvoices.map(inv => (
                  <div key={'c-' + inv.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px',
                    border: `1px solid ${theme.border}`
                  }}>
                    <div>
                      <button onClick={() => navigate(`/invoices/${inv.id}`)} style={{
                        color: theme.accent, background: 'none', border: 'none', cursor: 'pointer',
                        fontSize: '14px', fontWeight: '500', textDecoration: 'underline', padding: 0
                      }}>
                        {inv.invoice_id}
                      </button>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                        <span style={{ padding: '1px 6px', borderRadius: '8px', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6', fontWeight: '500', marginRight: '4px' }}>Customer</span>
                        {new Date(inv.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '600', color: theme.text, fontSize: '14px' }}>
                        {formatCurrency(inv.amount)}
                      </div>
                      <div style={{
                        fontSize: '11px', fontWeight: '500',
                        color: inv.payment_status === 'Paid' ? '#4a7c59' : inv.payment_status === 'Overdue' ? '#dc2626' : theme.textMuted
                      }}>
                        {inv.payment_status}
                      </div>
                    </div>
                  </div>
                ))}
                {jobUtilityInvoices.map(inv => (
                  <div key={'u-' + inv.id} onClick={() => navigate(`/utility-invoices/${inv.id}`)} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px',
                    border: `1px solid ${theme.border}`, cursor: 'pointer'
                  }}>
                    <div>
                      <div style={{
                        fontSize: '14px', fontWeight: '500', color: theme.text
                      }}>
                        {`UTL-${inv.id}`}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                        <span style={{ padding: '1px 6px', borderRadius: '8px', backgroundColor: 'rgba(20,184,166,0.12)', color: '#14b8a6', fontWeight: '500', marginRight: '4px' }}>Utility</span>
                        {inv.utility_name} — {new Date(inv.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '600', color: theme.text, fontSize: '14px' }}>
                        {formatCurrency(inv.amount)}
                      </div>
                      <div style={{
                        fontSize: '11px', fontWeight: '500',
                        color: inv.payment_status === 'Paid' ? '#4a7c59' : inv.payment_status === 'Overdue' ? '#dc2626' : theme.textMuted
                      }}>
                        {inv.payment_status}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Notes</h3>
            <textarea
              value={job.notes || ''}
              onChange={(e) => {
                supabase.from('jobs').update({ notes: e.target.value, updated_at: new Date().toISOString() }).eq('id', id)
                setJob(prev => ({ ...prev, notes: e.target.value }))
              }}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
              placeholder="Add notes..."
            />
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
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, flex: 1 }}>Documents ({attachments.length})</h3>
              <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleUploadDocument} />
              <button
                onClick={handleOpenGenerateModal}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 8px',
                  backgroundColor: theme.accentBg,
                  color: theme.accent,
                  border: `1px solid ${theme.accent}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '500'
                }}
              >
                <Package size={12} />
                Generate
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
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
              <p style={{ fontSize: '13px', color: theme.textMuted }}>No documents attached. Files from Lenard audits will appear here when the lead is converted to a job.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {attachments.map(att => {
                  const ext = (att.file_name || '').split('.').pop()?.toLowerCase()
                  const iconColor = ext === 'pdf' ? '#dc2626' : ext === 'xlsx' ? '#16a34a' : '#6366f1'
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
                      <div style={{
                        width: '32px', height: '32px',
                        backgroundColor: iconColor + '18',
                        borderRadius: '6px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <FileText size={16} color={iconColor} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontWeight: '500', color: theme.text, fontSize: '13px',
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                        }}>
                          {att.file_name}
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>
                          {ext?.toUpperCase()}{sizeKB ? ` \u2022 ${sizeKB}KB` : ''}{' \u2022 '}{new Date(att.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
                        <button
                          onClick={async () => {
                            const { data } = await supabase.storage.from(att.storage_bucket).createSignedUrl(att.file_path, 3600)
                            if (data?.signedUrl) setViewingDoc({ url: data.signedUrl, name: att.file_name })
                          }}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: theme.accentBg,
                            color: theme.accent,
                            border: `1px solid ${theme.accent}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}
                        >
                          <Eye size={12} />
                          View
                        </button>
                        <button
                          onClick={async () => {
                            const { data } = await supabase.storage.from(att.storage_bucket).createSignedUrl(att.file_path, 3600)
                            if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                          }}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: theme.accentBg,
                            color: theme.accent,
                            border: `1px solid ${theme.accent}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            fontSize: '12px',
                            fontWeight: '500'
                          }}
                        >
                          <Download size={12} />
                          Download
                        </button>
                        <button
                          onClick={() => handleDeleteAttachment(att)}
                          style={{
                            padding: '6px',
                            backgroundColor: '#fee2e2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Document Viewer Modal */}
      {viewingDoc && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.8)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: '#1e1e22', color: '#fff' }}>
            <div style={{ fontSize: '14px', fontWeight: '600', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, marginRight: '12px' }}>{viewingDoc.name}</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => window.open(viewingDoc.url, '_blank')} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><ExternalLink size={12} /> Open</button>
              <button onClick={() => setViewingDoc(null)} style={{ padding: '6px 12px', background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '4px' }}><X size={14} /> Close</button>
            </div>
          </div>
          <iframe src={/\.(xlsx?|docx?|pptx?)$/i.test(viewingDoc.name) ? `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(viewingDoc.url)}` : viewingDoc.url} title={viewingDoc.name} style={{ flex: 1, border: 'none', background: '#fff' }} />
        </div>
      )}

      {/* Generate from Library Modal */}
      {showGenerateModal && (
        <>
          <div
            onClick={() => !generating && setShowGenerateModal(false)}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.5)',
              zIndex: 50
            }}
          />
          <div style={{
            position: 'fixed',
            top: isMobile ? 0 : '50%',
            left: isMobile ? 0 : '50%',
            right: isMobile ? 0 : 'auto',
            bottom: isMobile ? 0 : 'auto',
            transform: isMobile ? 'none' : 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard || '#ffffff',
            borderRadius: isMobile ? 0 : '16px',
            border: isMobile ? 'none' : `1px solid ${theme.border}`,
            width: isMobile ? '100%' : '90%',
            maxWidth: isMobile ? '100%' : '700px',
            height: isMobile ? '100%' : 'auto',
            maxHeight: isMobile ? '100%' : '85vh',
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            zIndex: 51
          }}>
            {/* Header */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: isMobile ? '16px' : '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <div>
                <h2 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Generate Documents
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, margin: '4px 0 0' }}>
                  {job?.customer?.name || job?.title || 'Job'}
                </p>
              </div>
              <button
                onClick={() => !generating && setShowGenerateModal(false)}
                disabled={generating}
                style={{
                  padding: '8px', backgroundColor: 'transparent', border: 'none',
                  cursor: generating ? 'not-allowed' : 'pointer', color: theme.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: generating ? 0.5 : 1
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px' : '20px' }}>
              {generating && (
                <div style={{
                  padding: '16px', marginBottom: '16px', borderRadius: '10px',
                  backgroundColor: '#dbeafe', border: '1px solid #93c5fd',
                  display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <Loader size={16} color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '14px', color: '#1e40af', fontWeight: '500' }}>{generateProgress}</span>
                </div>
              )}

              {libraryTemplates.length === 0 ? (
                <div style={{
                  padding: '32px 16px', textAlign: 'center', color: theme.textMuted
                }}>
                  <Info size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <p style={{ fontSize: '14px', margin: 0 }}>No ready templates found. Configure templates in Document Rules first.</p>
                </div>
              ) : (
                <>
                  {/* Package quick-select */}
                  {packageTemplateKeys.length > 0 && (
                    <div style={{
                      marginBottom: '20px', padding: '16px', borderRadius: '10px',
                      backgroundColor: '#f0fdf4', border: '1px solid #86efac'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Package size={16} color="#166534" />
                          <span style={{ fontSize: '14px', fontWeight: '600', color: '#166534' }}>
                            Package Templates
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            const pkgTemplates = libraryTemplates.filter(t => packageTemplateKeys.includes(getTemplateKey(t)))
                            const allSelected = pkgTemplates.every(t => selectedTemplates.has(getTemplateKey(t)))
                            const next = new Set(selectedTemplates)
                            pkgTemplates.forEach(t => {
                              if (allSelected) next.delete(getTemplateKey(t))
                              else next.add(getTemplateKey(t))
                            })
                            setSelectedTemplates(next)
                          }}
                          style={{
                            padding: '4px 10px', fontSize: '12px', fontWeight: '500',
                            backgroundColor: '#dcfce7', color: '#166534', border: '1px solid #86efac',
                            borderRadius: '6px', cursor: 'pointer'
                          }}
                        >
                          {libraryTemplates.filter(t => packageTemplateKeys.includes(getTemplateKey(t))).every(t => selectedTemplates.has(getTemplateKey(t)))
                            ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      {libraryTemplates.filter(t => packageTemplateKeys.includes(getTemplateKey(t))).map(t => {
                        const key = getTemplateKey(t)
                        return (
                          <label key={key} style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0',
                            cursor: 'pointer', fontSize: '13px', color: '#166534'
                          }}>
                            <input
                              type="checkbox"
                              checked={selectedTemplates.has(key)}
                              onChange={() => {
                                const next = new Set(selectedTemplates)
                                next.has(key) ? next.delete(key) : next.add(key)
                                setSelectedTemplates(next)
                              }}
                            />
                            <span style={{ flex: 1 }}>{t.form_name}</span>
                            {(() => {
                              const cat = (t.category || 'CUSTOM').toUpperCase()
                              const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS.CUSTOM
                              return (
                                <span style={{
                                  padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '500',
                                  backgroundColor: colors.bg, color: colors.text
                                }}>{cat}</span>
                              )
                            })()}
                          </label>
                        )
                      })}
                    </div>
                  )}

                  {/* All templates grouped by category */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>All Templates</span>
                      <button
                        onClick={() => {
                          if (selectedTemplates.size === libraryTemplates.length) {
                            setSelectedTemplates(new Set())
                          } else {
                            setSelectedTemplates(new Set(libraryTemplates.map(getTemplateKey)))
                          }
                        }}
                        style={{
                          padding: '4px 10px', fontSize: '12px', fontWeight: '500',
                          backgroundColor: theme.accentBg, color: theme.accent,
                          border: `1px solid ${theme.accent}`, borderRadius: '6px', cursor: 'pointer'
                        }}
                      >
                        {selectedTemplates.size === libraryTemplates.length ? 'Deselect All' : 'Select All'}
                      </button>
                    </div>
                    {Object.entries(
                      libraryTemplates.reduce((groups, t) => {
                        const cat = (t.category || 'CUSTOM').toUpperCase()
                        if (!groups[cat]) groups[cat] = []
                        groups[cat].push(t)
                        return groups
                      }, {})
                    ).map(([cat, templates]) => {
                      const colors = CATEGORY_COLORS[cat] || CATEGORY_COLORS.CUSTOM
                      return (
                        <div key={cat} style={{ marginBottom: '14px' }}>
                          <div style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: '4px', fontSize: '11px',
                            fontWeight: '600', backgroundColor: colors.bg, color: colors.text, marginBottom: '8px'
                          }}>{cat}</div>
                          {templates.map(t => {
                            const key = getTemplateKey(t)
                            const isExcel = /\.xlsx$/i.test(t.file_path || '') || /\.xlsx$/i.test(t.file_name || '')
                            return (
                              <label key={key} style={{
                                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 10px',
                                borderRadius: '8px', cursor: 'pointer', marginBottom: '2px',
                                backgroundColor: selectedTemplates.has(key) ? theme.accentBg : 'transparent',
                                transition: 'background-color 0.15s'
                              }}>
                                <input
                                  type="checkbox"
                                  checked={selectedTemplates.has(key)}
                                  onChange={() => {
                                    const next = new Set(selectedTemplates)
                                    next.has(key) ? next.delete(key) : next.add(key)
                                    setSelectedTemplates(next)
                                  }}
                                />
                                <FileText size={14} color={isExcel ? '#16a34a' : '#dc2626'} />
                                <span style={{ flex: 1, fontSize: '13px', color: theme.text }}>{t.form_name}</span>
                                <span style={{
                                  padding: '2px 6px', borderRadius: '4px', fontSize: '10px', fontWeight: '600',
                                  backgroundColor: isExcel ? '#dcfce7' : '#fee2e2',
                                  color: isExcel ? '#16a34a' : '#dc2626'
                                }}>{isExcel ? 'XLSX' : 'PDF'}</span>
                              </label>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: isMobile ? '16px' : '16px 20px',
              borderTop: `1px solid ${theme.border}`
            }}>
              <span style={{ fontSize: '13px', color: theme.textMuted }}>
                {selectedTemplates.size} selected
              </span>
              <button
                onClick={handleGenerateSelected}
                disabled={generating || selectedTemplates.size === 0}
                style={{
                  padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
                  border: 'none', borderRadius: '8px', cursor: generating || selectedTemplates.size === 0 ? 'not-allowed' : 'pointer',
                  fontSize: '14px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px',
                  opacity: generating || selectedTemplates.size === 0 ? 0.6 : 1
                }}
              >
                {generating ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Check size={16} />}
                {generating ? 'Generating...' : 'Generate Selected'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add Line Item Modal */}
      {showAddLine && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard, borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            width: '100%', maxWidth: '400px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Add Line Item</h2>
              <button onClick={() => setShowAddLine(false)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Product/Service</label>
                <select value={newLine.item_id} onChange={(e) => setNewLine(prev => ({ ...prev, item_id: e.target.value }))} style={inputStyle}>
                  <option value="">-- Select --</option>
                  {products.filter(p => p.active).map(product => (
                    <option key={product.id} value={product.id}>{product.name} - {formatCurrency(product.unit_price)}</option>
                  ))}
                </select>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Quantity</label>
                <input type="number" value={newLine.quantity} onChange={(e) => setNewLine(prev => ({ ...prev, quantity: parseInt(e.target.value) || 1 }))} min="1" style={inputStyle} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowAddLine(false)} style={{ flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.text, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={addLineItem} disabled={saving || !newLine.item_id} style={{ flex: 1, padding: '10px 16px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', opacity: saving || !newLine.item_id ? 0.6 : 1 }}>{saving ? 'Adding...' : 'Add Item'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Time Entry Modal */}
      {showAddTime && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 50
        }}>
          <div style={{
            backgroundColor: theme.bgCard, borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
            width: '100%', maxWidth: '400px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Add Time Entry</h2>
              <button onClick={() => setShowAddTime(false)} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Employee</label>
                <select value={newTime.employee_id} onChange={(e) => setNewTime(prev => ({ ...prev, employee_id: e.target.value }))} style={inputStyle}>
                  <option value="">-- Select --</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Hours</label>
                  <input type="number" value={newTime.hours} onChange={(e) => setNewTime(prev => ({ ...prev, hours: e.target.value }))} step="0.25" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select value={newTime.category} onChange={(e) => setNewTime(prev => ({ ...prev, category: e.target.value }))} style={inputStyle}>
                    <option value="Regular">Regular</option>
                    <option value="Overtime">Overtime</option>
                    <option value="Travel">Travel</option>
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Notes</label>
                <textarea value={newTime.notes} onChange={(e) => setNewTime(prev => ({ ...prev, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowAddTime(false)} style={{ flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.text, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={addTimeEntry} disabled={saving || !newTime.employee_id || !newTime.hours} style={{ flex: 1, padding: '10px 16px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer', opacity: saving || !newTime.employee_id || !newTime.hours ? 0.6 : 1 }}>{saving ? 'Adding...' : 'Add Time'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Section Modal */}
      {showSectionModal && (
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
            width: '100%',
            maxWidth: '480px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
                {editingSection ? 'Edit Section' : 'Add Section'}
              </h2>
              <button
                onClick={() => {
                  setShowSectionModal(false)
                  setEditingSection(null)
                  resetSectionForm()
                }}
                style={{
                  padding: '8px',
                  minWidth: '44px',
                  minHeight: '44px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              {sectionFormError && (
                <div style={{
                  padding: '12px 16px',
                  backgroundColor: '#fef2f2',
                  borderRadius: '8px',
                  marginBottom: '16px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px'
                }}>
                  <AlertCircle size={16} style={{ color: '#ef4444' }} />
                  <span style={{ fontSize: '13px', color: '#dc2626' }}>{sectionFormError}</span>
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Section Name *</label>
                  <input
                    type="text"
                    value={sectionForm.name}
                    onChange={(e) => setSectionForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Install fixtures"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea
                    value={sectionForm.description}
                    onChange={(e) => setSectionForm(prev => ({ ...prev, description: e.target.value }))}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>
                      % of Job
                      <span style={{ fontSize: '10px', color: theme.textMuted, fontWeight: '400', marginLeft: '4px' }}>
                        ({getRemainingSectionPercent()}% avail)
                      </span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={sectionForm.percent_of_job}
                      onChange={(e) => setSectionForm(prev => ({ ...prev, percent_of_job: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Est. Hours</label>
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={sectionForm.estimated_hours}
                      onChange={(e) => setSectionForm(prev => ({ ...prev, estimated_hours: e.target.value }))}
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Status</label>
                  <select
                    value={sectionForm.status}
                    onChange={(e) => setSectionForm(prev => ({ ...prev, status: e.target.value }))}
                    style={inputStyle}
                  >
                    {effectiveSectionStatuses.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Assign To</label>
                  <select
                    value={sectionForm.assigned_to}
                    onChange={(e) => setSectionForm(prev => ({ ...prev, assigned_to: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">-- Select Employee --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Scheduled Date</label>
                  <input
                    type="date"
                    value={sectionForm.scheduled_date}
                    onChange={(e) => setSectionForm(prev => ({ ...prev, scheduled_date: e.target.value }))}
                    style={inputStyle}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  onClick={() => {
                    setShowSectionModal(false)
                    setEditingSection(null)
                    resetSectionForm()
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    minHeight: '44px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent',
                    color: theme.text,
                    borderRadius: '8px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveSection}
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    minHeight: '44px',
                    backgroundColor: theme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '500',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    opacity: saving ? 0.6 : 1
                  }}
                >
                  <Save size={16} />
                  {saving ? 'Saving...' : (editingSection ? 'Update' : 'Add')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect, useRef, Component } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import HelpBadge from '../components/HelpBadge'
import DealBreadcrumb from '../components/DealBreadcrumb'
import { isAdmin as checkAdmin } from '../lib/accessControl'
import {
  ArrowLeft, Plus, Trash2, MapPin, Clock, FileText, ExternalLink,
  Play, CheckCircle, Pencil, X, DollarSign, Calendar, User, Building2,
  Edit2, Save, AlertCircle, GripVertical, CheckCircle2, Paperclip, Download, Upload,
  Package, Loader, Check, Info, Eye, Zap, Camera, ChevronDown, ChevronRight, Image, Copy,
  Shield, Star, Receipt, Link2, TrendingUp, Search
} from 'lucide-react'
import { buildDataContext, generateAndUploadTemplate } from '../lib/documentGenerator'
import JobCostingModal from '../components/JobCostingModal'

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
  'Chillin': { bg: 'rgba(99,130,191,0.12)', text: '#6382bf' },
  'Scheduled': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
  'In Progress': { bg: 'rgba(194,139,56,0.12)', text: '#c28b38' },
  'Completed': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' },
  'Cancelled': { bg: 'rgba(139,90,90,0.12)', text: '#8b5a5a' },
  'On Hold': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' }
}

class JobDetailErrorBoundary extends Component {
  constructor(props) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error) { return { error } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '24px', maxWidth: '600px', margin: '0 auto' }}>
          <h2 style={{ color: '#dc2626', marginBottom: '12px' }}>JobDetail Error</h2>
          <pre style={{ padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', whiteSpace: 'pre-wrap', fontSize: '13px', color: '#991b1b' }}>
            {this.state.error.message}
            {'\n\n'}
            {this.state.error.stack}
          </pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: '12px', padding: '8px 16px', backgroundColor: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer' }}>Reload</button>
        </div>
      )
    }
    return this.props.children
  }
}

export default function JobDetailWrapper() {
  return <JobDetailErrorBoundary><JobDetailInner /></JobDetailErrorBoundary>
}

function JobDetailInner() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const products = useStore((state) => state.products)
  const employees = useStore((state) => state.employees)
  const timeLogs = useStore((state) => state.timeLogs)
  const fetchJobs = useStore((state) => state.fetchJobs)
  const fetchTimeLogs = useStore((state) => state.fetchTimeLogs)
  const isAdmin = checkAdmin(useStore((state) => state.user))
  const customers = useStore((state) => state.customers)
  const storeJobStatuses = useStore((state) => state.jobStatuses)
  const businessUnits = useStore((state) => state.businessUnits)
  const storeJobSectionStatuses = useStore((state) => state.jobSectionStatuses)
  const settings = useStore((state) => state.settings)

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
  const [allottedSource, setAllottedSource] = useState(null) // 'product' | 'rate' | null
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [showAddLine, setShowAddLine] = useState(false)
  const [showAddTime, setShowAddTime] = useState(false)
  const [newLine, setNewLine] = useState({ item_id: '', quantity: 1 })
  const [productGroups, setProductGroups] = useState([])
  const [selectedServiceType, setSelectedServiceType] = useState(null)
  const [selectedGroupId, setSelectedGroupId] = useState(null)
  const [productSearch, setProductSearch] = useState('')
  const [newTime, setNewTime] = useState({ employee_id: '', hours: '', category: 'Regular', notes: '' })
  const [editMode, setEditMode] = useState(false)
  const [formData, setFormData] = useState({})
  const [customerSearchText, setCustomerSearchText] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const [leadMeter, setLeadMeter] = useState(null)
  const [leadEin, setLeadEin] = useState(null)
  const [jobInvoices, setJobInvoices] = useState([])
  const [jobUtilityInvoices, setJobUtilityInvoices] = useState([])
  const [localIncentive, setLocalIncentive] = useState('')

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

  // Photo state
  const [linePhotos, setLinePhotos] = useState({}) // { [lineId]: attachment[] }
  const [notesPhotos, setNotesPhotos] = useState([]) // attachment[]
  const [auditPhotos, setAuditPhotos] = useState([]) // { url, name }[]
  const [expandedLineId, setExpandedLineId] = useState(null)
  const [viewingPhoto, setViewingPhoto] = useState(null) // { url, name }
  const photoInputRef = useRef(null)
  const [photoUploadTarget, setPhotoUploadTarget] = useState(null) // { lineId, context }

  // Victor verifications
  const [verificationReports, setVerificationReports] = useState([])
  const [verificationPhotos, setVerificationPhotos] = useState({}) // { [reportId]: [{url, photoType, aiScore}] }
  const [lineVerificationPhotos, setLineVerificationPhotos] = useState({}) // { [lineId]: [{url, aiScore}] }
  const [verificationsExpanded, setVerificationsExpanded] = useState(false)

  // Generate from Library state
  const [showGenerateModal, setShowGenerateModal] = useState(false)
  const [libraryTemplates, setLibraryTemplates] = useState([])
  const [packageTemplateKeys, setPackageTemplateKeys] = useState([])
  const [selectedTemplates, setSelectedTemplates] = useState(new Set())
  const [generating, setGenerating] = useState(false)
  const [generateProgress, setGenerateProgress] = useState('')

  // Job costing & expenses
  const [showCostingModal, setShowCostingModal] = useState(false)
  const [jobExpenses, setJobExpenses] = useState([])
  const [showAddExpense, setShowAddExpense] = useState(false)
  const [expenseForm, setExpenseForm] = useState({ amount: '', merchant: '', category: 'Materials', notes: '' })
  const [receiptUploading, setReceiptUploading] = useState(false)
  const receiptInputRef = useRef(null)
  const [showStatusDropdown, setShowStatusDropdown] = useState(false)
  const statusDropdownRef = useRef(null)

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
    fetchJobExpenses()
    // Fetch product groups for line item picker
    supabase.from('product_groups').select('*').eq('company_id', companyId).order('sort_order')
      .then(({ data }) => setProductGroups(data || []))
  }, [companyId, id, navigate])

  useEffect(() => {
    // Filter time logs for this job
    setJobTimeLogs(timeLogs.filter(t => t.job_id === parseInt(id)))
  }, [timeLogs, id])

  // Close status dropdown on outside click
  useEffect(() => {
    if (!showStatusDropdown) return
    const handleClick = (e) => {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(e.target)) {
        setShowStatusDropdown(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [showStatusDropdown])

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
      setLocalIncentive(jobData.utility_incentive || '')

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
        .select('*, item:products_services(id, name, description, allotted_time_hours, cost)')
        .eq('job_id', id)
        .order('id')

      setLineItems(lines || [])

      // Auto-calculate allotted time: ALL product hours OR ALL from hourly rate (not mixed)
      const loadedLines = lines || []
      const allLinesHaveHours = loadedLines.length > 0 && loadedLines.every(l => parseFloat(l.item?.allotted_time_hours) > 0)
      const productHoursSum = allLinesHaveHours
        ? loadedLines.reduce((sum, l) => sum + (parseFloat(l.item?.allotted_time_hours) || 0) * (parseFloat(l.quantity) || 1), 0)
        : 0

      let calculatedHours = productHoursSum
      let source = productHoursSum > 0 ? 'product' : null
      if (calculatedHours === 0 && jobData.job_total) {
        // Look up per-business-unit hourly rate
        const storeSettings = useStore.getState().settings || []
        const ratesSetting = storeSettings.find(s => s.key === 'default_hourly_rates')
        let rate = 0
        if (ratesSetting) {
          try {
            const ratesMap = JSON.parse(ratesSetting.value) || {}
            rate = parseFloat(ratesMap[jobData.business_unit]) || 0
          } catch {}
        }
        // Fallback to legacy single rate
        if (rate === 0) {
          const oldSetting = storeSettings.find(s => s.key === 'default_hourly_rate')
          if (oldSetting) {
            try { rate = parseFloat(JSON.parse(oldSetting.value)) || 0 } catch {}
          }
        }
        if (rate > 0) {
          calculatedHours = Math.round((parseFloat(jobData.job_total) / rate) * 100) / 100
          source = 'rate'
        }
      }
      setAllottedSource(source)

      if (calculatedHours > 0) {
        const currentAllotted = parseFloat(jobData.allotted_time_hours) || 0
        const calcRounded = Math.round(calculatedHours * 100) / 100
        if (calcRounded !== currentAllotted) {
          await supabase.from('jobs').update({
            allotted_time_hours: calcRounded,
            calculated_allotted_time: calcRounded
          }).eq('id', id)
          setJob(prev => ({ ...prev, allotted_time_hours: calcRounded, calculated_allotted_time: calcRounded }))
          setFormData(prev => ({ ...prev, allotted_time_hours: calcRounded }))
        }
      }

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
      let allAttachments = byJob || []
      if (!allAttachments.length && jobData.lead_id) {
        const { data: byLead } = await supabase.from('file_attachments').select('*').eq('lead_id', jobData.lead_id).order('created_at', { ascending: false })
        allAttachments = byLead || []
      }

      // Separate photo attachments from document attachments
      const isPhoto = (att) => att.photo_context && att.file_type?.startsWith('image/')
      const docAttachments = allAttachments.filter(a => !isPhoto(a))
      const photoAttachments = allAttachments.filter(a => isPhoto(a))
      setAttachments(docAttachments)

      // Group line photos by job_line_id
      const grouped = {}
      const notePhotos = []
      for (const p of photoAttachments) {
        if (p.photo_context === 'notes') {
          notePhotos.push(p)
        } else if (p.job_line_id) {
          if (!grouped[p.job_line_id]) grouped[p.job_line_id] = []
          grouped[p.job_line_id].push(p)
        }
      }
      setLinePhotos(grouped)
      setNotesPhotos(notePhotos)

      // Fetch audit photos if job has lead_id
      if (jobData.lead_id) {
        try {
          const { data: auditData } = await supabase
            .from('lighting_audits')
            .select('id')
            .eq('lead_id', jobData.lead_id)
            .limit(1)
            .single()
          if (auditData?.id) {
            const { data: files } = await supabase.storage
              .from('audit-photos')
              .list(`audits/${auditData.id}`, { search: 'photo_' })
            if (files?.length) {
              const photos = files
                .filter(f => f.name?.startsWith('photo_'))
                .sort((a, b) => a.name.localeCompare(b.name))
                .map(f => {
                  const { data: urlData } = supabase.storage.from('audit-photos').getPublicUrl(`audits/${auditData.id}/${f.name}`)
                  return { url: urlData.publicUrl, name: f.name }
                })
              setAuditPhotos(photos)
            } else {
              setAuditPhotos([])
            }
          } else {
            setAuditPhotos([])
          }
        } catch (_) {
          setAuditPhotos([])
        }
      } else {
        setAuditPhotos([])
      }
    }

    // Fetch Victor verification reports for this job
    const { data: verReports } = await supabase
      .from('verification_reports')
      .select('id, verification_type, score, grade, summary, status, created_at, verified_by, ai_analysis')
      .eq('job_id', id)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    setVerificationReports(verReports || [])

    // Fetch verification photos for this job
    if (verReports?.length) {
      const { data: vPhotos } = await supabase
        .from('verification_photos')
        .select('id, verification_id, file_path, storage_bucket, photo_type, ai_score')
        .eq('job_id', id)
        .eq('company_id', companyId)
      if (vPhotos?.length) {
        const grouped = {}
        const lineVPhotos = {}
        for (const p of vPhotos) {
          const bucket = p.storage_bucket || 'project-documents'
          const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(p.file_path)
          if (!grouped[p.verification_id]) grouped[p.verification_id] = []
          grouped[p.verification_id].push({
            id: p.id,
            url: urlData.publicUrl,
            photoType: p.photo_type,
            aiScore: p.ai_score
          })
          // Group line_item verification photos by matching line item
          if (p.photo_type === 'line_item' && lines?.length) {
            const pathSegment = p.file_path.split('/').pop() || ''
            const match = pathSegment.match(/^lineitem_(.+?)_\d+_/)
            if (match) {
              const photoLineName = match[1].replace(/_/g, ' ')
              const matchedLine = lines.find(l => {
                const name = (l.item?.name || l.description || '').toLowerCase()
                return name === photoLineName.toLowerCase() || name.replace(/[^a-z0-9]/g, '') === photoLineName.replace(/[^a-z0-9]/g, '').toLowerCase()
              })
              if (matchedLine) {
                if (!lineVPhotos[matchedLine.id]) lineVPhotos[matchedLine.id] = []
                lineVPhotos[matchedLine.id].push({ url: urlData.publicUrl, aiScore: p.ai_score })
              }
            }
          }
        }
        setVerificationPhotos(grouped)
        setLineVerificationPhotos(lineVPhotos)
      } else {
        setVerificationPhotos({})
        setLineVerificationPhotos({})
      }
    } else {
      setVerificationPhotos({})
      setLineVerificationPhotos({})
    }

    setLoading(false)
  }

  const fetchJobExpenses = async () => {
    const { data } = await supabase
      .from('expenses')
      .select('*')
      .eq('job_id', parseInt(id))
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
    setJobExpenses(data || [])
  }

  const handleReceiptCapture = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !job) return
    setReceiptUploading(true)

    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `jobs/${id}/receipts/${timestamp}_${safeName}`

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
      job_id: parseInt(id),
      amount: 0,
      category: 'Materials',
      date: new Date().toISOString().split('T')[0],
      description: 'Receipt capture',
      receipt_url: urlData.publicUrl,
      receipt_storage_path: storagePath,
      source: 'receipt'
    }])

    await fetchJobExpenses()
    setReceiptUploading(false)
    if (receiptInputRef.current) receiptInputRef.current.value = ''
  }

  const handleAddJobExpense = async () => {
    if (!expenseForm.amount) return
    await supabase.from('expenses').insert([{
      company_id: companyId,
      job_id: parseInt(id),
      amount: parseFloat(expenseForm.amount) || 0,
      category: expenseForm.category || 'Other',
      vendor: expenseForm.merchant || null,
      description: expenseForm.notes || null,
      date: new Date().toISOString().split('T')[0],
    }])
    await fetchJobExpenses()
    setExpenseForm({ amount: '', merchant: '', category: 'Materials', notes: '' })
    setShowAddExpense(false)
  }

  const handleDeleteExpense = async (expId) => {
    if (!confirm('Delete this expense?')) return
    await supabase.from('expenses').delete().eq('id', expId)
    await fetchJobExpenses()
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

  const duplicateLineItem = async (line) => {
    setSaving(true)
    await supabase.from('job_lines').insert([{
      company_id: companyId,
      job_id: parseInt(id),
      item_id: line.item_id,
      quantity: line.quantity,
      price: line.price,
      total: line.total,
      notes: line.notes || null
    }])
    await fetchJobData()
    setSaving(false)
  }

  const handleJobLineNotesChange = async (lineId, newNotes) => {
    setLineItems(prev => prev.map(l => l.id === lineId ? { ...l, notes: newNotes } : l))
    await supabase.from('job_lines').update({ notes: newNotes || null }).eq('id', lineId)
  }

  const removeLineItem = async (lineId) => {
    setSaving(true)
    await supabase.from('job_lines').delete().eq('id', lineId)
    await fetchJobData()
    setSaving(false)
  }

  const handleJobLinePhotoUpload = async (lineId, e) => {
    const file = e.target.files?.[0]
    if (!file) return

    const ext = file.name.split('.').pop()
    const path = `jobs/${id}/lines/${lineId}/${Date.now()}.${ext}`

    const { error: uploadErr } = await supabase.storage
      .from('project-documents')
      .upload(path, file)
    if (uploadErr) {
      const { toast } = await import('../lib/toast')
      toast.error('Photo upload failed: ' + uploadErr.message)
      return
    }

    const { data: urlData } = supabase.storage.from('project-documents').getPublicUrl(path)
    const photoUrl = urlData.publicUrl

    const line = lineItems.find(l => l.id === lineId)
    const updatedPhotos = [...(line?.photos || []), photoUrl]

    setLineItems(prev => prev.map(l => l.id === lineId ? { ...l, photos: updatedPhotos } : l))
    await supabase.from('job_lines').update({ photos: updatedPhotos }).eq('id', lineId)
  }

  const handleJobLinePhotoDelete = async (lineId, photoUrl) => {
    const line = lineItems.find(l => l.id === lineId)
    const updatedPhotos = (line?.photos || []).filter(p => p !== photoUrl)

    setLineItems(prev => prev.map(l => l.id === lineId ? { ...l, photos: updatedPhotos } : l))
    await supabase.from('job_lines').update({ photos: updatedPhotos }).eq('id', lineId)

    try {
      const url = new URL(photoUrl)
      const storagePath = url.pathname.split('/object/public/project-documents/')[1]
      if (storagePath) {
        await supabase.storage.from('project-documents').remove([decodeURIComponent(storagePath)])
      }
    } catch (_) { /* ignore */ }
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
        total: ql.line_total || ql.total,
        photos: ql.photos || []
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
        'Chillin': 'Job Scheduled',
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
    if (!formData.business_unit) {
      alert('Business Unit is required.')
      return
    }
    setSaving(true)
    const updates = {
      job_title: formData.job_title,
      job_address: formData.job_address,
      start_date: formData.start_date,
      end_date: formData.end_date,
      assigned_team: formData.assigned_team,
      allotted_time_hours: formData.allotted_time_hours,
      details: formData.details,
      notes: formData.notes,
      salesperson_id: formData.salesperson_id || null,
      business_unit: formData.business_unit,
      updated_at: new Date().toISOString()
    }
    if (formData.customer_id) updates.customer_id = formData.customer_id
    await supabase.from('jobs').update(updates).eq('id', id)
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
    setSaving(true)
    const { toast } = await import('../lib/toast')

    try {
      let utilityName = 'Utility'
      let totalFixtures = 0
      let incentiveAmount = parseFloat(job.utility_incentive) || 0
      let projectCost = 0
      let netCost = 0
      let notes = ''

      // Try to pull details from linked lighting audit
      if (job.lead_id) {
        const { data: audits } = await supabase
          .from('lighting_audits')
          .select('*, utility_provider:utility_providers!lighting_audits_utility_provider_id_fkey(id, provider_name)')
          .eq('lead_id', job.lead_id)
          .order('created_at', { ascending: false })
          .limit(1)

        const audit = audits?.[0]
        if (audit) {
          utilityName = audit.utility_provider?.provider_name || 'Utility'
          totalFixtures = audit.total_fixtures || 0
          incentiveAmount = audit.estimated_rebate || incentiveAmount
          projectCost = audit.est_project_cost || 0
          netCost = audit.net_cost || 0
          notes = `Lighting Audit — ${totalFixtures} fixtures, ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(incentiveAmount)} incentive`
        }
      }

      // Fall back to hand-entered incentive on the job
      if (!incentiveAmount) {
        toast.error('No incentive amount found. Enter a utility incentive on this job first.')
        setSaving(false)
        return
      }

      if (!notes) {
        notes = `Utility Incentive — ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(incentiveAmount)}`
      }

      const { error } = await supabase
        .from('utility_invoices')
        .insert([{
          company_id: companyId,
          job_id: parseInt(id),
          lead_id: job.lead_id || null,
          customer_name: job.customer?.name || '',
          utility_name: utilityName,
          amount: incentiveAmount,
          project_cost: projectCost,
          incentive_amount: incentiveAmount,
          net_cost: netCost,
          payment_status: 'Pending',
          notes
        }])

      if (error) {
        toast.error('Failed to create utility incentive: ' + error.message)
      } else {
        toast.success('Utility incentive invoice created')
        await fetchJobData()
      }
    } catch (err) {
      toast.error('Error creating utility incentive')
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

  // Photo upload handler
  const handleUploadPhoto = async (e) => {
    const file = e.target.files?.[0]
    if (!file || !photoUploadTarget) return
    e.target.value = ''

    const { lineId, context } = photoUploadTarget
    setPhotoUploadTarget(null)

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const subPath = context === 'notes' ? 'notes' : `${context}/${lineId}`
    const filePath = `jobs/${id}/photos/${subPath}/${Date.now()}_${safeName}`

    const { error: uploadError } = await supabase.storage
      .from('project-documents')
      .upload(filePath, file)

    if (uploadError) {
      alert('Upload failed: ' + uploadError.message)
      return
    }

    const insertData = {
      company_id: companyId,
      job_id: parseInt(id),
      lead_id: job.lead_id || null,
      file_name: file.name,
      file_path: filePath,
      file_type: file.type || null,
      file_size: file.size,
      storage_bucket: 'project-documents',
      photo_context: context,
    }
    if (lineId && context !== 'notes') insertData.job_line_id = lineId

    const { error: dbError } = await supabase.from('file_attachments').insert(insertData)
    if (dbError) {
      alert('Failed to save photo record: ' + dbError.message)
      return
    }
    await fetchJobData()
  }

  const handleDeletePhoto = async (att) => {
    if (!confirm('Delete this photo?')) return
    await supabase.from('file_attachments').delete().eq('id', att.id)
    await supabase.storage.from(att.storage_bucket).remove([att.file_path])
    await fetchJobData()
  }

  const triggerPhotoInput = (lineId, context) => {
    setPhotoUploadTarget({ lineId, context })
    setTimeout(() => photoInputRef.current?.click(), 50)
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
    // Delete or nullify related records before deleting the job (no CASCADE)
    await Promise.all([
      supabase.from('time_log').update({ job_id: null }).eq('job_id', id),
      supabase.from('expenses').update({ job_id: null }).eq('job_id', id),
      supabase.from('invoices').delete().eq('job_id', id),
      supabase.from('utility_invoices').delete().eq('job_id', id),
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

  // Budget: sum of product cost * qty + 3% sundry
  const productCostTotal = lineItems.reduce((sum, l) => {
    const cost = parseFloat(l.item?.cost) || 0
    const qty = parseFloat(l.quantity) || 1
    return sum + (cost * qty)
  }, 0)
  const sundryAmount = productCostTotal * 0.03
  const totalBudget = productCostTotal + sundryAmount

  // Build job statuses from store (DB-driven) with fallback to hardcoded
  const effectiveJobStatuses = (() => {
    if (storeJobStatuses && storeJobStatuses.length > 0) {
      return storeJobStatuses.map(s => {
        if (typeof s === 'string') return { id: s, name: s, color: statusColors[s]?.text || '#9ca3af' }
        return { id: s.id || s.name, name: s.name, color: s.color || statusColors[s.name]?.text || '#9ca3af' }
      })
    }
    return Object.entries(statusColors).map(([name, c]) => ({ id: name, name, color: c.text }))
  })()

  const getStatusStyle = (status) => {
    const found = effectiveJobStatuses.find(s => s.id === status || s.name === status)
    if (found) return { bg: found.color + '20', text: found.color }
    return statusColors[status] || { bg: '#f3f4f6', text: '#6b7280' }
  }

  const statusStyle = getStatusStyle(job.status)

  // Inline photo helpers
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

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Hidden photo file input */}
      <input type="file" ref={photoInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleUploadPhoto} />

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
        <div ref={statusDropdownRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setShowStatusDropdown(!showStatusDropdown)}
            disabled={saving}
            style={{
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '500',
              backgroundColor: statusStyle.bg,
              color: statusStyle.text,
              border: `1px solid ${statusStyle.text}30`,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            {job.status}
            <ChevronDown size={14} />
          </button>
          {showStatusDropdown && (
            <div style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '6px',
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '10px',
              boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
              zIndex: 50,
              minWidth: '160px',
              overflow: 'hidden',
            }}>
              {effectiveJobStatuses.map(statusObj => {
                const s = statusObj.id
                const sc = { bg: statusObj.color + '20', text: statusObj.color }
                const isActive = s === job.status
                return (
                  <button
                    key={s}
                    onClick={() => {
                      if (s !== job.status) updateJobStatus(s)
                      setShowStatusDropdown(false)
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '10px 14px',
                      border: 'none',
                      backgroundColor: isActive ? sc.bg : 'transparent',
                      color: isActive ? sc.text : theme.text,
                      fontSize: '13px',
                      fontWeight: isActive ? '600' : '400',
                      cursor: isActive ? 'default' : 'pointer',
                      textAlign: 'left',
                      borderBottom: `1px solid ${theme.border}`,
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.backgroundColor = sc.bg }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <span style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: sc.text,
                      flexShrink: 0,
                    }} />
                    {s}
                    {isActive && <Check size={14} style={{ marginLeft: 'auto' }} />}
                  </button>
                )
              })}
            </div>
          )}
        </div>
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
                onClick={() => {
                  if (!editMode) setCustomerSearchText(job.customer?.name || '')
                  setEditMode(!editMode)
                }}
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
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Job Title</label>
                    <input type="text" value={formData.job_title || ''} onChange={(e) => setFormData(prev => ({ ...prev, job_title: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Business Unit *</label>
                    <select
                      value={formData.business_unit || ''}
                      onChange={(e) => setFormData(prev => ({ ...prev, business_unit: e.target.value }))}
                      style={{ ...inputStyle, borderColor: !formData.business_unit ? '#ef4444' : inputStyle.borderColor }}
                    >
                      <option value="">-- Select --</option>
                      {(businessUnits || []).map(bu => {
                        const buName = typeof bu === 'object' ? bu.name : bu
                        return <option key={buName} value={buName}>{buName}</option>
                      })}
                    </select>
                    {!formData.business_unit && (
                      <span style={{ fontSize: '11px', color: '#ef4444', marginTop: '2px', display: 'block' }}>Required</span>
                    )}
                  </div>
                </div>
                <div style={{ position: 'relative' }}>
                  <label style={labelStyle}>Customer</label>
                  <div style={{ position: 'relative' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted, pointerEvents: 'none' }} />
                    <input
                      type="text"
                      value={customerSearchText}
                      onChange={(e) => {
                        setCustomerSearchText(e.target.value)
                        setShowCustomerDropdown(true)
                        if (!e.target.value) setFormData(prev => ({ ...prev, customer_id: '' }))
                      }}
                      onFocus={() => setShowCustomerDropdown(true)}
                      onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 200)}
                      placeholder="Type to search customers..."
                      style={{ ...inputStyle, paddingLeft: '32px' }}
                      autoComplete="off"
                    />
                    {customerSearchText && (
                      <button
                        type="button"
                        onClick={() => { setCustomerSearchText(''); setFormData(prev => ({ ...prev, customer_id: '' })); setShowCustomerDropdown(false) }}
                        style={{ position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px', color: theme.textMuted }}
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {showCustomerDropdown && (() => {
                    const filtered = (customers || []).filter(c =>
                      c.name?.toLowerCase().includes((customerSearchText || '').toLowerCase())
                    ).slice(0, 10)
                    return filtered.length > 0 ? (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                        backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
                        borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                        maxHeight: '200px', overflowY: 'auto', marginTop: '2px'
                      }}>
                        {filtered.map(c => (
                          <div
                            key={c.id}
                            onClick={() => {
                              setFormData(prev => ({ ...prev, customer_id: c.id }))
                              setCustomerSearchText(c.name)
                              setShowCustomerDropdown(false)
                            }}
                            style={{
                              padding: '10px 12px', cursor: 'pointer', fontSize: '14px',
                              color: theme.text, borderBottom: `1px solid ${theme.border}`,
                              backgroundColor: formData.customer_id === c.id ? theme.accentBg : 'transparent'
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                            onMouseLeave={(e) => e.currentTarget.style.backgroundColor = formData.customer_id === c.id ? theme.accentBg : 'transparent'}
                          >
                            {c.name}
                            {c.phone && <span style={{ fontSize: '12px', color: theme.textMuted, marginLeft: '8px' }}>{c.phone}</span>}
                          </div>
                        ))}
                      </div>
                    ) : null
                  })()}
                </div>
                <div>
                  <label style={labelStyle}>Sales Owner</label>
                  <select
                    value={formData.salesperson_id || ''}
                    onChange={(e) => setFormData(prev => ({ ...prev, salesperson_id: e.target.value ? parseInt(e.target.value) : null }))}
                    style={inputStyle}
                  >
                    <option value="">-- Select --</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
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
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Business Unit</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.business_unit || '-'}</p>
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
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Sales Owner</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.salesperson?.name || '-'}</p>
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
                  display: 'grid', gridTemplateColumns: '20px 2fr 80px 100px 100px 40px', gap: '12px',
                  padding: '12px 20px', backgroundColor: theme.accentBg,
                  fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px'
                }}>
                  <div></div>
                  <div>Item</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                  <div style={{ textAlign: 'right' }}>Price</div>
                  <div style={{ textAlign: 'right' }}>Total</div>
                  <div></div>
                </div>
                {lineItems.map((line) => {
                  const auditPhotos = line.photos || []
                  const attPhotoCount = (linePhotos[line.id] || []).length
                  const victorPhotos = lineVerificationPhotos[line.id] || []
                  const totalPhotoCount = auditPhotos.length + attPhotoCount + victorPhotos.length
                  const isExpanded = expandedLineId === line.id
                  const beforePhotos = (linePhotos[line.id] || []).filter(p => p.photo_context === 'line_before')
                  const afterPhotos = (linePhotos[line.id] || []).filter(p => p.photo_context === 'line_after')
                  return (
                    <div key={line.id}>
                      <div
                        onClick={() => setExpandedLineId(isExpanded ? null : line.id)}
                        style={{
                          display: 'grid', gridTemplateColumns: '20px 2fr 80px 100px 100px 72px', gap: '12px',
                          padding: '14px 20px', borderBottom: `1px solid ${theme.border}`, alignItems: 'center', cursor: 'pointer'
                        }}
                      >
                        <div style={{ color: theme.textMuted, display: 'flex', alignItems: 'center' }}>
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px', margin: 0 }}>{line.item?.name || 'Unknown'}</p>
                          {line.notes && (
                            <span style={{ fontSize: '11px', backgroundColor: 'rgba(59,130,246,0.1)', color: '#3b82f6', padding: '2px 6px', borderRadius: '10px', fontWeight: '600' }}>
                              <FileText size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} />notes
                            </span>
                          )}
                          {totalPhotoCount > 0 && (
                            <span style={{ fontSize: '11px', backgroundColor: theme.accentBg, color: theme.accent, padding: '2px 6px', borderRadius: '10px', fontWeight: '600' }}>
                              <Camera size={10} style={{ marginRight: '3px', verticalAlign: 'middle' }} />{totalPhotoCount}
                            </span>
                          )}
                          {victorPhotos.length > 0 && (
                            <span style={{ fontSize: '11px', backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7', padding: '2px 6px', borderRadius: '10px', fontWeight: '600' }}>
                              Victor
                            </span>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '14px', color: theme.textSecondary }}>{line.quantity}</div>
                        <div style={{ textAlign: 'right', fontSize: '14px', color: theme.textSecondary }}>{formatCurrency(line.price)}</div>
                        <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatCurrency(line.total)}</div>
                        <div style={{ display: 'flex', gap: '2px', justifyContent: 'flex-end' }}>
                          <button onClick={(e) => { e.stopPropagation(); duplicateLineItem(line) }} title="Duplicate line" style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: theme.textMuted }}>
                            <Copy size={16} />
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); removeLineItem(line.id) }} title="Delete line" style={{ padding: '6px', backgroundColor: 'transparent', border: 'none', borderRadius: '6px', cursor: 'pointer', color: theme.textMuted }}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                      {isExpanded && (
                        <div style={{ padding: '12px 20px 16px', backgroundColor: theme.bg, borderBottom: `1px solid ${theme.border}` }}>
                          {/* Notes */}
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes</div>
                            <input
                              type="text"
                              placeholder="Line item notes..."
                              defaultValue={line.notes || ''}
                              onClick={(e) => e.stopPropagation()}
                              onBlur={(e) => {
                                const val = e.target.value.trim()
                                if (val !== (line.notes || '')) handleJobLineNotesChange(line.id, val)
                              }}
                              onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                              style={{
                                width: '100%',
                                padding: '6px 8px',
                                fontSize: '13px',
                                color: theme.textSecondary,
                                border: `1px solid ${theme.border}`,
                                borderRadius: '6px',
                                backgroundColor: theme.bgCard,
                                outline: 'none',
                                boxSizing: 'border-box'
                              }}
                            />
                          </div>
                          {/* Audit/Source Photos (editable) */}
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Photos</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {auditPhotos.map((url, idx) => (
                                <div key={`audit-${idx}`} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: `1px solid ${theme.border}` }}>
                                  <img
                                    src={url}
                                    alt={`Photo ${idx + 1}`}
                                    onClick={() => setViewingPhoto({ url, name: `${line.item?.name || 'Line'} Photo ${idx + 1}` })}
                                    style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                  />
                                  <button
                                    onClick={() => handleJobLinePhotoDelete(line.id, url)}
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
                                  onChange={(e) => handleJobLinePhotoUpload(line.id, e)}
                                />
                              </label>
                            </div>
                          </div>
                          {/* Before Photos (file_attachments) */}
                          <div style={{ marginBottom: '12px' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Before</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {beforePhotos.map(photo => (
                                <PhotoThumbnail key={photo.id} att={photo} theme={theme} onView={setViewingPhoto} onDelete={handleDeletePhoto} />
                              ))}
                              <AddPhotoButton theme={theme} onClick={() => triggerPhotoInput(line.id, 'line_before')} />
                            </div>
                          </div>
                          {/* After (Completion) Photos */}
                          <div style={{ marginBottom: victorPhotos.length > 0 ? '12px' : '0' }}>
                            <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>After (Completion)</div>
                            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                              {afterPhotos.map(photo => (
                                <PhotoThumbnail key={photo.id} att={photo} theme={theme} onView={setViewingPhoto} onDelete={handleDeletePhoto} />
                              ))}
                              <AddPhotoButton theme={theme} onClick={() => triggerPhotoInput(line.id, 'line_after')} />
                            </div>
                          </div>
                          {/* Victor Verification Photos (read-only) */}
                          {victorPhotos.length > 0 && (
                            <div>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: '#a855f7', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                Victor Verification
                              </div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {victorPhotos.map((vp, idx) => (
                                  <div key={`victor-${idx}`} style={{ position: 'relative', width: '72px', height: '72px', borderRadius: '8px', overflow: 'hidden', border: '2px solid rgba(168,85,247,0.3)' }}>
                                    <img
                                      src={vp.url}
                                      alt={`Verification ${idx + 1}`}
                                      onClick={() => setViewingPhoto({ url: vp.url, name: `Victor Verification ${idx + 1}` })}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'pointer' }}
                                    />
                                    {vp.aiScore != null && (
                                      <span style={{
                                        position: 'absolute', bottom: '2px', right: '2px',
                                        fontSize: '10px', fontWeight: '700', padding: '1px 4px', borderRadius: '4px',
                                        backgroundColor: vp.aiScore >= 80 ? '#22c55e' : vp.aiScore >= 60 ? '#eab308' : '#ef4444',
                                        color: '#fff'
                                      }}>
                                        {vp.aiScore}
                                      </span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
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
                      <span style={{ fontWeight: '500' }}>Customer Cost After Incentive</span>
                      <span style={{ fontWeight: '600' }}>{formatCurrency(outOfPocket)}</span>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Utility Incentive — always visible */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: 'rgba(74,124,89,0.08)',
              borderTop: `1px solid ${theme.border}`,
              borderRadius: '0 0 12px 12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#4a7c59', fontSize: '14px', fontWeight: '600' }}>Utility Incentive</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#4a7c59', fontSize: '14px' }}>$</span>
                  <input
                    type="number"
                    value={localIncentive}
                    onChange={(e) => setLocalIncentive(e.target.value)}
                    onBlur={async () => {
                      const val = parseFloat(localIncentive) || 0
                      if (val !== (parseFloat(job.utility_incentive) || 0)) {
                        await supabase.from('jobs').update({
                          utility_incentive: val,
                          updated_at: new Date().toISOString()
                        }).eq('id', id)
                        setJob(prev => ({ ...prev, utility_incentive: val }))
                      }
                    }}
                    placeholder="0.00"
                    style={{
                      width: '110px',
                      padding: '6px 10px',
                      textAlign: 'right',
                      border: `1px solid rgba(74,124,89,0.3)`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#4a7c59',
                      fontWeight: '600',
                      backgroundColor: theme.bgCard
                    }}
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
              {incentive > 0 && subtotal > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '13px', color: '#4a7c59' }}>
                  <span>Customer Cost After Incentive</span>
                  <span style={{ fontWeight: '600' }}>{formatCurrency(outOfPocket)}</span>
                </div>
              )}
            </div>
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
                <span style={{ fontSize: '13px', color: theme.textMuted }}>
                  {allottedHours}h allotted
                  {allottedSource && (
                    <span style={{ fontSize: '11px', color: theme.textMuted, marginLeft: '4px' }}>
                      ({allottedSource === 'product' ? 'from products' : 'from $/hr rate'})
                    </span>
                  )}
                </span>
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

            {/* Budget Summary */}
            {totalBudget > 0 && (
              <div style={{ padding: '12px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                  <span style={{ color: theme.textMuted }}>Material Cost:</span> ${productCostTotal.toFixed(2)}
                </div>
                <div style={{ fontSize: '13px', color: theme.textSecondary }}>
                  <span style={{ color: theme.textMuted }}>Sundry (3%):</span> ${sundryAmount.toFixed(2)}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>
                  <span style={{ color: theme.textMuted }}>Budget:</span> ${totalBudget.toFixed(2)}
                </div>
              </div>
            )}

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
              {/* Advance to next status button */}
              {(() => {
                const currentIdx = effectiveJobStatuses.findIndex(s => s.id === job.status || s.name === job.status)
                const nextStatus = currentIdx >= 0 && currentIdx < effectiveJobStatuses.length - 1
                  ? effectiveJobStatuses[currentIdx + 1] : null
                if (!nextStatus) return null
                return (
                  <button onClick={() => updateJobStatus(nextStatus.id)} disabled={saving} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '12px 16px', backgroundColor: nextStatus.color, color: '#ffffff',
                    border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
                  }}>
                    <ChevronRight size={18} />
                    Move to {nextStatus.name}
                  </button>
                )
              })()}
              {lineItems.length > 0 && job.invoice_status !== 'Invoiced' && job.invoice_status !== 'Paid' && jobInvoices.length === 0 && (
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
              {/* Paired Invoicing: Customer + Utility Incentive */}
              {parseFloat(job.utility_incentive) > 0 && (jobInvoices.length === 0 || jobUtilityInvoices.length === 0) && (
                <div style={{
                  border: `1px solid rgba(212,148,10,0.3)`,
                  borderRadius: '10px',
                  padding: '14px',
                  backgroundColor: 'rgba(212,148,10,0.05)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '10px' }}>
                    <Zap size={14} color="#d4940a" />
                    <span style={{ fontSize: '13px', fontWeight: '600', color: '#d4940a' }}>Lighting Project Invoicing</span>
                  </div>
                  {(() => {
                    const incentiveAmt = parseFloat(job.utility_incentive) || 0
                    const projectTotal = lineItems.reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0) || (parseFloat(job.quote?.quote_amount) || 0)
                    const customerOOP = projectTotal > 0 ? projectTotal - incentiveAmt : 0
                    return (
                      <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px', lineHeight: '1.6' }}>
                        {projectTotal > 0 && <div>Project: <strong>${projectTotal.toLocaleString()}</strong></div>}
                        <div>Utility Incentive: <strong style={{ color: '#d4940a' }}>${incentiveAmt.toLocaleString()}</strong></div>
                        {customerOOP > 0 && <div>Customer Copay: <strong>${customerOOP.toLocaleString()}</strong></div>}
                      </div>
                    )
                  })()}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {jobInvoices.length === 0 && (
                      <button onClick={createCustomerInvoice} disabled={saving} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        padding: '10px 14px', backgroundColor: theme.accentBg, color: theme.accent,
                        border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                      }}>
                        <DollarSign size={16} />
                        Customer Copayment Invoice
                      </button>
                    )}
                    {jobUtilityInvoices.length === 0 && (
                      <button onClick={createUtilityInvoice} disabled={saving} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        padding: '10px 14px', backgroundColor: 'rgba(212,148,10,0.12)', color: '#d4940a',
                        border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                      }}>
                        <Zap size={16} />
                        Utility Incentive Invoice
                      </button>
                    )}
                    {jobInvoices.length === 0 && jobUtilityInvoices.length === 0 && (
                      <button onClick={async () => { await createCustomerInvoice(); await createUtilityInvoice(); }} disabled={saving} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        padding: '10px 14px', backgroundColor: '#d4940a', color: '#ffffff',
                        border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600', cursor: 'pointer'
                      }}>
                        <FileText size={16} />
                        Create Both Invoices
                      </button>
                    )}
                  </div>
                </div>
              )}
              <button onClick={() => setShowCostingModal(true)} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                padding: '12px 16px', backgroundColor: 'rgba(59,130,246,0.12)', color: '#3b82f6',
                border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
              }}>
                <TrendingUp size={18} />
                Job Costing
              </button>

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
              <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Linked Estimate</h3>
              <button onClick={() => navigate(`/estimates/${job.quote_id}`)} style={{
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

          {/* Job Expenses */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Receipt size={16} style={{ color: theme.accent }} />
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Job Expenses ({jobExpenses.length})
                </h3>
              </div>
              <div style={{ display: 'flex', gap: '6px' }}>
                <input
                  type="file"
                  ref={receiptInputRef}
                  accept="image/*"
                  capture="environment"
                  style={{ display: 'none' }}
                  onChange={handleReceiptCapture}
                />
                <button
                  onClick={() => receiptInputRef.current?.click()}
                  disabled={receiptUploading}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '8px 12px', backgroundColor: theme.accentBg, color: theme.accent,
                    border: `1px solid ${theme.accent}`, borderRadius: '6px',
                    fontSize: '12px', fontWeight: '500', cursor: 'pointer', minHeight: '44px',
                    opacity: receiptUploading ? 0.6 : 1
                  }}
                >
                  <Camera size={14} />
                  {receiptUploading ? 'Uploading...' : 'Receipt'}
                </button>
                <button
                  onClick={() => setShowAddExpense(!showAddExpense)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '8px 12px', backgroundColor: theme.accent, color: '#fff',
                    border: 'none', borderRadius: '6px',
                    fontSize: '12px', fontWeight: '500', cursor: 'pointer', minHeight: '44px'
                  }}
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>
            </div>

            {/* Add expense form */}
            {showAddExpense && (
              <div style={{
                padding: '12px', backgroundColor: theme.bg, borderRadius: '8px',
                border: `1px solid ${theme.border}`, marginBottom: '12px'
              }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: theme.text, marginBottom: '4px' }}>Amount</label>
                    <input
                      type="number" step="0.01" value={expenseForm.amount}
                      onChange={(e) => setExpenseForm(f => ({ ...f, amount: e.target.value }))}
                      placeholder="0.00"
                      style={{ width: '100%', padding: '10px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: theme.text, marginBottom: '4px' }}>Merchant</label>
                    <input
                      type="text" value={expenseForm.merchant}
                      onChange={(e) => setExpenseForm(f => ({ ...f, merchant: e.target.value }))}
                      placeholder="Store name"
                      style={{ width: '100%', padding: '10px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: theme.text, marginBottom: '4px' }}>Category</label>
                    <select
                      value={expenseForm.category}
                      onChange={(e) => setExpenseForm(f => ({ ...f, category: e.target.value }))}
                      style={{ width: '100%', padding: '10px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    >
                      {['Materials', 'Labor', 'Equipment Rental', 'Permits', 'Travel', 'Fuel', 'Meals', 'Subcontractor', 'Office Supplies', 'Other'].map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: theme.text, marginBottom: '4px' }}>Notes</label>
                    <input
                      type="text" value={expenseForm.notes}
                      onChange={(e) => setExpenseForm(f => ({ ...f, notes: e.target.value }))}
                      placeholder="Optional"
                      style={{ width: '100%', padding: '10px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={handleAddJobExpense} style={{
                    padding: '10px 20px', backgroundColor: theme.accent, color: '#fff',
                    border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500',
                    cursor: 'pointer', minHeight: '44px'
                  }}>
                    Save Expense
                  </button>
                  <button onClick={() => setShowAddExpense(false)} style={{
                    padding: '10px 16px', backgroundColor: 'transparent', color: theme.textMuted,
                    border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '13px',
                    cursor: 'pointer', minHeight: '44px'
                  }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Expense list */}
            {jobExpenses.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '16px 0', color: theme.textMuted, fontSize: '13px' }}>
                No expenses yet. Capture a receipt or add an expense manually.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {jobExpenses.map(exp => (
                  <div key={exp.id} style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px',
                    border: `1px solid ${theme.border}`
                  }}>
                    {exp.receipt_url && (
                      <img
                        src={exp.receipt_url}
                        alt="receipt"
                        onClick={() => setViewingPhoto({ url: exp.receipt_url, name: 'Receipt' })}
                        style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${theme.border}`, flexShrink: 0 }}
                      />
                    )}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                        {exp.vendor || exp.description || 'Expense'}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>
                        {exp.category || 'Uncategorized'} {exp.date ? `— ${new Date(exp.date).toLocaleDateString()}` : ''}
                        {exp.plaid_transaction_id && (
                          <span style={{ marginLeft: '6px', color: '#22c55e' }}>
                            <Link2 size={10} style={{ verticalAlign: 'middle' }} /> Reconciled
                          </span>
                        )}
                      </div>
                    </div>
                    <div style={{ fontWeight: '600', color: theme.text, fontSize: '14px', flexShrink: 0 }}>
                      ${(parseFloat(exp.amount) || 0).toFixed(2)}
                    </div>
                    {isAdmin && (
                      <button onClick={() => handleDeleteExpense(exp.id)} style={{
                        padding: '4px', background: 'none', border: 'none', color: theme.textMuted,
                        cursor: 'pointer'
                      }}>
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                ))}
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
              value={job.notes || ''}
              onChange={(e) => {
                supabase.from('jobs').update({ notes: e.target.value, updated_at: new Date().toISOString() }).eq('id', id)
                setJob(prev => ({ ...prev, notes: e.target.value }))
              }}
              rows={4}
              style={{ ...inputStyle, resize: 'vertical' }}
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

          {/* Victor Verifications */}
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            padding: '20px'
          }}>
            <div
              onClick={() => verificationReports.length > 0 && setVerificationsExpanded(!verificationsExpanded)}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: verificationReports.length > 0 ? 'pointer' : 'default', marginBottom: (verificationsExpanded && verificationReports.length > 0) || verificationReports.length === 0 ? '12px' : 0 }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Shield size={16} style={{ color: '#a855f7' }} />
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Victor Verifications{verificationReports.length > 0 ? ` (${verificationReports.length})` : ''}
                </h3>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {verificationReports[0]?.grade && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: '28px', height: '28px', borderRadius: '50%',
                    fontWeight: '800', fontSize: '14px',
                    backgroundColor: verificationReports[0].grade === 'A' ? 'rgba(34,197,94,0.15)' :
                      verificationReports[0].grade === 'B' ? 'rgba(59,130,246,0.15)' :
                      verificationReports[0].grade === 'C' ? 'rgba(245,158,11,0.15)' :
                      verificationReports[0].grade === 'D' ? 'rgba(249,115,22,0.15)' : 'rgba(239,68,68,0.15)',
                    color: verificationReports[0].grade === 'A' ? '#22c55e' :
                      verificationReports[0].grade === 'B' ? '#3b82f6' :
                      verificationReports[0].grade === 'C' ? '#f59e0b' :
                      verificationReports[0].grade === 'D' ? '#f97316' : '#ef4444'
                  }}>
                    {verificationReports[0].grade}
                  </span>
                )}
                {verificationReports.length > 0 && (
                  verificationsExpanded ? <ChevronDown size={16} color={theme.textMuted} /> : <ChevronRight size={16} color={theme.textMuted} />
                )}
              </div>
            </div>

            {/* Empty state */}
            {verificationReports.length === 0 && (
              <div style={{ textAlign: 'center', padding: '8px 0' }}>
                <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                  No verifications yet. Run Victor to score this job's work quality.
                </div>
                <button
                  onClick={() => navigate(`/agents/victor/verify/${id}`)}
                  style={{
                    padding: '10px 20px',
                    background: 'linear-gradient(135deg, #a855f7 0%, #7c3aed 100%)',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '13px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    minHeight: '44px'
                  }}
                >
                  <Shield size={16} />
                  Run Verification
                </button>
              </div>
            )}

            {/* Reports list */}
            {verificationsExpanded && verificationReports.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {verificationReports.map(report => {
                  const gradeColor = report.grade === 'A' ? '#22c55e' :
                    report.grade === 'B' ? '#3b82f6' :
                    report.grade === 'C' ? '#f59e0b' :
                    report.grade === 'D' ? '#f97316' : '#ef4444'
                  const verifier = report.verified_by ? employees.find(e => e.id === report.verified_by) : null

                  return (
                    <div
                      key={report.id}
                      onClick={() => navigate(`/agents/victor/report/${report.id}`)}
                      style={{
                        padding: '12px',
                        backgroundColor: theme.bg,
                        borderRadius: '10px',
                        cursor: 'pointer',
                        border: `1px solid ${theme.border}`,
                        transition: 'border-color 0.2s'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', borderRadius: '50%',
                            backgroundColor: `${gradeColor}15`,
                            border: `2px solid ${gradeColor}`,
                            fontWeight: '800', fontSize: '16px', color: gradeColor
                          }}>
                            {report.grade || '—'}
                          </span>
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                              {report.score || 0}/100
                            </div>
                            <div style={{ fontSize: '11px', color: theme.textMuted }}>
                              {report.verification_type === 'daily' ? 'End-of-Day Check' : 'Job Verification'}
                            </div>
                          </div>
                        </div>
                        <ExternalLink size={14} color={theme.textMuted} />
                      </div>

                      {report.summary && (
                        <div style={{
                          fontSize: '12px', color: theme.textSecondary,
                          lineHeight: '1.4', marginBottom: '6px',
                          display: '-webkit-box', WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical', overflow: 'hidden'
                        }}>
                          {report.summary}
                        </div>
                      )}

                      {report.ai_analysis && (
                        <div style={{ display: 'flex', gap: '6px', marginBottom: '6px' }}>
                          {[
                            { label: 'Quality', val: report.ai_analysis.work_quality_score },
                            { label: 'Clean', val: report.ai_analysis.cleanliness_score },
                            { label: 'Complete', val: report.ai_analysis.completeness_score },
                            { label: 'Ready', val: report.ai_analysis.customer_readiness_score },
                          ].filter(s => s.val).map(s => (
                            <div key={s.label} style={{
                              flex: 1, textAlign: 'center', padding: '4px 2px',
                              backgroundColor: s.val >= 80 ? 'rgba(34,197,94,0.1)' : s.val >= 60 ? 'rgba(245,158,11,0.1)' : 'rgba(239,68,68,0.1)',
                              borderRadius: '4px'
                            }}>
                              <div style={{ fontSize: '13px', fontWeight: '700', color: s.val >= 80 ? '#22c55e' : s.val >= 60 ? '#f59e0b' : '#ef4444' }}>
                                {s.val}
                              </div>
                              <div style={{ fontSize: '9px', color: theme.textMuted, textTransform: 'uppercase' }}>{s.label}</div>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Verification photos */}
                      {verificationPhotos[report.id]?.length > 0 && (
                        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          {verificationPhotos[report.id].map(photo => (
                            <div key={photo.id} style={{ position: 'relative' }}>
                              <img
                                src={photo.url}
                                alt={photo.photoType}
                                onClick={(e) => { e.stopPropagation(); setViewingPhoto({ url: photo.url, name: photo.photoType }) }}
                                style={{
                                  width: '64px', height: '64px', objectFit: 'cover',
                                  borderRadius: '8px', cursor: 'pointer',
                                  border: `1px solid ${theme.border}`
                                }}
                              />
                              {photo.aiScore != null && (
                                <span style={{
                                  position: 'absolute', bottom: '2px', right: '2px',
                                  fontSize: '9px', fontWeight: '700',
                                  padding: '1px 4px', borderRadius: '4px',
                                  backgroundColor: photo.aiScore >= 80 ? 'rgba(34,197,94,0.9)' : photo.aiScore >= 60 ? 'rgba(245,158,11,0.9)' : 'rgba(239,68,68,0.9)',
                                  color: '#fff'
                                }}>
                                  {photo.aiScore}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', color: theme.textMuted }}>
                        <span>{verifier?.name || 'Unknown'}</span>
                        <span>{new Date(report.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Audit Photos */}
          {auditPhotos.length > 0 && (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '20px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                <Zap size={16} color={theme.textMuted} />
                <h3 style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>Audit Photos ({auditPhotos.length})</h3>
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {auditPhotos.map((photo, idx) => (
                  <img
                    key={idx}
                    src={photo.url}
                    alt={photo.name}
                    onClick={() => setViewingPhoto({ url: photo.url, name: photo.name })}
                    style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', cursor: 'pointer', border: `1px solid ${theme.border}` }}
                  />
                ))}
              </div>
            </div>
          )}

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
                  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext)
                  const iconColor = ext === 'pdf' ? '#dc2626' : ext === 'xlsx' ? '#16a34a' : isImage ? '#8b5cf6' : '#6366f1'
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
                        width: '32px', height: '32px',
                        backgroundColor: iconColor + '18',
                        borderRadius: '6px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <FileText size={16} color={iconColor} />
                      </div>
                      )}
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
      {showAddLine && (() => {
        // Build service types and groups hierarchy
        const serviceTypes = [...new Set(productGroups.map(g => g.service_type).filter(Boolean))]
        const activeServiceType = selectedServiceType || serviceTypes[0] || null
        const groupsForType = productGroups.filter(g => g.service_type === activeServiceType)

        // Filter products based on selection
        let visibleProducts = products.filter(p => p.active)
        if (productSearch) {
          const s = productSearch.toLowerCase()
          visibleProducts = visibleProducts.filter(p =>
            (p.name || '').toLowerCase().includes(s) ||
            (p.description || '').toLowerCase().includes(s)
          )
        } else if (selectedGroupId) {
          visibleProducts = visibleProducts.filter(p => p.group_id === selectedGroupId)
        } else if (activeServiceType) {
          const groupIds = new Set(groupsForType.map(g => g.id))
          visibleProducts = visibleProducts.filter(p => groupIds.has(p.group_id))
        }

        const selectedProduct = newLine.item_id ? products.find(p => p.id === parseInt(newLine.item_id)) : null

        return (
          <div style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px', zIndex: 50
          }}>
            <div style={{
              backgroundColor: theme.bgCard, borderRadius: '16px', boxShadow: '0 20px 40px rgba(0,0,0,0.15)',
              width: '100%', maxWidth: isMobile ? '95%' : '700px', maxHeight: '90vh', display: 'flex', flexDirection: 'column'
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, flexShrink: 0 }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>Add Line Item</h2>
                <button onClick={() => { setShowAddLine(false); setSelectedServiceType(null); setSelectedGroupId(null); setProductSearch(''); setNewLine({ item_id: '', quantity: 1 }) }} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                  <X size={20} />
                </button>
              </div>

              {/* Search bar */}
              <div style={{ padding: '12px 20px 0', flexShrink: 0 }}>
                <div style={{ position: 'relative' }}>
                  <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
                  <input
                    type="text"
                    value={productSearch}
                    onChange={(e) => { setProductSearch(e.target.value); if (e.target.value) { setSelectedGroupId(null) } }}
                    placeholder="Search products..."
                    style={{ ...inputStyle, paddingLeft: '32px' }}
                  />
                </div>
              </div>

              {!productSearch && (
                <>
                  {/* Service type tabs */}
                  {serviceTypes.length > 1 && (
                    <div style={{ display: 'flex', gap: '4px', padding: '12px 20px 0', flexShrink: 0, overflowX: 'auto' }}>
                      {serviceTypes.map(st => (
                        <button
                          key={st}
                          onClick={() => { setSelectedServiceType(st); setSelectedGroupId(null) }}
                          style={{
                            padding: '8px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: '500',
                            border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', minHeight: '36px',
                            backgroundColor: activeServiceType === st ? theme.accent : theme.bg,
                            color: activeServiceType === st ? '#fff' : theme.textSecondary,
                          }}
                        >
                          {st}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Product groups grid with images */}
                  {groupsForType.length > 0 && (
                    <div style={{ padding: '12px 20px', flexShrink: 0 }}>
                      <div style={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(auto-fill, minmax(${isMobile ? '70px' : '90px'}, 1fr))`,
                        gap: '8px'
                      }}>
                        {groupsForType.map(group => {
                          const isActive = selectedGroupId === group.id
                          const count = products.filter(p => p.active && p.group_id === group.id).length
                          return (
                            <button
                              key={group.id}
                              onClick={() => setSelectedGroupId(isActive ? null : group.id)}
                              style={{
                                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                                padding: '6px', borderRadius: '10px', border: isActive ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
                                backgroundColor: isActive ? theme.accentBg : theme.bgCard,
                                cursor: 'pointer', minHeight: '44px'
                              }}
                            >
                              {group.image_url ? (
                                <img
                                  src={group.image_url}
                                  alt={group.name}
                                  style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px' }}
                                />
                              ) : (
                                <div style={{ width: '48px', height: '48px', borderRadius: '6px', backgroundColor: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                  <Package size={20} color={theme.textMuted} />
                                </div>
                              )}
                              <div style={{ fontSize: '10px', fontWeight: '500', color: theme.text, textAlign: 'center', lineHeight: '1.2', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>
                                {group.name}
                              </div>
                              <div style={{ fontSize: '9px', color: theme.textMuted }}>{count}</div>
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Product list */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 12px', minHeight: 0 }}>
                {visibleProducts.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '24px 0', color: theme.textMuted, fontSize: '13px' }}>
                    {productSearch ? 'No products match your search.' : 'Select a group above to see products.'}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {visibleProducts.map(p => {
                      const isSelected = newLine.item_id === String(p.id)
                      return (
                        <button
                          key={p.id}
                          onClick={() => setNewLine(prev => ({ ...prev, item_id: String(p.id) }))}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            padding: '10px 12px', borderRadius: '8px', border: isSelected ? `2px solid ${theme.accent}` : `1px solid ${theme.border}`,
                            backgroundColor: isSelected ? theme.accentBg : 'transparent',
                            cursor: 'pointer', textAlign: 'left', width: '100%', minHeight: '44px'
                          }}
                        >
                          {p.image_url ? (
                            <img src={p.image_url} alt={p.name} style={{ width: '40px', height: '40px', objectFit: 'cover', borderRadius: '6px', flexShrink: 0 }} />
                          ) : (
                            <div style={{ width: '40px', height: '40px', borderRadius: '6px', backgroundColor: theme.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              <Package size={16} color={theme.textMuted} />
                            </div>
                          )}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {p.name}
                            </div>
                            {p.description && (
                              <div style={{ fontSize: '11px', color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.description}</div>
                            )}
                          </div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, flexShrink: 0 }}>
                            {formatCurrency(p.unit_price)}
                          </div>
                          {isSelected && <CheckCircle size={16} style={{ color: theme.accent, flexShrink: 0 }} />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>

              {/* Footer: quantity + add */}
              <div style={{
                padding: '12px 20px 16px', borderTop: `1px solid ${theme.border}`, flexShrink: 0,
                display: 'flex', gap: '12px', alignItems: 'center'
              }}>
                {selectedProduct && (
                  <div style={{ flex: 1, minWidth: 0, fontSize: '13px', color: theme.text, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedProduct.name}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                  <label style={{ fontSize: '12px', fontWeight: '500', color: theme.textSecondary }}>Qty</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    value={newLine.quantity}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9]/g, '')
                      setNewLine(prev => ({ ...prev, quantity: val === '' ? '' : parseInt(val) }))
                    }}
                    onBlur={(e) => {
                      if (!e.target.value || parseInt(e.target.value) < 1) setNewLine(prev => ({ ...prev, quantity: 1 }))
                    }}
                    style={{ ...inputStyle, width: '64px', textAlign: 'center' }}
                  />
                </div>
                <button
                  onClick={() => { addLineItem(); setSelectedServiceType(null); setSelectedGroupId(null); setProductSearch('') }}
                  disabled={saving || !newLine.item_id}
                  style={{
                    padding: '10px 20px', backgroundColor: theme.accent, color: '#ffffff',
                    border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                    cursor: 'pointer', opacity: saving || !newLine.item_id ? 0.6 : 1,
                    minHeight: '44px', flexShrink: 0
                  }}
                >
                  {saving ? 'Adding...' : 'Add'}
                </button>
              </div>
            </div>
          </div>
        )
      })()}

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

      {/* Photo Lightbox */}
      {viewingPhoto && (
        <div onClick={() => setViewingPhoto(null)} style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
          <button onClick={() => setViewingPhoto(null)} style={{ position: 'absolute', top: '16px', right: '16px', background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: '50%', width: '40px', height: '40px', color: '#fff', fontSize: '22px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2001 }}>
            {'\u2715'}
          </button>
          <img src={viewingPhoto.url} alt={viewingPhoto.name || 'Photo'} style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px' }} />
        </div>
      )}

      {showCostingModal && job && (
        <JobCostingModal job={job} theme={theme} onClose={() => setShowCostingModal(false)} />
      )}
    </div>
  )
}

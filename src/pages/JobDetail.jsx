import { useState, useEffect, useRef, Component } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import HelpBadge from '../components/HelpBadge'
import DealBreadcrumb from '../components/DealBreadcrumb'
import SignedProposalCard from '../components/SignedProposalCard'
import { jobStatusColors as statusColors } from '../lib/statusColors'
import { isAdmin as checkAdmin } from '../lib/accessControl'
import {
  ArrowLeft, Plus, Trash2, MapPin, Clock, FileText, ExternalLink,
  Play, CheckCircle, Pencil, X, DollarSign, Calendar, User, Building2,
  Edit2, Save, AlertCircle, GripVertical, CheckCircle2, Paperclip, Download, Upload,
  Package, Loader, Check, Info, Eye, Zap, Camera, ChevronDown, ChevronRight, Image, Copy,
  Shield, Star, Receipt, Link2, TrendingUp, Search, PackageCheck, UserPlus, Send, Mail
} from 'lucide-react'
import { buildDataContext, generateAndUploadTemplate } from '../lib/documentGenerator'
import JobCostingModal from '../components/JobCostingModal'
import { companyNotify } from '../lib/companyNotify'
import { getCustomerPrimary, getCustomerSecondary } from '../lib/customerDisplay'
import { computeAllottedHours } from '../lib/allottedHours'
import SearchableSelect from '../components/SearchableSelect'

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
  const company = useStore((state) => state.company)
  const products = useStore((state) => state.products)
  const employees = useStore((state) => state.employees)
  const timeLogs = useStore((state) => state.timeLogs)
  const fetchJobs = useStore((state) => state.fetchJobs)
  const fetchTimeLogs = useStore((state) => state.fetchTimeLogs)
  const user = useStore((state) => state.user)
  const isAdmin = checkAdmin(user)
  const customers = useStore((state) => state.customers)
  const storeJobStatuses = useStore((state) => state.jobStatuses)
  const businessUnits = useStore((state) => state.businessUnits)
  const storeJobSectionStatuses = useStore((state) => state.jobSectionStatuses)
  const laborRates = useStore((state) => state.laborRates)
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
  const [localDiscount, setLocalDiscount] = useState('')

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

  // Submittal package state
  const [showSubmittalModal, setShowSubmittalModal] = useState(false)
  const [submittalSelected, setSubmittalSelected] = useState(new Set())
  const [submittalDownloading, setSubmittalDownloading] = useState(false)
  const [submittalProgress, setSubmittalProgress] = useState('')
  const [submittalSections, setSubmittalSections] = useState({ documents: true, specSheets: true, lineItems: true, verification: true, notes: true, invoices: true })
  const [submittalEmail, setSubmittalEmail] = useState('')
  const [submittalMessage, setSubmittalMessage] = useState('')
  const [submittalSending, setSubmittalSending] = useState(false)
  const [submittalHistory, setSubmittalHistory] = useState([])

  // Bonus hours state
  const [bonusConfig, setBonusConfig] = useState(null) // payroll_config from settings
  const [skillLevelSettings, setSkillLevelSettings] = useState([]) // skill_levels from settings
  const currentUser = useStore((state) => state.user)

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
    // Load bonus hours config
    Promise.all([
      supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'payroll_config').maybeSingle(),
      supabase.from('settings').select('value').eq('company_id', companyId).eq('key', 'skill_levels').maybeSingle()
    ]).then(([configRes, skillRes]) => {
      if (configRes.data?.value) {
        try { setBonusConfig(JSON.parse(configRes.data.value)) } catch {}
      }
      if (skillRes.data?.value) {
        try {
          const parsed = JSON.parse(skillRes.data.value)
          setSkillLevelSettings(parsed.map(s => typeof s === 'string' ? { name: s, weight: 1 } : s))
        } catch {}
      }
    })
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
      .select('*, customer:customers!customer_id(id, name, email, phone, address, business_name), salesperson:employees!salesperson_id(id, name), quote:quotes!quote_id(id, quote_id, audit_id, customer_id), pm:employees!jobs_pm_id_fkey(id, name), job_lead:employees!jobs_job_lead_id_fkey(id, name)')
      .eq('id', id)
      .single()

    if (jobData) {
      setJob(jobData)
      setFormData(jobData)
      setLocalIncentive(jobData.utility_incentive || '')
      setLocalDiscount(jobData.discount || '')

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
        .select('*, item:products_services(id, name, description, allotted_time_hours, cost, spec_sheet_url, install_guide_url, dlc_document_url)')
        .eq('job_id', id)
        .order('id')

      setLineItems(lines || [])

      // Auto-calculate allotted time via the shared helper so JobDetail,
      // FieldScout, Payroll and bonusCalc all agree on one number.
      const calcRounded = computeAllottedHours({
        lines: lines || [],
        jobTotal: jobData.job_total,
        businessUnit: jobData.business_unit,
        settings: useStore.getState().settings || [],
      })

      if (calcRounded > 0) {
        const currentAllotted = parseFloat(jobData.allotted_time_hours) || 0
        if (calcRounded !== currentAllotted) {
          await supabase.from('jobs').update({
            allotted_time_hours: calcRounded,
            calculated_allotted_time: calcRounded
          }).eq('id', id)
          setJob(prev => ({ ...prev, allotted_time_hours: calcRounded, calculated_allotted_time: calcRounded }))
          setFormData(prev => ({ ...prev, allotted_time_hours: calcRounded }))
        }
      }

      // Sync job_total from line items so pipeline/reports stay accurate
      const linesTotal = (lines || []).reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0)
      const discount = parseFloat(jobData.discount) || 0
      const computedJobTotal = Math.round((linesTotal - discount) * 100) / 100
      const storedJobTotal = Math.round((parseFloat(jobData.job_total) || 0) * 100) / 100
      if ((lines || []).length > 0 && computedJobTotal !== storedJobTotal) {
        await supabase.from('jobs').update({ job_total: computedJobTotal }).eq('id', id)
        setJob(prev => ({ ...prev, job_total: computedJobTotal }))
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
        .select('id, invoice_id, amount, payment_status, created_at, pdf_url, invoice_type')
        .eq('job_id', id)
        .order('created_at', { ascending: false })
      setJobInvoices(invoicesData || [])

      // Fetch submittal history
      const { data: submittalData } = await supabase
        .from('file_attachments')
        .select('id, file_name, file_path, storage_bucket, created_at')
        .eq('job_id', id)
        .eq('photo_context', 'submittal')
        .order('created_at', { ascending: false })
      setSubmittalHistory(submittalData || [])

      // Fetch utility invoices linked to this job
      const { data: utilInvoicesData } = await supabase
        .from('utility_invoices')
        .select('id, amount, payment_status, utility_name, created_at, project_cost, incentive_amount, net_cost, customer_name, notes')
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
    const files = Array.from(e.target.files || [])
    if (files.length === 0 || !job) return
    setReceiptUploading(true)

    for (const file of files) {
      const timestamp = Date.now()
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const storagePath = `jobs/${id}/receipts/${timestamp}_${safeName}`

      const { error: uploadErr } = await supabase.storage
        .from('project-documents')
        .upload(storagePath, file, { contentType: file.type })

      if (uploadErr) {
        console.error('Receipt upload failed:', uploadErr)
        continue
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
    }

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

  const calculateProductLaborCost = (product) => {
    if (!product.allotted_time_hours) return 0
    const defaultRate = laborRates.find(r => r.is_default) || laborRates[0]
    const rate = product.labor_rate_id ? laborRates.find(r => r.id === product.labor_rate_id) : defaultRate
    if (!rate) return 0
    return product.allotted_time_hours * (rate.rate_per_hour || 0) * (rate.multiplier || 1)
  }

  const addLineItem = async () => {
    if (!newLine.item_id) return

    const product = products.find(p => p.id === parseInt(newLine.item_id))
    if (!product) return

    setSaving(true)

    const lineTotal = (product.unit_price || 0) * newLine.quantity
    const laborCost = calculateProductLaborCost(product)

    await supabase.from('job_lines').insert([{
      company_id: companyId,
      job_id: parseInt(id),
      item_id: product.id,
      quantity: newLine.quantity,
      price: product.unit_price,
      total: lineTotal,
      labor_cost: laborCost || 0
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
      discount: line.discount || 0,
      total: line.total,
      notes: line.notes || null
    }])
    await fetchJobData()
    setSaving(false)
  }

  const handleJobLineQuantityChange = async (line, newQty) => {
    const qty = Math.max(1, parseInt(newQty) || 1)
    const unitPrice = parseFloat(line.price) || 0
    const discount = parseFloat(line.discount) || 0
    const newTotal = (unitPrice * qty) - discount

    const updatedLines = lineItems.map(l => l.id === line.id ? { ...l, quantity: qty, total: newTotal } : l)
    setLineItems(updatedLines)
    await supabase.from('job_lines').update({ quantity: qty, total: newTotal }).eq('id', line.id)
    await updateJobTotalFromLines(updatedLines)
  }

  const handleJobLinePriceChange = async (line, newPrice) => {
    const basePrice = parseFloat(line.item?.price || line.item?.unit_price) || parseFloat(line.price) || 0
    const price = Math.max(basePrice, parseFloat(newPrice) || basePrice)
    const discount = parseFloat(line.discount) || 0
    const newTotal = (price * (line.quantity || 1)) - discount

    const updatedLines = lineItems.map(l => l.id === line.id ? { ...l, price, total: newTotal } : l)
    setLineItems(updatedLines)
    await supabase.from('job_lines').update({ price, total: newTotal }).eq('id', line.id)
    await updateJobTotalFromLines(updatedLines)
  }

  const handleJobLineDiscountChange = async (line, newDiscount) => {
    const discount = Math.max(0, parseFloat(newDiscount) || 0)
    const unitPrice = parseFloat(line.price) || 0
    const lineSubtotal = unitPrice * (line.quantity || 1)
    const cappedDiscount = Math.min(discount, lineSubtotal)
    const newTotal = lineSubtotal - cappedDiscount

    const updatedLines = lineItems.map(l => l.id === line.id ? { ...l, discount: cappedDiscount, total: newTotal } : l)
    setLineItems(updatedLines)
    await supabase.from('job_lines').update({ discount: cappedDiscount, total: newTotal }).eq('id', line.id)
    await updateJobTotalFromLines(updatedLines)
  }

  // Compute job_total from local line items (avoids race condition from full refetch during rapid edits)
  const updateJobTotalFromLines = async (lines) => {
    const linesTotal = lines.reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0)
    const discount = parseFloat(job?.discount) || 0
    const computedJobTotal = Math.round((linesTotal - discount) * 100) / 100
    setJob(prev => prev ? { ...prev, job_total: computedJobTotal } : prev)
    await supabase.from('jobs').update({ job_total: computedJobTotal }).eq('id', id)
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
    if (!confirm('Copy line items from the linked estimate?')) return

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
        photos: ql.photos || [],
        labor_cost: ql.labor_cost || 0
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

    if (newStatus === 'Scheduled' && !job.start_date) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(8, 0, 0, 0)
      updateData.start_date = tomorrow.toISOString()
      updateData.end_date = new Date(tomorrow.getTime() + 4 * 60 * 60 * 1000).toISOString()
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

    if (newStatus === 'Completed') {
      const customerName = getCustomerPrimary(job.customer) || job.customer_name || 'Unknown'
      const amount = parseFloat(job.job_total) || 0
      const amountStr = amount > 0 ? ` — $${amount.toLocaleString()}` : ''
      companyNotify({
        companyId,
        type: 'job_completed',
        title: 'Job Completed!',
        message: `${customerName}${amountStr} (${job.job_id})`,
        metadata: { job_id: job.id, customer_name: customerName, amount },
        createdBy: user?.id
      })
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
      created_at: formData.created_at,
      start_date: formData.start_date,
      end_date: formData.end_date,
      assigned_team: formData.assigned_team,
      allotted_time_hours: formData.allotted_time_hours,
      details: formData.details,
      notes: formData.notes,
      salesperson_id: formData.salesperson_id || null,
      job_lead_id: formData.job_lead_id || null,
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

  // Send to setter pipeline
  const handleSendToSetter = async () => {
    const reason = window.prompt(`Why does ${job.customer_name || job.job_title} need a meeting?\n\nAdd a note for the setter:`)
    if (reason === null) return
    const { toast } = await import('../lib/toast')
    const senderName = user?.name || 'Someone'
    const noteText = `Sent to setter by ${senderName} on ${new Date().toLocaleDateString()}${reason ? `: ${reason}` : ''}`

    if (job.lead_id) {
      const { data: leadData } = await supabase.from('leads').select('notes').eq('id', job.lead_id).single()
      const existingNotes = leadData?.notes ? `${leadData.notes}\n${noteText}` : noteText
      const { error } = await supabase.from('leads').update({ status: 'Contacted', notes: existingNotes, updated_at: new Date().toISOString() }).eq('id', job.lead_id)
      if (error) { toast.error('Error: ' + error.message); return }
    } else {
      const { error } = await supabase.from('leads').insert({
        company_id: companyId,
        customer_name: job.customer_name || job.job_title,
        address: job.address || null,
        status: 'Contacted',
        lead_source: 'Existing Job',
        customer_id: job.customer_id || null,
        notes: noteText
      })
      if (error) { toast.error('Error: ' + error.message); return }
    }
    toast.success('Sent to setter pipeline')
    navigate('/lead-setter')
  }

  const generateInvoice = async () => {
    if (!confirm('Generate invoice from this job?')) return

    setSaving(true)

    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`
    const subtotal = lineItems.reduce((sum, line) => sum + (parseFloat(line.total) || 0), 0)
    const discount = parseFloat(job.discount) || 0
    const total = subtotal - discount

    const descParts = [job.job_title]
    if (discount > 0) descParts.push(`Discount: -$${discount.toFixed(2)}`)

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert([{
        company_id: companyId,
        invoice_id: invoiceNumber,
        job_id: parseInt(id),
        customer_id: job.customer_id,
        amount: subtotal,
        discount_applied: discount,
        payment_status: 'Pending',
        job_description: descParts.join(' | ')
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

  // Create a deposit/down-payment invoice for this job. Used for the
  // historical-repair case (jobs converted before the auto-create logic
  // existed) and for any situation where the rep realizes after the fact
  // that the customer owes a deposit. Pulls the down payment config from
  // the linked estimate's settings_overrides.formal_proposal, but also
  // prompts for a manual amount if no formal proposal exists.
  const createDepositInvoice = async () => {
    const { toast } = await import('../lib/toast')
    try {
      // Block if a deposit invoice already exists on this job
      const existing = jobInvoices.find(i => i.invoice_type === 'deposit')
      if (existing) {
        toast.error(`Deposit invoice already exists: ${existing.invoice_id}`)
        return
      }

      // Resolve the down payment amount + label from the source estimate.
      // Fall back to a manual prompt so reps can still create one on jobs
      // without a formal proposal configured.
      let dpAmount = 0
      let dpLabel = 'Deposit'
      let sourceEst = null
      if (job.quote_id) {
        const { data: est } = await supabase
          .from('quotes')
          .select('id, quote_id, estimate_name, settings_overrides, business_unit')
          .eq('id', job.quote_id)
          .maybeSingle()
        if (est) {
          sourceEst = est
          const formal = est.settings_overrides?.formal_proposal || {}
          const raw = parseFloat(formal.down_payment_amount) || 0
          const isPercent = !!formal.down_payment_is_percent
          const contractTotal = parseFloat(job.job_total) || 0
          dpAmount = isPercent ? Math.round(contractTotal * (raw / 100) * 100) / 100 : raw
          if (formal.down_payment_label) dpLabel = formal.down_payment_label
        }
      }

      if (!(dpAmount > 0)) {
        // Fallback: ask the rep for an amount
        const input = window.prompt(`No down payment configured on the source estimate. Enter the ${dpLabel.toLowerCase()} amount (USD):`, '')
        if (input === null) return
        const manual = parseFloat(input)
        if (!(manual > 0)) {
          toast.error('Invalid amount')
          return
        }
        dpAmount = manual
      }

      setSaving(true)
      const invNumber = `INV-DEP-${Date.now().toString(36).toUpperCase()}`
      const resolvedCustomerId = job.customer_id || job.quote?.customer_id || null
      const refId = sourceEst?.quote_id || job.job_id || `JOB-${job.id}`
      const { data: depositInvoice, error: insErr } = await supabase
        .from('invoices')
        .insert([{
          company_id: companyId,
          job_id: parseInt(id),
          customer_id: resolvedCustomerId,
          invoice_id: invNumber,
          amount: dpAmount,
          payment_status: 'Draft',
          invoice_type: 'deposit',
          business_unit: sourceEst?.business_unit || job.business_unit || null,
          job_description: `${dpLabel} for ${sourceEst?.estimate_name || job.job_title || 'project'}`,
          notes: `${dpLabel} invoice created from ${refId}. ${dpLabel} due upon acceptance.`,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }])
        .select()
        .single()

      if (insErr) throw insErr

      // Auto-link any existing deposit payment recorded on the source estimate
      if (sourceEst?.id) {
        const { data: existingPayment } = await supabase
          .from('payments')
          .select('id, amount')
          .eq('company_id', companyId)
          .eq('quote_id', sourceEst.id)
          .eq('is_deposit', true)
          .is('invoice_id', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (existingPayment?.id) {
          const paidAmount = parseFloat(existingPayment.amount) || 0
          await supabase.from('payments')
            .update({ invoice_id: depositInvoice.id, job_id: parseInt(id) })
            .eq('id', existingPayment.id)
          if (paidAmount >= dpAmount - 0.01) {
            await supabase.from('invoices')
              .update({ payment_status: 'Paid', updated_at: new Date().toISOString() })
              .eq('id', depositInvoice.id)
          } else if (paidAmount > 0) {
            await supabase.from('invoices')
              .update({ payment_status: 'Partial', updated_at: new Date().toISOString() })
              .eq('id', depositInvoice.id)
          }
        }
      }

      toast.success(`${dpLabel} invoice ${invNumber} created: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(dpAmount)}`)
      await fetchJobData()
    } catch (err) {
      console.error('[createDepositInvoice]', err)
      toast.error('Could not create deposit invoice: ' + (err?.message || 'unknown'))
    } finally {
      setSaving(false)
    }
  }

  const createCustomerInvoice = async () => {
    setSaving(true)

    try {
      // Try to find a lighting audit through multiple paths:
      // 1. Via quote's audit_id (most direct)
      // 2. Via job's lead_id
      // 3. Via customer_id as last resort
      let audit = null

      if (job.quote?.audit_id) {
        const { data } = await supabase
          .from('lighting_audits')
          .select('*')
          .eq('id', job.quote.audit_id)
          .single()
        audit = data
      }

      if (!audit && job.lead_id) {
        const { data: audits } = await supabase
          .from('lighting_audits')
          .select('*')
          .eq('lead_id', job.lead_id)
          .order('created_at', { ascending: false })
          .limit(1)
        audit = audits?.[0] || null
      }

      if (!audit && job.customer_id) {
        const { data: audits } = await supabase
          .from('lighting_audits')
          .select('*')
          .eq('customer_id', job.customer_id)
          .eq('company_id', companyId)
          .order('created_at', { ascending: false })
          .limit(1)
        audit = audits?.[0] || null
      }

      // Calculate invoice amounts — use audit data if available, otherwise use job data
      const incentiveAmt = parseFloat(job.utility_incentive) || 0
      let projectCost, customerIncentive, customerOOP

      if (audit) {
        // Parse the notes JSON to get Give Me adjustments
        let additionalOOP = 0
        try {
          const pd = JSON.parse(audit.notes || '{}')
          additionalOOP = pd.giveMe?.additionalOOP || 0
        } catch (_) { /* notes may not be JSON */ }

        projectCost = audit.est_project_cost || 0
        customerIncentive = (audit.estimated_rebate || 0) - additionalOOP
        customerOOP = (audit.net_cost || 0) + additionalOOP
      } else {
        // No audit — calculate from job data directly
        const jobTotal = lineItems.reduce((sum, l) => sum + (parseFloat(l.total) || 0), 0)
          || parseFloat(job.job_total) || 0
        projectCost = jobTotal
        customerIncentive = incentiveAmt
        customerOOP = jobTotal - incentiveAmt
      }

      // Subtract any deposit invoices already on this job so the customer
      // copayment invoice is strictly the balance due after the deposit.
      // Link the latest deposit via parent_invoice_id for traceability.
      const depositInvoices = jobInvoices.filter(i => i.invoice_type === 'deposit')
      const depositTotal = depositInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
      const remainingCustomerOOP = Math.max(0, customerOOP - depositTotal)
      const parentDepositId = depositInvoices[0]?.id || null

      if (remainingCustomerOOP <= 0) {
        const { toast } = await import('../lib/toast')
        toast.error(
          depositTotal > 0
            ? `Deposit of $${Math.round(depositTotal).toLocaleString()} already covers the customer portion — no balance invoice needed`
            : 'Customer copayment is $0 or less — no invoice needed'
        )
        setSaving(false)
        return
      }

      const resolvedCustomerId = job.customer_id || job.quote?.customer_id || audit?.customer_id || null

      const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`

      // Invoice carries the FULL project cost as `amount`. Both the
      // utility rebate and any pre-paid deposit are rolled into
      // `discount_applied`, so the balance due is
      //   amount − discount_applied = remainingCustomerOOP.
      // That keeps the ledger clean: the full project value is on the
      // invoice, and the discounts show exactly how the customer's share
      // was reduced.
      const rebateDiscount = projectCost - customerOOP
      const totalDiscount = rebateDiscount + depositTotal
      const description = depositTotal > 0
        ? `Lighting Project Balance — $${Math.round(projectCost).toLocaleString()} project, $${Math.round(customerIncentive).toLocaleString()} incentive, $${Math.round(depositTotal).toLocaleString()} deposit credit`
        : `Lighting Project — $${Math.round(projectCost).toLocaleString()} project, $${Math.round(customerIncentive).toLocaleString()} incentive`

      const { data: invoice, error } = await supabase
        .from('invoices')
        .insert([{
          company_id: companyId,
          invoice_id: invoiceNumber,
          job_id: parseInt(id),
          customer_id: resolvedCustomerId,
          amount: projectCost,
          discount_applied: Math.max(0, totalDiscount),
          payment_status: 'Pending',
          parent_invoice_id: parentDepositId,
          job_description: description,
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
          customer_name: getCustomerPrimary(job.customer) || '',
          utility_name: utilityName,
          business_unit: job.business_unit || null,
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
    const files = Array.from(e.target.files || [])
    if (files.length === 0 || !photoUploadTarget) return
    e.target.value = ''

    const { lineId, context } = photoUploadTarget
    setPhotoUploadTarget(null)

    let failCount = 0
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const subPath = context === 'notes' ? 'notes' : `${context}/${lineId}`
      const filePath = `jobs/${id}/photos/${subPath}/${Date.now()}_${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, file)

      if (uploadError) {
        failCount++
        continue
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
      if (dbError) failCount++
    }

    if (failCount > 0) alert(`${failCount} of ${files.length} photo(s) failed to upload`)
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

  // Upload document(s)
  const handleUploadDocument = async (e) => {
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    e.target.value = ''

    let failCount = 0
    for (const file of files) {
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
      const filePath = `jobs/${id}/${Date.now()}_${safeName}`

      const { error: uploadError } = await supabase.storage
        .from('project-documents')
        .upload(filePath, file)

      if (uploadError) {
        failCount++
        continue
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

      if (dbError) failCount++
    }

    if (failCount > 0) alert(`${failCount} of ${files.length} file(s) failed to upload`)
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
      <div style={{ padding: isMobile ? '16px' : '24px' }}>
        <p style={{ color: theme.textMuted }}>Loading job...</p>
      </div>
    )
  }

  if (!job) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px' }}>
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

  // Receipt thumbnail — generates signed URL for private bucket
  const ReceiptThumbnail = ({ exp, theme: t, onView }) => {
    const [src, setSrc] = useState(null)
    useEffect(() => {
      let cancelled = false
      // Determine storage path: use receipt_storage_path, or extract from receipt_url
      let storagePath = exp.receipt_storage_path
      if (!storagePath && exp.receipt_url) {
        const match = exp.receipt_url.match(/\/storage\/v1\/object\/public\/project-documents\/(.+)/)
        if (match) storagePath = decodeURIComponent(match[1])
      }
      if (storagePath) {
        supabase.storage.from('project-documents')
          .createSignedUrl(storagePath, 3600)
          .then(({ data, error }) => {
            if (error) console.warn('[ReceiptThumbnail] signedUrl error:', storagePath, error.message)
            if (!cancelled && data?.signedUrl) setSrc(data.signedUrl)
          })
      }
      return () => { cancelled = true }
    }, [exp.id])
    if (!src) return (
      <div style={{ width: '48px', height: '48px', borderRadius: '6px', backgroundColor: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Camera size={16} color={t.textMuted} />
      </div>
    )
    return (
      <img
        src={src}
        alt="receipt"
        onClick={() => onView({ url: src, name: 'Receipt' })}
        style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '6px', cursor: 'pointer', border: `1px solid ${t.border}`, flexShrink: 0 }}
      />
    )
  }

  const AddPhotoButton = ({ theme: t, onClick }) => (
    <button onClick={onClick} style={{ width: '64px', height: '64px', borderRadius: '8px', border: `2px dashed ${t.border}`, backgroundColor: 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2px', color: t.textMuted, flexShrink: 0 }}>
      <Camera size={18} />
      <span style={{ fontSize: '10px' }}>Add</span>
    </button>
  )

  // Submittal helper: selectable photo thumbnail
  const SelectablePhoto = ({ src, label, itemKey, selected, onToggle, theme: t, score }) => (
    <div
      onClick={() => onToggle(itemKey)}
      style={{
        position: 'relative', width: '64px', height: '64px', flexShrink: 0,
        borderRadius: '8px', overflow: 'hidden', cursor: 'pointer',
        border: selected ? '2px solid #3b82f6' : `1px solid ${t.border}`,
        opacity: selected ? 1 : 0.7
      }}
    >
      <img src={src} alt={label} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <div style={{
        position: 'absolute', top: '2px', left: '2px',
        width: '18px', height: '18px', borderRadius: '4px',
        backgroundColor: selected ? '#3b82f6' : 'rgba(0,0,0,0.4)',
        display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        {selected && <Check size={12} color="#fff" />}
      </div>
      {score != null && (
        <span style={{
          position: 'absolute', bottom: '2px', right: '2px',
          fontSize: '9px', fontWeight: '700', padding: '1px 4px', borderRadius: '4px',
          backgroundColor: score >= 80 ? 'rgba(34,197,94,0.9)' : score >= 60 ? 'rgba(245,158,11,0.9)' : 'rgba(239,68,68,0.9)',
          color: '#fff'
        }}>
          {score}
        </span>
      )}
    </div>
  )

  // Submittal helper: selectable photo with signed URL fetch
  const SubmittalSignedPhoto = ({ att, itemKey, selected, onToggle, theme: t }) => {
    const [thumbUrl, setThumbUrl] = useState(null)
    useEffect(() => {
      let cancelled = false
      supabase.storage.from(att.storage_bucket).createSignedUrl(att.file_path, 3600).then(({ data }) => {
        if (!cancelled && data?.signedUrl) setThumbUrl(data.signedUrl)
      })
      return () => { cancelled = true }
    }, [att.id])

    if (!thumbUrl) {
      return (
        <div
          onClick={() => onToggle(itemKey)}
          style={{
            width: '64px', height: '64px', borderRadius: '8px',
            backgroundColor: t.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', border: selected ? '2px solid #3b82f6' : `1px solid ${t.border}`
          }}
        >
          <Image size={20} color={t.textMuted} />
        </div>
      )
    }
    return (
      <SelectablePhoto
        src={thumbUrl}
        label={att.file_name}
        itemKey={itemKey}
        selected={selected}
        onToggle={onToggle}
        theme={t}
      />
    )
  }

  // Submittal helpers
  const sanitizeFilename = (name) => (name || 'file').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/_+/g, '_').substring(0, 100)

  const toggleSubmittalItem = (key) => {
    setSubmittalSelected(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const selectAllInGroup = (keys) => {
    setSubmittalSelected(prev => {
      const next = new Set(prev)
      const allSelected = keys.every(k => next.has(k))
      keys.forEach(k => allSelected ? next.delete(k) : next.add(k))
      return next
    })
  }

  // Generate a utility invoice PDF blob using jsPDF
  const generateUtilityInvoicePDF = async (inv) => {
    const { default: jsPDF } = await import('jspdf')
    const pdfDoc = new jsPDF()
    const pw = pdfDoc.internal.pageSize.getWidth()
    const m = 20, re = pw - m, cw = pw - m * 2
    let py = 20
    const fmtCur = (v) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v || 0)

    // Sender (business unit) on left — businessUnits is an array of strings
    const senderName = inv.business_unit || job?.business_unit || company?.name || 'Our Company'
    pdfDoc.setFontSize(14); pdfDoc.setFont('helvetica', 'bold'); pdfDoc.setTextColor(90, 99, 73)
    pdfDoc.text(senderName, m, 20)
    pdfDoc.setFontSize(9); pdfDoc.setFont('helvetica', 'normal'); pdfDoc.setTextColor(80)
    let sy = 26
    if (company?.address) { pdfDoc.text(company.address, m, sy); sy += 4 }
    if (company?.phone) { pdfDoc.text(company.phone, m, sy); sy += 4 }

    // Title
    pdfDoc.setFontSize(18); pdfDoc.setFont('helvetica', 'bold')
    pdfDoc.setTextColor(90, 99, 73)
    pdfDoc.text('UTILITY INVOICE', re, 20, { align: 'right' })
    pdfDoc.setTextColor(80); pdfDoc.setFontSize(10); pdfDoc.setFont('helvetica', 'normal')
    let iy = 30
    pdfDoc.text(`Invoice #: UTL-${inv.id}`, re, iy, { align: 'right' }); iy += 5
    pdfDoc.text(`Date: ${new Date(inv.created_at).toLocaleDateString()}`, re, iy, { align: 'right' }); iy += 5
    pdfDoc.text(`Utility: ${inv.utility_name || '-'}`, re, iy, { align: 'right' })
    py = Math.max(py, sy + 4)

    // Customer
    pdfDoc.setTextColor(0); pdfDoc.setFontSize(11); pdfDoc.setFont('helvetica', 'bold')
    pdfDoc.text('Customer:', m, py); py += 6
    pdfDoc.setFont('helvetica', 'normal'); pdfDoc.setFontSize(10)
    pdfDoc.text(inv.customer_name || getCustomerPrimary(job.customer) || '-', m, py); py += 5
    if (job.customer?.address) { pdfDoc.text(job.customer.address, m, py); py += 5 }
    if (job.customer?.phone) { pdfDoc.text(job.customer.phone, m, py); py += 5 }
    py += 3

    // Job
    pdfDoc.setFont('helvetica', 'bold'); pdfDoc.setFontSize(11)
    pdfDoc.text('Job:', m, py); py += 6
    pdfDoc.setFont('helvetica', 'normal'); pdfDoc.setFontSize(10)
    pdfDoc.text(job.job_title || job.job_id || '-', m, py); py += 5
    if (job.job_address) { pdfDoc.text(job.job_address, m, py); py += 5 }
    py += 3

    // Divider
    pdfDoc.setDrawColor(214, 205, 184); pdfDoc.line(m, py, re, py); py += 10

    // Cost breakdown from line items
    const materialTotal = lineItems.reduce((s, l) => s + (parseFloat(l.total || l.line_total) || 0), 0)
    const rawLaborTotal = lineItems.reduce((s, l) => s + (parseFloat(l.labor_total) || 0), 0)
    const hasLaborData = lineItems.some(l => parseFloat(l.labor_total) > 0)
    const laborTotal = hasLaborData ? rawLaborTotal : Math.round(materialTotal * 0.3 * 100) / 100

    pdfDoc.setFontSize(11); pdfDoc.setFont('helvetica', 'bold')
    pdfDoc.text('Cost Breakdown', m, py); py += 8
    pdfDoc.setFillColor(247, 245, 239); pdfDoc.rect(m, py - 4, cw, 8, 'F')
    pdfDoc.setFontSize(9); pdfDoc.setFont('helvetica', 'bold'); pdfDoc.setTextColor(80)
    pdfDoc.text('Description', m + 2, py); pdfDoc.text('Amount', re - 2, py, { align: 'right' }); py += 8
    pdfDoc.setFont('helvetica', 'normal'); pdfDoc.setTextColor(0); pdfDoc.setFontSize(10)
    pdfDoc.text('Material', m + 2, py); pdfDoc.text(fmtCur(materialTotal), re - 2, py, { align: 'right' }); py += 7
    pdfDoc.text('Labor', m + 2, py); pdfDoc.text(fmtCur(laborTotal), re - 2, py, { align: 'right' }); py += 4
    pdfDoc.setDrawColor(214, 205, 184); pdfDoc.line(m, py, re, py); py += 10

    // Financial summary
    const sx = m + 100
    pdfDoc.setFontSize(10); pdfDoc.setFont('helvetica', 'bold'); pdfDoc.setTextColor(0)
    pdfDoc.text('Project Cost:', sx, py)
    pdfDoc.text(fmtCur(inv.project_cost || inv.amount || (materialTotal + laborTotal)), re, py, { align: 'right' }); py += 6
    pdfDoc.setFont('helvetica', 'normal'); pdfDoc.setTextColor(212, 148, 10)
    pdfDoc.text('Utility Incentive:', sx, py)
    pdfDoc.text(`- ${fmtCur(inv.incentive_amount)}`, re, py, { align: 'right' }); py += 8
    pdfDoc.setDrawColor(214, 205, 184); pdfDoc.line(sx, py - 2, re, py - 2)
    pdfDoc.setTextColor(0); pdfDoc.setFontSize(12); pdfDoc.setFont('helvetica', 'bold')
    pdfDoc.text('Net Cost:', sx, py + 4)
    pdfDoc.text(fmtCur(inv.net_cost), re, py + 4, { align: 'right' }); py += 14

    // Notes
    if (inv.notes) {
      pdfDoc.setFontSize(10); pdfDoc.setFont('helvetica', 'normal'); pdfDoc.setTextColor(100)
      pdfDoc.text('Notes:', m, py); py += 5
      for (const ln of pdfDoc.splitTextToSize(inv.notes, cw)) { pdfDoc.text(ln, m, py); py += 5 }
    }

    return pdfDoc.output('blob')
  }

  const buildSubmittalManifest = () => {
    const items = []
    // Two-folder layout: Documents (PDFs/text) and Photos (images)
    // Filenames carry the meaning so utilities can scan one folder
    const DOCS = 'Documents'
    const PHOTOS = 'Photos'

    submittalSelected.forEach(key => {
      const [type, ...rest] = key.split(':')
      if (type === 'doc') {
        const attId = parseInt(rest[0])
        const att = attachments.find(a => a.id === attId)
        if (att) {
          const isImg = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(att.file_name || '')
          items.push({ type: 'doc', att, folder: isImg ? PHOTOS : DOCS, filename: sanitizeFilename(att.file_name) })
        }
      } else if (type === 'source') {
        const [lineId, idx] = rest
        const line = lineItems.find(l => l.id === parseInt(lineId))
        const url = line?.photos?.[parseInt(idx)]
        if (url) {
          const lineName = sanitizeFilename(line.item?.name || `line_${lineId}`)
          const ext = url.split('.').pop()?.split('?')[0] || 'jpg'
          items.push({ type: 'public', url, folder: PHOTOS, filename: `${lineName}_source_${parseInt(idx) + 1}.${ext}` })
        }
      } else if (type === 'before' || type === 'after') {
        const [lineId, attId] = rest
        const line = lineItems.find(l => l.id === parseInt(lineId))
        const photos = (linePhotos[parseInt(lineId)] || []).filter(p => p.photo_context === `line_${type}`)
        const att = photos.find(p => p.id === parseInt(attId))
        if (att) {
          const lineName = sanitizeFilename(line?.item?.name || `line_${lineId}`)
          const ext = (att.file_name || '').split('.').pop() || 'jpg'
          const label = type === 'before' ? 'BEFORE' : 'AFTER'
          items.push({ type: 'signed', att, folder: PHOTOS, filename: `${lineName}_${label}_${attId}.${ext}` })
        }
      } else if (type === 'victor') {
        const [lineId, idx] = rest
        const line = lineItems.find(l => l.id === parseInt(lineId))
        const photos = lineVerificationPhotos[parseInt(lineId)] || []
        const vp = photos[parseInt(idx)]
        if (vp) {
          const lineName = sanitizeFilename(line?.item?.name || `line_${lineId}`)
          const ext = vp.url.split('.').pop()?.split('?')[0] || 'jpg'
          items.push({ type: 'public', url: vp.url, folder: PHOTOS, filename: `${lineName}_verification_${parseInt(idx) + 1}.${ext}` })
        }
      } else if (type === 'vreport') {
        const reportId = parseInt(rest[0])
        const report = verificationReports.find(r => r.id === reportId)
        if (report) {
          const dateStr = new Date(report.created_at).toISOString().slice(0, 10)
          const text = `Victor Verification Report\nDate: ${dateStr}\nGrade: ${report.grade || 'N/A'}\nScore: ${report.score || 0}/100\n\n${report.summary || ''}\n\n${report.ai_analysis ? JSON.stringify(report.ai_analysis, null, 2) : ''}`
          items.push({ type: 'text', content: text, folder: DOCS, filename: `Verification_Report_${dateStr}.txt` })
        }
      } else if (type === 'vphoto') {
        const [reportId, idx] = rest
        const photos = verificationPhotos[parseInt(reportId)] || []
        const photo = photos[parseInt(idx)]
        if (photo) {
          const ext = photo.url.split('.').pop()?.split('?')[0] || 'jpg'
          items.push({ type: 'public', url: photo.url, folder: PHOTOS, filename: `Verification_Photo_${parseInt(idx) + 1}.${ext}` })
        }
      } else if (type === 'notephoto') {
        const attId = parseInt(rest[0])
        const att = notesPhotos.find(p => p.id === attId)
        if (att) {
          const ext = (att.file_name || '').split('.').pop() || 'jpg'
          items.push({ type: 'signed', att, folder: PHOTOS, filename: `Note_Photo_${attId}.${ext}` })
        }
      } else if (type === 'auditphoto') {
        const idx = parseInt(rest[0])
        const photo = auditPhotos[idx]
        if (photo) {
          const ext = photo.url.split('.').pop()?.split('?')[0] || 'jpg'
          items.push({ type: 'public', url: photo.url, folder: PHOTOS, filename: `Audit_Photo_${idx + 1}.${ext}` })
        }
      } else if (type === 'invoice') {
        const invId = parseInt(rest[0])
        const inv = jobInvoices.find(i => i.id === invId)
        if (inv?.pdf_url) {
          items.push({ type: 'signed_path', bucket: 'project-documents', path: inv.pdf_url, folder: DOCS, filename: `Invoice_${inv.invoice_id || invId}.pdf` })
        }
      } else if (type === 'utilinvoice') {
        const invId = parseInt(rest[0])
        const inv = jobUtilityInvoices.find(i => i.id === invId)
        if (inv) {
          items.push({ type: 'utilpdf', invoice: inv, folder: DOCS, filename: `Utility_Invoice_UTL-${inv.id}.pdf` })
        }
      } else if (type === 'specsheet') {
        // rest = [docKey, url] — spec sheet/install guide/DLC doc
        const url = rest.slice(1).join(':') // URL may contain colons
        const docKey = rest[0] || 'doc'
        const label = docKey.startsWith('spec') ? 'Spec_Sheet' : docKey.startsWith('install') ? 'Install_Guide' : docKey.startsWith('dlc') ? 'DLC_Certificate' : 'Document'
        const lineId = docKey.split('-')[1]
        const line = lineItems.find(l => l.id === parseInt(lineId))
        const productName = sanitizeFilename(line?.item?.name || `Product_${lineId}`)
        const ext = url.split('.').pop()?.split('?')[0] || 'pdf'
        items.push({ type: 'public', url, folder: DOCS, filename: `${label}_${productName}.${ext}` })
      } else if (type === 'jobnotes') {
        if (job?.notes) {
          items.push({ type: 'text', content: `Job Notes — ${job.job_title || job.job_id}\n${'—'.repeat(40)}\n\n${job.notes}`, folder: DOCS, filename: 'Job_Notes.txt' })
        }
      }
    })
    return items
  }

  // Build a CONTENTS.txt index that lists everything in the package
  const buildSubmittalIndex = (manifest, jobName, customerName, businessUnit) => {
    const docs = manifest.filter(m => m.folder === 'Documents')
    const photos = manifest.filter(m => m.folder === 'Photos')
    const lines = []
    lines.push('═'.repeat(60))
    lines.push('  SUBMITTAL PACKAGE')
    lines.push('═'.repeat(60))
    lines.push('')
    if (businessUnit) lines.push(`From:      ${businessUnit}`)
    lines.push(`Job:       ${jobName}`)
    if (customerName) lines.push(`Customer:  ${customerName}`)
    lines.push(`Date:      ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`)
    lines.push(`Items:     ${manifest.length} (${docs.length} document${docs.length !== 1 ? 's' : ''}, ${photos.length} photo${photos.length !== 1 ? 's' : ''})`)
    lines.push('')
    lines.push('─'.repeat(60))
    lines.push('  DOCUMENTS/')
    lines.push('─'.repeat(60))
    if (docs.length === 0) lines.push('  (none)')
    else docs.forEach((d, i) => lines.push(`  ${String(i + 1).padStart(2, '0')}. ${d.filename}`))
    lines.push('')
    lines.push('─'.repeat(60))
    lines.push('  PHOTOS/')
    lines.push('─'.repeat(60))
    if (photos.length === 0) lines.push('  (none)')
    else photos.forEach((p, i) => lines.push(`  ${String(i + 1).padStart(2, '0')}. ${p.filename}`))
    lines.push('')
    lines.push('═'.repeat(60))
    return lines.join('\n')
  }

  const handleDownloadSubmittal = async () => {
    const { toast } = await import('../lib/toast')
    const manifest = buildSubmittalManifest()
    if (manifest.length === 0) return
    setSubmittalDownloading(true)
    setSubmittalProgress(`Preparing 0/${manifest.length}...`)
    try {
      const [{ default: JSZip }, { saveAs }] = await Promise.all([
        import('jszip'),
        import('file-saver')
      ])
      const zip = new JSZip()
      const jobName = sanitizeFilename(job.job_title || job.job_id || 'job')
      const indexCustomerName = getCustomerPrimary(job.customer) || ''
      const indexBU = job?.business_unit || company?.name || ''
      zip.file(`${jobName}_submittal_package/CONTENTS.txt`, buildSubmittalIndex(manifest, job.job_title || job.job_id, indexCustomerName, indexBU))
      let completed = 0

      for (const item of manifest) {
        try {
          let data
          if (item.type === 'text') {
            data = item.content
          } else if (item.type === 'public') {
            const resp = await fetch(item.url)
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            data = await resp.blob()
          } else if (item.type === 'signed') {
            const { data: signedData } = await supabase.storage
              .from(item.att.storage_bucket)
              .createSignedUrl(item.att.file_path, 300)
            if (!signedData?.signedUrl) throw new Error('No signed URL')
            const resp = await fetch(signedData.signedUrl)
            if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
            data = await resp.blob()
          } else if (item.type === 'signed_path') {
            const { data: signedData } = await supabase.storage
              .from(item.bucket)
              .createSignedUrl(item.path, 300)
            if (signedData?.signedUrl) {
              const resp = await fetch(signedData.signedUrl)
              if (resp.ok) data = await resp.blob()
            }
          } else if (item.type === 'doc') {
            // Documents may be in public or private buckets
            if (item.att.storage_bucket) {
              const { data: signedData } = await supabase.storage
                .from(item.att.storage_bucket)
                .createSignedUrl(item.att.file_path, 300)
              if (signedData?.signedUrl) {
                const resp = await fetch(signedData.signedUrl)
                if (resp.ok) data = await resp.blob()
              }
            }
            if (!data && item.att.url) {
              const resp = await fetch(item.att.url)
              if (resp.ok) data = await resp.blob()
            }
          }
          if (!data && item.type === 'utilpdf') {
            data = await generateUtilityInvoicePDF(item.invoice)
          }
          if (data) {
            zip.file(`${jobName}_submittal_package/${item.folder}/${item.filename}`, data)
          }
        } catch (err) {
          console.warn(`Submittal: skipping ${item.filename}:`, err.message)
        }
        completed++
        setSubmittalProgress(`Fetching ${completed}/${manifest.length}...`)
      }

      setSubmittalProgress('Building ZIP...')
      const blob = await zip.generateAsync({ type: 'blob' })

      // Save a record of the submittal to storage + file_attachments
      const timestamp = Date.now()
      const zipFilename = `${jobName}_submittal_package.zip`
      const storagePath = `jobs/${id}/submittals/${timestamp}_submittal.zip`
      await supabase.storage.from('project-documents').upload(storagePath, blob, { contentType: 'application/zip' })
      await supabase.from('file_attachments').insert({
        company_id: companyId,
        job_id: parseInt(id),
        file_name: zipFilename,
        file_path: storagePath,
        file_type: 'application/zip',
        file_size: blob.size,
        storage_bucket: 'project-documents',
        photo_context: 'submittal'
      })

      saveAs(blob, zipFilename)
      toast.success('Submittal package downloaded')
      await fetchJobData()
    } catch (err) {
      console.error('Submittal download failed:', err)
      toast.error('Download failed: ' + err.message)
    } finally {
      setSubmittalDownloading(false)
      setSubmittalProgress('')
    }
  }

  const handleSendSubmittal = async () => {
    const { toast } = await import('../lib/toast')
    if (!submittalEmail) {
      toast.error('Enter a recipient email')
      return
    }
    const manifest = buildSubmittalManifest()
    if (manifest.length === 0) {
      toast.error('Select at least one item')
      return
    }
    setSubmittalSending(true)
    setSubmittalProgress('Building package...')
    try {
      const [{ default: JSZip }] = await Promise.all([import('jszip')])
      const zip = new JSZip()
      const jobName = sanitizeFilename(job.job_title || job.job_id || 'job')
      const _indexCustomer = getCustomerPrimary(job.customer) || ''
      const _indexBU = job?.business_unit || company?.name || ''
      zip.file(`${jobName}_submittal_package/CONTENTS.txt`, buildSubmittalIndex(manifest, job.job_title || job.job_id, _indexCustomer, _indexBU))
      let completed = 0

      for (const item of manifest) {
        try {
          let data
          if (item.type === 'text') {
            data = item.content
          } else if (item.type === 'public') {
            const resp = await fetch(item.url)
            if (resp.ok) data = await resp.blob()
          } else if (item.type === 'signed') {
            const { data: signedData } = await supabase.storage.from(item.att.storage_bucket).createSignedUrl(item.att.file_path, 300)
            if (signedData?.signedUrl) { const resp = await fetch(signedData.signedUrl); if (resp.ok) data = await resp.blob() }
          } else if (item.type === 'signed_path') {
            const { data: signedData } = await supabase.storage.from(item.bucket).createSignedUrl(item.path, 300)
            if (signedData?.signedUrl) { const resp = await fetch(signedData.signedUrl); if (resp.ok) data = await resp.blob() }
          } else if (item.type === 'doc' && item.att.storage_bucket) {
            const { data: signedData } = await supabase.storage.from(item.att.storage_bucket).createSignedUrl(item.att.file_path, 300)
            if (signedData?.signedUrl) { const resp = await fetch(signedData.signedUrl); if (resp.ok) data = await resp.blob() }
          } else if (item.type === 'utilpdf') {
            data = await generateUtilityInvoicePDF(item.invoice)
          }
          if (data) zip.file(`${jobName}_submittal_package/${item.folder}/${item.filename}`, data)
        } catch (err) { console.warn('Submittal email: skipping', item.filename, err.message) }
        completed++
        setSubmittalProgress(`Preparing ${completed}/${manifest.length}...`)
      }

      setSubmittalProgress('Uploading...')
      const blob = await zip.generateAsync({ type: 'blob' })

      // Upload to storage
      const timestamp = Date.now()
      const storagePath = `jobs/${id}/submittals/${timestamp}_submittal.zip`
      await supabase.storage.from('project-documents').upload(storagePath, blob, { contentType: 'application/zip' })

      // Create signed URL for the email (7 days)
      const { data: signedData } = await supabase.storage.from('project-documents').createSignedUrl(storagePath, 7 * 24 * 3600)
      const downloadUrl = signedData?.signedUrl

      // Save record
      await supabase.from('file_attachments').insert({
        company_id: companyId,
        job_id: parseInt(id),
        file_name: `${jobName}_submittal_package.zip`,
        file_path: storagePath,
        file_type: 'application/zip',
        file_size: blob.size,
        storage_bucket: 'project-documents',
        photo_context: 'submittal'
      })

      // Send email via edge function
      setSubmittalProgress('Sending email...')
      const companyName = job?.business_unit || company?.name || 'Our Company'
      const customerName = getCustomerPrimary(job.customer) || ''
      // Call via direct fetch with anon key to avoid expired-JWT 401s
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL
      const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY
      const docCount = manifest.filter(m => m.folder === 'Documents').length
      const photoCount = manifest.filter(m => m.folder === 'Photos').length
      const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
      const escapedMsg = submittalMessage ? submittalMessage.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''
      const escapedJobTitle = (job.job_title || job.job_id || '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const escapedCustomer = customerName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      const escapedCompany = companyName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

      const emailHtml = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background-color:#f7f5ef;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#2c3530;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f5ef;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:14px;border:1px solid #d6cdb8;box-shadow:0 2px 12px rgba(44,53,48,0.06);overflow:hidden;">

        <!-- Header bar -->
        <tr><td style="background:linear-gradient(135deg,#5a6349 0%,#4a5239 100%);padding:28px 32px;">
          <div style="font-size:11px;letter-spacing:2px;color:rgba(255,255,255,0.7);text-transform:uppercase;font-weight:600;margin-bottom:6px;">Submittal Package</div>
          <div style="font-size:22px;color:#ffffff;font-weight:700;line-height:1.3;">${escapedJobTitle}</div>
          ${escapedCustomer ? `<div style="font-size:14px;color:rgba(255,255,255,0.85);margin-top:4px;">${escapedCustomer}</div>` : ''}
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          ${escapedMsg
            ? `<div style="font-size:15px;line-height:1.6;color:#2c3530;white-space:pre-line;margin-bottom:24px;">${escapedMsg}</div>`
            : `<div style="font-size:15px;line-height:1.6;color:#2c3530;margin-bottom:24px;">Please find the submittal package for <strong>${escapedJobTitle}</strong> attached below. The download link is valid for 7 days.</div>`
          }

          <!-- Summary card -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f7f5ef;border:1px solid #d6cdb8;border-radius:10px;margin-bottom:24px;">
            <tr><td style="padding:18px 20px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="font-size:11px;color:#7d8a7f;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;">Documents</td>
                  <td style="font-size:11px;color:#7d8a7f;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;">Photos</td>
                  <td style="font-size:11px;color:#7d8a7f;text-transform:uppercase;letter-spacing:1px;padding-bottom:4px;">Total Items</td>
                </tr>
                <tr>
                  <td style="font-size:24px;color:#5a6349;font-weight:700;">${docCount}</td>
                  <td style="font-size:24px;color:#5a6349;font-weight:700;">${photoCount}</td>
                  <td style="font-size:24px;color:#5a6349;font-weight:700;">${manifest.length}</td>
                </tr>
              </table>
            </td></tr>
          </table>

          <!-- CTA -->
          ${downloadUrl ? `
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
            <tr><td align="center">
              <a href="${downloadUrl}" style="display:inline-block;padding:16px 36px;background:linear-gradient(135deg,#5a6349 0%,#4a5239 100%);color:#ffffff;text-decoration:none;border-radius:10px;font-weight:600;font-size:15px;letter-spacing:0.3px;box-shadow:0 4px 12px rgba(90,99,73,0.25);">
                &#x2B07; Download Submittal Package
              </a>
              <div style="font-size:12px;color:#7d8a7f;margin-top:10px;">Link expires in 7 days &middot; ${today}</div>
            </td></tr>
          </table>
          ` : ''}

          <!-- What's inside -->
          <div style="border-top:1px solid #eef2eb;padding-top:20px;">
            <div style="font-size:12px;color:#7d8a7f;text-transform:uppercase;letter-spacing:1px;font-weight:600;margin-bottom:10px;">What's Inside</div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="padding:8px 0;font-size:14px;color:#2c3530;">
                  <span style="display:inline-block;width:24px;color:#5a6349;">&#128193;</span>
                  <strong>Documents/</strong> <span style="color:#7d8a7f;">— spec sheets, install guides, certificates, invoices</span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:14px;color:#2c3530;">
                  <span style="display:inline-block;width:24px;color:#5a6349;">&#128247;</span>
                  <strong>Photos/</strong> <span style="color:#7d8a7f;">— before, after, and verification photos</span>
                </td>
              </tr>
              <tr>
                <td style="padding:8px 0;font-size:14px;color:#2c3530;">
                  <span style="display:inline-block;width:24px;color:#5a6349;">&#128196;</span>
                  <strong>CONTENTS.txt</strong> <span style="color:#7d8a7f;">— full index of every file included</span>
                </td>
              </tr>
            </table>
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background-color:#f7f5ef;border-top:1px solid #d6cdb8;padding:20px 32px;text-align:center;">
          <div style="font-size:13px;color:#2c3530;font-weight:600;">${escapedCompany}</div>
          <div style="font-size:11px;color:#7d8a7f;margin-top:4px;">This submittal package was generated by JobScout</div>
        </td></tr>

      </table>
      <div style="font-size:11px;color:#7d8a7f;margin-top:16px;text-align:center;">If the button doesn't work, copy this link into your browser:<br />${downloadUrl ? `<a href="${downloadUrl}" style="color:#5a6349;word-break:break-all;">${downloadUrl}</a>` : ''}</div>
    </td></tr>
  </table>
</body>
</html>`

      const emailBody = {
          to: submittalEmail,
          from: `${companyName} <invoices@appsannex.com>`,
          subject: `Submittal Package — ${job.job_title || job.job_id}${customerName ? ` — ${customerName}` : ''}`,
          html: emailHtml,
      }
      const sendRes = await fetch(`${SUPABASE_URL}/functions/v1/send-email`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${ANON_KEY}`,
          'apikey': ANON_KEY,
        },
        body: JSON.stringify(emailBody),
      })
      const sendData = await sendRes.json().catch(() => ({}))
      if (!sendRes.ok || sendData.success === false) {
        const det = sendData.details ? ` (${JSON.stringify(sendData.details)})` : ''
        throw new Error((sendData.error || `HTTP ${sendRes.status}`) + det)
      }

      toast.success(`Submittal sent to ${submittalEmail}`)
      setShowSubmittalModal(false)
      setSubmittalEmail('')
      setSubmittalMessage('')
      setSubmittalSelected(new Set())
      await fetchJobData()
    } catch (err) {
      console.error('Send submittal failed:', err)
      toast.error('Failed to send: ' + err.message)
    } finally {
      setSubmittalSending(false)
      setSubmittalProgress('')
    }
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Hidden photo file input */}
      <input type="file" ref={photoInputRef} accept="image/*" multiple style={{ display: 'none' }} onChange={handleUploadPhoto} />

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
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>
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
        <button
          onClick={handleSendToSetter}
          style={{ padding: '8px 14px', backgroundColor: '#dbeafe', color: '#1d4ed8', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: '500', whiteSpace: 'nowrap' }}
        >
          <UserPlus size={16} /> Send to Setter
        </button>
      </div>

      {/* Deal Breadcrumb */}
      <DealBreadcrumb
        current="job"
        leadId={job.lead_id}
        quoteId={job.quote_id}
        customerId={job.customer_id}
        jobId={job.id}
      />

      {/* Signed formal proposal carried over from the estimate */}
      {job.signed_proposal_attachment_id && (
        <SignedProposalCard
          attachmentId={job.signed_proposal_attachment_id}
          quoteId={job.quote_id}
          theme={theme}
        />
      )}

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
                  <SearchableSelect
                    options={employees.map(emp => ({ value: emp.id, label: emp.name }))}
                    value={formData.salesperson_id || ''}
                    onChange={(val) => setFormData(prev => ({ ...prev, salesperson_id: val ? parseInt(val) : null }))}
                    placeholder="-- Select --"
                    theme={theme}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Address</label>
                  <input type="text" value={formData.job_address || ''} onChange={(e) => setFormData(prev => ({ ...prev, job_address: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Assigned To</label>
                  <SearchableSelect
                    options={employees.map(emp => ({ value: emp.id, label: emp.name }))}
                    value={formData.job_lead_id || ''}
                    onChange={(val) => setFormData(prev => ({ ...prev, job_lead_id: val ? parseInt(val) : null }))}
                    placeholder="-- Select --"
                    theme={theme}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Created Date</label>
                    <input type="date" value={formData.created_at ? formData.created_at.slice(0, 10) : ''} onChange={(e) => setFormData(prev => ({ ...prev, created_at: e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : prev.created_at }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Start Date</label>
                    <input type="datetime-local" value={formData.start_date ? formData.start_date.slice(0, 16) : ''} onChange={(e) => setFormData(prev => ({ ...prev, start_date: e.target.value }))} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date</label>
                    <input type="datetime-local" value={formData.end_date ? formData.end_date.slice(0, 16) : ''} onChange={(e) => setFormData(prev => ({ ...prev, end_date: e.target.value }))} style={inputStyle} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                    {getCustomerPrimary(job.customer) || '-'}
                  </p>
                  {getCustomerSecondary(job.customer) && (
                    <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                      Contact: {getCustomerSecondary(job.customer)}
                    </p>
                  )}
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
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Assigned To</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{job.job_lead?.name || '-'}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Start Date</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatDateTime(job.start_date)}</p>
                </div>
                <div>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>End Date</p>
                  <p style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>{formatDateTime(job.end_date)}</p>
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
                  display: 'grid', gridTemplateColumns: '20px 2fr 80px 100px 90px 100px 72px', gap: '12px',
                  padding: '12px 20px', backgroundColor: theme.accentBg,
                  fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px'
                }}>
                  <div></div>
                  <div>Item</div>
                  <div style={{ textAlign: 'right' }}>Qty</div>
                  <div style={{ textAlign: 'right' }}>Price</div>
                  <div style={{ textAlign: 'right' }}>Discount</div>
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
                          display: 'grid', gridTemplateColumns: '20px 2fr 80px 100px 90px 100px 72px', gap: '12px',
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
                        <div style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="number" min="1" defaultValue={line.quantity}
                            key={`qty-${line.id}-${line.quantity}`}
                            onBlur={(e) => { const val = parseInt(e.target.value) || 1; if (val !== line.quantity) handleJobLineQuantityChange(line, val) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                            style={{ width: '56px', padding: '4px 6px', textAlign: 'right', fontSize: '14px', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '6px', backgroundColor: theme.bgCard, outline: 'none' }}
                          />
                        </div>
                        <div style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="number" step="0.01"
                            min="0"
                            defaultValue={line.price}
                            key={`price-${line.id}-${line.price}`}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value)
                              if (isNaN(val) || val < 0) { e.target.value = line.price; return }
                              if (val !== parseFloat(line.price)) handleJobLinePriceChange(line, val)
                            }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                            style={{ width: '80px', padding: '4px 6px', textAlign: 'right', fontSize: '14px', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '6px', backgroundColor: theme.bgCard, outline: 'none' }}
                          />
                        </div>
                        <div style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <input
                            type="number" min="0" step="0.01"
                            defaultValue={line.discount || ''} placeholder="0"
                            key={`disc-${line.id}-${line.discount}`}
                            onBlur={(e) => { const val = parseFloat(e.target.value) || 0; if (val !== (parseFloat(line.discount) || 0)) handleJobLineDiscountChange(line, val) }}
                            onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur() }}
                            style={{ width: '70px', padding: '4px 6px', textAlign: 'right', fontSize: '14px', color: (line.discount > 0) ? '#ef4444' : theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: '6px', backgroundColor: theme.bgCard, outline: 'none' }}
                          />
                        </div>
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
                          {/* Labor cost info */}
                          {line.labor_cost > 0 && (
                            <div style={{ marginBottom: '12px', padding: '8px 10px', backgroundColor: 'rgba(139,92,246,0.08)', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <DollarSign size={12} style={{ color: '#8b5cf6' }} />
                              <span style={{ fontSize: '12px', color: '#8b5cf6', fontWeight: '500' }}>
                                Labor cost: ${parseFloat(line.labor_cost).toFixed(2)}
                              </span>
                            </div>
                          )}
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
                                  style={{ display: 'none' }}
                                  onChange={(e) => handleJobLinePhotoUpload(line.id, e)}
                                />
                              </label>
                            </div>
                          </div>
                          {/* Product Documents */}
                          {(line.item?.spec_sheet_url || line.item?.install_guide_url || line.item?.dlc_document_url) && (
                            <div style={{ marginBottom: '12px' }}>
                              <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Product Documents</div>
                              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                                {line.item.spec_sheet_url && (
                                  <a href={line.item.spec_sheet_url} target="_blank" rel="noopener noreferrer" style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                                    backgroundColor: 'rgba(90,99,73,0.12)', color: '#5a6349', borderRadius: '6px',
                                    fontSize: '12px', fontWeight: '500', textDecoration: 'none', border: '1px solid #d6cdb8'
                                  }}>
                                    <FileText size={14} /> Spec Sheet
                                  </a>
                                )}
                                {line.item.install_guide_url && (
                                  <a href={line.item.install_guide_url} target="_blank" rel="noopener noreferrer" style={{
                                    display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px',
                                    backgroundColor: 'rgba(90,99,73,0.12)', color: '#5a6349', borderRadius: '6px',
                                    fontSize: '12px', fontWeight: '500', textDecoration: 'none', border: '1px solid #d6cdb8'
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
                  {discount > 0 && incentive > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', color: '#4a7c59' }}>
                      <span style={{ fontWeight: '500' }}>After Discount & Incentive</span>
                      <span style={{ fontWeight: '600' }}>{formatCurrency(outOfPocket)}</span>
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

            {/* Discount — always visible */}
            <div style={{
              padding: '16px 20px',
              backgroundColor: 'rgba(220,38,38,0.06)',
              borderTop: `1px solid ${theme.border}`
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: '#dc2626', fontSize: '14px', fontWeight: '600' }}>Discount</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ color: '#dc2626', fontSize: '14px' }}>$</span>
                  <input
                    type="number"
                    value={localDiscount}
                    onChange={(e) => setLocalDiscount(e.target.value)}
                    onBlur={async () => {
                      const val = parseFloat(localDiscount) || 0
                      if (val !== (parseFloat(job.discount) || 0)) {
                        await supabase.from('jobs').update({
                          discount: val,
                          updated_at: new Date().toISOString()
                        }).eq('id', id)
                        setJob(prev => ({ ...prev, discount: val }))
                      }
                    }}
                    placeholder="0.00"
                    style={{
                      width: '110px',
                      padding: '6px 10px',
                      textAlign: 'right',
                      border: `1px solid rgba(220,38,38,0.25)`,
                      borderRadius: '6px',
                      fontSize: '14px',
                      color: '#dc2626',
                      fontWeight: '600',
                      backgroundColor: theme.bgCard
                    }}
                    step="0.01"
                    min="0"
                  />
                </div>
              </div>
            </div>

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

          {/* Bonus Hours Card */}
          {(() => {
            const showBonus = bonusConfig?.efficiency_bonus_enabled && allottedHours > 0 &&
              (job.status === 'In Progress' || job.status === 'Complete' || job.status === 'Completed')
            if (!showBonus) return null

            const rate = bonusConfig.efficiency_bonus_rate || 25
            const companyCut = bonusConfig.company_bonus_cut_percent || 0
            const savedHours = Math.max(0, allottedHours - totalHoursWorked)
            const hoursRemaining = allottedHours - totalHoursWorked
            const isOverBudget = hoursRemaining < 0
            const totalPool = savedHours * rate
            const companyShare = totalPool * (companyCut / 100)
            const crewPool = totalPool - companyShare

            // Build crew from time logs
            const crewMemberIds = [...new Set(jobTimeLogs.map(t => t.employee_id))]
            const crewMembers = crewMemberIds.map(empId => {
              const emp = employees.find(e => e.id === empId)
              const skillLevel = emp?.skill_level || ''
              const found = skillLevelSettings.find(s => s.name === skillLevel)
              const weight = found ? found.weight : 1
              return { id: empId, name: emp?.name || 'Unknown', skillLevel, weight }
            })
            const participating = crewMembers.filter(c => c.weight > 0)
            const totalWeight = participating.reduce((sum, c) => sum + c.weight, 0)

            // Current user's share
            const currentEmp = employees.find(e => e.email === currentUser?.email)
            const myMember = currentEmp ? crewMembers.find(c => c.id === currentEmp.id) : null
            const myShare = myMember && totalWeight > 0 ? crewPool * (myMember.weight / totalWeight) : null

            const progressPct = allottedHours > 0 ? Math.min(100, (totalHoursWorked / allottedHours) * 100) : 0
            const barColor = progressPct >= 100 ? '#ef4444' : progressPct >= 80 ? '#eab308' : '#22c55e'
            const isComplete = job.status === 'Complete' || job.status === 'Completed'

            return (
              <div style={{
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                border: `1px solid ${isOverBudget ? '#ef444440' : '#22c55e40'}`,
                overflow: 'hidden'
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '16px 20px', borderBottom: `1px solid ${theme.border}`,
                  background: isComplete && !isOverBudget ? 'linear-gradient(135deg, rgba(34,197,94,0.08) 0%, rgba(34,197,94,0.02) 100%)' : undefined
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Zap size={20} style={{ color: isOverBudget ? '#ef4444' : '#22c55e' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>
                      {isComplete && !isOverBudget ? 'Bonus Earned' : 'Bonus Hours'}
                    </h3>
                  </div>
                  {!isOverBudget && crewPool > 0 && (
                    <div style={{
                      padding: '5px 12px', borderRadius: '20px', fontSize: '14px', fontWeight: '700',
                      backgroundColor: 'rgba(34,197,94,0.12)', color: '#22c55e'
                    }}>
                      ${crewPool.toFixed(0)} pool
                    </div>
                  )}
                </div>

                <div style={{ padding: '16px 20px' }}>
                  {/* How it works — always visible, one-liner with expandable detail */}
                  <div style={{
                    padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
                    backgroundColor: 'rgba(139,92,246,0.06)', border: '1px solid rgba(139,92,246,0.12)',
                    fontSize: '13px', color: theme.textSecondary, lineHeight: '1.7'
                  }}>
                    <strong style={{ color: theme.text, fontSize: '13px' }}>How this works:</strong> This job was bid at <strong>{allottedHours}h</strong>.
                    Every hour your crew saves is worth <strong>${rate}/hr</strong>.
                    {companyCut > 0
                      ? <> The company keeps <strong>{companyCut}%</strong> and the crew splits <strong>{100 - companyCut}%</strong>, weighted by skill level — higher roles earn a bigger share.</>
                      : <> The full bonus goes to the crew, weighted by skill level — higher roles earn a bigger share.</>
                    }
                    {bonusConfig.bonus_quality_gate && <> No bonus if the job has callbacks.</>}
                    {' '}Finish early, get paid more.
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '14px' }}>
                      <span style={{ color: theme.textSecondary, fontWeight: '600' }}>{totalHoursWorked.toFixed(1)}h logged</span>
                      <span style={{ color: theme.textMuted, fontWeight: '500' }}>{allottedHours}h allotted</span>
                    </div>
                    <div style={{ height: '12px', backgroundColor: theme.accentBg, borderRadius: '6px', overflow: 'hidden' }}>
                      <div style={{
                        height: '100%',
                        width: `${Math.min(progressPct, 100)}%`,
                        backgroundColor: barColor,
                        borderRadius: '6px',
                        transition: 'width 0.3s'
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px', fontSize: '13px' }}>
                      <span style={{ color: isOverBudget ? '#ef4444' : '#22c55e', fontWeight: '700' }}>
                        {isOverBudget ? `${Math.abs(hoursRemaining).toFixed(1)}h over budget` : `${hoursRemaining.toFixed(1)}h remaining`}
                      </span>
                      {!isOverBudget && savedHours > 0 && (
                        <span style={{ color: theme.textSecondary, fontWeight: '500' }}>
                          {savedHours.toFixed(1)}h saved = ${totalPool.toFixed(0)} pool
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Pool breakdown — transparent math */}
                  {!isOverBudget && crewPool > 0 && (
                    <div style={{
                      display: 'flex', gap: '12px', marginBottom: '16px', flexWrap: 'wrap'
                    }}>
                      <div style={{
                        flex: 1, minWidth: '130px', padding: '14px 16px', borderRadius: '10px',
                        backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.15)', textAlign: 'center'
                      }}>
                        <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Crew Pool</div>
                        <div style={{ fontSize: '22px', fontWeight: '700', color: '#22c55e', margin: '4px 0' }}>${crewPool.toFixed(0)}</div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>{100 - companyCut}% of ${totalPool.toFixed(0)}</div>
                      </div>
                      {companyShare > 0 && (
                        <div style={{
                          flex: 1, minWidth: '130px', padding: '14px 16px', borderRadius: '10px',
                          backgroundColor: theme.bg, border: `1px solid ${theme.border}`, textAlign: 'center'
                        }}>
                          <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.3px' }}>Company</div>
                          <div style={{ fontSize: '22px', fontWeight: '700', color: theme.textSecondary, margin: '4px 0' }}>${companyShare.toFixed(0)}</div>
                          <div style={{ fontSize: '12px', color: theme.textMuted }}>{companyCut}% retention</div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* My share callout */}
                  {myShare !== null && myShare > 0 && !isOverBudget && (
                    <div style={{
                      padding: '16px 18px', borderRadius: '12px', marginBottom: '16px',
                      background: 'linear-gradient(135deg, rgba(34,197,94,0.1) 0%, rgba(168,85,247,0.08) 100%)',
                      border: '1px solid rgba(34,197,94,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
                    }}>
                      <div>
                        <div style={{ fontSize: '15px', fontWeight: '700', color: theme.text }}>Your Bonus</div>
                        <div style={{ fontSize: '13px', color: theme.textSecondary, marginTop: '4px' }}>
                          {myMember.skillLevel || 'Unassigned'} — weight {myMember.weight} of {totalWeight} total
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '3px' }}>
                          ${crewPool.toFixed(0)} x {myMember.weight}/{totalWeight} = ${myShare.toFixed(2)}
                        </div>
                      </div>
                      <div style={{ fontSize: '26px', fontWeight: '700', color: '#22c55e' }}>
                        ${myShare.toFixed(2)}
                      </div>
                    </div>
                  )}

                  {isOverBudget && (
                    <div style={{
                      padding: '12px 16px', borderRadius: '10px', marginBottom: '16px',
                      backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                      fontSize: '13px', color: '#ef4444', textAlign: 'center'
                    }}>
                      Job is over allotted hours — no bonus available
                    </div>
                  )}

                  {/* Crew breakdown */}
                  {crewMembers.length > 0 && !isOverBudget && (
                    <div>
                      <div style={{ fontSize: '13px', color: theme.text, marginBottom: '10px', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        Crew Breakdown
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {crewMembers.map(member => {
                          const share = totalWeight > 0 && member.weight > 0
                            ? crewPool * (member.weight / totalWeight)
                            : 0
                          return (
                            <div key={member.id} style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '10px 14px', backgroundColor: theme.bg, borderRadius: '8px',
                              fontSize: '14px', border: `1px solid ${theme.border}33`
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: 0 }}>
                                <div style={{
                                  width: '10px', height: '10px', borderRadius: '50%', flexShrink: 0,
                                  backgroundColor: member.weight > 0 ? '#a855f7' : theme.textMuted
                                }} />
                                <span style={{ color: theme.text, fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
                                <span style={{ color: theme.textMuted, fontSize: '12px', flexShrink: 0, padding: '2px 6px', backgroundColor: 'rgba(168,85,247,0.08)', borderRadius: '4px' }}>
                                  wt {member.weight}
                                </span>
                              </div>
                              <span style={{
                                fontWeight: '700', flexShrink: 0, marginLeft: '8px', fontSize: '15px',
                                color: member.weight > 0 ? '#22c55e' : theme.textMuted
                              }}>
                                {member.weight > 0 ? `$${share.toFixed(2)}` : 'Not eligible'}
                              </span>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '10px', textAlign: 'center', fontStyle: 'italic' }}>
                        Share = crew pool x (your weight / total weight). Higher skill level = higher weight = bigger share.
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )
          })()}

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
              {lineItems.length > 0 && job.invoice_status !== 'Invoiced' && job.invoice_status !== 'Paid' && !jobInvoices.some(i => i.invoice_type !== 'deposit') && (
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

              {/* Create Deposit Invoice \u2014 historical repair + manual entry.
                  Only shows when there isn't already a deposit invoice on
                  the job. Pulls the amount from the source estimate's
                  formal proposal config if present, otherwise prompts. */}
              {!jobInvoices.some(i => i.invoice_type === 'deposit') && (
                <button
                  onClick={createDepositInvoice}
                  disabled={saving}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '12px 16px',
                    backgroundColor: 'rgba(212,175,55,0.12)',
                    color: '#a88527',
                    border: '1px solid rgba(212,175,55,0.4)',
                    borderRadius: '8px', fontSize: '14px', fontWeight: '600',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1,
                  }}
                >
                  <DollarSign size={18} />
                  Create Deposit Invoice
                </button>
              )}

              {/* Paired Invoicing: Customer + Utility Incentive.
                  Gate only counts non-deposit customer invoices so an
                  existing deposit invoice doesn't block the copayment
                  button from appearing. */}
              {(() => {
                const hasCustomerInvoice = jobInvoices.some(i => i.invoice_type !== 'deposit')
                const hasUtilityInvoice = jobUtilityInvoices.length > 0
                const depositInvoices = jobInvoices.filter(i => i.invoice_type === 'deposit')
                const depositTotal = depositInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
                if (!(parseFloat(job.utility_incentive) > 0 && (!hasCustomerInvoice || !hasUtilityInvoice))) return null
                return (
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
                    const remainingAfterDeposit = Math.max(0, customerOOP - depositTotal)
                    return (
                      <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '12px', lineHeight: '1.6' }}>
                        {projectTotal > 0 && <div>Project: <strong>${projectTotal.toLocaleString()}</strong></div>}
                        <div>Utility Incentive: <strong style={{ color: '#d4940a' }}>${incentiveAmt.toLocaleString()}</strong></div>
                        {customerOOP > 0 && <div>Customer Copay: <strong>${customerOOP.toLocaleString()}</strong></div>}
                        {depositTotal > 0 && (
                          <>
                            <div>Deposit Already Invoiced: <strong style={{ color: '#a88527' }}>−${depositTotal.toLocaleString()}</strong></div>
                            <div style={{ marginTop: '4px', paddingTop: '4px', borderTop: `1px dashed ${theme.border}` }}>
                              Remaining Customer Balance: <strong style={{ color: theme.accent }}>${remainingAfterDeposit.toLocaleString()}</strong>
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })()}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {!hasCustomerInvoice && (
                      <button onClick={createCustomerInvoice} disabled={saving} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        padding: '10px 14px', backgroundColor: theme.accentBg, color: theme.accent,
                        border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                      }}>
                        <DollarSign size={16} />
                        Customer {depositTotal > 0 ? 'Balance' : 'Copayment'} Invoice
                      </button>
                    )}
                    {!hasUtilityInvoice && (
                      <button onClick={createUtilityInvoice} disabled={saving} style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                        padding: '10px 14px', backgroundColor: 'rgba(212,148,10,0.12)', color: '#d4940a',
                        border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
                      }}>
                        <Zap size={16} />
                        Utility Incentive Invoice
                      </button>
                    )}
                    {!hasCustomerInvoice && !hasUtilityInvoice && (
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
                )
              })()}
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
                  multiple
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
                    {(exp.receipt_storage_path || exp.receipt_url) && (
                      <ReceiptThumbnail exp={exp} theme={theme} onView={setViewingPhoto} />
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
              <input type="file" ref={fileInputRef} multiple style={{ display: 'none' }} onChange={handleUploadDocument} />
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
                onClick={() => {
                  setShowSubmittalModal(true)
                  setSubmittalEmail(job.customer?.email || '')
                  const jobTitle = job.job_title || job.job_id || 'your project'
                  const svcType = job.service_type ? ` for ${job.service_type} services` : ''
                  setSubmittalMessage(`Please find the attached submittal package for ${jobTitle}${svcType}. Let us know if you have any questions.`)
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '5px 8px',
                  backgroundColor: 'rgba(59,130,246,0.1)',
                  color: '#3b82f6',
                  border: '1px solid #3b82f6',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '11px',
                  fontWeight: '500'
                }}
              >
                <PackageCheck size={12} />
                Submittal
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

      {/* Submittal Package Modal */}
      {showSubmittalModal && (
        <>
          <div
            onClick={() => !submittalDownloading && setShowSubmittalModal(false)}
            style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }}
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
            maxWidth: isMobile ? '100%' : '800px',
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
                  Submittal Package
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, margin: '4px 0 0' }}>
                  {job?.customer?.name || job?.job_title || 'Job'} — select assets to include
                </p>
              </div>
              <button
                onClick={() => !submittalDownloading && setShowSubmittalModal(false)}
                disabled={submittalDownloading}
                style={{
                  padding: '8px', backgroundColor: 'transparent', border: 'none',
                  cursor: submittalDownloading ? 'not-allowed' : 'pointer', color: theme.textMuted,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: submittalDownloading ? 0.5 : 1
                }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: isMobile ? '16px' : '20px' }}>
              {submittalDownloading && (
                <div style={{
                  padding: '12px 16px', marginBottom: '16px', borderRadius: '10px',
                  backgroundColor: '#dbeafe', border: '1px solid #93c5fd',
                  display: 'flex', alignItems: 'center', gap: '10px'
                }}>
                  <Loader size={16} color="#2563eb" style={{ animation: 'spin 1s linear infinite' }} />
                  <span style={{ fontSize: '14px', color: '#1e40af', fontWeight: '500' }}>{submittalProgress}</span>
                </div>
              )}

              {/* No assets at all */}
              {attachments.length === 0 && lineItems.length === 0 && verificationReports.length === 0 && notesPhotos.length === 0 && auditPhotos.length === 0 ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: theme.textMuted }}>
                  <Info size={32} style={{ marginBottom: '8px', opacity: 0.5 }} />
                  <p style={{ fontSize: '14px', margin: 0 }}>No assets available for this job yet. Upload documents, add photos, or run Victor verifications first.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                  {/* Section 1: Documents */}
                  {attachments.length > 0 && (
                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                      <div
                        onClick={() => setSubmittalSections(p => ({ ...p, documents: !p.documents }))}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 16px', backgroundColor: theme.bg, cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {submittalSections.documents ? <ChevronDown size={16} color={theme.textMuted} /> : <ChevronRight size={16} color={theme.textMuted} />}
                          <Paperclip size={14} color={theme.textMuted} />
                          <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Documents ({attachments.length})</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            selectAllInGroup(attachments.map(a => `doc:${a.id}`))
                          }}
                          style={{
                            padding: '4px 10px', fontSize: '11px', fontWeight: '500',
                            backgroundColor: theme.accentBg, color: theme.accent,
                            border: `1px solid ${theme.accent}`, borderRadius: '6px', cursor: 'pointer'
                          }}
                        >
                          {attachments.every(a => submittalSelected.has(`doc:${a.id}`)) ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      {submittalSections.documents && (
                        <div style={{ padding: '8px 16px' }}>
                          {attachments.map(att => {
                            const key = `doc:${att.id}`
                            const selected = submittalSelected.has(key)
                            const ext = (att.file_name || '').split('.').pop()?.toLowerCase()
                            const cat = (att.category || 'CUSTOM').toUpperCase()
                            const catColors = CATEGORY_COLORS[cat] || CATEGORY_COLORS.CUSTOM
                            const sizeKB = att.file_size ? Math.round(att.file_size / 1024) : null
                            return (
                              <label key={att.id} style={{
                                display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 4px',
                                borderRadius: '8px', cursor: 'pointer',
                                backgroundColor: selected ? 'rgba(59,130,246,0.08)' : 'transparent',
                                minHeight: '44px'
                              }}>
                                <input
                                  type="checkbox"
                                  checked={selected}
                                  onChange={() => toggleSubmittalItem(key)}
                                  style={{ width: '18px', height: '18px', flexShrink: 0 }}
                                />
                                <FileText size={16} color={ext === 'pdf' ? '#dc2626' : ext === 'xlsx' ? '#16a34a' : '#6366f1'} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {att.file_name}
                                  </div>
                                  <div style={{ fontSize: '11px', color: theme.textMuted }}>
                                    {sizeKB ? `${sizeKB} KB` : ''}{sizeKB && att.created_at ? ' · ' : ''}{att.created_at ? new Date(att.created_at).toLocaleDateString() : ''}
                                  </div>
                                </div>
                                <span style={{
                                  padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: '500',
                                  backgroundColor: catColors.bg, color: catColors.text
                                }}>{cat}</span>
                              </label>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section 2: Line Items */}
                  {lineItems.length > 0 && (
                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                      {/* Product Spec Sheets Section */}
                      {lineItems.some(l => l.item?.spec_sheet_url || l.item?.install_guide_url || l.item?.dlc_document_url) && (
                        <>
                          <div
                            onClick={() => setSubmittalSections(p => ({ ...p, specSheets: !p.specSheets }))}
                            style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '12px 16px', backgroundColor: theme.bg, cursor: 'pointer'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                              {submittalSections.specSheets ? <ChevronDown size={16} color={theme.textMuted} /> : <ChevronRight size={16} color={theme.textMuted} />}
                              <FileText size={14} color={theme.textMuted} />
                              <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Product Spec Sheets</span>
                            </div>
                          </div>
                          {submittalSections.specSheets && (
                            <div style={{ padding: '8px 16px' }}>
                              {lineItems.filter(l => l.item?.spec_sheet_url || l.item?.install_guide_url || l.item?.dlc_document_url).map(line => {
                                const docs = []
                                if (line.item.spec_sheet_url) docs.push({ label: 'Spec Sheet', url: line.item.spec_sheet_url, key: `spec-${line.id}` })
                                if (line.item.install_guide_url) docs.push({ label: 'Install Guide', url: line.item.install_guide_url, key: `install-${line.id}` })
                                if (line.item.dlc_document_url) docs.push({ label: 'DLC Certificate', url: line.item.dlc_document_url, key: `dlc-${line.id}` })
                                return (
                                  <div key={line.id} style={{ marginBottom: '10px' }}>
                                    <div style={{ fontSize: '12px', fontWeight: '600', color: theme.text, marginBottom: '6px' }}>
                                      {line.item?.name || line.item_name || 'Line Item'} ({line.quantity || 1}x)
                                    </div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', paddingLeft: '8px' }}>
                                      {docs.map(doc => {
                                        const isSelected = submittalSelected.has(`specsheet:${doc.key}:${doc.url}`)
                                        return (
                                          <label key={doc.key} style={{
                                            display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px',
                                            backgroundColor: isSelected ? 'rgba(90,99,73,0.12)' : theme.bgCard,
                                            border: `1px solid ${isSelected ? '#5a6349' : theme.border}`,
                                            borderRadius: '6px', cursor: 'pointer', fontSize: '12px',
                                            color: isSelected ? '#5a6349' : theme.textSecondary
                                          }}>
                                            <input
                                              type="checkbox"
                                              checked={!!isSelected}
                                              onChange={() => {
                                                setSubmittalSelected(prev => {
                                                  const next = new Set(prev)
                                                  const key = `specsheet:${doc.key}:${doc.url}`
                                                  if (next.has(key)) next.delete(key)
                                                  else next.add(key)
                                                  return next
                                                })
                                              }}
                                              style={{ accentColor: '#5a6349' }}
                                            />
                                            <FileText size={12} />
                                            {doc.label}
                                          </label>
                                        )
                                      })}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </>
                      )}

                      <div
                        onClick={() => setSubmittalSections(p => ({ ...p, lineItems: !p.lineItems }))}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 16px', backgroundColor: theme.bg, cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {submittalSections.lineItems ? <ChevronDown size={16} color={theme.textMuted} /> : <ChevronRight size={16} color={theme.textMuted} />}
                          <Zap size={14} color={theme.textMuted} />
                          <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Line Item Photos</span>
                        </div>
                      </div>
                      {submittalSections.lineItems && (
                        <div style={{ padding: '8px 16px' }}>
                          {lineItems.map(line => {
                            const sourcePhotos = line.photos || []
                            const beforePhotos = (linePhotos[line.id] || []).filter(p => p.photo_context === 'line_before')
                            const afterPhotos = (linePhotos[line.id] || []).filter(p => p.photo_context === 'line_after')
                            const victorPhotos = lineVerificationPhotos[line.id] || []
                            const allKeys = [
                              ...sourcePhotos.map((_, i) => `source:${line.id}:${i}`),
                              ...beforePhotos.map(p => `before:${line.id}:${p.id}`),
                              ...afterPhotos.map(p => `after:${line.id}:${p.id}`),
                              ...victorPhotos.map((_, i) => `victor:${line.id}:${i}`)
                            ]
                            const totalPhotos = allKeys.length
                            if (totalPhotos === 0) return null

                            return (
                              <div key={line.id} style={{ marginBottom: '12px' }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                                  <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>
                                    {line.item?.name || 'Unknown'} ({totalPhotos})
                                  </span>
                                  <button
                                    onClick={() => selectAllInGroup(allKeys)}
                                    style={{
                                      padding: '2px 8px', fontSize: '10px', fontWeight: '500',
                                      backgroundColor: theme.accentBg, color: theme.accent,
                                      border: `1px solid ${theme.accent}`, borderRadius: '4px', cursor: 'pointer'
                                    }}
                                  >
                                    {allKeys.every(k => submittalSelected.has(k)) ? 'Deselect' : 'Select All'}
                                  </button>
                                </div>

                                {sourcePhotos.length > 0 && (
                                  <div style={{ marginBottom: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>Source</div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                      {sourcePhotos.map((url, idx) => (
                                        <SelectablePhoto
                                          key={`source-${line.id}-${idx}`}
                                          src={url}
                                          label={`Source ${idx + 1}`}
                                          itemKey={`source:${line.id}:${idx}`}
                                          selected={submittalSelected.has(`source:${line.id}:${idx}`)}
                                          onToggle={toggleSubmittalItem}
                                          theme={theme}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {beforePhotos.length > 0 && (
                                  <div style={{ marginBottom: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>Before</div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                      {beforePhotos.map(photo => {
                                        const key = `before:${line.id}:${photo.id}`
                                        return (
                                          <SubmittalSignedPhoto
                                            key={key}
                                            att={photo}
                                            itemKey={key}
                                            selected={submittalSelected.has(key)}
                                            onToggle={toggleSubmittalItem}
                                            theme={theme}
                                          />
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                {afterPhotos.length > 0 && (
                                  <div style={{ marginBottom: '6px' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase' }}>After</div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                      {afterPhotos.map(photo => {
                                        const key = `after:${line.id}:${photo.id}`
                                        return (
                                          <SubmittalSignedPhoto
                                            key={key}
                                            att={photo}
                                            itemKey={key}
                                            selected={submittalSelected.has(key)}
                                            onToggle={toggleSubmittalItem}
                                            theme={theme}
                                          />
                                        )
                                      })}
                                    </div>
                                  </div>
                                )}

                                {victorPhotos.length > 0 && (
                                  <div>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: '#a855f7', marginBottom: '4px', textTransform: 'uppercase' }}>Verification</div>
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                      {victorPhotos.map((vp, idx) => (
                                        <SelectablePhoto
                                          key={`victor-${line.id}-${idx}`}
                                          src={vp.url}
                                          label={`Verification ${idx + 1}`}
                                          itemKey={`victor:${line.id}:${idx}`}
                                          selected={submittalSelected.has(`victor:${line.id}:${idx}`)}
                                          onToggle={toggleSubmittalItem}
                                          theme={theme}
                                          score={vp.aiScore}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section 3: Verification Reports */}
                  {verificationReports.length > 0 && (
                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                      <div
                        onClick={() => setSubmittalSections(p => ({ ...p, verification: !p.verification }))}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 16px', backgroundColor: theme.bg, cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {submittalSections.verification ? <ChevronDown size={16} color={theme.textMuted} /> : <ChevronRight size={16} color={theme.textMuted} />}
                          <Shield size={14} color="#a855f7" />
                          <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Verification Reports ({verificationReports.length})</span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const allKeys = []
                            verificationReports.forEach(r => {
                              allKeys.push(`vreport:${r.id}`)
                              ;(verificationPhotos[r.id] || []).forEach((_, i) => allKeys.push(`vphoto:${r.id}:${i}`))
                            })
                            selectAllInGroup(allKeys)
                          }}
                          style={{
                            padding: '4px 10px', fontSize: '11px', fontWeight: '500',
                            backgroundColor: 'rgba(168,85,247,0.1)', color: '#a855f7',
                            border: '1px solid #a855f7', borderRadius: '6px', cursor: 'pointer'
                          }}
                        >
                          {(() => {
                            const allKeys = []
                            verificationReports.forEach(r => {
                              allKeys.push(`vreport:${r.id}`)
                              ;(verificationPhotos[r.id] || []).forEach((_, i) => allKeys.push(`vphoto:${r.id}:${i}`))
                            })
                            return allKeys.every(k => submittalSelected.has(k)) ? 'Deselect All' : 'Select All'
                          })()}
                        </button>
                      </div>
                      {submittalSections.verification && (
                        <div style={{ padding: '8px 16px' }}>
                          {verificationReports.map(report => {
                            const gradeColor = report.grade === 'A' ? '#22c55e' :
                              report.grade === 'B' ? '#3b82f6' :
                              report.grade === 'C' ? '#f59e0b' :
                              report.grade === 'D' ? '#f97316' : '#ef4444'
                            const reportKey = `vreport:${report.id}`
                            const reportPhotos = verificationPhotos[report.id] || []
                            return (
                              <div key={report.id} style={{ marginBottom: '12px', padding: '10px', borderRadius: '8px', backgroundColor: theme.bg }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', minHeight: '44px' }}>
                                  <input
                                    type="checkbox"
                                    checked={submittalSelected.has(reportKey)}
                                    onChange={() => toggleSubmittalItem(reportKey)}
                                    style={{ width: '18px', height: '18px', flexShrink: 0 }}
                                  />
                                  <span style={{
                                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                                    width: '28px', height: '28px', borderRadius: '50%',
                                    fontWeight: '800', fontSize: '14px',
                                    backgroundColor: `${gradeColor}20`, color: gradeColor
                                  }}>
                                    {report.grade || '—'}
                                  </span>
                                  <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>
                                      {report.score || 0}/100 — {new Date(report.created_at).toLocaleDateString()}
                                    </div>
                                    {report.summary && (
                                      <div style={{ fontSize: '11px', color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                        {report.summary.substring(0, 80)}{report.summary.length > 80 ? '...' : ''}
                                      </div>
                                    )}
                                  </div>
                                  <span style={{ fontSize: '11px', color: theme.textMuted }}>Summary .txt</span>
                                </label>
                                {reportPhotos.length > 0 && (
                                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '8px', paddingLeft: '28px' }}>
                                    {reportPhotos.map((photo, idx) => (
                                      <SelectablePhoto
                                        key={`vphoto-${report.id}-${idx}`}
                                        src={photo.url}
                                        label={photo.photoType || `Photo ${idx + 1}`}
                                        itemKey={`vphoto:${report.id}:${idx}`}
                                        selected={submittalSelected.has(`vphoto:${report.id}:${idx}`)}
                                        onToggle={toggleSubmittalItem}
                                        theme={theme}
                                        score={photo.aiScore}
                                      />
                                    ))}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Section 4: Notes & Audit Photos */}
                  {(notesPhotos.length > 0 || auditPhotos.length > 0) && (
                    <div style={{ border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                      <div
                        onClick={() => setSubmittalSections(p => ({ ...p, notes: !p.notes }))}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '12px 16px', backgroundColor: theme.bg, cursor: 'pointer'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          {submittalSections.notes ? <ChevronDown size={16} color={theme.textMuted} /> : <ChevronRight size={16} color={theme.textMuted} />}
                          <Camera size={14} color={theme.textMuted} />
                          <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                            Notes & Audit Photos ({notesPhotos.length + auditPhotos.length})
                          </span>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation()
                            const allKeys = [
                              ...notesPhotos.map(p => `notephoto:${p.id}`),
                              ...auditPhotos.map((_, i) => `auditphoto:${i}`)
                            ]
                            selectAllInGroup(allKeys)
                          }}
                          style={{
                            padding: '4px 10px', fontSize: '11px', fontWeight: '500',
                            backgroundColor: theme.accentBg, color: theme.accent,
                            border: `1px solid ${theme.accent}`, borderRadius: '6px', cursor: 'pointer'
                          }}
                        >
                          {[...notesPhotos.map(p => `notephoto:${p.id}`), ...auditPhotos.map((_, i) => `auditphoto:${i}`)].every(k => submittalSelected.has(k)) ? 'Deselect All' : 'Select All'}
                        </button>
                      </div>
                      {submittalSections.notes && (
                        <div style={{ padding: '8px 16px' }}>
                          {notesPhotos.length > 0 && (
                            <div style={{ marginBottom: '10px' }}>
                              <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase' }}>Notes Photos</div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {notesPhotos.map(photo => {
                                  const key = `notephoto:${photo.id}`
                                  return (
                                    <SubmittalSignedPhoto
                                      key={key}
                                      att={photo}
                                      itemKey={key}
                                      selected={submittalSelected.has(key)}
                                      onToggle={toggleSubmittalItem}
                                      theme={theme}
                                    />
                                  )
                                })}
                              </div>
                            </div>
                          )}
                          {auditPhotos.length > 0 && (
                            <div>
                              <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase' }}>Audit Photos</div>
                              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                                {auditPhotos.map((photo, idx) => (
                                  <SelectablePhoto
                                    key={`audit-${idx}`}
                                    src={photo.url}
                                    label={photo.name || `Audit ${idx + 1}`}
                                    itemKey={`auditphoto:${idx}`}
                                    selected={submittalSelected.has(`auditphoto:${idx}`)}
                                    onToggle={toggleSubmittalItem}
                                    theme={theme}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Section 5: Invoices */}
              {(jobInvoices.length > 0 || jobUtilityInvoices.length > 0) && (
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <div
                    onClick={() => setSubmittalSections(p => ({ ...p, invoices: !p.invoices }))}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px', backgroundColor: theme.bg, cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {submittalSections.invoices ? <ChevronDown size={16} color={theme.textMuted} /> : <ChevronRight size={16} color={theme.textMuted} />}
                      <Receipt size={14} color={theme.textMuted} />
                      <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                        Invoices ({jobInvoices.length + jobUtilityInvoices.length})
                      </span>
                    </div>
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        const allKeys = [
                          ...jobInvoices.filter(i => i.pdf_url).map(i => `invoice:${i.id}`),
                          ...jobUtilityInvoices.map(i => `utilinvoice:${i.id}`)
                        ]
                        selectAllInGroup(allKeys)
                      }}
                      style={{
                        padding: '4px 10px', fontSize: '11px', fontWeight: '500',
                        backgroundColor: theme.accentBg, color: theme.accent,
                        border: `1px solid ${theme.accent}`, borderRadius: '6px', cursor: 'pointer'
                      }}
                    >
                      {[...jobInvoices.filter(i => i.pdf_url).map(i => `invoice:${i.id}`), ...jobUtilityInvoices.map(i => `utilinvoice:${i.id}`)].every(k => submittalSelected.has(k)) ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>
                  {submittalSections.invoices && (
                    <div style={{ padding: '8px 16px 12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {jobInvoices.map(inv => {
                        const key = `invoice:${inv.id}`
                        const hasPdf = !!inv.pdf_url
                        return (
                          <div
                            key={key}
                            onClick={() => hasPdf && toggleSubmittalItem(key)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '10px 12px', borderRadius: '8px',
                              backgroundColor: submittalSelected.has(key) ? 'rgba(59,130,246,0.08)' : theme.bg,
                              border: submittalSelected.has(key) ? '1px solid #3b82f6' : `1px solid ${theme.border}`,
                              cursor: hasPdf ? 'pointer' : 'default',
                              opacity: hasPdf ? 1 : 0.5
                            }}
                          >
                            <div style={{
                              width: '20px', height: '20px', borderRadius: '4px',
                              backgroundColor: submittalSelected.has(key) ? '#3b82f6' : 'rgba(0,0,0,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                              {submittalSelected.has(key) && <Check size={12} color="#fff" />}
                            </div>
                            <FileText size={16} color="#3b82f6" />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>{inv.invoice_id}</div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>
                                {formatCurrency(inv.amount)} — {inv.payment_status} — {new Date(inv.created_at).toLocaleDateString()}
                              </div>
                            </div>
                            {!hasPdf && <span style={{ fontSize: '10px', color: theme.textMuted }}>No PDF</span>}
                          </div>
                        )
                      })}
                      {jobUtilityInvoices.map(inv => {
                        const key = `utilinvoice:${inv.id}`
                        return (
                          <div
                            key={key}
                            onClick={() => toggleSubmittalItem(key)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '10px',
                              padding: '10px 12px', borderRadius: '8px',
                              backgroundColor: submittalSelected.has(key) ? 'rgba(59,130,246,0.08)' : theme.bg,
                              border: submittalSelected.has(key) ? '1px solid #3b82f6' : `1px solid ${theme.border}`,
                              cursor: 'pointer'
                            }}
                          >
                            <div style={{
                              width: '20px', height: '20px', borderRadius: '4px',
                              backgroundColor: submittalSelected.has(key) ? '#3b82f6' : 'rgba(0,0,0,0.1)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                              {submittalSelected.has(key) && <Check size={12} color="#fff" />}
                            </div>
                            <Zap size={16} color="#14b8a6" />
                            <div style={{ flex: 1 }}>
                              <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>UTL-{inv.id}</div>
                              <div style={{ fontSize: '11px', color: theme.textMuted }}>
                                {inv.utility_name} — {formatCurrency(inv.amount)} — {inv.payment_status}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Section 6: Job Notes */}
              {job?.notes && (
                <div style={{ border: `1px solid ${theme.border}`, borderRadius: '10px', overflow: 'hidden' }}>
                  <div
                    onClick={() => toggleSubmittalItem('jobnotes:1')}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '12px 16px', backgroundColor: submittalSelected.has('jobnotes:1') ? 'rgba(59,130,246,0.08)' : theme.bg,
                      border: submittalSelected.has('jobnotes:1') ? '1px solid #3b82f6' : 'none',
                      cursor: 'pointer', borderRadius: '10px'
                    }}
                  >
                    <div style={{
                      width: '20px', height: '20px', borderRadius: '4px',
                      backgroundColor: submittalSelected.has('jobnotes:1') ? '#3b82f6' : 'rgba(0,0,0,0.1)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                    }}>
                      {submittalSelected.has('jobnotes:1') && <Check size={12} color="#fff" />}
                    </div>
                    <Edit2 size={14} color={theme.textMuted} />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                      Job Notes
                    </span>
                    <span style={{ fontSize: '12px', color: theme.textMuted, marginLeft: 'auto' }}>
                      {job.notes.length > 60 ? job.notes.substring(0, 60) + '...' : job.notes}
                    </span>
                  </div>
                </div>
              )}

              {/* Submittal History */}
              {submittalHistory.length > 0 && (
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Previous Submittals
                  </div>
                  {submittalHistory.map(s => (
                    <div key={s.id} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', backgroundColor: theme.bg, borderRadius: '6px',
                      border: `1px solid ${theme.border}`, marginBottom: '4px', fontSize: '12px'
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: theme.text }}>
                        <PackageCheck size={14} color={theme.accent} />
                        {s.file_name}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ color: theme.textMuted }}>{new Date(s.created_at).toLocaleDateString()}</span>
                        <button
                          onClick={async () => {
                            const { data } = await supabase.storage.from(s.storage_bucket).createSignedUrl(s.file_path, 300)
                            if (data?.signedUrl) window.open(data.signedUrl, '_blank')
                          }}
                          style={{ padding: '4px 8px', fontSize: '11px', backgroundColor: theme.accentBg, color: theme.accent, border: 'none', borderRadius: '4px', cursor: 'pointer' }}
                        >
                          <Download size={12} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{
              display: 'flex', flexDirection: 'column', gap: '10px',
              padding: isMobile ? '16px' : '16px 20px',
              borderTop: `1px solid ${theme.border}`
            }}>
              {/* Email row */}
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <Mail size={16} color={theme.textMuted} style={{ flexShrink: 0 }} />
                <input
                  type="email"
                  placeholder="Email to send submittal..."
                  value={submittalEmail}
                  onChange={(e) => setSubmittalEmail(e.target.value)}
                  style={{
                    flex: 1, padding: '8px 12px', border: `1px solid ${theme.border}`,
                    borderRadius: '8px', fontSize: '13px', color: theme.text,
                    backgroundColor: theme.bgCard, outline: 'none', minWidth: 0
                  }}
                />
              </div>
              {/* Message */}
              <textarea
                placeholder="Message to recipient..."
                value={submittalMessage}
                onChange={(e) => setSubmittalMessage(e.target.value)}
                rows={3}
                style={{
                  width: '100%', padding: '8px 12px', border: `1px solid ${theme.border}`,
                  borderRadius: '8px', fontSize: '13px', color: theme.text,
                  backgroundColor: theme.bgCard, outline: 'none', resize: 'vertical',
                  fontFamily: 'inherit', lineHeight: '1.4'
                }}
              />
              {/* Action row */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>
                  {submittalSelected.size} item{submittalSelected.size !== 1 ? 's' : ''} selected
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={handleDownloadSubmittal}
                    disabled={submittalDownloading || submittalSending || submittalSelected.size === 0}
                    style={{
                      padding: '10px 16px', backgroundColor: '#3b82f6', color: '#fff',
                      border: 'none', borderRadius: '8px',
                      cursor: submittalDownloading || submittalSending || submittalSelected.size === 0 ? 'not-allowed' : 'pointer',
                      fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px',
                      opacity: submittalDownloading || submittalSending || submittalSelected.size === 0 ? 0.6 : 1,
                      minHeight: '44px'
                    }}
                  >
                    {submittalDownloading ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={16} />}
                    {submittalDownloading ? submittalProgress : 'Download'}
                  </button>
                  <button
                    onClick={handleSendSubmittal}
                    disabled={submittalSending || submittalDownloading || submittalSelected.size === 0 || !submittalEmail}
                    style={{
                      padding: '10px 16px', backgroundColor: '#5a6349', color: '#fff',
                      border: 'none', borderRadius: '8px',
                      cursor: submittalSending || submittalDownloading || submittalSelected.size === 0 || !submittalEmail ? 'not-allowed' : 'pointer',
                      fontSize: '13px', fontWeight: '500', display: 'flex', alignItems: 'center', gap: '6px',
                      opacity: submittalSending || submittalDownloading || submittalSelected.size === 0 || !submittalEmail ? 0.6 : 1,
                      minHeight: '44px'
                    }}
                  >
                    {submittalSending ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Send size={16} />}
                    {submittalSending ? submittalProgress : 'Send'}
                  </button>
                </div>
              </div>
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
            width: '100%', maxWidth: isMobile ? 'calc(100vw - 32px)' : '400px', maxHeight: '90vh', overflowY: 'auto'
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
                <SearchableSelect
                  options={employees.map(emp => ({ value: emp.id, label: emp.name }))}
                  value={newTime.employee_id}
                  onChange={(val) => setNewTime(prev => ({ ...prev, employee_id: val }))}
                  placeholder="-- Select --"
                  theme={theme}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '480px',
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
                  <SearchableSelect
                    options={employees.map(emp => ({ value: emp.id, label: emp.name }))}
                    value={sectionForm.assigned_to}
                    onChange={(val) => setSectionForm(prev => ({ ...prev, assigned_to: val }))}
                    placeholder="-- Select Employee --"
                    theme={theme}
                  />
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
          <img
            src={viewingPhoto.url}
            alt={viewingPhoto.name || 'Photo'}
            onClick={(e) => e.stopPropagation()}
            onError={(e) => { e.target.style.display = 'none'; e.target.insertAdjacentHTML('afterend', '<div style="color:#fff;font-size:16px;text-align:center">Image failed to load</div>') }}
            style={{ maxWidth: '95vw', maxHeight: '90vh', objectFit: 'contain', borderRadius: '8px', cursor: 'default' }}
          />
        </div>
      )}

      {showCostingModal && job && (
        <JobCostingModal job={job} theme={theme} onClose={() => setShowCostingModal(false)} />
      )}
    </div>
  )
}

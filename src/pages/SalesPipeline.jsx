import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { offlineDb } from '../lib/offlineDb'
import { canEditPipelineStages } from '../lib/accessControl'
import {
  Plus, X, DollarSign, User, Calendar, Phone, Mail, Building2,
  Trophy, XCircle, ChevronRight, RefreshCw, MapPin, Settings, Trash2,
  ChevronUp, ChevronDown, Briefcase, List, Search
} from 'lucide-react'
import EntityCard, { MALE_NAMES, FEMALE_NAMES } from '../components/EntityCard'

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

// Legacy status mapping (old DB values → new unified stages)
const STATUS_MAP = {
  'Assigned': 'New',
  'Callback': 'Contacted',
  'Converted': 'Won',
  'Not Qualified': 'Lost'
}

// All legacy statuses we need to fetch from DB
const LEGACY_STATUSES = ['Assigned', 'Callback', 'Converted', 'Not Qualified']

// Default pipeline stages based on lead status
const defaultStages = [
  // Sales funnel
  { id: 'New', name: 'New', color: '#3b82f6' },
  { id: 'Contacted', name: 'Contacted', color: '#8b5cf6' },
  { id: 'Appointment Set', name: 'Scheduled', color: '#22c55e' },
  { id: 'Qualified', name: 'Qualified', color: '#3b82f6' },
  { id: 'Quote Sent', name: 'Estimate Sent', color: '#8b5cf6' },
  { id: 'Negotiation', name: 'Negotiation', color: '#f59e0b' },
  { id: 'Won', name: 'Won', color: '#10b981', isWon: true },
  // Delivery funnel
  { id: 'Chillin', name: 'Chillin', color: '#94a3b8', isDelivery: true },
  { id: 'Job Scheduled', name: 'Job Scheduled', color: '#0ea5e9', isDelivery: true },
  { id: 'In Progress', name: 'In Progress', color: '#f97316', isDelivery: true },
  { id: 'Job Complete', name: 'Job Complete', color: '#22c55e', isDelivery: true },
  { id: 'Invoiced', name: 'Invoiced', color: '#8b5cf6', isDelivery: true },
  { id: 'Closed', name: 'Closed', color: '#6b7280', isClosed: true },
  // Lost (always last)
  { id: 'Lost', name: 'Lost', color: '#64748b', isLost: true }
]

const PIPELINE_VERSION = 4

// Available stats to show in header
const availableStats = [
  { id: 'salesWon', label: 'Sales Won', color: '#16a34a' },
  { id: 'active', label: 'Active Leads', color: null },
  { id: 'won', label: 'Won', color: '#22c55e' },
  { id: 'lost', label: 'Lost', color: '#64748b' },
  { id: 'totalValue', label: 'Total Value', color: null },
  { id: 'wonValue', label: 'Won Value', color: '#22c55e' },
  { id: 'appointments', label: 'Appointments', color: '#3b82f6' },
  { id: 'todayAppointments', label: 'Today\'s Appts', color: '#16a34a' },
  { id: 'quoteSent', label: 'Estimates Sent', color: '#8b5cf6' },
  { id: 'jobScheduled', label: 'Job Scheduled', color: '#0ea5e9' },
  { id: 'inProgress', label: 'In Progress', color: '#f97316' },
  { id: 'completed', label: 'Completed', color: '#22c55e' },
  { id: 'invoiced', label: 'Invoiced', color: '#8b5cf6' },
  { id: 'deliveryValue', label: 'Delivery Value', color: '#0ea5e9' }
]

const defaultVisibleStats = ['salesWon', 'active', 'won', 'totalValue']

export default function SalesPipeline() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const isAdmin = useStore((state) => state.isAdmin)
  const isDeveloper = useStore((state) => state.isDeveloper)
  const employees = useStore((state) => state.employees)
  const updateLead = useStore((state) => state.updateLead)
  const updateQuote = useStore((state) => state.updateQuote)
  const storeJobs = useStore((state) => state.jobs)
  const fetchJobs = useStore((state) => state.fetchJobs)
  const storeJobStatuses = useStore((state) => state.jobStatuses)

  // Pipeline state
  const [pipelineLeads, setPipelineLeads] = useState([])
  const [stages, setStages] = useState(defaultStages)
  const [visibleStats, setVisibleStats] = useState(defaultVisibleStats)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  // Modals
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [showWonModal, setShowWonModal] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)

  // Selected lead
  const [selectedLead, setSelectedLead] = useState(null)

  // Section expand/collapse (default collapsed so both sections visible)
  const [salesExpanded, setSalesExpanded] = useState(false)
  const [deliveryExpanded, setDeliveryExpanded] = useState(false)

  // Search
  const [searchTerm, setSearchTerm] = useState('')

  // Won/Lost handling
  const [wonNotes, setWonNotes] = useState('')
  const [lostReason, setLostReason] = useState('')

  // Drag state
  const [draggedLead, setDraggedLead] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)

  // Settings form
  const [stageForm, setStageForm] = useState([])
  const [statsForm, setStatsForm] = useState([])

  // Mobile detection
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768)
  const [selectedMobileStage, setSelectedMobileStage] = useState(null)
  const [mobileFilter, setMobileFilter] = useState('All')
  const [mobileSalesExpanded, setMobileSalesExpanded] = useState(true)
  const [mobileDeliveryExpanded, setMobileDeliveryExpanded] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullStartY, setPullStartY] = useState(0)
  const [isPulling, setIsPulling] = useState(false)
  const [touchedCardId, setTouchedCardId] = useState(null)

  // Owner filter — default to logged-in user
  const [ownerFilter, setOwnerFilter] = useState(() => user?.id ? String(user.id) : 'all')
  const canViewAll = isAdmin || isDeveloper

  // Sync owner filter once user loads (initializer runs before user is hydrated).
  // Non-admins are locked to their own scope; admins default to "Mine" but can switch.
  useEffect(() => {
    if (!user?.id) return
    setOwnerFilter(prev => {
      if (!canViewAll) return String(user.id)
      // Admin: only override the initial "all" fallback so we don't undo their selection.
      if (prev === 'all') return String(user.id)
      return prev
    })
  }, [user?.id, canViewAll])

  // Business Unit filter
  const [buFilter, setBuFilter] = useState('all')

  // Date range filter for delivery stages
  const [dateRange, setDateRange] = useState('mtd')

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Get active employees for filter
  const activeEmployees = employees.filter(e => e.active !== false)

  // Compute cutoff date from range selection
  const getDateCutoff = (range) => {
    const now = new Date()
    switch (range) {
      case 'mtd': return new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
      case 'ytd': return new Date(now.getFullYear(), 0, 1).toISOString()
      case 'last30': { const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString() }
      case 'last90': { const d = new Date(); d.setDate(d.getDate() - 90); return d.toISOString() }
      case 'all': return null
      default: return new Date(now.getFullYear(), 0, 1).toISOString()
    }
  }

  // Check if user can edit pipeline settings (Super Admin+)
  const isSuperAdmin = canEditPipelineStages(user)

  // Handle window resize for mobile detection
  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 768)
    }
    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  // Load saved stages and stats from localStorage or use defaults
  useEffect(() => {
    // Pipeline version check — clear cached stages when defaults change
    const savedVersion = localStorage.getItem(`pipeline_version_${companyId}`)
    if (savedVersion !== String(PIPELINE_VERSION)) {
      localStorage.removeItem(`pipeline_stages_${companyId}`)
      localStorage.setItem(`pipeline_version_${companyId}`, String(PIPELINE_VERSION))
    }

    const savedStages = localStorage.getItem(`pipeline_stages_${companyId}`)
    if (savedStages) {
      try {
        const parsed = JSON.parse(savedStages)
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Migration: if saved stages start with old default "Appointment Set", clear them
          if (parsed[0]?.id === 'Appointment Set') {
            localStorage.removeItem(`pipeline_stages_${companyId}`)
          } else {
            setStages(parsed)
          }
        }
      } catch (e) {
        console.error('Error loading saved stages:', e)
      }
    }

    const savedStats = localStorage.getItem(`pipeline_stats_${companyId}`)
    if (savedStats) {
      try {
        const parsed = JSON.parse(savedStats)
        if (Array.isArray(parsed)) {
          setVisibleStats(parsed)
        }
      } catch (e) {
        console.error('Error loading saved stats:', e)
      }
    }
  }, [companyId])

  // Rebuild delivery stages from DB-driven job statuses
  useEffect(() => {
    if (!storeJobStatuses || storeJobStatuses.length === 0) return

    setStages(prev => {
      const salesStages = prev.filter(s => !s.isDelivery && !s.isClosed && !s.isLost)
      const closedStage = prev.find(s => s.isClosed) || { id: 'Closed', name: 'Closed', color: '#6b7280', isClosed: true }
      const lostStage = prev.find(s => s.isLost) || { id: 'Lost', name: 'Lost', color: '#64748b', isLost: true }

      const deliveryStages = storeJobStatuses.map(s => {
        const name = typeof s === 'string' ? s : s.name
        const color = typeof s === 'string' ? '#94a3b8' : (s.color || '#94a3b8')
        return { id: name, name, color, isDelivery: true }
      })

      // Add Invoiced after job statuses
      deliveryStages.push({ id: 'Invoiced', name: 'Invoiced', color: '#8b5cf6', isDelivery: true })

      return [...salesStages, ...deliveryStages, closedStage, lostStage]
    })
  }, [storeJobStatuses])

  // Lead query with owner join
  const LEAD_COLUMNS = '*, lead_owner:employees!leads_lead_owner_id_fkey(id, name), source_employee:employees!leads_lead_source_employee_id_fkey(id, name)'

  // Normalize legacy statuses
  const normalizeLead = (lead) => ({
    ...lead,
    status: STATUS_MAP[lead.status] || lead.status
  })

  // Map standalone job status to pipeline delivery stage
  const mapJobToStage = (job) => {
    if (job.invoice_status === 'Invoiced') return 'Invoiced'
    const status = job.status || 'Chillin'
    // Ensure the status maps to an existing delivery stage
    const hasStage = stages.some(s => s.id === status)
    if (hasStage) return status
    // Legacy fallback: 'Completed' → 'Job Complete'
    if (status === 'Completed' && stages.some(s => s.id === 'Job Complete')) return 'Job Complete'
    if (status === 'Job Complete' && stages.some(s => s.id === 'Completed')) return 'Completed'
    return status
  }

  // Attach jobs data to leads
  const attachJobs = (normalized, jobsData) => {
    if (!jobsData?.length) return
    const jobsByLeadId = {}
    jobsData.forEach(j => {
      if (!jobsByLeadId[j.lead_id]) jobsByLeadId[j.lead_id] = []
      jobsByLeadId[j.lead_id].push(j)
    })
    normalized.forEach(lead => {
      lead.jobs = jobsByLeadId[lead.id] || []
    })
  }

  // Attach ALL quotes to leads (for estimate-based pipeline)
  const attachQuotes = (normalized, quotesData) => {
    if (!quotesData?.length) return
    const quotesByLeadId = {}
    quotesData.forEach(q => {
      if (!q.lead_id) return
      if (!quotesByLeadId[q.lead_id]) quotesByLeadId[q.lead_id] = []
      quotesByLeadId[q.lead_id].push(q)
    })
    normalized.forEach(lead => {
      lead._quotes = quotesByLeadId[lead.id] || []
      if (lead._quotes.length > 0) {
        lead._quoteTotal = Math.max(...lead._quotes.map(q =>
          (parseFloat(q.quote_amount) || 0) + (parseFloat(q.utility_incentive) || 0)
        ))
      }
    })
  }

  // Fetch pipeline leads — cache-first, then refresh from network
  const fetchPipelineLeads = async (background = false) => {
    if (!companyId) return

    if (!background) {
      // Show cached data instantly on first load
      if (pipelineLeads.length === 0) {
        try {
          const cached = await offlineDb.getAll('salesPipeline')
          if (cached.length > 0) {
            setPipelineLeads(cached)
            setLoading(false)
          }
        } catch (e) { /* cache miss is fine */ }
      }
      setRefreshing(true)
    }

    const stageIds = stages.map(s => s.id)
    const allStatuses = [...new Set([...stageIds, ...LEGACY_STATUSES])]

    // Fetch leads
    let { data, error } = await supabase
      .from('leads')
      .select(LEAD_COLUMNS)
      .eq('company_id', companyId)
      .in('status', allStatuses)
      .order('updated_at', { ascending: false })

    // If join fails (e.g. PostgREST schema cache), fall back to simpler query
    if (error) {
      console.warn('[Pipeline] Join query failed, falling back:', error.message);
      ({ data, error } = await supabase
        .from('leads')
        .select('*, lead_owner:employees!leads_lead_owner_id_fkey(id, name)')
        .eq('company_id', companyId)
        .in('status', allStatuses)
        .order('updated_at', { ascending: false }))
    }

    if (error) {
      console.error('[Pipeline] Error fetching leads:', error)
      setLoading(false)
      setRefreshing(false)
      return
    }

    const normalized = (data || []).map(normalizeLead)

    // Fetch job data in parallel for delivery/won leads
    const deliveryLeadIds = normalized.filter(l => {
      const s = stages.find(st => st.id === l.status)
      return s?.isDelivery || s?.isClosed || s?.isWon
    }).map(l => l.id)

    if (deliveryLeadIds.length > 0) {
      try {
        const { data: jobsData } = await supabase
          .from('jobs')
          .select('id, lead_id, job_id, status, job_total, utility_incentive, assigned_team, invoice_status, salesperson_id, pm_id, job_lead_id, business_unit')
          .in('lead_id', deliveryLeadIds)
        attachJobs(normalized, jobsData)
      } catch (e) { /* non-critical */ }
    }

    // Fetch quote totals for all leads
    const allLeadIds = normalized.map(l => l.id).filter(id => typeof id === 'number' || (typeof id === 'string' && !id.startsWith('job-')))
    if (allLeadIds.length > 0) {
      try {
        // Fetch in batches if needed (PostgREST IN limit)
        const batchSize = 200
        const allQuotes = []
        for (let i = 0; i < allLeadIds.length; i += batchSize) {
          const batch = allLeadIds.slice(i, i + batchSize)
          const { data: quotesData } = await supabase
            .from('quotes')
            .select('id, lead_id, quote_amount, utility_incentive, status, estimate_name, quote_id, approved_date, rejected_date, created_at, updated_at, salesperson_id')
            .in('lead_id', batch)
          if (quotesData) allQuotes.push(...quotesData)
        }
        attachQuotes(normalized, allQuotes)
      } catch (e) { /* non-critical */ }
    }

    // Fetch standalone jobs for delivery stages
    try {
      const jobSelect = 'id, job_id, job_title, status, start_date, business_unit, customer_id, job_total, utility_incentive, assigned_team, invoice_status, lead_id, salesperson_id, pm_id, job_lead_id, customer:customers!customer_id(id, name)'
      const rangeCutoff = getDateCutoff(dateRange)

      // Determine which statuses are "terminal" (completed-like) vs active
      const terminalStatuses = ['Completed', 'Verified Complete']
      const allJobStatuses = (storeJobStatuses || []).map(s => typeof s === 'string' ? s : s.name)
      const activeStatuses = allJobStatuses.filter(s => !terminalStatuses.includes(s))

      // Active jobs: always fetch ALL regardless of date range (they're current work)
      let activeQuery = supabase.from('jobs').select(jobSelect)
        .eq('company_id', companyId)
        .in('status', activeStatuses.length > 0 ? activeStatuses : ['Chillin', 'Scheduled', 'Needs scheduling', 'In Progress', 'Pre Inspection (Req)', 'Waiting Product', 'Post Inspection (Req)'])
        .limit(5000)

      let completedQuery = supabase.from('jobs').select(jobSelect)
        .eq('company_id', companyId)
        .in('status', terminalStatuses)
        .limit(5000)
      if (rangeCutoff) completedQuery = completedQuery.gte('start_date', rangeCutoff)

      const [activeRes, completedRes] = await Promise.all([activeQuery, completedQuery])

      const standaloneJobs = [...(activeRes.data || []), ...(completedRes.data || [])]

      if (standaloneJobs.length) {
        const pipelineLeadIds = new Set(normalized.map(l => l.id))
        const todayStr = new Date().toISOString().split('T')[0]

        const orphanJobs = standaloneJobs.filter(j => !j.lead_id || !pipelineLeadIds.has(j.lead_id))
        orphanJobs.forEach(job => {
          const stage = mapJobToStage(job)

          // For scheduled-type jobs, skip past-dated jobs
          if (job.status === 'Scheduled' || job.status === 'Needs scheduling') {
            const jobDate = job.start_date ? new Date(job.start_date).toISOString().split('T')[0] : null
            if (jobDate && jobDate < todayStr) return
          }

          normalized.push({
            id: `job-${job.id}`,
            _isJob: true,
            _jobId: job.id,
            customer_name: job.customer?.name || job.job_title || 'Untitled Job',
            business_name: null,
            business_unit: job.business_unit,
            status: stage,
            quote_amount: (parseFloat(job.job_total) || 0) + (parseFloat(job.utility_incentive) || 0),
            created_at: job.start_date,
            lead_owner: null,
            lead_owner_id: job.pm_id || job.job_lead_id || null,
            salesperson_id: job.salesperson_id || null,
            _pmId: job.pm_id || null,
            _jobLeadId: job.job_lead_id || null,
            lead_source: 'Direct Job',
            jobs: [job],
          })
        })
      }
    } catch (e) { /* non-critical */ }

    setPipelineLeads(normalized)
    setLoading(false)
    setRefreshing(false)

    // Cache for instant load next time
    try { await offlineDb.putAll('salesPipeline', normalized) } catch (e) { /* ok */ }
  }

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchPipelineLeads()
  }, [companyId, navigate, stages, dateRange])

  // Extract unique business units for filter dropdown.
  // Sources: lead.business_unit (sales-stage leads) AND any business_unit
  // on the lead's attached jobs (delivery-stage leads usually have BU on
  // the job, not the lead).
  const businessUnits = useMemo(() => {
    const bus = new Set()
    const collect = (raw) => {
      if (!raw) return
      const name = typeof raw === 'object' ? raw.name : raw
      if (name) bus.add(name)
    }
    pipelineLeads.forEach(l => {
      collect(l.business_unit)
      ;(l.jobs || []).forEach(j => collect(j.business_unit))
    })
    return [...bus].sort()
  }, [pipelineLeads])

  // Filter leads by search, owner, and business unit
  const filteredPipelineLeads = pipelineLeads.filter(lead => {
    // Search filter — match name, phone, email, address, notes
    if (searchTerm) {
      const term = searchTerm.toLowerCase()
      const searchable = [
        lead.customer_name,
        lead.business_name,
        lead.phone,
        lead.email,
        lead.address,
        lead.city,
        lead.notes,
        lead.lead_owner?.name,
        lead.source_employee?.name,
        lead.lead_source,
      ].filter(Boolean).join(' ').toLowerCase()
      if (!searchable.includes(term)) return false
    }

    // Owner filter — applies to leads AND jobs.
    // Non-admins are always scoped to their own records, even if the filter state
    // somehow says "all" (e.g. stale state before user hydrated).
    const effectiveOwnerFilter = (!canViewAll && user?.id)
      ? String(user.id)
      : ownerFilter
    if (effectiveOwnerFilter !== 'all') {
      const ownerId = parseInt(effectiveOwnerFilter)
      if (effectiveOwnerFilter === 'unassigned') {
        if (lead.lead_owner_id || lead.salesperson_id) return false
      } else if (lead._isJob) {
        // For standalone jobs, match salesperson or lead owner only.
        // PM / job-lead matches were too loose — they made reps see deals
        // they didn't sell just because they were assigned to install.
        if (lead.salesperson_id !== ownerId && lead.lead_owner_id !== ownerId) return false
      } else {
        // Lead-level ownership only — the salesperson/lead owner ON THE LEAD.
        // Previously we also matched on jobs.salesperson_id / pm_id /
        // job_lead_id, which surfaced leads where the rep was just the
        // installer or PM on a single attached job. That made reps see
        // jobs they didn't sell.
        if (lead.lead_owner_id !== ownerId && lead.salesperson_id !== ownerId) return false
      }
    }
    if (buFilter !== 'all') {
      // Match the lead's BU OR any attached job's BU. Delivery-stage
      // leads often have BU only on the job, not the lead row.
      const leadBu = typeof lead.business_unit === 'object' ? lead.business_unit?.name : (lead.business_unit || '')
      const jobBuMatch = (lead.jobs || []).some(j => {
        const jbu = typeof j.business_unit === 'object' ? j.business_unit?.name : (j.business_unit || '')
        return jbu === buFilter
      })
      if (leadBu !== buFilter && !jobBuMatch) return false
    }
    return true
  })

  // Get leads for a stage
  // Pre-estimate stages show lead cards; estimate stages show one card per quote
  const PRE_ESTIMATE_STAGES = ['New', 'Contacted', 'Appointment Set', 'Qualified']
  const QUOTE_STATUS_MAP = { 'Quote Sent': 'Sent', 'Negotiation': 'Negotiation', 'Won': 'Approved', 'Lost': 'Rejected' }

  const getLeadsForStage = (stageId) => {
    // PRE-ESTIMATE STAGES: return lead cards (same as before)
    if (PRE_ESTIMATE_STAGES.includes(stageId)) {
      return filteredPipelineLeads
        .filter(l => l.status === stageId)
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
    }

    // ESTIMATE STAGES: return one card per quote with matching status
    const quoteStatus = QUOTE_STATUS_MAP[stageId]
    if (quoteStatus) {
      const estimateCards = []
      filteredPipelineLeads.forEach(lead => {
        if (!lead._quotes || lead._quotes.length === 0) {
          // Fallback: if lead has no quotes but status matches, show as lead card
          if (lead.status === stageId) {
            estimateCards.push(lead)
          }
          return
        }
        lead._quotes
          .filter(q => q.status === quoteStatus)
          .forEach(q => {
            estimateCards.push({
              ...lead,
              _isEstimate: true,
              _quoteId: q.id,
              _quoteName: q.estimate_name || q.quote_id || `EST-${q.id}`,
              _quoteAmount: (parseFloat(q.quote_amount) || 0) + (parseFloat(q.utility_incentive) || 0),
              _quoteStatus: q.status,
              _quoteApprovedDate: q.approved_date,
              _quoteRejectedDate: q.rejected_date,
              _quoteCreatedAt: q.created_at,
              id: `quote-${q.id}`,
              _originalLeadId: lead.id,
            })
          })
      })

      // Won column: also include quotes approved THIS MONTH that may have moved to delivery
      if (stageId === 'Won') {
        const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        filteredPipelineLeads.forEach(lead => {
          if (!lead._quotes) return
          lead._quotes
            .filter(q => q.status === 'Approved' && q.approved_date && new Date(q.approved_date) >= firstOfMonth)
            .forEach(q => {
              // Don't duplicate if already in the list
              if (!estimateCards.find(c => c._quoteId === q.id)) {
                estimateCards.push({
                  ...lead,
                  _isEstimate: true,
                  _quoteId: q.id,
                  _quoteName: q.estimate_name || q.quote_id || `EST-${q.id}`,
                  _quoteAmount: (parseFloat(q.quote_amount) || 0) + (parseFloat(q.utility_incentive) || 0),
                  _quoteStatus: q.status,
                  _quoteApprovedDate: q.approved_date,
                  _quoteCreatedAt: q.created_at,
                  id: `quote-${q.id}`,
                  _originalLeadId: lead.id,
                })
              }
            })
        })
      }

      return estimateCards.sort((a, b) =>
        new Date(b._quoteCreatedAt || b.created_at || 0) - new Date(a._quoteCreatedAt || a.created_at || 0)
      )
    }

    // DELIVERY / OTHER STAGES: lead cards by status (unchanged)
    return filteredPipelineLeads
      .filter(l => l.status === stageId)
      .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
  }

  // Get effective dollar amount for a lead or estimate card
  const getLeadAmount = (l) => {
    // Estimate card: use the specific quote amount
    if (l._isEstimate) return l._quoteAmount || 0

    // Lead card with jobs: use job total
    const job = l.jobs?.[0]
    if (job) {
      const jobTotal = parseFloat(job.job_total) || 0
      const incentive = parseFloat(job.utility_incentive) || 0
      if (jobTotal > 0 || incentive > 0) return jobTotal + incentive
    }
    if (l._quoteTotal > 0) return l._quoteTotal
    return parseFloat(l.quote_amount) || 0
  }

  // Get stage value
  const getStageValue = (stageId) => {
    return getLeadsForStage(stageId).reduce((sum, l) => sum + getLeadAmount(l), 0)
  }

  // Check if appointment is today
  const isToday = (dateStr) => {
    if (!dateStr) return false
    return new Date(dateStr).toDateString() === new Date().toDateString()
  }

  // Drag handlers
  const handleDragStart = (e, lead) => {
    setDraggedLead(lead)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', lead.id.toString())
  }

  const handleDragEnd = () => {
    setDraggedLead(null)
    setDragOverStage(null)
  }

  const handleDragOver = (e, stageId) => {
    const stage = stages.find(s => s.id === stageId)
    if (stage?.isDelivery || stage?.isClosed) {
      e.preventDefault()
      return
    }
    e.preventDefault()
    setDragOverStage(stageId)
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  const handleDrop = async (e, targetStageId) => {
    e.preventDefault()
    setDragOverStage(null)

    if (!draggedLead) return

    const stage = stages.find(s => s.id === targetStageId)

    // Block drag-drop into delivery stages (they auto-advance via job sync)
    if (stage?.isDelivery || stage?.isClosed) return

    // ESTIMATE CARD being dragged
    if (draggedLead._isEstimate) {
      // Block estimate cards from going back to pre-estimate stages
      if (PRE_ESTIMATE_STAGES.includes(targetStageId)) return

      if (stage?.isWon) {
        setSelectedLead(draggedLead)
        setShowWonModal(true)
        return
      }
      if (stage?.isLost) {
        setSelectedLead(draggedLead)
        setShowLostModal(true)
        return
      }

      // Move estimate between Quote Sent / Negotiation
      const newQuoteStatus = QUOTE_STATUS_MAP[targetStageId]
      if (newQuoteStatus) {
        await updateQuote(draggedLead._quoteId, {
          status: newQuoteStatus,
          updated_at: new Date().toISOString()
        })
      }
      setDraggedLead(null)
      await fetchPipelineLeads()
      return
    }

    // LEAD CARD being dragged (pre-estimate stages)
    if (draggedLead.status === targetStageId) return

    // Handle Won/Lost stages for lead cards
    if (stage?.isWon) {
      setSelectedLead(draggedLead)
      setShowWonModal(true)
      return
    }

    if (stage?.isLost) {
      setSelectedLead(draggedLead)
      setShowLostModal(true)
      return
    }

    // Update lead status
    await updateLead(draggedLead.id, {
      status: targetStageId,
      updated_at: new Date().toISOString()
    })

    setDraggedLead(null)
    await fetchPipelineLeads()
  }

  // Open lead detail
  const openLeadDetail = (lead) => {
    setSelectedLead(lead)
    setShowDetailPanel(true)
  }

  // Close detail panel
  const closeDetailPanel = () => {
    setShowDetailPanel(false)
    setSelectedLead(null)
  }

  // Mark as Won
  const handleMarkAsWon = async () => {
    if (!selectedLead) return

    if (selectedLead._isEstimate) {
      // Update the specific QUOTE to Approved
      await updateQuote(selectedLead._quoteId, {
        status: 'Approved',
        approved_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      // Auto-create a job in Chillin status for this won estimate
      const leadId = selectedLead._originalLeadId
      try {
        const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`
        const { data: newJob } = await supabase.from('jobs').insert({
          company_id: companyId,
          job_id: jobNumber,
          job_title: selectedLead.customer_name + ' - ' + (selectedLead._quoteName || 'Won Estimate'),
          customer_id: selectedLead.customer_id || null,
          customer_name: selectedLead.customer_name || null,
          email: selectedLead.email || null,
          phone: selectedLead.phone || null,
          address: selectedLead.address || null,
          salesperson_id: selectedLead.salesperson_id || selectedLead.lead_owner_id || null,
          quote_id: selectedLead._quoteId,
          lead_id: leadId,
          job_total: selectedLead._quoteAmount || 0,
          status: 'Chillin',
          notes: wonNotes || null,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).select().single()

        if (newJob) {
          // Carry canonical customer signature from the lead onto the new
          // job so downstream attachments (W9, credit app, etc.) auto-stamp.
          try {
            const { data: leadSig } = await supabase
              .from('leads')
              .select('customer_signature_path, customer_signature_typed, customer_signature_method, customer_signature_captured_at')
              .eq('id', leadId)
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
            console.warn('[Pipeline] signature carry-over failed', sigErr)
          }
          await fetchJobs()
        }
      } catch (e) {
        console.error('[Pipeline] Auto-create job failed:', e)
      }

      // Check if ALL quotes for this lead are now Approved → auto-win the lead
      const parentLead = pipelineLeads.find(l => l.id === leadId)
      if (parentLead && parentLead._quotes) {
        const allApproved = parentLead._quotes.every(q =>
          q.id === selectedLead._quoteId ? true : q.status === 'Approved'
        )
        if (allApproved) {
          await updateLead(leadId, { status: 'Won', converted_at: new Date().toISOString() })
        }
      }
    } else {
      // Lead card (pre-estimate) dragged to Won
      await updateLead(selectedLead.id, {
        status: 'Won',
        converted_at: new Date().toISOString(),
        notes: selectedLead.notes
          ? `${selectedLead.notes}\n\nWON: ${wonNotes}`
          : `WON: ${wonNotes}`
      })
    }

    setShowWonModal(false)
    setWonNotes('')
    setSelectedLead(null)
    setDraggedLead(null)
    await fetchPipelineLeads()
  }

  // Mark as Lost
  const handleMarkAsLost = async () => {
    if (!selectedLead || !lostReason) return

    if (selectedLead._isEstimate) {
      // Update the specific QUOTE to Rejected
      await updateQuote(selectedLead._quoteId, {
        status: 'Rejected',
        rejected_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })

      // Check if ALL quotes for this lead are now Rejected → auto-lose the lead
      const leadId = selectedLead._originalLeadId
      const parentLead = pipelineLeads.find(l => l.id === leadId)
      if (parentLead && parentLead._quotes) {
        const allRejected = parentLead._quotes.every(q =>
          q.id === selectedLead._quoteId ? true : q.status === 'Rejected'
        )
        if (allRejected) {
          await updateLead(leadId, { status: 'Lost' })
        }
      }
    } else {
      // Lead card dragged to Lost
      await updateLead(selectedLead.id, {
        status: 'Lost',
        notes: selectedLead.notes
          ? `${selectedLead.notes}\n\nLOST: ${lostReason}`
          : `LOST: ${lostReason}`
      })
    }

    setShowLostModal(false)
    setLostReason('')
    setSelectedLead(null)
    setDraggedLead(null)
    await fetchPipelineLeads()
  }

  // Open settings modal
  const openSettings = () => {
    setStageForm(stages.map(s => ({ ...s })))
    setStatsForm([...visibleStats])
    setShowSettingsModal(true)
  }

  // Save settings
  const saveSettings = () => {
    // Filter out empty stages and finalize IDs for new stages
    const validStages = stageForm
      .filter(s => s.name && s.name.trim())
      .map(s => {
        if (s.isNew) {
          // Set the ID based on the final name
          return { ...s, id: s.name.trim().replace(/\s+/g, '_'), isNew: undefined }
        }
        return s
      })
    setStages(validStages)
    setVisibleStats(statsForm)
    localStorage.setItem(`pipeline_stages_${companyId}`, JSON.stringify(validStages))
    localStorage.setItem(`pipeline_stats_${companyId}`, JSON.stringify(statsForm))
    setShowSettingsModal(false)
  }

  // Toggle stat visibility
  const toggleStat = (statId) => {
    if (statsForm.includes(statId)) {
      setStatsForm(statsForm.filter(s => s !== statId))
    } else {
      setStatsForm([...statsForm, statId])
    }
  }

  // Add new stage
  const addStage = () => {
    const newStage = {
      id: `custom_${Date.now()}`,
      name: 'New Stage',
      color: '#6b7280',
      isNew: true
    }
    setStageForm([...stageForm.slice(0, -2), newStage, ...stageForm.slice(-2)])
  }

  // Update stage in form
  const updateStage = (index, field, value) => {
    const updated = [...stageForm]
    updated[index] = { ...updated[index], [field]: value }
    setStageForm(updated)
  }

  // Delete stage
  const deleteStage = (index) => {
    const stage = stageForm[index]
    if (stage.isWon || stage.isLost || stage.isDelivery || stage.isClosed) {
      alert('Cannot delete system stages')
      return
    }
    const updated = stageForm.filter((_, i) => i !== index)
    setStageForm(updated)
  }

  // Move stage up
  const moveStageUp = (index) => {
    if (index <= 0) return
    const stage = stageForm[index]
    // Can't move Won/Lost or move past them
    if (stage.isWon || stage.isLost) return
    const updated = [...stageForm]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    setStageForm(updated)
  }

  // Move stage down
  const moveStageDown = (index) => {
    // Find the last non-Won/Lost stage index
    const lastActiveIndex = stageForm.findIndex(s => s.isWon || s.isLost) - 1
    if (index >= lastActiveIndex || index < 0) return
    const stage = stageForm[index]
    if (stage.isWon || stage.isLost) return
    const updated = [...stageForm]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    setStageForm(updated)
  }

  // Reset to defaults
  const resetToDefaults = () => {
    setStageForm(defaultStages.map(s => ({ ...s })))
    setStatsForm([...defaultVisibleStats])
  }

  // Format currency
  const formatCurrency = (value) => {
    if (!value) return '$0'
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value)
  }

  // Styles
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard
  }

  // Calculate all stats (memoized — must be before any early returns)
  // Uses filteredPipelineLeads so stats match what's visible on screen (owner/BU filters apply)
  const statsData = useMemo(() => {
    const stageMap = new Map(stages.map(s => [s.id, s]))
    const leads = filteredPipelineLeads
    const activeLeads = leads.filter(l => { const s = stageMap.get(l.status); return s && !s.isWon && !s.isLost && !s.isDelivery && !s.isClosed })
    const wonLeadsList = leads.filter(l => l.status === 'Won')
    const lostLeadsList = leads.filter(l => l.status === 'Lost')
    const deliveryLeads = leads.filter(l => stageMap.get(l.status)?.isDelivery)
    const today = new Date().toDateString()
    const leadsWithAppointments = leads.filter(l => l.appointment_time)
    const todayAppointments = leadsWithAppointments.filter(l => new Date(l.appointment_time).toDateString() === today)
    const sumAmount = (arr) => arr.reduce((sum, l) => sum + getLeadAmount(l), 0)

    // "Sales Won" — completed jobs value (matches Dashboard)
    // This is the most concrete number: work done = money earned
    const rangeCutoff = getDateCutoff(dateRange)
    const completedJobsInRange = (storeJobs || []).filter(j => {
      if (j.status !== 'Completed') return false
      const jobDate = j.start_date || j.updated_at
      if (!jobDate) return false
      if (rangeCutoff && new Date(jobDate) < new Date(rangeCutoff)) return false
      return true
    })
    const salesWonTotal = completedJobsInRange.reduce((sum, j) => sum + (parseFloat(j.job_total) || 0), 0)
    const salesWonCount = completedJobsInRange.length

    return {
      salesWon: { value: formatCurrency(salesWonTotal), label: `Jobs Won`, sublabel: `${salesWonCount} completed`, color: '#16a34a', isFormatted: true },
      active: { value: activeLeads.length, label: 'Active', color: null },
      won: { value: wonLeadsList.length, label: 'Won', color: '#22c55e' },
      lost: { value: lostLeadsList.length, label: 'Lost', color: '#64748b' },
      totalValue: { value: formatCurrency(sumAmount(leads)), label: 'Pipeline Value', color: null, isFormatted: true },
      wonValue: { value: formatCurrency(sumAmount(wonLeadsList)), label: 'Won Value', color: '#22c55e', isFormatted: true },
      appointments: { value: leadsWithAppointments.length, label: 'Appts', color: '#3b82f6' },
      todayAppointments: { value: todayAppointments.length, label: 'Today', color: '#16a34a' },
      quoteSent: { value: leads.filter(l => l.status === 'Quote Sent').length, label: 'Estimates', color: '#8b5cf6' },
      jobScheduled: { value: leads.filter(l => stages.find(s => s.id === l.status)?.isDelivery && l.status !== 'Invoiced').length, label: 'In Delivery', color: '#0ea5e9' },
      inProgress: { value: leads.filter(l => l.status === 'In Progress' || l.status === 'Scheduled').length, label: 'In Progress', color: '#f97316' },
      completed: { value: leads.filter(l => l.status === 'Completed' || l.status === 'Verified Complete').length, label: 'Complete', color: '#22c55e' },
      invoiced: { value: leads.filter(l => l.status === 'Invoiced').length, label: 'Invoiced', color: '#8b5cf6' },
      deliveryValue: { value: formatCurrency(sumAmount(deliveryLeads)), label: 'Delivery $', color: '#0ea5e9', isFormatted: true }
    }
  }, [filteredPipelineLeads, stages, dateRange])

  if (loading && pipelineLeads.length === 0) {
    return (
      <div style={{ padding: isMobile ? '16px' : '24px', textAlign: 'center', color: theme.textMuted }}>
        Loading pipeline...
      </div>
    )
  }

  // Identify delivery-phase boundaries for visual separator
  const firstDeliveryIndex = stages.findIndex(s => s.isDelivery)

  return (
    <div style={{ padding: isMobile ? '12px' : '16px', minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      {isMobile ? (
        null /* mobile header is rendered below in the mobile view block */
      ) : (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '16px',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <div>
            <h1 style={{ fontSize: '22px', fontWeight: '700', color: theme.text, margin: 0 }}>
              Sales Pipeline
            </h1>
            <p style={{ fontSize: '13px', color: theme.textMuted, margin: '4px 0 0' }}>
              Track leads through the sales process. Drag to move between stages.
            </p>
          </div>

          <div style={{ position: 'relative', minWidth: '220px' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
            <input
              type="text"
              placeholder="Search leads... name, phone, email, address"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '9px 12px 9px 34px',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                fontSize: '13px',
                color: theme.text,
                backgroundColor: theme.bgCard,
                outline: 'none',
              }}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{
                  position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '2px',
                  display: 'flex', alignItems: 'center'
                }}
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {visibleStats.length > 0 && (
              <div style={{
                display: 'flex',
                gap: '16px',
                padding: '8px 16px',
                backgroundColor: theme.bgCard,
                borderRadius: '8px',
                border: `1px solid ${theme.border}`
              }}>
                {visibleStats.map((statId, idx) => {
                  const stat = statsData[statId]
                  if (!stat) return null
                  return (
                    <div key={statId} style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      {idx > 0 && <div style={{ width: '1px', height: '32px', backgroundColor: theme.border }} />}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: stat.color || theme.text }}>
                          {stat.value}
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>{stat.label}</div>
                        {stat.sublabel && <div style={{ fontSize: '10px', color: theme.textMuted }}>{stat.sublabel}</div>}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            <div style={{ display: 'flex', gap: '2px', backgroundColor: theme.bgCard, borderRadius: '8px', border: `1px solid ${theme.border}`, padding: '2px' }}>
              {[
                { id: 'mtd', label: 'MTD' },
                { id: 'ytd', label: 'YTD' },
                { id: 'last30', label: '30d' },
                { id: 'last90', label: '90d' },
                { id: 'all', label: 'All' }
              ].map(opt => (
                <button
                  key={opt.id}
                  onClick={() => setDateRange(opt.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '12px',
                    fontWeight: dateRange === opt.id ? '600' : '400',
                    backgroundColor: dateRange === opt.id ? theme.accent : 'transparent',
                    color: dateRange === opt.id ? '#fff' : theme.textMuted,
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            <select
              value={ownerFilter}
              onChange={(e) => setOwnerFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                color: theme.text,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              {canViewAll && <option value="all">All Owners</option>}
              {canViewAll && <option value="unassigned">Unassigned</option>}
              {(canViewAll ? activeEmployees : activeEmployees.filter(e => e.id === user?.id)).map(emp => (
                <option key={emp.id} value={emp.id}>{emp.id === user?.id ? `${emp.name} (Me)` : emp.name}</option>
              ))}
            </select>

            <select
              value={buFilter}
              onChange={(e) => setBuFilter(e.target.value)}
              style={{
                padding: '8px 12px',
                backgroundColor: theme.bgCard,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                color: theme.text,
                fontSize: '13px',
                cursor: 'pointer'
              }}
            >
              <option value="all">All Business Units</option>
              {businessUnits.map(bu => <option key={bu} value={bu}>{bu}</option>)}
            </select>

            <button
              onClick={fetchPipelineLeads}
              disabled={refreshing}
              style={{
                padding: '10px',
                backgroundColor: 'transparent',
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                cursor: refreshing ? 'wait' : 'pointer',
                color: theme.textSecondary
              }}
              title="Refresh"
            >
              <RefreshCw size={18} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
            </button>

            {isSuperAdmin && (
              <button
                onClick={openSettings}
                style={{
                  padding: '10px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: theme.textSecondary
                }}
                title="Pipeline Settings"
              >
                <Settings size={18} />
              </button>
            )}

            <button
              onClick={() => navigate('/leads')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                backgroundColor: 'transparent',
                color: theme.textSecondary,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px'
              }}
              title="Switch to list view"
            >
              List View
            </button>

            <button
              onClick={() => navigate('/leads')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                backgroundColor: theme.accent,
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500'
              }}
            >
              <Plus size={18} />
              Add Lead
            </button>
          </div>
        </div>
      )}

      {/* Mobile View — dark theme, full PWA experience */}
      {isMobile ? (() => {
        const m = { bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8', text: '#2c3530', textMuted: '#7d8a7f', accent: '#5a6349' }
        const stageColorMap = Object.fromEntries(stages.map(s => [s.id, s.color]))
        const getStatusColor = (status) => stageColorMap[status] || '#71717a'
        const salesStages = stages.filter(s => !s.isDelivery && !s.isClosed)
        const deliveryStages = stages.filter(s => s.isDelivery || s.isClosed)

        // Filter leads by mobile tab
        const mobileLeads = mobileFilter === 'All'
          ? filteredPipelineLeads.filter(l => { const s = stages.find(st => st.id === l.status); return s && !s.isDelivery && !s.isClosed })
          : filteredPipelineLeads.filter(l => l.status === mobileFilter)

        const deliveryLeadsList = filteredPipelineLeads.filter(l => { const s = stages.find(st => st.id === l.status); return s && (s.isDelivery || s.isClosed) })

        const filterTabs = [
          { id: 'All', label: 'All', color: '#71717a' },
          ...salesStages.map(s => ({ id: s.id, label: s.name, color: getStatusColor(s.id) }))
        ]

        const getSourceStyle = (source) => {
          if (source?.includes('Lenard') || source?.includes('SRP') || source?.includes('RMP')) return { bg: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.25)' }
          if (source === 'Referral') return { bg: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }
          return { bg: 'rgba(90,99,73,0.08)', color: '#7d8a7f', border: `1px solid ${m.border}` }
        }

        // Pull to refresh handlers
        const handleTouchStart = (e) => { setPullStartY(e.touches[0].clientY) }
        const handleTouchMove = (e) => {
          const scrollEl = e.currentTarget
          if (scrollEl.scrollTop > 0) return
          const diff = e.touches[0].clientY - pullStartY
          if (diff > 0) { setPullDistance(Math.min(diff, 100)); setIsPulling(true) }
        }
        const handleTouchEnd = () => {
          if (pullDistance > 70) { fetchPipelineLeads(); setRefreshing(true) }
          setPullDistance(0); setIsPulling(false)
        }

        return (
          <div style={{ position: 'fixed', inset: 0, top: '64px', backgroundColor: m.bg, display: 'flex', flexDirection: 'column', zIndex: 10 }}>

            {/* Sticky Header Bar */}
            <div style={{ height: '56px', backgroundColor: m.bg, borderBottom: `1px solid ${m.border}`, display: 'flex', alignItems: 'center', padding: '0 16px', flexShrink: 0, zIndex: 100 }}>
              <span style={{ fontSize: '16px', fontWeight: '700', color: m.text, flex: 1 }}>Sales Pipeline</span>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button onClick={() => navigate('/leads')} style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', border: `1px solid ${m.border}`, borderRadius: '8px', color: m.textMuted }}>
                  <List size={18} />
                </button>
                <button onClick={() => { fetchPipelineLeads(); setRefreshing(true) }} style={{ width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'transparent', border: `1px solid ${m.border}`, borderRadius: '8px', color: m.textMuted }}>
                  <RefreshCw size={18} style={refreshing ? { animation: 'spin 1s linear infinite' } : undefined} />
                </button>
                <button onClick={() => navigate('/leads')} style={{ height: '40px', padding: '0 12px', display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: '#5a6349', border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '600' }}>
                  <Plus size={16} /> Add
                </button>
              </div>
            </div>

            {/* Search Bar */}
            <div style={{ padding: '8px 16px', backgroundColor: m.bg, borderBottom: `1px solid ${m.border}`, flexShrink: 0 }}>
              <div style={{ position: 'relative' }}>
                <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: m.textMuted }} />
                <input
                  type="text"
                  placeholder="Search leads..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  style={{
                    width: '100%', padding: '10px 36px 10px 34px', border: `1px solid ${m.border}`,
                    borderRadius: '10px', fontSize: '14px', color: m.text,
                    backgroundColor: m.bgCard, outline: 'none', minHeight: '44px'
                  }}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: m.textMuted, padding: '4px', display: 'flex', alignItems: 'center' }}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Scrollable content */}
            <div
              style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', WebkitOverflowScrolling: 'touch' }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
            >
              {/* Pull indicator */}
              {isPulling && (
                <div style={{ textAlign: 'center', padding: '8px 0', color: m.textMuted, fontSize: '12px', transition: 'opacity 0.2s', opacity: pullDistance > 20 ? 1 : 0 }}>
                  {pullDistance > 70 ? '↑ Release to refresh' : '↓ Pull to refresh'}
                </div>
              )}

              {/* Stats Row */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {[
                  { label: 'Sales Won', value: statsData.salesWon.value, color: '#16a34a', isFormatted: true },
                  { label: 'Active', value: statsData.active.value, color: '#5a6349' },
                  { label: 'Won', value: statsData.won.value, color: '#22c55e' }
                ].map(s => (
                  <div key={s.label} style={{ flex: 1, height: '64px', backgroundColor: m.bgCard, borderRadius: '12px', border: `1px solid ${m.border}`, borderLeft: `3px solid ${s.color}`, padding: '10px 12px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: m.text }}>{s.isFormatted ? s.value : s.value}</div>
                    <div style={{ fontSize: '11px', color: m.textMuted }}>{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Date range pills */}
              <div style={{ display: 'flex', gap: '4px', marginBottom: '8px', backgroundColor: m.bgCard, borderRadius: '8px', border: `1px solid ${m.border}`, padding: '3px' }}>
                {[
                  { id: 'mtd', label: 'MTD' },
                  { id: 'ytd', label: 'YTD' },
                  { id: 'last30', label: '30d' },
                  { id: 'last90', label: '90d' },
                  { id: 'all', label: 'All' }
                ].map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => setDateRange(opt.id)}
                    style={{
                      flex: 1,
                      padding: '6px 0',
                      fontSize: '12px',
                      fontWeight: dateRange === opt.id ? '600' : '400',
                      backgroundColor: dateRange === opt.id ? '#5a6349' : 'transparent',
                      color: dateRange === opt.id ? '#fff' : m.textMuted,
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer'
                    }}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Owner + BU filters */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                <select
                  value={ownerFilter}
                  onChange={(e) => setOwnerFilter(e.target.value)}
                  style={{ flex: 1, padding: '10px 12px', backgroundColor: m.bgCard, border: `1px solid ${m.border}`, borderRadius: '8px', color: m.text, fontSize: '13px' }}
                >
                  {canViewAll && <option value="all">All Owners</option>}
                  {canViewAll && <option value="unassigned">Unassigned</option>}
                  {(canViewAll ? activeEmployees : activeEmployees.filter(e => e.id === user?.id)).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.id === user?.id ? `${emp.name} (Me)` : emp.name}</option>
                  ))}
                </select>
                <select
                  value={buFilter}
                  onChange={(e) => setBuFilter(e.target.value)}
                  style={{ flex: 1, padding: '10px 12px', backgroundColor: m.bgCard, border: `1px solid ${m.border}`, borderRadius: '8px', color: m.text, fontSize: '13px' }}
                >
                  <option value="all">All BUs</option>
                  {businessUnits.map(bu => <option key={bu} value={bu}>{bu}</option>)}
                </select>
              </div>

              {/* Status Filter Tabs */}
              <div style={{ display: 'flex', overflowX: 'auto', gap: '8px', paddingBottom: '4px', marginBottom: '12px', flexShrink: 0, WebkitOverflowScrolling: 'touch' }}>
                {filterTabs.map(tab => {
                  const isActive = mobileFilter === tab.id
                  const count = tab.id === 'All'
                    ? filteredPipelineLeads.filter(l => { const s = stages.find(st => st.id === l.status); return s && !s.isDelivery && !s.isClosed }).length
                    : getLeadsForStage(tab.id).length
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setMobileFilter(tab.id)}
                      style={{
                        height: '36px', borderRadius: '18px', padding: '0 14px',
                        display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0,
                        backgroundColor: isActive ? tab.color + '1a' : 'transparent',
                        border: `1px solid ${isActive ? tab.color : m.border}`,
                        color: isActive ? tab.color : m.textMuted,
                        fontSize: '13px', fontWeight: isActive ? '600' : '400'
                      }}
                    >
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: tab.color, flexShrink: 0 }} />
                      {tab.label}
                      {count > 0 && (
                        <span style={{ minWidth: '18px', height: '18px', borderRadius: '9px', backgroundColor: tab.color, color: '#fff', fontSize: '10px', fontWeight: '600', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>
                          {count}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
              <style>{`.pipeline-mobile-tabs::-webkit-scrollbar { display: none; }`}</style>

              {/* SALES PIPELINE Section */}
              <div style={{ marginBottom: '16px' }}>
                <div
                  onClick={() => setMobileSalesExpanded(!mobileSalesExpanded)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}
                >
                  <ChevronRight size={14} color={m.textMuted} style={{ transform: mobileSalesExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  <span style={{ fontSize: '11px', fontWeight: '700', color: m.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>Sales Pipeline</span>
                  <span style={{ fontSize: '10px', color: m.textMuted }}>Leads & Customers W/Estimates</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: m.border }} />
                  <span style={{ fontSize: '11px', color: m.textMuted, backgroundColor: m.bgCard, padding: '2px 8px', borderRadius: '10px', border: `1px solid ${m.border}` }}>
                    {mobileLeads.length}
                  </span>
                </div>

                {mobileSalesExpanded && (
                  <>
                    {mobileLeads.length === 0 ? (
                      <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                        <Search size={32} color={m.textMuted} style={{ marginBottom: '8px', opacity: 0.5 }} />
                        <div style={{ fontSize: '16px', color: m.text, marginBottom: '4px' }}>No {mobileFilter === 'All' ? '' : mobileFilter + ' '}leads</div>
                        <div style={{ fontSize: '13px', color: m.textMuted }}>Leads will appear here as they progress</div>
                      </div>
                    ) : (
                      mobileLeads.map(lead => {
                        const sc = getStatusColor(lead.status)
                        const srcStyle = getSourceStyle(lead.lead_source)
                        return (
                          <div
                            key={lead.id}
                            onClick={() => navigate(`/leads/${lead.id}`)}
                            onTouchStart={() => setTouchedCardId(lead.id)}
                            onTouchEnd={() => setTouchedCardId(null)}
                            style={{
                              backgroundColor: touchedCardId === lead.id ? '#eef2eb' : m.bgCard,
                              border: `1px solid ${m.border}`,
                              borderLeft: `4px solid ${sc}`,
                              borderRadius: '12px',
                              padding: '14px 16px',
                              marginBottom: '8px',
                              cursor: 'pointer',
                              transition: 'background-color 0.1s'
                            }}
                          >
                            {/* Row 1: Name + Estimate badge + Source */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              <span style={{ flex: 1, fontSize: '16px', fontWeight: '700', color: m.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {lead.customer_name}
                              </span>
                              {lead._isEstimate && (
                                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '6px', backgroundColor: 'rgba(90,99,73,0.12)', color: '#5a6349', fontWeight: '600', flexShrink: 0, whiteSpace: 'nowrap' }}>
                                  {lead._quoteName}
                                </span>
                              )}
                              {lead.lead_source && !lead._isEstimate && (
                                <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: srcStyle.bg, color: srcStyle.color, border: srcStyle.border, flexShrink: 0, whiteSpace: 'nowrap' }}>
                                  {lead.lead_source}
                                </span>
                              )}
                            </div>
                            {/* Row 2: Owner + Source Person + Status */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                              {lead.lead_owner && (
                                <span style={{ flex: 1, fontSize: '13px', color: m.textMuted, display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <User size={12} /> {lead.lead_owner.name}
                                </span>
                              )}
                              {lead.source_employee?.name && (
                                <span style={{ fontSize: '11px', color: m.textMuted }}>
                                  via {lead.source_employee.name}
                                </span>
                              )}
                              {!lead.lead_owner && <span style={{ flex: 1 }} />}
                              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: sc + '26', color: sc, fontWeight: '500' }}>
                                {lead.status === 'Quote Sent' ? 'Estimate Sent' : lead.status}
                              </span>
                              {getLeadAmount(lead) > 0 && (
                                <span style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e' }}>
                                  {formatCurrency(getLeadAmount(lead))}
                                </span>
                              )}
                            </div>
                            {/* Row 3: Phone */}
                            {lead.phone && (
                              <a
                                href={`tel:${lead.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#5a6349', textDecoration: 'none' }}
                              >
                                <Phone size={12} /> {lead.phone}
                              </a>
                            )}
                          </div>
                        )
                      })
                    )}
                  </>
                )}
              </div>

              {/* DELIVERY PIPELINE Section */}
              <div style={{ marginBottom: '80px' }}>
                <div
                  onClick={() => setMobileDeliveryExpanded(!mobileDeliveryExpanded)}
                  style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px', cursor: 'pointer' }}
                >
                  <ChevronRight size={14} color="#0284c7" style={{ transform: mobileDeliveryExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }} />
                  <span style={{ fontSize: '11px', fontWeight: '700', color: '#0284c7', textTransform: 'uppercase', letterSpacing: '1px' }}>Delivery Pipeline</span>
                  <span style={{ fontSize: '10px', color: m.textMuted }}>Auto-synced</span>
                  <div style={{ flex: 1, height: '1px', backgroundColor: m.border }} />
                  <span style={{ fontSize: '11px', color: m.textMuted, backgroundColor: m.bgCard, padding: '2px 8px', borderRadius: '10px', border: `1px solid ${m.border}` }}>
                    {deliveryLeadsList.length}
                  </span>
                </div>

                {mobileDeliveryExpanded && (
                  <>
                    {deliveryLeadsList.length === 0 ? (
                      <div style={{ padding: '24px 20px', textAlign: 'center', color: m.textMuted, fontSize: '13px' }}>
                        No active jobs
                      </div>
                    ) : (
                      deliveryStages.map(stage => {
                        const stLeads = getLeadsForStage(stage.id)
                        if (stLeads.length === 0) return null
                        return (
                          <div key={stage.id} style={{ marginBottom: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px', padding: '4px 0' }}>
                              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: stage.color }} />
                              <span style={{ fontSize: '12px', fontWeight: '600', color: m.textMuted }}>{stage.name}</span>
                              <span style={{ fontSize: '10px', color: stage.color }}>({stLeads.length})</span>
                            </div>
                            {stLeads.map(lead => {
                              const job = lead.jobs?.[0]
                              return (
                                <div
                                  key={lead.id}
                                  onClick={() => navigate(lead._isJob ? `/jobs/${lead._jobId}` : `/leads/${lead.id}`)}
                                  style={{ backgroundColor: m.bgCard, border: `1px solid ${m.border}`, borderLeft: `4px solid ${stage.color}`, borderRadius: '12px', padding: '12px 16px', marginBottom: '6px', cursor: 'pointer' }}
                                >
                                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}>
                                      <span style={{ fontSize: '15px', fontWeight: '600', color: m.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.customer_name}</span>
                                      {lead._isJob && (
                                        <span style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '4px', backgroundColor: '#f97316' + '20', color: '#f97316', fontWeight: '600', flexShrink: 0 }}>Job</span>
                                      )}
                                    </div>
                                    {getLeadAmount(lead) > 0 && (
                                      <span style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e' }}>
                                        {formatCurrency(getLeadAmount(lead))}
                                      </span>
                                    )}
                                  </div>
                                  {job && (
                                    <div style={{ display: 'flex', gap: '8px', fontSize: '12px', color: m.textMuted }}>
                                      {job.job_id && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><Briefcase size={10} /> {job.job_id}</span>}
                                      {job.assigned_team && <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}><User size={10} /> {job.assigned_team}</span>}
                                    </div>
                                  )}
                                </div>
                              )
                            })}
                          </div>
                        )
                      })
                    )}
                  </>
                )}
              </div>
            </div>

          </div>
        )
      })() : (
        /* Desktop Pipeline Board - Two collapsible sections */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', minHeight: 0 }}>

          {/* SALES FUNNEL */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden', flex: salesExpanded ? 1 : 'none' }}>
            {/* Section Header - always visible, clickable */}
            <div
              onClick={() => setSalesExpanded(!salesExpanded)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: theme.bgCard, cursor: 'pointer', borderBottom: `1px solid ${theme.border}`, userSelect: 'none' }}
            >
              <div style={{ transition: 'transform 0.2s', transform: salesExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                <ChevronRight size={16} color={theme.textMuted} />
              </div>
              <span style={{ fontSize: '12px', fontWeight: '700', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '1px' }}>Sales Pipeline</span>
              <span style={{ fontSize: '10px', color: theme.textMuted }}>Leads & Customers W/Estimates</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: theme.border }} />
              {(() => {
                const salesLeads = filteredPipelineLeads.filter(l => { const s = stages.find(st => st.id === l.status); return s && !s.isDelivery && !s.isClosed })
                const salesTotal = salesLeads.reduce((sum, l) => sum + getLeadAmount(l), 0)
                return <>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#16a34a' }}>{formatCurrency(salesTotal)}</span>
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>{salesLeads.length} leads</span>
                </>
              })()}
            </div>

            {/* Stage Headers Strip - always visible */}
            <div style={{ display: 'flex', gap: '0px', backgroundColor: theme.bg }}>
              {stages.filter(s => !s.isDelivery && !s.isClosed).map(stage => {
                const stageLeads = getLeadsForStage(stage.id)
                const stageValue = getStageValue(stage.id)
                const isDragOver = dragOverStage === stage.id
                return (
                  <div
                    key={stage.id}
                    style={{
                      flex: '1 1 0',
                      minWidth: 0,
                      padding: '6px 8px',
                      borderBottom: `3px solid ${stage.color}`,
                      backgroundColor: isDragOver ? theme.accentBg : theme.bgCard,
                      transition: 'background-color 0.15s'
                    }}
                    onDragOver={(e) => handleDragOver(e, stage.id)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, stage.id)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                      <span style={{ fontWeight: '600', color: theme.text, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stage.name}
                      </span>
                      <span style={{ backgroundColor: stage.color + '20', color: stage.color, padding: '1px 5px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', flexShrink: 0 }}>
                        {stageLeads.length}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: stageValue > 0 ? '#16a34a' : theme.textMuted, fontWeight: stageValue > 0 ? '600' : '400', marginTop: '2px' }}>
                      {formatCurrency(stageValue)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Cards Area - only when expanded */}
            {salesExpanded && (
              <div style={{ flex: 1, display: 'flex', gap: '0px', minHeight: '200px', overflow: 'hidden' }}>
                {stages.filter(s => !s.isDelivery && !s.isClosed).map(stage => {
                  const stageLeads = getLeadsForStage(stage.id)
                  const isDragOver = dragOverStage === stage.id

                  return (
                    <div
                      key={stage.id}
                      style={{
                        flex: '1 1 0',
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        backgroundColor: isDragOver ? theme.accentBg : 'transparent',
                        borderRight: `1px solid ${theme.border}`,
                        transition: 'background-color 0.15s'
                      }}
                      onDragOver={(e) => handleDragOver(e, stage.id)}
                      onDragLeave={handleDragLeave}
                      onDrop={(e) => handleDrop(e, stage.id)}
                    >
                      <div style={{ flex: 1, padding: '4px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {stageLeads.map(lead => (
                          <div
                            key={lead.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, lead)}
                            onDragEnd={handleDragEnd}
                            style={{
                              opacity: draggedLead?.id === lead.id ? 0.8 : 1,
                              boxShadow: draggedLead?.id === lead.id ? '0 4px 12px rgba(0,0,0,0.15)' : 'none'
                            }}
                          >
                            <EntityCard
                              name={lead.customer_name}
                              businessName={lead.business_name}
                              onClick={() => lead._isEstimate ? navigate(`/estimates/${lead._quoteId}`) : navigate(`/leads/${lead.id}`)}
                              style={{ cursor: 'grab', padding: '8px' }}
                            >
                              <div style={{ fontWeight: '600', color: theme.text, fontSize: '12px', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {lead.customer_name}
                              </div>
                              {lead._isEstimate && (
                                <div style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(90,99,73,0.12)', color: '#5a6349', fontWeight: '600', display: 'inline-block', marginBottom: '3px' }}>
                                  {lead._quoteName}
                                </div>
                              )}
                              {lead.business_name && !lead._isEstimate && (
                                <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {lead.business_name}
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                {lead.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: theme.textMuted }}><Phone size={10} /><span>{lead.phone}</span></div>}
                                {lead.email && <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: theme.textMuted, overflow: 'hidden' }}><Mail size={10} /></div>}
                              </div>
                              {getLeadAmount(lead) > 0 && (
                                <div style={{ color: '#16a34a', fontSize: '12px', fontWeight: '600' }}>{formatCurrency(getLeadAmount(lead))}</div>
                              )}
                              {lead.appointment_time && (
                                <div style={{ marginTop: '3px', padding: '2px 5px', backgroundColor: isToday(lead.appointment_time) ? '#dcfce7' : '#f0fdf4', borderRadius: '4px', fontSize: '10px', color: isToday(lead.appointment_time) ? '#166534' : '#15803d', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <Calendar size={9} />
                                  <span style={{ fontWeight: isToday(lead.appointment_time) ? '600' : '400' }}>
                                    {isToday(lead.appointment_time) ? `TODAY ${new Date(lead.appointment_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}` : new Date(lead.appointment_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  </span>
                                </div>
                              )}
                              {lead.lead_owner && (
                                <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: '600', color: theme.accent }}>
                                    {lead.lead_owner.name?.charAt(0)}
                                  </div>
                                  <span style={{ fontSize: '10px', color: theme.textMuted }}>{lead.lead_owner.name}</span>
                                </div>
                              )}
                              {(lead.lead_source || lead.source_employee) && (
                                <div style={{ marginTop: '3px', fontSize: '9px', color: lead.lead_source === 'Existing Customer' ? '#0ea5e9' : lead.lead_source === 'Direct Job' ? '#f97316' : theme.textMuted, fontStyle: 'italic' }}>
                                  {lead.lead_source ? `via ${lead.lead_source}` : ''}{lead.source_employee?.name ? `${lead.lead_source ? ' · ' : 'via '}${lead.source_employee.name}` : ''}
                                </div>
                              )}
                            </EntityCard>
                          </div>
                        ))}
                        {stageLeads.length === 0 && (
                          <div style={{ padding: '16px 8px', textAlign: 'center', color: theme.textMuted, fontSize: '11px' }}>
                            {stage.id === 'New' && 'Add a lead or import from a source'}
                            {stage.id === 'Contacted' && 'Drag leads here after first contact'}
                            {stage.id === 'Appointment Set' && 'Leads with scheduled appointments'}
                            {stage.id === 'Qualified' && 'Leads confirmed as good fit'}
                            {stage.id === 'Quote Sent' && 'Leads with estimates sent to them'}
                            {stage.id === 'Negotiation' && 'Leads in active negotiation'}
                            {stage.isWon && 'Drag a lead here when you close a deal'}
                            {stage.isLost && 'Drag here if a deal falls through'}
                            {!['New','Contacted','Appointment Set','Qualified','Quote Sent','Negotiation'].includes(stage.id) && !stage.isWon && !stage.isLost && 'Drop leads here'}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* DELIVERY FUNNEL */}
          <div style={{ display: 'flex', flexDirection: 'column', borderRadius: '8px', border: `1px solid ${theme.border}`, overflow: 'hidden', flex: deliveryExpanded ? 1 : 'none' }}>
            {/* Section Header - always visible, clickable */}
            <div
              onClick={() => setDeliveryExpanded(!deliveryExpanded)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: theme.bgCard, cursor: 'pointer', borderBottom: `1px solid ${theme.border}`, userSelect: 'none' }}
            >
              <div style={{ transition: 'transform 0.2s', transform: deliveryExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }}>
                <ChevronRight size={16} color="#0ea5e9" />
              </div>
              <span style={{ fontSize: '12px', fontWeight: '700', color: '#0ea5e9', textTransform: 'uppercase', letterSpacing: '1px' }}>Delivery Pipeline</span>
              <span style={{ fontSize: '10px', color: theme.textMuted }}>Auto-synced from jobs</span>
              <div style={{ flex: 1, height: '1px', backgroundColor: theme.border }} />
              {(() => {
                const deliveryDeals = filteredPipelineLeads.filter(l => { const s = stages.find(st => st.id === l.status); return s && (s.isDelivery || s.isClosed) })
                const deliveryTotal = deliveryDeals.reduce((sum, l) => sum + getLeadAmount(l), 0)
                return <>
                  <span style={{ fontSize: '12px', fontWeight: '700', color: '#16a34a' }}>{formatCurrency(deliveryTotal)}</span>
                  <span style={{ fontSize: '11px', color: theme.textMuted }}>{deliveryDeals.length} deals</span>
                </>
              })()}
            </div>

            {/* Stage Headers Strip - always visible */}
            <div style={{ display: 'flex', gap: '0px', backgroundColor: theme.bg }}>
              {stages.filter(s => s.isDelivery || s.isClosed).map(stage => {
                const stageLeads = getLeadsForStage(stage.id)
                const stageValue = getStageValue(stage.id)
                return (
                  <div
                    key={stage.id}
                    style={{
                      flex: '1 1 0',
                      minWidth: 0,
                      padding: '6px 8px',
                      borderBottom: `3px solid ${stage.color}`,
                      backgroundColor: theme.bgCard
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                      <span style={{ fontWeight: '600', color: theme.text, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {stage.name}
                      </span>
                      <span style={{ backgroundColor: stage.color + '20', color: stage.color, padding: '1px 5px', borderRadius: '10px', fontSize: '10px', fontWeight: '600', flexShrink: 0 }}>
                        {stageLeads.length}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: stageValue > 0 ? '#16a34a' : theme.textMuted, fontWeight: stageValue > 0 ? '600' : '400', marginTop: '2px' }}>
                      {formatCurrency(stageValue)}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Cards Area - only when expanded */}
            {deliveryExpanded && (
              <div style={{ flex: 1, display: 'flex', gap: '0px', minHeight: '200px', overflow: 'hidden' }}>
                {stages.filter(s => s.isDelivery || s.isClosed).map(stage => {
                  const stageLeads = getLeadsForStage(stage.id)
                  const leadJob = (lead) => lead.jobs?.[0] || null

                  return (
                    <div
                      key={stage.id}
                      style={{
                        flex: '1 1 0',
                        minWidth: 0,
                        display: 'flex',
                        flexDirection: 'column',
                        borderRight: `1px solid ${theme.border}`
                      }}
                    >
                      <div style={{ flex: 1, padding: '4px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {stageLeads.map(lead => {
                          const job = leadJob(lead)
                          return (
                            <EntityCard
                              key={lead.id}
                              name={lead.customer_name}
                              businessName={lead.business_name}
                              onClick={() => navigate(lead._isJob ? `/jobs/${lead._jobId}` : `/leads/${lead.id}`)}
                              style={{ cursor: 'pointer', padding: '8px' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '2px' }}>
                                <div style={{ fontWeight: '600', color: theme.text, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
                                  {lead.customer_name}
                                </div>
                                {lead._isJob && (
                                  <span style={{ fontSize: '9px', padding: '1px 5px', borderRadius: '4px', backgroundColor: '#f97316' + '20', color: '#f97316', fontWeight: '600', flexShrink: 0 }}>Job</span>
                                )}
                              </div>
                              {job ? (
                                <div style={{ fontSize: '10px', color: theme.textSecondary, display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '3px' }}>
                                  {parseFloat(job.job_total) > 0 && (
                                    <div style={{ color: '#16a34a', fontWeight: '600', fontSize: '12px' }}>{formatCurrency(job.job_total)}</div>
                                  )}
                                  <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                    <Briefcase size={9} /><span>{job.job_id}</span>
                                  </div>
                                  {job.assigned_team && (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                                      <User size={9} /><span>{job.assigned_team}</span>
                                    </div>
                                  )}
                                  {job.invoice_status && (
                                    <div style={{
                                      padding: '1px 5px',
                                      backgroundColor: job.invoice_status === 'Paid' ? '#dcfce7' : job.invoice_status === 'Invoiced' ? '#dbeafe' : '#f3f4f6',
                                      borderRadius: '4px', fontSize: '9px', fontWeight: '500',
                                      color: job.invoice_status === 'Paid' ? '#166534' : job.invoice_status === 'Invoiced' ? '#1d4ed8' : theme.textMuted,
                                      display: 'inline-block', marginTop: '1px'
                                    }}>
                                      {job.invoice_status}
                                    </div>
                                  )}
                                </div>
                              ) : (
                                getLeadAmount(lead) > 0 && (
                                  <div style={{ color: '#16a34a', fontSize: '12px', fontWeight: '600', marginTop: '3px' }}>{formatCurrency(getLeadAmount(lead))}</div>
                                )
                              )}
                              {lead.lead_owner && (
                                <div style={{ marginTop: '3px', display: 'flex', alignItems: 'center', gap: '3px' }}>
                                  <div style={{ width: '16px', height: '16px', borderRadius: '50%', backgroundColor: theme.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '8px', fontWeight: '600', color: theme.accent }}>
                                    {lead.lead_owner.name?.charAt(0)}
                                  </div>
                                  <span style={{ fontSize: '10px', color: theme.textMuted }}>{lead.lead_owner.name}</span>
                                </div>
                              )}
                              {(lead.lead_source || lead.source_employee) && (
                                <div style={{ marginTop: '3px', fontSize: '9px', color: lead.lead_source === 'Existing Customer' ? '#0ea5e9' : lead.lead_source === 'Direct Job' ? '#f97316' : theme.textMuted, fontStyle: 'italic' }}>
                                  {lead.lead_source ? `via ${lead.lead_source}` : ''}{lead.source_employee?.name ? `${lead.lead_source ? ' · ' : 'via '}${lead.source_employee.name}` : ''}
                                </div>
                              )}
                            </EntityCard>
                          )
                        })}
                        {stageLeads.length === 0 && (
                          <div style={{ padding: '16px 8px', textAlign: 'center', color: theme.textMuted, fontSize: '11px' }}>
                            {stage.id === 'Job Scheduled' && 'Convert a Won lead or create a job'}
                            {stage.id === 'In Progress' && 'Jobs move here when started'}
                            {stage.id === 'Job Complete' && 'Jobs move here when completed'}
                            {stage.id === 'Invoiced' && 'Jobs move here when invoiced'}
                            {stage.isClosed && 'Deals move here when invoice is paid'}
                            {!['Job Scheduled','In Progress','Job Complete','Invoiced'].includes(stage.id) && !stage.isClosed && 'Auto-synced from jobs'}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lead Detail Panel */}
      {showDetailPanel && selectedLead && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: isMobile ? '100%' : '380px',
          backgroundColor: theme.bgCard,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column'
        }}>
          {/* Header */}
          <div style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                {selectedLead.customer_name}
              </h2>
              <div style={{
                display: 'inline-block',
                marginTop: '4px',
                padding: '2px 8px',
                backgroundColor: stages.find(s => s.id === selectedLead.status)?.color + '20',
                color: stages.find(s => s.id === selectedLead.status)?.color,
                borderRadius: '4px',
                fontSize: '11px',
                fontWeight: '500'
              }}>
                {selectedLead.status}
              </div>
            </div>
            <button
              onClick={closeDetailPanel}
              style={{
                padding: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: theme.textMuted
              }}
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
            {/* Contact Info */}
            <div style={{ marginBottom: '16px' }}>
              {selectedLead.phone && (
                <a
                  href={`tel:${selectedLead.phone}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    backgroundColor: '#dcfce7',
                    borderRadius: '6px',
                    color: '#166534',
                    textDecoration: 'none',
                    marginBottom: '6px',
                    fontSize: '14px'
                  }}
                >
                  <Phone size={16} />
                  {selectedLead.phone}
                </a>
              )}

              {selectedLead.email && (
                <a
                  href={`mailto:${selectedLead.email}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    backgroundColor: theme.accentBg,
                    borderRadius: '6px',
                    color: theme.accent,
                    textDecoration: 'none',
                    marginBottom: '6px',
                    fontSize: '14px'
                  }}
                >
                  <Mail size={16} />
                  {selectedLead.email}
                </a>
              )}

              {selectedLead.address && (
                <div style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '8px',
                  padding: '10px 12px',
                  backgroundColor: theme.bg,
                  borderRadius: '6px',
                  color: theme.text,
                  fontSize: '14px'
                }}>
                  <MapPin size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                  {selectedLead.address}
                </div>
              )}
            </div>

            {/* Lead Details */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '10px',
              marginBottom: '16px'
            }}>
              {selectedLead.service_type && (
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Service</div>
                  <div style={{ fontSize: '13px', color: theme.text }}>{selectedLead.service_type}</div>
                </div>
              )}
              {selectedLead.lead_source && (
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Source</div>
                  <div style={{ fontSize: '13px', color: theme.text }}>{selectedLead.lead_source}</div>
                </div>
              )}
              {selectedLead.source_employee?.name && (
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Source Person</div>
                  <div style={{ fontSize: '13px', color: theme.text }}>{selectedLead.source_employee.name}</div>
                </div>
              )}
              {getLeadAmount(selectedLead) > 0 && (
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Value</div>
                  <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: '600' }}>
                    {formatCurrency(getLeadAmount(selectedLead))}
                  </div>
                </div>
              )}
              {selectedLead.lead_owner && (
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Owner</div>
                  <div style={{ fontSize: '13px', color: theme.text }}>{selectedLead.lead_owner.name}</div>
                </div>
              )}
            </div>

            {/* Appointment Info */}
            {selectedLead.appointment_time && (
              <div style={{
                padding: '12px',
                backgroundColor: isToday(selectedLead.appointment_time) ? '#dcfce7' : '#f0fdf4',
                borderRadius: '6px',
                marginBottom: '16px'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#166534',
                  fontWeight: '600',
                  fontSize: '13px'
                }}>
                  <Calendar size={14} />
                  {isToday(selectedLead.appointment_time) ? 'TODAY' : new Date(selectedLead.appointment_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
                <div style={{ color: '#15803d', marginTop: '2px', fontSize: '13px' }}>
                  {new Date(selectedLead.appointment_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedLead.notes && (
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Notes</div>
                <div style={{
                  padding: '10px',
                  backgroundColor: theme.bg,
                  borderRadius: '6px',
                  fontSize: '13px',
                  color: theme.text,
                  whiteSpace: 'pre-wrap'
                }}>
                  {selectedLead.notes}
                </div>
              </div>
            )}
          </div>

          {/* Actions */}
          <div style={{
            padding: '12px 20px',
            borderTop: `1px solid ${theme.border}`,
            display: 'flex',
            gap: '8px'
          }}>
            <button
              onClick={() => navigate(`/leads/${selectedLead.id}`)}
              style={{
                flex: 1,
                padding: '10px',
                backgroundColor: theme.accent,
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: '500',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              View Details
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 60
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            width: '100%',
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '500px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Pipeline Settings
                </h2>
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: '2px 0 0' }}>
                  Customize stages and header stats
                </p>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {/* Stats Configuration - moved to top since it's what users want to change most */}
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 4px' }}>
                  Summary Stats
                </h3>
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 12px' }}>
                  Toggle which summary numbers show in the top-right bar. Column totals always show on each stage.
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {availableStats.map(stat => {
                    const isSelected = statsForm.includes(stat.id)
                    return (
                      <button
                        key={stat.id}
                        onClick={() => toggleStat(stat.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: isSelected ? (stat.color || theme.accent) + '20' : theme.bg,
                          border: `1px solid ${isSelected ? (stat.color || theme.accent) : theme.border}`,
                          borderRadius: '16px',
                          color: isSelected ? (stat.color || theme.accent) : theme.textSecondary,
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: isSelected ? '600' : '400',
                          transition: 'all 0.15s'
                        }}
                      >
                        {stat.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Stage Management */}
              <div style={{ paddingTop: '16px', borderTop: `1px solid ${theme.border}` }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 4px' }}>
                  Pipeline Stages
                </h3>
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 12px' }}>
                  Rename, reorder, or add custom sales stages. System stages (Won, Lost, Delivery) cannot be changed.
                </p>
              </div>
              {stageForm.map((stage, index) => {
                const lastActiveIndex = stageForm.findIndex(s => s.isWon || s.isLost) - 1
                const canMoveUp = index > 0 && !stage.isWon && !stage.isLost
                const canMoveDown = index < lastActiveIndex && !stage.isWon && !stage.isLost

                return (
                  <div
                    key={index}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      marginBottom: '10px',
                      padding: '10px',
                      backgroundColor: theme.bg,
                      borderRadius: '6px'
                    }}
                  >
                    {/* Reorder buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                      <button
                        onClick={() => moveStageUp(index)}
                        disabled={!canMoveUp}
                        style={{
                          padding: '2px',
                          background: 'none',
                          border: 'none',
                          cursor: canMoveUp ? 'pointer' : 'default',
                          color: canMoveUp ? theme.textSecondary : theme.border,
                          opacity: canMoveUp ? 1 : 0.4
                        }}
                        title="Move up"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        onClick={() => moveStageDown(index)}
                        disabled={!canMoveDown}
                        style={{
                          padding: '2px',
                          background: 'none',
                          border: 'none',
                          cursor: canMoveDown ? 'pointer' : 'default',
                          color: canMoveDown ? theme.textSecondary : theme.border,
                          opacity: canMoveDown ? 1 : 0.4
                        }}
                        title="Move down"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    <input
                      type="color"
                      value={stage.color}
                      onChange={(e) => updateStage(index, 'color', e.target.value)}
                      style={{
                        width: '32px',
                        height: '32px',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        padding: 0
                      }}
                    />
                    <input
                      type="text"
                      value={stage.name}
                      onChange={(e) => updateStage(index, 'name', e.target.value)}
                      disabled={stage.isWon || stage.isLost || stage.isDelivery || stage.isClosed}
                      style={{
                        ...inputStyle,
                        flex: 1,
                        opacity: (stage.isWon || stage.isLost || stage.isDelivery || stage.isClosed) ? 0.6 : 1
                      }}
                    />
                    {!stage.isWon && !stage.isLost && !stage.isDelivery && !stage.isClosed && (
                      <button
                        onClick={() => deleteStage(index)}
                        style={{
                          padding: '8px',
                          background: 'none',
                          border: 'none',
                          cursor: 'pointer',
                          color: '#dc2626'
                        }}
                        title="Delete stage"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                    {(stage.isWon || stage.isLost || stage.isDelivery || stage.isClosed) && (
                      <div style={{ width: '32px' }} />
                    )}
                  </div>
                )
              })}

              <button
                onClick={addStage}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'transparent',
                  border: `1px dashed ${theme.border}`,
                  borderRadius: '6px',
                  color: theme.textSecondary,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  marginTop: '8px'
                }}
              >
                <Plus size={16} />
                Add Stage
              </button>

              <button
                onClick={resetToDefaults}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: theme.textMuted,
                  cursor: 'pointer',
                  fontSize: '12px',
                  marginTop: '12px'
                }}
              >
                Reset to Defaults
              </button>
            </div>

            <div style={{
              padding: '12px 20px',
              borderTop: `1px solid ${theme.border}`,
              display: 'flex',
              gap: '8px'
            }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  flex: 1,
                  padding: '10px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveSettings}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '13px'
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Won Modal */}
      {showWonModal && selectedLead && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 60
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            width: '100%',
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '380px',
            padding: '20px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Trophy size={22} color="#16a34a" />
              </div>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Mark as Won
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
                  {selectedLead.customer_name}
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: theme.textSecondary, marginBottom: '4px' }}>
                Notes (optional)
              </label>
              <textarea
                value={wonNotes}
                onChange={(e) => setWonNotes(e.target.value)}
                placeholder="Add any closing notes..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowWonModal(false)
                  setSelectedLead(null)
                  setDraggedLead(null)
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleMarkAsWon}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: '500',
                  fontSize: '13px'
                }}
              >
                Mark as Won
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Modal */}
      {showLostModal && selectedLead && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '16px',
          zIndex: 60
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            width: '100%',
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '380px',
            padding: '20px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div style={{
                width: '44px',
                height: '44px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <XCircle size={22} color="#dc2626" />
              </div>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Mark as Lost
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, margin: 0 }}>
                  {selectedLead.customer_name}
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', color: theme.textSecondary, marginBottom: '4px' }}>
                Reason *
              </label>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                style={inputStyle}
              >
                <option value="">Select a reason...</option>
                <option value="Price too high">Price too high</option>
                <option value="Went with competitor">Went with competitor</option>
                <option value="No budget">No budget</option>
                <option value="Project cancelled">Project cancelled</option>
                <option value="No response">No response</option>
                <option value="Not qualified">Not qualified</option>
                <option value="Timing not right">Timing not right</option>
                <option value="Other">Other</option>
              </select>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setShowLostModal(false)
                  setSelectedLead(null)
                  setDraggedLead(null)
                }}
                style={{
                  flex: 1,
                  padding: '10px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleMarkAsLost}
                disabled={!lostReason}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: lostReason ? '#dc2626' : '#ccc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: lostReason ? 'pointer' : 'not-allowed',
                  fontWeight: '500',
                  fontSize: '13px'
                }}
              >
                Mark as Lost
              </button>
            </div>
          </div>
        </div>
      )}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}

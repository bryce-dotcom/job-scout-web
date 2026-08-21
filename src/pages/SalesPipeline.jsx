import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { effectiveQuoteAmount } from '../lib/quoteTotal'
import { useTheme } from '../components/Layout'
import { offlineDb } from '../lib/offlineDb'
import { toast } from '../lib/toast'
import { canEditPipelineStages, isFieldTech } from '../lib/accessControl'
import { wonJobsInRange, deliveredJobsInRange, sumJobTotal } from '../lib/jobMetrics'
import {
  Plus, X, DollarSign, User, Calendar, Phone, Mail, Building2,
  Trophy, XCircle, ChevronRight, RefreshCw, MapPin, Settings, Trash2,
  ChevronUp, ChevronDown, Briefcase, List, Search
} from 'lucide-react'
import EntityCard, { MALE_NAMES, FEMALE_NAMES } from '../components/EntityCard'
import UnassignedSalesPanel from '../components/UnassignedSalesPanel'
import FollowUpStrip from '../components/FollowUpStrip'
import { buildLeadIndex, primaryOwnerId, leadForJob } from '../lib/jobOwnership'
import { loadPipelineFilters, savePipelineFilters, resolveOwnerFilter, stashPipelineScroll, takePipelineScroll } from '../lib/pipelinePrefs'
import { soldTotal, periodBounds } from '../lib/soldTotals'
import { countDueFromRows, dueKeysFromRows } from '../lib/followUpDue'
import { pushStatus, enablePush, disablePush, PUSH_GRANTED, PUSH_UNSUPPORTED, PUSH_UNCONFIGURED, PUSH_DENIED } from '../lib/pushNotifications'

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
import { shouldShowLeadFallback, leadRendersSomewhere } from '../lib/pipelineVisibility'

const LEGACY_STATUSES = ['Assigned', 'Callback', 'Converted', 'Not Qualified']

// Not a stage — a saved view over the stages. Kept out of the stage lists on
// purpose so nothing can ever drag a deal "into" it.
const FOLLOW_UP_TAB = '__followup'

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
  { id: 'Paid', name: 'Paid', color: '#16a34a', isDelivery: true, isPaid: true },
  { id: 'Closed', name: 'Closed', color: '#6b7280', isClosed: true },
  // Lost (always last)
  { id: 'Lost', name: 'Lost', color: '#64748b', isLost: true }
]

const PIPELINE_VERSION = 5

// Available stats to show in header
const availableStats = [
  { id: 'sold', label: 'Sold', color: '#0ea5e9' },
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

// ONE money number. 'salesWon' summed whatever was parked in the Won COLUMN,
// which answers a question nobody asks and read $0 for a rep who had sold
// $305,199. Two similarly-named money tiles side by side was just confusing.
// The Won column still shows its own total in the stage header, so nothing
// is lost. salesWon remains available in the stat picker for anyone who
// wants it back.
const defaultVisibleStats = ['sold', 'active', 'won', 'totalValue']

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

  // Two tickets the same morning: "i have to put all the filters on again"
  // and "deletes your prefrences". Read whatever was last used ONCE, and let
  // each filter seed itself from it. lib/pipelinePrefs owns the storage.
  const savedPrefs = useMemo(() => loadPipelineFilters(companyId), [companyId])

  // Search
  const [searchTerm, setSearchTerm] = useState(() => savedPrefs.searchTerm || '')

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
  const [mobileFilter, setMobileFilter] = useState(() => savedPrefs.mobileFilter || 'All')
  const [mobileSalesExpanded, setMobileSalesExpanded] = useState(true)
  const [mobileDeliveryExpanded, setMobileDeliveryExpanded] = useState(false)
  const [pullDistance, setPullDistance] = useState(0)
  const [pullStartY, setPullStartY] = useState(0)
  const [pullStartX, setPullStartX] = useState(0)
  const [isPulling, setIsPulling] = useState(false)
  const [touchedCardId, setTouchedCardId] = useState(null)

  // Owner filter — default to "All" for everyone EXCEPT field techs.
  // The pipeline is a shared view of company activity for admins,
  // sales, and managers; field techs should still only see their own
  // scope so they don't see other reps' deal sizes and pipeline data.
  const fieldTech = isFieldTech(user)
  const [ownerFilter, setOwnerFilter] = useState(() => resolveOwnerFilter(savedPrefs.ownerFilter, { isFieldTech: fieldTech, userId: user?.id }))
  // Field techs are locked to their own scope (numbers hidden from
  // them). Everyone else — admins, sales, managers, team leads,
  // owners — gets the full company pipeline.
  const canViewAll = !fieldTech

  // Re-pin field techs to themselves if the user object hydrates after
  // mount (initializer may run before user is ready).
  useEffect(() => {
    if (fieldTech && user?.id) setOwnerFilter(String(user.id))
  }, [fieldTech, user?.id])

  // Business Unit filter
  const [buFilter, setBuFilter] = useState(() => savedPrefs.buFilter || 'all')

  // Date range filter for delivery stages
  // YTD, not MTD. The range now filters open stages too, and on the live board
  // MTD keeps 100 of 1,577 cards where it used to keep all of them — opening
  // on 6% of your pipeline reads as "the app lost my deals". YTD keeps 497 and
  // still drops the 906 cards nobody has touched in over a year, which is the
  // clutter Cole asked to be rid of. Anyone who has set their own range keeps
  // it; this only affects a rep who has never chosen one.
  const [dateRange, setDateRange] = useState(() => savedPrefs.dateRange || 'ytd')
  // Referenced by three date-window calculations for dateRange === 'custom'
  // but never declared — the only reason it wasn't already throwing is that
  // 'custom' isn't offered in the range buttons, so the && short-circuits
  // before evaluating it. Declaring it so adding a custom range later can't
  // take the whole board down with a ReferenceError.
  const [customDateTo] = useState('')

  // companyId comes from the store and may not be ready on the first render,
  // and a useState initializer never runs again — so the seeding above can
  // silently miss. Apply the saved set once, when companyId first arrives.
  // (The ownerFilter re-pin below exists for this same reason.)
  const prefsApplied = useRef(false)
  useEffect(() => {
    if (prefsApplied.current || !companyId) return
    prefsApplied.current = true
    const saved = loadPipelineFilters(companyId)
    if (!Object.keys(saved).length) return
    if (saved.dateRange) setDateRange(saved.dateRange)
    if (saved.buFilter) setBuFilter(saved.buFilter)
    if (saved.searchTerm) setSearchTerm(saved.searchTerm)
    if (saved.mobileFilter) setMobileFilter(saved.mobileFilter)
    setOwnerFilter(resolveOwnerFilter(saved.ownerFilter, { isFieldTech: fieldTech, userId: user?.id }))
  }, [companyId, fieldTech, user?.id])

  // Persist the filter set whenever it changes, so coming back from a job
  // finds the board exactly as it was left.
  useEffect(() => {
    // Never write before the saved set has been applied, or the first render's
    // DEFAULTS would overwrite what the user actually had.
    if (!prefsApplied.current) return
    savePipelineFilters(companyId, { ownerFilter, dateRange, buFilter, searchTerm, mobileFilter, customDateTo })
  }, [companyId, ownerFilter, dateRange, buFilter, searchTerm, mobileFilter, customDateTo])

  // What is actually narrowing the board right now, in words. Filters survive
  // a refresh, so an empty board is far more often a filter than an absence of
  // deals — and the old empty state said "leads will appear here as they
  // progress", which reads as "you have none".
  const DATE_RANGE_LABELS = { mtd: 'This month', ytd: 'This year', last30: 'Last 30 days', last90: 'Last 90 days', custom: 'Custom dates' }
  // The subset of activeFilterLabels worth interrupting someone over. The date
  // range is deliberately NOT here: it is always set to something, so a banner
  // that counted it would be permanently on screen and would stop being read.
  // These three are the ones a rep can leave on by accident and not see —
  // above all the search box, which on a phone is a collapsed icon.
  const narrowingFilterLabels = useMemo(() => {
    const out = []
    if (searchTerm?.trim()) out.push(`Search: "${searchTerm.trim()}"`)
    if (ownerFilter && ownerFilter !== 'all') {
      const who = employees?.find(emp => String(emp.id) === String(ownerFilter))
      out.push(`Rep: ${who?.name || ownerFilter}`)
    }
    if (buFilter && buFilter !== 'all') out.push(`Unit: ${buFilter}`)
    return out
  }, [searchTerm, ownerFilter, buFilter, employees])

  const activeFilterLabels = useMemo(() => {
    const out = []
    if (ownerFilter && ownerFilter !== 'all') {
      const who = employees?.find(emp => String(emp.id) === String(ownerFilter))
      out.push(`Rep: ${who?.name || ownerFilter}`)
    }
    if (buFilter && buFilter !== 'all') out.push(`Unit: ${buFilter}`)
    if (searchTerm?.trim()) out.push(`Search: "${searchTerm.trim()}"`)
    // The range counts as active at anything but 'all', DEFAULT INCLUDED — it
    // now filters open stages too, so it is the filter most likely to be
    // hiding what someone is looking for.
    if (dateRange && dateRange !== 'all') out.push(DATE_RANGE_LABELS[dateRange] || dateRange)
    if (mobileFilter && mobileFilter !== 'All') out.push(mobileFilter === FOLLOW_UP_TAB ? 'Follow-ups due' : `Stage: ${mobileFilter}`)
    return out
  }, [ownerFilter, buFilter, searchTerm, dateRange, mobileFilter, employees])

  const clearPipelineFilters = () => {
    setOwnerFilter('all')
    setBuFilter('all')
    setSearchTerm('')
    setDateRange('all')
    setMobileFilter('All')
  }

  // The board scrolls inside containers, not the window, so a plain
  // window.scrollY restore (what Estimates does) would not help here.
  // Follow-up OVERLAY. Deals stay in their real stage; this is a worklist of
  // who has gone quiet. Failing to load it must never take the board down, so
  // it degrades to an empty column.
  // Who is logging the touch. Matches the Payroll pattern (auth user -> employee row).
  const currentEmployeeId = useMemo(
    () => employees.find(e => e.email && user?.email && e.email === user.email)?.id ?? null,
    [employees, user?.email],
  )
  // CUMULATIVE sold — every deal closed in the window, wherever it sits now.
  // Its own query rather than the board's card set, because the store excludes
  // Archived jobs and 10 of Cole's 31 are archived: reading from the board
  // would show ,945 against a verified ,199.43. A stat you cannot
  // reconcile is worse than no stat, which is the lesson from the version of
  // this I had to revert.
  const [soldStat, setSoldStat] = useState({ count: 0, total: 0 })
  const loadSoldTotal = async () => {
    if (!companyId) return
    try {
      const { start, end } = periodBounds(dateRange)
      // PostgREST caps a response at 1000 rows NO MATTER what .limit() says.
      // The first version asked for 5000 leads and got 1000 of 1722, so every
      // job attributed through one of the missing 722 lost its owner and fell
      // out of the total — Cole read 301,905 against a real 305,199.43.
      // Paginate with a stable sort. Same silent-truncation trap that has bitten
      // this codebase repeatedly; never trust .limit() above 1000.
      const page = async (table, select, tweak = (x) => x) => {
        const out = []
        for (let from = 0; ; from += 1000) {
          let q = supabase.from(table).select(select)
            .eq('company_id', companyId).order('id', { ascending: true }).range(from, from + 999)
          q = tweak(q)
          const { data, error } = await q
          if (error) throw error
          out.push(...(data || []))
          if (!data || data.length < 1000) break
        }
        return out
      }
      const [jobRows, leadRows] = await Promise.all([
        page('jobs', 'id, job_total, status, created_at, salesperson_id, lead_id',
          (q) => (start ? q.gte('created_at', start) : q)),
        page('leads', 'id, salesperson_id, lead_owner_id, salesperson_ids'),
      ])
      const owner = (!canViewAll && user?.id) ? String(user.id) : ownerFilter
      setSoldStat(soldTotal(jobRows || [], leadRows || [], {
        ownerId: owner === 'unassigned' ? null : owner, start, end,
      }))
    } catch (e) { /* leave the previous figure rather than showing a wrong one */ }
  }
  useEffect(() => { loadSoldTotal() }, [companyId, dateRange, ownerFilter, canViewAll, user?.id])

  const [followUpRows, setFollowUpRows] = useState([])
  const loadFollowUps = async () => {
    if (!companyId) return
    const { data, error } = await supabase
      .from('lead_follow_ups')
      .select('id, lead_id, job_id, employee_id, contacted_at, method, note, next_follow_up_at')
      .eq('company_id', companyId)
      .order('contacted_at', { ascending: false })
      .limit(5000)
    if (error) { console.warn('[Pipeline] follow-ups unavailable:', error.message); return }
    setFollowUpRows(data || [])
  }
  useEffect(() => { loadFollowUps() }, [companyId])

  const boardScrollRef = useRef(null)
  // Put them back where they were, once the cards have actually rendered —
  // restoring against an empty board would just scroll to 0. takePipelineScroll
  // clears as it reads, so this fires exactly once per return trip and a
  // later re-render cannot yank the board back under someone's finger.
  const scrollRestored = useRef(false)
  useEffect(() => {
    if (scrollRestored.current || loading || pipelineLeads.length === 0) return
    const saved = takePipelineScroll(companyId)
    if (!saved) { scrollRestored.current = true; return }
    scrollRestored.current = true
    requestAnimationFrame(() => {
      if (boardScrollRef.current && saved.board) boardScrollRef.current.scrollTop = saved.board
      if (saved.window) window.scrollTo(0, saved.window)
    })
  }, [loading, pipelineLeads.length, companyId])

  const openRecord = (path) => {
    stashPipelineScroll(companyId, {
      board: boardScrollRef.current?.scrollTop || 0,
      window: window.scrollY || 0,
    })
    navigate(path)
  }

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
          // Migrate a saved set forward: anyone who arranged their stats before
          // 'sold' existed would otherwise never see it. Prepend rather than
          // bumping PIPELINE_VERSION, which would also wipe custom STAGES.
          const migrated = parsed.filter(id => id !== 'salesWon')
          setVisibleStats(migrated.includes('sold') ? migrated : ['sold', ...migrated])
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

  // Map standalone job status to pipeline delivery stage.
  // Previously: invoice_status='Invoiced' forced the card into the
  // Invoiced column the moment ANY invoice was created — before the
  // sales team had actually sent it to the customer. Tracy's flow was
  // "Doug marks job Completed → I generate invoice → I send it" but
  // step 2 was moving the card to Invoiced before step 3, so she
  // couldn't tell which jobs still needed sending.
  //
  // Now the card moves to Invoiced only when jobs.status is set to
  // 'Invoiced' — which happens when the Send button is actually
  // clicked on the invoice (see InvoiceDetail). Until then the card
  // stays in whatever delivery stage Doug set (Completed, etc.).
  const mapJobToStage = (job) => {
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
        // quote_amount is the CONTRACT TOTAL and already contains the utility
        // incentive — every other surface treats the incentive as the utility's
        // share OF that total (estimatePdf/signedProposalPdf both compute
        // outOfPocket = total - incentive). Adding it back double-counted the
        // rebate and inflated the board by ~19% (Cole: "showing numbers that
        // are not real").
        lead._quoteTotal = Math.max(...lead._quotes.map(q => parseFloat(q.quote_amount) || 0))
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

    // Fetch leads — paginated, with NULLS LAST sort. Two reasons:
    //
    //   1) Postgres' DEFAULT for DESC order is NULLS FIRST. HHH had 1273
    //      leads with updated_at=NULL (legacy import gap). The default
    //      sort dumped all of them at the top, then PostgREST's 1000-row
    //      cap silently truncated the rest — meaning every lead actually
    //      touched recently (the ones reps care about) was invisible.
    //      `nullsFirst: false` puts the active rows first.
    //
    //   2) Even with the sort fixed, HHH already exceeds 1000 rows so
    //      the cap would still swallow some leads. We page through with
    //      .range() until we have everything.
    const fetchAllLeads = async (selectStr) => {
      const PAGE = 1000
      const all = []
      for (let from = 0; ; from += PAGE) {
        const to = from + PAGE - 1
        const { data: page, error: pageErr } = await supabase
          .from('leads')
          .select(selectStr)
          .eq('company_id', companyId)
          .in('status', allStatuses)
          .order('updated_at', { ascending: false, nullsFirst: false })
          .range(from, to)
        if (pageErr) return { data: null, error: pageErr }
        if (!page || page.length === 0) break
        all.push(...page)
        if (page.length < PAGE) break
      }
      return { data: all, error: null }
    }

    let { data, error } = await fetchAllLeads(LEAD_COLUMNS)

    // If join fails (e.g. PostgREST schema cache), fall back to simpler query
    if (error) {
      console.warn('[Pipeline] Join query failed, falling back:', error.message);
      ({ data, error } = await fetchAllLeads('*, lead_owner:employees!leads_lead_owner_id_fkey(id, name)'))
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
            .select('id, lead_id, quote_amount, discount, utility_incentive, status, estimate_name, quote_id, approved_date, rejected_date, created_at, updated_at, salesperson_id')
            .in('lead_id', batch)
          if (quotesData) allQuotes.push(...quotesData)
        }
        // Sum each quote's LINE ITEMS. quotes.quote_amount is a cached copy of
        // these and it drifts — EST-MOUH4ST4 stored $732,220.44 against
        // $111,405.64 of lines, and 803 other quotes disagree with their own
        // lines today. Reading the cache meant every drift needed a one-off
        // data repair; deriving from the rows means there is nothing to
        // repair, and the board matches the estimate page by construction.
        const lineSums = new Map()
        try {
          const quoteIds = allQuotes.map(q => q.id).filter(Boolean)
          for (let i = 0; i < quoteIds.length; i += batchSize) {
            const { data: qlines } = await supabase
              .from('quote_lines')
              .select('quote_id, line_total, total')
              .in('quote_id', quoteIds.slice(i, i + batchSize))
            for (const l of qlines || []) {
              const v = Number(l.line_total ?? l.total ?? 0) || 0
              lineSums.set(l.quote_id, (lineSums.get(l.quote_id) || 0) + v)
            }
          }
        } catch (e) { /* fall back to the stored amount below */ }
        for (const q of allQuotes) q._lineSum = lineSums.get(q.id) || 0

        attachQuotes(normalized, allQuotes)
      } catch (e) { /* non-critical */ }
    }

    // Fetch standalone jobs for delivery stages
    try {
      const jobSelect = 'id, job_id, job_title, status, start_date, business_unit, customer_id, job_total, utility_incentive, assigned_team, invoice_status, lead_id, salesperson_id, pm_id, job_lead_id, customer:customers!customer_id(id, name, phone, email)'
      const rangeCutoff = getDateCutoff(dateRange)

      // Determine which statuses are "terminal" (completed-like) vs active.
      // Invoiced/Paid are real job statuses (54 such jobs in prod) but were
      // in NEITHER list, so invoiced jobs silently vanished from the board
      // (Doug #47). Treating them as terminal both surfaces them AND runs
      // them through the date-filtered query, so the MTD/YTD/90d filter
      // finally applies to them too (Doug #48).
      const terminalStatuses = ['Completed', 'Verified Complete', 'Invoiced', 'Paid', 'Closed']
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
      // Filtering on start_date alone lost two whole classes of job:
      // Postgres drops NULLs on a .gte() comparison, so any job SOLD in the
      // window but not yet scheduled was never fetched at all (10 of Cole's
      // 18 jobs this year — $140,449), and a job sold in one period but
      // scheduled in another landed in the wrong one. Match on any of the
      // three dates and let the client-side filter below decide which column
      // it belongs in; this is strictly more inclusive than before, so
      // nothing that used to appear can disappear.
      if (rangeCutoff) {
        completedQuery = completedQuery.or(
          `created_at.gte.${rangeCutoff},start_date.gte.${rangeCutoff},last_status_change_at.gte.${rangeCutoff}`
        )
      }

      const [activeRes, completedRes] = await Promise.all([activeQuery, completedQuery])

      const standaloneJobs = [...(activeRes.data || []), ...(completedRes.data || [])]

      if (standaloneJobs.length) {
        const todayStr = new Date().toISOString().split('T')[0]

        // EVERY fetched job gets its own card, at its OWN status.
        //
        // This deliberately does NOT suppress a job because its lead is also
        // on the board. A job sitting in Completed / Invoiced / Closed is a
        // different thing from its lead sitting in Quote Sent or Appointment
        // Set, and the delivery columns are built from job status.
        //
        // This used to be achieved by accident: the check was
        // `pipelineLeadIds.has(j.lead_id)` comparing a TEXT jobs.lead_id
        // against INT leads.id, so it was always false and every job fell
        // through as an "orphan". Making that comparison correct removed 187
        // cards worth $1,105,873 from the board — 84 Completed, 21 Invoiced,
        // 20 Closed — because their lead cards render in an earlier sales
        // stage. The behaviour was load-bearing, so it is now explicit
        // instead of resting on a type mismatch. Do not re-add a dedup here
        // without moving delivery-stage rendering onto the lead card first.
        const orphanJobs = standaloneJobs

        // An orphan can still HAVE a lead — one the pipeline query filtered
        // out. Fetch just those leads so the card can inherit its rep instead
        // of rendering as unattributed work.
        let orphanLeadIndex = buildLeadIndex([])
        const missingLeadIds = [...new Set(orphanJobs.map(j => j.lead_id).filter(Boolean))]
        if (missingLeadIds.length) {
          const { data: extraLeads } = await supabase
            .from('leads')
            .select('id, salesperson_id, lead_owner_id, salesperson_ids')
            .eq('company_id', companyId)
            .in('id', missingLeadIds.slice(0, 500))
          orphanLeadIndex = buildLeadIndex(extraLeads || [])
        }
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
            // job_total is the contract value and already includes the utility
            // incentive (it carries through from quote_amount) — adding the
            // incentive again overstated these cards by the rebate amount.
            quote_amount: parseFloat(job.job_total) || 0,
            // The card's date is when the deal was SOLD, not when the work
            // is scheduled. These were the same field before, which dated
            // every direct job by its start_date and left jobs with no start
            // date undated entirely. Scheduling still reads job.start_date
            // directly (see the past-dated skip above) — keep it available.
            created_at: job.created_at || job.start_date,
            _startDate: job.start_date,
            lead_owner: null,
            // Keep the PM / assigned field lead here: this is what lets
            // someone FIND their own work with the owner filter, and a PM
            // losing sight of the jobs they run is a worse bug than the one
            // removing it was meant to fix. Being wrongly credited with the
            // SALE is prevented in the right place instead — the Sold stat
            // uses scope:'credit', which ignores lead_owner_id entirely, so
            // London and Cameron stop showing sales they never made while
            // still seeing their jobs on the board. _pmId / _jobLeadId
            lead_owner_id: job.pm_id || job.job_lead_id || null,
            salesperson_ids: leadForJob(job, orphanLeadIndex)?.salesperson_ids ?? null,
            // Fall back to the lead's rep. Without this the card shows as
            // unattributed even though the sale plainly belongs to someone —
            // $232,049 of 2026 work read that way.
            salesperson_id: job.salesperson_id || primaryOwnerId(job, orphanLeadIndex) || null,
            _pmId: job.pm_id || null,
            _jobLeadId: job.job_lead_id || null,
            // Carry the contact through so the follow-up strip can dial and
            // email a direct job the same as a lead.
            phone: job.customer?.phone || null,
            email: job.customer?.email || null,
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
  // Search + owner + business-unit + date, in ONE definition. The cumulative
  // "Sold" stat needs the same owner/BU scoping but its own date rule (it
  // dates by when the deal was sold, not by stage timestamps), so the date
  // block is parameterised rather than the predicate being copied — a second
  // copy is how the owner rules drifted apart on this page before.
  // `scope` mirrors lib/jobOwnership: 'visibility' decides what a rep SEES on
  // the board (includes the lead owner, often a setter or admin), 'credit'
  // decides who SOLD it. The Sold stat must use 'credit' or it disagrees with
  // Payroll and My Pay — under 'visibility' Tracy Clark showed $216,278 sold
  // against the $2,521 she is actually paid on, purely from owning leads.
  const matchesCardFilters = (lead, { applyDateFilter = true, scope = 'visibility' } = {}) => {
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
      // Build the set of all possible owner IDs that could attribute this
      // lead/job to a rep. We deliberately ALSO check attached quotes —
      // many leads in the system have null salesperson_id but a real rep
      // on the quote (legacy import + create flows that didn't carry
      // salesperson through). Without this fallback, those quotes
      // disappear from every rep's pipeline view ("bitter creek testing
      // is Noah's but I can't see it"). Quote-level matching is safe
      // because the rep DID send the quote — that's their work.
      // Everything here is compared as a STRING. Ids arrive from three
      // places with three types — leads.id / salesperson_id are INTs,
      // jobs.lead_id is TEXT, and a card's salesperson_id may come from
      // primaryOwnerId() which normalises to a string. Comparing raw is
      // what made the board lose whole reps' work in the first place.
      const oid = String(ownerId)
      const owners = new Set()
      // Lead owner counts for VISIBILITY only — crediting a sale to whoever
      // owns the lead is how a coordinator ends up outselling the sales team.
      if (scope === 'visibility' && lead.lead_owner_id) owners.add(String(lead.lead_owner_id))
      if (lead.salesperson_id) owners.add(String(lead.salesperson_id))
      // Multi-rep deals: Payroll credits every rep listed here, so the board
      // must too, or a shared sale shows on one rep's number and not the
      // other's (Cole was short $20,961 from exactly this).
      if (Array.isArray(lead.salesperson_ids)) {
        for (const id of lead.salesperson_ids) if (id != null) owners.add(String(id))
      }
      ;(lead._quotes || []).forEach(q => {
        if (q.salesperson_id) owners.add(String(q.salesperson_id))
      })

      if (effectiveOwnerFilter === 'unassigned') {
        if (owners.size > 0) return false
      } else if (lead._isJob) {
        // Job cards carry no attached quote set; match the owner ids built
        // above. PM / job-lead are install roles and are deliberately NOT in
        // there — feeding them in credited techs with sales they never made.
        if (!owners.has(oid)) return false
      } else {
        if (!owners.has(oid)) return false
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
    // Date-range filter — applies to EVERY stage, but measured differently
    // either side of the close.
    //
    // TERMINAL leads (Won / Lost / delivered / paid) are dated by when the
    // deal actually closed — approved_date, rejected_date — never by later job
    // activity. A deal won in 2022 whose job got a PO today must not appear in
    // this month's Won column.
    //
    // OPEN leads are dated by LAST ACTIVITY. This used to be skipped
    // altogether, on the reasoning that a rep needs to see everything they are
    // still working. In practice it meant nothing ever left: 1,173 of 1,577
    // cards untouched for six months, 960 over a year old, because a lead that
    // is never moved to Won or Lost has no close date for any filter to catch.
    // Dating them by activity keeps live work visible however old the lead is,
    // and lets MTD/YTD mean what a rep expects.
    const cutoffStr = getDateCutoff(dateRange)
    const cutoffEndStr = dateRange === 'custom' && customDateTo ? new Date(customDateTo + 'T23:59:59').toISOString() : null
    if (applyDateFilter && cutoffStr) {
      const stage = stages.find(s => s.id === lead.status)
      // isPaid is terminal for date-range purposes — a deal paid 2 years ago
      // shouldn't appear in the current month's pipeline view. isClosed was
      // already terminal; adding isPaid mirrors the same logic.
      const isTerminalStage = !!(stage?.isWon || stage?.isLost || stage?.isClosed || stage?.isPaid)
      // For delivery-side leads, also count as terminal if the lead's
      // current status is in the company's "delivered" category.
      const deliveredJobStatusIds = (storeJobStatuses || [])
        .filter(s => s?.category === 'delivered')
        .map(s => s.id)
      const isDeliveredJobStatus = deliveredJobStatusIds.includes(lead.status)
      const isTerminal = isTerminalStage || isDeliveredJobStatus
      if (isTerminal) {
        // For Won/Lost: only use deal-closed timestamps. Job execution
        // timestamps (job.updated_at, last_status_change_at) are WRONG
        // here — a deal Won in 2022 whose job got a PO received today
        // would pass MTD and pollute the Won column. The "when" of a
        // Won/Lost deal is when the customer said yes/no, not when
        // work happened later.
        // For Delivered: job.last_status_change_at IS the right timestamp
        // (it records when the job moved to a completed status).
        const isWonOrLost = !!(stage?.isWon || stage?.isLost)
        // q.updated_at is NOT a close date — it is the last time somebody
        // edited the estimate. Treating it as one dated deals by their
        // paperwork: four of Cole's six Lost deals were dated by a 2025 quote
        // edit, and 9 of the company's 40 Lost deals were invisible in a 2026
        // view for that reason alone. Only real close stamps count here.
        const candidates = [
          lead.last_updated,
          lead.converted_at,
          ...(lead._quotes || []).flatMap(q => [q.approved_date, q.rejected_date]),
          // Only include job timestamps for delivery-stage leads, not Won/Lost
          ...(isWonOrLost ? [] : (lead.jobs || []).flatMap(j => [j.last_status_change_at, j.updated_at])),
        ].filter(Boolean)
        // Nothing recorded when this closed. Deals lost before the stamp above
        // existed are in exactly this state, and guessing a date for them would
        // put invented losses into someone's month. Show them instead: not
        // knowing when something closed is not a reason to make it disappear.
        // Measured before changing it — Won is unaffected (every Won deal
        // carries a real converted_at or approved_date); this adds back 9 Lost
        // and 8 Closed across the whole company.
        if (candidates.length === 0) return true
        const inRange = candidates.some(d => {
          if (d < cutoffStr) return false
          if (cutoffEndStr && d > cutoffEndStr) return false
          return true
        })
        if (!inRange) return false
      } else {
        // OPEN stages now respect the range too. They used to ignore it
        // entirely, which is why Cole's board carried 1,173 cards nobody had
        // touched in six months — 960 of them over a year old, 439 still
        // sitting in "New". No date filter could ever clear them because they
        // were never dispositioned to Won or Lost.
        //
        // Measured on LAST ACTIVITY, not creation date: a deal that came in
        // last year but was worked this week is live and stays. A deal nobody
        // has touched since then drops out of the window. That keeps
        // "everything I need to keep working" on the board while letting MTD
        // and YTD mean what a rep expects them to mean.
        const activity = [
          lead.last_updated,
          lead.updated_at,
          ...(lead._quotes || []).flatMap(q => [q.updated_at, q.created_at]),
          ...(lead.jobs || []).flatMap(j => [j.updated_at, j.last_status_change_at]),
          lead.created_at,
        ].filter(Boolean)
        const active = activity.some(d => {
          if (d < cutoffStr) return false
          if (cutoffEndStr && d > cutoffEndStr) return false
          return true
        })
        if (!active) return false
      }
    }
    return true
  }

  const filteredPipelineLeads = pipelineLeads.filter(l => matchesCardFilters(l))
  // Same owner / BU / search scoping, WITHOUT the stage-timestamp date rule,
  // so the cumulative Sold stat can apply its own sold-date window.

  // Get leads for a stage
  // Pre-estimate stages show lead cards; estimate stages show one card per quote
  const PRE_ESTIMATE_STAGES = ['New', 'Contacted', 'Appointment Set', 'Qualified']
  const QUOTE_STATUS_MAP = { 'Quote Sent': 'Sent', 'Negotiation': 'Negotiation', 'Won': 'Approved', 'Lost': 'Rejected' }
  // Quote statuses that have actually been staged. A Draft is not among them:
  // it has not been sent, so a drag must never promote it.
  const STAGED_QUOTE_STATUSES = new Set(Object.values(QUOTE_STATUS_MAP))

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
      // For Won: pre-compute the date range cutoff so both the main loop
      // guard and the delivery-lead block use the same window.
      const wonCutoffStr    = stageId === 'Won' ? getDateCutoff(dateRange) : null
      const wonCutoffEndStr = stageId === 'Won' && dateRange === 'custom' && customDateTo
        ? new Date(customDateTo + 'T23:59:59').toISOString()
        : null

      const estimateCards = []
      filteredPipelineLeads.forEach(lead => {
        // A quote only produces a card if its status maps to a stage. Draft
        // maps to nothing — so a lead whose every quote is still a Draft
        // matched no stage AND skipped the no-quotes fallback below, and
        // vanished from the board completely.
        //
        // That is Cole's "not all the estimates are pulling through": Ryder
        // Trucking (quote 4439, Draft) sat on a lead in Negotiation and showed
        // nowhere. Measured across the company: 485 leads worth $3.9M were
        // invisible, including a $139,901 deal.
        //
        // Treat "no quote in a staged status" the same as "no quotes": show
        // the lead card at the lead's own status. This can only ADD cards that
        // were missing — a lead with any staged quote is untouched.
        // The original test was "has NO staged quote at all", which missed the
        // other half: a staged quote sitting in a DIFFERENT column from the
        // lead. A lead marked "Quote Sent" whose only quote is "Approved"
        // matched nothing — Quote Sent wants a Sent quote, and Won additionally
        // requires lead.status === 'Won'. 59 leads were invisible.
        //
        // Noah: "i switched a project from qualified to won and it didnt go
        // into the won tab and now i cant find it in my pipeline."
        //
        // shouldShowLeadFallback only fires when the lead renders in NO column
        // AND this is its own status, so it can only ADD a missing card.
        if (shouldShowLeadFallback(lead, stageId, QUOTE_STATUS_MAP)) {
          estimateCards.push(lead)
          return
        }
        if (!leadRendersSomewhere(lead, QUOTE_STATUS_MAP)) return

        // ── KEY FIX ─────────────────────────────────────────────────────
        // For the Won stage, the main loop must ONLY process Won-status leads.
        // Delivery-stage leads (Chillin, Scheduled, In Progress, etc.) are
        // NOT terminal in filteredPipelineLeads, so they bypass the date
        // filter entirely — their Approved quotes would show regardless of
        // the date range, inflating the Won column with ALL historical deals.
        //
        // Delivery leads are handled below in the "extra block" which
        // correctly date-filters by quote.approved_date. The dedup check
        // (c._quoteId === q.id) prevents Won-status-lead quotes from
        // appearing twice.
        if (stageId === 'Won' && lead.status !== 'Won') return

        lead._quotes
          .filter(q => q.status === quoteStatus)
          .forEach(q => {
            estimateCards.push({
              ...lead,
              _isEstimate: true,
              _quoteId: q.id,
              _quoteName: q.estimate_name || q.quote_id || `EST-${q.id}`,
              _quoteAmount: effectiveQuoteAmount(q, q._lineSum), // lines win; stored amount only for lump-sum quotes
              _quoteStatus: q.status,
              _quoteApprovedDate: q.approved_date,
              _quoteRejectedDate: q.rejected_date,
              _quoteCreatedAt: q.created_at,
              id: `quote-${q.id}`,
              _originalLeadId: lead.id,
            })
          })
      })

      // Won column extra block: delivery-stage leads whose quote was approved
      // within the selected date range. These deals are "Won" even though the
      // lead status has already moved to Chillin/Scheduled/In Progress/etc.
      // This is the ONLY place delivery-lead Approved quotes enter the Won
      // column — they're properly date-filtered by approved_date here.
      if (stageId === 'Won') {
        filteredPipelineLeads.forEach(lead => {
          if (!lead._quotes) return
          lead._quotes
            .filter(q => {
              if (q.status !== 'Approved' || !q.approved_date) return false
              if (wonCutoffStr && q.approved_date < wonCutoffStr) return false
              if (wonCutoffEndStr && q.approved_date > wonCutoffEndStr) return false
              return true
            })
            .forEach(q => {
              if (!estimateCards.find(c => c._quoteId === q.id)) {
                estimateCards.push({
                  ...lead,
                  _isEstimate: true,
                  _quoteId: q.id,
                  _quoteName: q.estimate_name || q.quote_id || `EST-${q.id}`,
                  _quoteAmount: effectiveQuoteAmount(q, q._lineSum), // lines win; stored amount only for lump-sum quotes
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

      // Won column: also add DIRECT JOBS (no estimate/quote) from wonInRangeJobs.
      // These are service calls and bookings that bypassed the estimate stage —
      // window cleaning, recurring services, small repairs booked directly.
      // Filter to quote_id === null to avoid double-counting jobs that came
      // from approved estimates (those are already in estimateCards above).
      if (stageId === 'Won') {
        ;(wonInRangeJobs || [])
          .filter(job => !job.quote_id)
          .forEach(job => {
            // Skip if somehow already in list (shouldn't happen but be safe)
            if (estimateCards.find(c => c._jobId === job.id)) return
            estimateCards.push({
              _isDirectJob: true,
              _isEstimate: true,    // so getLeadAmount() picks up _quoteAmount
              _jobId: job.id,
              id: `job-${job.id}`,
              _quoteName: job.job_title || job.job_id || 'Direct Job',
              _quoteAmount: parseFloat(job.job_total) || 0,
              _quoteCreatedAt: job.created_at,
              _quoteApprovedDate: job.created_at,
              customer_name: job.customer?.name || '',
              job_id: job.job_id,
              status: job.status,
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

    // Lead card with jobs: use the job total.
    //
    // NOT jobTotal + incentive. The incentive is the utility's share OF the
    // job total, not money on top of it — job 23407 has job_total 46432.76 and
    // its estimate reads 46432.76 to the cent, with the SAME utility_incentive
    // of 32095 recorded on both. Adding them showed that deal as $78,527.
    //
    // Cole (716a21e2): "Pipe Line is showing number that are not real. the job
    // totals are in correcet." Across 69 jobs carrying an incentive it
    // overstated $1,448,077 of real work by $1,028,586 — 71% too high.
    const job = l.jobs?.[0]
    if (job) {
      const jobTotal = parseFloat(job.job_total) || 0
      const incentive = parseFloat(job.utility_incentive) || 0
      if (jobTotal > 0) return jobTotal
      // A utility-only job carries no job_total; there the incentive IS the
      // value. One live job (worth $11,285) depends on this.
      if (incentive > 0) return incentive
    }
    if (l._quoteTotal > 0) return l._quoteTotal
    return parseFloat(l.quote_amount) || 0
  }

  // Get stage value
  // Single source of truth for Won: use the SAME calc as the page's
  // grand-total Sales Won (jobs created in the date window), but ALSO
  // honor the active owner filter so the Won column shows only THIS
  // rep's wins when filtering to a specific person.
  const ownerFilteredJobs = (() => {
    const effOwner = (!canViewAll && user?.id) ? String(user.id) : ownerFilter
    if (!effOwner || effOwner === 'all') return storeJobs || []
    if (effOwner === 'unassigned') return (storeJobs || []).filter(j => !j.salesperson_id)
    const ownerId = parseInt(effOwner)
    return (storeJobs || []).filter(j => j.salesperson_id === ownerId)
  })()
  const wonInRangeJobs = (() => {
    const cutoff = getDateCutoff(dateRange)
    const cutoffEnd = dateRange === 'custom' && customDateTo
      ? new Date(customDateTo + 'T23:59:59').toISOString()
      : null
    return wonJobsInRange(ownerFilteredJobs, cutoff, cutoffEnd)
  })()

  const getStageValue = (stageId) => {
    // getLeadsForStage('Won') is now properly date-filtered (main loop skips
    // delivery leads; extra block handles them with approved_date filter).
    // Using it here means column dollar value = sum of cards shown. Safe.
    return getLeadsForStage(stageId).reduce((sum, l) => sum + getLeadAmount(l), 0)
  }
  const getStageCount = (stageId) => {
    // Badge count = exactly what's rendered. No more mismatch.
    return getLeadsForStage(stageId).length
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

    // JOB CARD being dragged. These are standalone jobs with no lead behind
    // them — their id is the string `job-<id>`, so the updateLead() below
    // silently matched nothing and the card snapped back on the next refetch
    // (Cole: "when i move jobs to negotiation some of them are not saving").
    // A delivered job has no sales stage to move to, so say so instead of
    // pretending it worked.
    if (draggedLead._isJob) {
      toast.info('This is a job, not a lead — it can\'t be moved back into a sales stage.')
      setDraggedLead(null)
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

    // Dragging a lead INTO an estimate stage must move its quote too.
    //
    // Estimate columns render from quote.status, so writing only the lead left
    // the card in whichever column its quote was already in. Noah: "i moved 5
    // jobs from qualified to negotiation and they went out of qualified but
    // didnt switch to negotiation" — they went to Quote Sent, because that is
    // where their Sent quote lived.
    //
    // Only a quote that has already been staged is moved: a Draft has not been
    // sent, and silently marking it Sent would tell a rep a customer received
    // something they never did. A lead whose quotes are all Drafts falls back
    // to its own lead card, so it still lands in the right column.
    const targetQuoteStatus = QUOTE_STATUS_MAP[targetStageId]
    if (targetQuoteStatus) {
      const staged = (draggedLead._quotes || [])
        .filter(q => STAGED_QUOTE_STATUSES.has(q.status))
        .sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0))
      const active = staged[0]
      if (active && active.status !== targetQuoteStatus) {
        await updateQuote(active.id, {
          status: targetQuoteStatus,
          updated_at: new Date().toISOString(),
        })
      }
    }

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
          await updateLead(leadId, { status: 'Lost', last_updated: new Date().toISOString() })
        }
      }
    } else {
      // Lead card dragged to Lost
      await updateLead(selectedLead.id, {
        status: 'Lost',
        // When it was lost. Winning stamps converted_at on both paths; losing
        // stamped nothing, so the date filter fell back to whatever timestamp
        // it could find — in practice a quote's updated_at, i.e. the last time
        // anyone EDITED the estimate. A deal lost today whose estimate was last
        // touched in 2025 was dated 2025 and vanished out of the window the
        // moment it was lost. Cole: "if i move a job to lost it disaperes some
        // times. i need to be abel to see thoes jobs still."
        last_updated: new Date().toISOString(),
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
  // Follow-up rows keyed by lead, so each card can render its own strip
  // without re-scanning the whole list. The strip decides what to show; only
  // OPEN deals get one — a won or delivered deal is nobody's callback.
  // Follow-ups DUE right now. Same rule as the nav badge (lib/followUpDue)
  // so the two can never disagree. Counts scheduled callbacks that have come
  // round, not deals that have merely gone quiet.
  const dueFollowUps = useMemo(() => countDueFromRows(followUpRows), [followUpRows])
  // WHICH ones, for the Follow-up tab. Same function the count comes from, so
  // the tab and the badge cannot disagree.
  const dueFollowUpKeys = useMemo(() => dueKeysFromRows(followUpRows), [followUpRows])
  const isFollowUpDue = (lead) =>
    dueFollowUpKeys.has(`l${lead?.id}`) ||
    (lead?.job_id != null && dueFollowUpKeys.has(`j${lead.job_id}`))

  // Push opt-in. Hidden entirely when the browser cannot do it or the
  // workspace has no VAPID key — offering a button that cannot work is worse
  // than not offering one.
  const [pushState, setPushState] = useState(() => pushStatus())
  const canOfferPush = pushState !== PUSH_UNSUPPORTED && pushState !== PUSH_UNCONFIGURED
  const togglePush = async () => {
    if (pushState === PUSH_GRANTED) {
      await disablePush()
      setPushState(pushStatus())
      toast.info('Daily follow-up reminders off for this device')
      return
    }
    const res = await enablePush({ companyId, employeeId: currentEmployeeId })
    setPushState(pushStatus())
    if (res.ok) toast.success('You will get one reminder each morning')
    else toast.error(res.reason || 'Could not turn on notifications')
  }

  const followUpRowsByLead = useMemo(() => {
    const m = new Map()
    for (const r of followUpRows || []) {
      if (!r?.lead_id) continue
      const k = String(r.lead_id)
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(r)
    }
    return m
  }, [followUpRows])
  const stageIsOpen = (statusId) => {
    const st = stages.find(x => x.id === statusId)
    return !(st?.isWon || st?.isLost || st?.isClosed || st?.isPaid || st?.isDelivery)
  }

  const statsData = useMemo(() => {
    const stageMap = new Map(stages.map(s => [s.id, s]))
    const leads = filteredPipelineLeads
    const activeLeads = leads.filter(l => { const s = stageMap.get(l.status); return s && !s.isWon && !s.isLost && !s.isDelivery && !s.isClosed })
    // (no wonLeadsList — counting leads whose status is literally 'Won' is the
    // definition that disagreed with the Won column. Use salesWonCount /
    // salesWonTotal below, which come from getLeadsForStage('Won').)
    const lostLeadsList = leads.filter(l => l.status === 'Lost')
    const deliveryLeads = leads.filter(l => stageMap.get(l.status)?.isDelivery)
    const today = new Date().toDateString()
    const leadsWithAppointments = leads.filter(l => l.appointment_time)
    const todayAppointments = leadsWithAppointments.filter(l => new Date(l.appointment_time).toDateString() === today)
    const sumAmount = (arr) => arr.reduce((sum, l) => sum + getLeadAmount(l), 0)

    // "Sales Won" — now uses the SAME source as the Won column cards so
    // the header stat always matches what the rep sees in the pipeline.
    // Previously used wonJobsInRange(storeJobs) which counted jobs by
    // created_at — a different dataset that never agreed with the column.
    // "Sales Won" — same source as the Won column cards so tile and column
    // always agree. Includes both estimate-based wins (approved_date in range)
    // and direct jobs (created in range, no quote). Owner and date filtered.
    const rangeCutoff = getDateCutoff(dateRange)

    // REVERTED to matching the Won column exactly, as it was before today.
    // I changed this to a cumulative "Sold" figure — every deal sold in the
    // window wherever it now sits. The finding behind it stands (deals leave
    // the Won column as they progress, so a column sum under-reports what a
    // rep sold), but shipping it produced a header that could not be
    // reconciled with anything on screen: the tile read a six-figure total
    // while the Won column sat empty, and I could not account for the number
    // from the data. A stat nobody can check is worse than a conservative
    // one. Tile and column agree again.
    //
    // If we bring the cumulative version back it needs to be its OWN clearly
    // labelled tile, verified against a known rep-month before release —
    // not a redefinition of an existing number.
    const wonCards = getLeadsForStage('Won')
    const salesWonTotal = wonCards.reduce((s, l) => s + getLeadAmount(l), 0)
    const salesWonCount = wonCards.length

    // "Delivered" — leads in terminal delivery stages (Paid, Closed),
    // already date-filtered by filteredPipelineLeads (isPaid is now terminal).
    // The old deliveredJobsInRange() returned 0 because no statuses had
    // category='delivered' configured. filteredPipelineLeads is the correct source.
    const deliveredLeadsList = filteredPipelineLeads.filter(l => {
      const stage = stageMap.get(l.status)
      return stage?.isPaid || stage?.isClosed
    })
    const deliveredCount = deliveredLeadsList.length
    const deliveredTotal = sumAmount(deliveredLeadsList)

    return {
      // CUMULATIVE — everything closed in the window, wherever it sits now.
      // Sales Won below is the Won COLUMN and is deliberately left alone; the
      // two answer different questions and both are worth seeing.
      sold: { value: formatCurrency(soldStat.total), label: 'Sold', sublabel: `${soldStat.count} deal${soldStat.count !== 1 ? 's' : ''} closed`, color: '#0ea5e9', isFormatted: true },
      salesWon: { value: formatCurrency(salesWonTotal), label: `Sales Won`, sublabel: `${salesWonCount} deal${salesWonCount !== 1 ? 's' : ''} won`, color: '#16a34a', isFormatted: true },
      delivered: { value: formatCurrency(deliveredTotal), label: 'Delivered', sublabel: `${deliveredCount} paid/closed`, color: '#10b981', isFormatted: true },
      active: { value: activeLeads.length, label: 'Active', color: null },
      // Won counts the SAME cards the Won column shows. It used to count leads
      // whose status was literally 'Won', which is a different dataset: a deal
      // that is won and then moves on to Scheduled or Invoiced stops being a
      // 'Won' lead but keeps its Approved quote, so it stays in the column and
      // vanishes from the tile. Cole's board showed Won 0 against a Won column
      // of 9 deals / $144,995 for exactly that reason.
      won: { value: salesWonCount, label: 'Won', color: '#22c55e' },
      lost: { value: lostLeadsList.length, label: 'Lost', color: '#64748b' },
      totalValue: { value: formatCurrency(sumAmount(leads)), label: 'Pipeline Value', color: null, isFormatted: true },
      wonValue: { value: formatCurrency(salesWonTotal), label: 'Won Value', color: '#22c55e', isFormatted: true },
      appointments: { value: leadsWithAppointments.length, label: 'Appts', color: '#3b82f6' },
      todayAppointments: { value: todayAppointments.length, label: 'Today', color: '#16a34a' },
      quoteSent: { value: leads.filter(l => l.status === 'Quote Sent').length, label: 'Estimates', color: '#8b5cf6' },
      jobScheduled: { value: leads.filter(l => stages.find(s => s.id === l.status)?.isDelivery && l.status !== 'Invoiced').length, label: 'In Delivery', color: '#0ea5e9' },
      inProgress: { value: leads.filter(l => l.status === 'In Progress' || l.status === 'Scheduled').length, label: 'In Progress', color: '#f97316' },
      completed: { value: leads.filter(l => l.status === 'Completed' || l.status === 'Verified Complete').length, label: 'Complete', color: '#22c55e' },
      invoiced: { value: leads.filter(l => l.status === 'Invoiced').length, label: 'Invoiced', color: '#8b5cf6' },
      deliveryValue: { value: formatCurrency(sumAmount(deliveryLeads)), label: 'Delivery $', color: '#0ea5e9', isFormatted: true }
    }
  }, [filteredPipelineLeads, stages, dateRange, soldStat])

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
            {/* Same due count as the nav badge — lib/followUpDue is the single
                definition, so the two can never disagree. */}
            {dueFollowUps > 0 && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: '6px', marginTop: '6px',
                padding: '4px 10px', borderRadius: '12px',
                background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)',
              }}>
                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444' }} />
                <span style={{ fontSize: '12px', fontWeight: 600, color: '#991b1b' }}>
                  {dueFollowUps} follow-up{dueFollowUps === 1 ? '' : 's'} due
                </span>
              </div>
            )}
            {canOfferPush && (
              <button
                onClick={togglePush}
                title={pushState === PUSH_DENIED ? 'Notifications are blocked in your browser settings' : 'One reminder each morning listing what is due'}
                style={{
                  marginTop: '6px', marginLeft: '6px', minHeight: '28px', padding: '4px 10px',
                  borderRadius: '12px', cursor: 'pointer', fontSize: '12px',
                  border: `1px solid ${pushState === PUSH_GRANTED ? theme.accent : theme.border}`,
                  background: pushState === PUSH_GRANTED ? theme.accentBg : theme.bgCard,
                  color: pushState === PUSH_GRANTED ? theme.accent : theme.textSecondary,
                }}
              >
                {pushState === PUSH_GRANTED ? 'Morning reminders on' : 'Remind me each morning'}
              </button>
            )}
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
                backgroundColor: ownerFilter !== 'all' ? 'rgba(90,99,73,0.10)' : theme.bgCard,
                border: `1px solid ${ownerFilter !== 'all' ? theme.accent : theme.border}`,
                borderRadius: '8px',
                color: theme.text,
                fontSize: '13px',
                cursor: 'pointer',
                fontWeight: ownerFilter !== 'all' ? '600' : '400',
              }}
            >
              {canViewAll && <option value="all">All Owners</option>}
              {canViewAll && <option value="unassigned">Unassigned</option>}
              {(canViewAll ? activeEmployees : activeEmployees.filter(e => e.id === user?.id)).map(emp => (
                <option key={emp.id} value={emp.id}>{emp.id === user?.id ? `${emp.name} (Me)` : emp.name}</option>
              ))}
            </select>
            {/* Tracy reported "I only see me" — likely her filter got
                stuck on her own name without realizing. The active
                filter now highlights in green, and a one-click "Show
                All" appears when scoped so she can reset instantly. */}
            {canViewAll && ownerFilter !== 'all' && (
              <button
                type="button"
                onClick={() => setOwnerFilter('all')}
                style={{
                  padding: '8px 12px', borderRadius: '8px',
                  backgroundColor: 'transparent', color: theme.accent,
                  border: `1px solid ${theme.accent}`, cursor: 'pointer',
                  fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap',
                }}
                title="Clear the owner filter and show everyone's pipeline"
              >
                ↺ Show All
              </button>
            )}

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

      {/* Sold work nobody is credited for. Sits above the board for both
          layouts, and hides itself entirely when there is nothing to claim.
          Admins only — a rep claiming their own work unprompted is how
          commission ends up on the wrong name. */}
      {canViewAll && (
        <UnassignedSalesPanel
          theme={theme}
          companyId={companyId}
          employees={activeEmployees}
          cutoff={getDateCutoff(dateRange)}
          onAssigned={fetchPipelineLeads}
        />
      )}

      {/* Mobile View — dark theme, full PWA experience */}
      {isMobile ? (() => {
        const m = { bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8', text: '#2c3530', textMuted: '#7d8a7f', accent: '#5a6349' }
        const stageColorMap = Object.fromEntries(stages.map(s => [s.id, s.color]))
        const getStatusColor = (status) => stageColorMap[status] || '#71717a'
        const salesStages = stages.filter(s => !s.isDelivery && !s.isClosed)
        const deliveryStages = stages.filter(s => s.isDelivery || s.isClosed)

        // Filter leads by mobile tab
        // Use the SAME source as the desktop columns. Mobile was filtering
        // LEADS by lead.status, but for the estimate stages (Estimate Sent /
        // Negotiation / Won / Lost) a stage is made of one card per QUOTE —
        // which is what getLeadsForStage returns and what desktop renders.
        // So the phone silently showed a different, much smaller set: on
        // Negotiation, desktop had 27 cards worth $1.5M while the phone
        // listed 4 leads worth $100k. That is the "shows on the computer but
        // not on the phone" report.
        const mobileLeads = mobileFilter === 'All'
          ? salesStages.flatMap(s => getLeadsForStage(s.id))
          : mobileFilter === FOLLOW_UP_TAB
            // The worklist: every open deal whose callback date has arrived,
            // wherever it sits. Deals keep their real stage — this is a view,
            // not a column.
            ? salesStages.flatMap(s => getLeadsForStage(s.id)).filter(isFollowUpDue)
            : getLeadsForStage(mobileFilter)

        const deliveryLeadsList = filteredPipelineLeads.filter(l => { const s = stages.find(st => st.id === l.status); return s && (s.isDelivery || s.isClosed) })

        // Follow-up is an OVERLAY tab, not a stage: picking it shows the
        // worklist while every deal stays in whatever stage it is really in.
        const filterTabs = [
          { id: 'All', label: 'All', color: '#71717a' },
          // Cole: "can i get a tab on pipe line for follow up today". The board
          // already knew the number and showed it in a banner, then told him to
          // "tap a red card to call" — i.e. find them yourself across every
          // stage. This is that banner made clickable.
          { id: FOLLOW_UP_TAB, label: dueFollowUps > 0 ? `Follow-up (${dueFollowUps})` : 'Follow-up', color: '#ef4444' },
          ...salesStages.map(s => ({ id: s.id, label: s.name, color: getStatusColor(s.id) }))
        ]

        const getSourceStyle = (source) => {
          if (source?.includes('Lenard') || source?.includes('SRP') || source?.includes('RMP')) return { bg: 'rgba(249,115,22,0.1)', color: '#c2410c', border: '1px solid rgba(249,115,22,0.25)' }
          if (source === 'Referral') return { bg: 'rgba(34,197,94,0.1)', color: '#16a34a', border: '1px solid rgba(34,197,94,0.25)' }
          return { bg: 'rgba(90,99,73,0.08)', color: '#7d8a7f', border: `1px solid ${m.border}` }
        }

        // Pull to refresh handlers — Bryce flagged the old threshold (70px)
        // was firing accidentally during normal list scrolling. Now we
        // require 40px before even SHOWING the indicator and 130px before
        // actually triggering the refresh. Also bail if the user is
        // mostly swiping sideways (kanban swipe between columns) so the
        // refresh doesn't fire during horizontal navigation.
        const handleTouchStart = (e) => {
          setPullStartY(e.touches[0].clientY)
          setPullStartX(e.touches[0].clientX)
        }
        const handleTouchMove = (e) => {
          const scrollEl = e.currentTarget
          if (scrollEl.scrollTop > 0) return
          const dy = e.touches[0].clientY - pullStartY
          const dx = Math.abs(e.touches[0].clientX - (pullStartX || 0))
          // Mostly horizontal? Bail.
          if (dx > Math.max(20, dy)) return
          // Need a clear downward intent before showing the indicator
          if (dy > 40) { setPullDistance(Math.min(dy, 160)); setIsPulling(true) }
        }
        const handleTouchEnd = () => {
          if (pullDistance > 130) { fetchPipelineLeads(); setRefreshing(true) }
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
              ref={boardScrollRef}
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

              {/* Follow-ups DUE — a commitment someone made and the date has
                  arrived. Deliberately not counting merely-quiet deals: a badge
                  that counts everything stale is too big to act on. */}
              {dueFollowUps > 0 && (
                <div
                  onClick={() => setMobileFilter(FOLLOW_UP_TAB)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px',
                    padding: '10px 12px', borderRadius: '10px', cursor: 'pointer',
                    background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.35)',
                  }}
                >
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#991b1b' }}>
                    {dueFollowUps} follow-up{dueFollowUps === 1 ? '' : 's'} due
                  </span>
                  <span style={{ fontSize: '11px', color: '#991b1b', opacity: 0.8 }}>tap to see them</span>
                </div>
              )}

              {/* Stats Row */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
                {[
                  /* Sold = everything closed in the window, wherever it sits now.
                     Sales Won = what is in the Won column right now. Different
                     questions; both shown. The per-stage totals below are
                     untouched. */
                  { label: 'Sold', value: statsData.sold.value, color: '#0ea5e9', isFormatted: true },
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
                  style={{
                    flex: 1, padding: '10px 12px',
                    backgroundColor: ownerFilter !== 'all' ? 'rgba(90,99,73,0.10)' : m.bgCard,
                    border: `1px solid ${ownerFilter !== 'all' ? m.accent : m.border}`,
                    borderRadius: '8px', color: m.text, fontSize: '13px',
                    fontWeight: ownerFilter !== 'all' ? '600' : '400',
                  }}
                >
                  {canViewAll && <option value="all">All Owners</option>}
                  {canViewAll && <option value="unassigned">Unassigned</option>}
                  {(canViewAll ? activeEmployees : activeEmployees.filter(e => e.id === user?.id)).map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.id === user?.id ? `${emp.name} (Me)` : emp.name}</option>
                  ))}
                </select>
                {/* One tap to my own deals, and one tap back.
                    The board opens on All Owners for everyone who is not a
                    field tech, which is right for a manager and surprising for
                    a rep: "my pipeline" opens holding the whole company's work.
                    Cole, 5 Aug: "i have jobs there are not mine in my pipe line
                    and cant get them out."
                    The dropdown could already do this — his name is in it
                    marked (Me) — but on a phone that means opening a native
                    picker and finding yourself among 28 people. The default is
                    deliberately unchanged: managers and office staff open this
                    board to see everything, and flipping that for them to fix
                    a rep's first tap would be the wrong trade. */}
                {canViewAll && user?.id && (
                  <button
                    type="button"
                    onClick={() => setOwnerFilter(String(ownerFilter) === String(user.id) ? 'all' : String(user.id))}
                    style={{
                      minHeight: '44px', padding: '10px 14px', borderRadius: '8px',
                      backgroundColor: String(ownerFilter) === String(user.id) ? m.accent : 'transparent',
                      color: String(ownerFilter) === String(user.id) ? '#fff' : m.accent,
                      border: `1px solid ${m.accent}`, cursor: 'pointer',
                      fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap',
                    }}
                    title={String(ownerFilter) === String(user.id) ? 'Show everyone again' : 'Show only my deals'}
                  >
                    {String(ownerFilter) === String(user.id) ? 'Everyone' : 'Just mine'}
                  </button>
                )}
                {canViewAll && ownerFilter !== 'all' && String(ownerFilter) !== String(user?.id) && (
                  <button
                    type="button"
                    onClick={() => setOwnerFilter('all')}
                    style={{
                      minHeight: '44px', padding: '10px 12px', borderRadius: '8px',
                      backgroundColor: 'transparent', color: m.accent,
                      border: `1px solid ${m.accent}`, cursor: 'pointer',
                      fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap',
                    }}
                    title="Clear the owner filter"
                  >
                    ↺ All
                  </button>
                )}
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
                  const tabLeads = tab.id === 'All'
                    ? filteredPipelineLeads.filter(l => { const s = stages.find(st => st.id === l.status); return s && !s.isDelivery && !s.isClosed })
                    : getLeadsForStage(tab.id)
                  const count = tabLeads.length
                  // Value on the tab itself, so a rep can see which stage
                  // holds the money without opening each one.
                  const tabValue = tabLeads.reduce((s, l) => s + getLeadAmount(l), 0)
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
                      {tabValue > 0 && (
                        <span style={{ fontSize: '11px', fontWeight: '700', color: isActive ? tab.color : m.textMuted, whiteSpace: 'nowrap' }}>
                          {formatCurrency(tabValue)}
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
                  {/* Value of whatever folder/status is selected. Mobile showed
                      counts everywhere and money nowhere, so a rep tapping
                      "Negotiation" saw the cards but not the $1.1M behind them
                      — the number their desktop column header shows. */}
                  {(() => {
                    const total = mobileLeads.reduce((s, l) => s + getLeadAmount(l), 0)
                    if (total <= 0) return null
                    return (
                      <span style={{ fontSize: '11px', fontWeight: '700', color: '#16a34a' }}>
                        {formatCurrency(total)}
                      </span>
                    )
                  })()}
                  <span style={{ fontSize: '11px', color: m.textMuted, backgroundColor: m.bgCard, padding: '2px 8px', borderRadius: '10px', border: `1px solid ${m.border}` }}>
                    {mobileLeads.length}
                  </span>
                </div>

                {/* A filtered board that still has cards on it looks like an
                    unfiltered board with fewer deals. The empty state already
                    explained itself; a stage left holding one survivor did not,
                    which is how Cole read "only 1 job in qualified" as the
                    truth about his pipeline instead of the truth about his
                    search box. Say it wherever it is true. */}
                {mobileSalesExpanded && mobileLeads.length > 0 && narrowingFilterLabels.length > 0 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap',
                    padding: '8px 12px', margin: '0 12px 8px',
                    backgroundColor: 'rgba(234,179,8,0.10)',
                    border: '1px solid rgba(234,179,8,0.35)', borderRadius: '8px',
                  }}>
                    <Search size={13} color="#a16207" style={{ flexShrink: 0 }} />
                    <span style={{ fontSize: '12px', color: '#a16207', minWidth: 0, flex: 1 }}>
                      Filtered — {narrowingFilterLabels.join(' · ')}
                    </span>
                    <button
                      onClick={clearPipelineFilters}
                      style={{
                        minHeight: '32px', padding: '0 12px', borderRadius: '6px',
                        border: '1px solid rgba(234,179,8,0.5)', backgroundColor: 'transparent',
                        color: '#a16207', fontSize: '12px', fontWeight: '600',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}

                {mobileSalesExpanded && (
                  <>
                    {mobileLeads.length === 0 ? (
                      <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                        <Search size={32} color={m.textMuted} style={{ marginBottom: '8px', opacity: 0.5 }} />
                        {/* An empty board used to say "Leads will appear here as
                            they progress" — which reads as "you have no deals"
                            even when a saved filter is hiding all of them.
                            Filters persist across refreshes now, so Cole
                            refreshed Noah's phone and it still showed 0
                            (db60e9ce). Say which filters are on, and offer one
                            tap to clear them. */}
                        {activeFilterLabels.length > 0 ? (
                          <>
                            <div style={{ fontSize: '16px', color: m.text, marginBottom: '4px' }}>
                              Nothing matches your filters
                            </div>
                            <div style={{ fontSize: '13px', color: m.textMuted, marginBottom: '14px' }}>
                              {activeFilterLabels.join(' · ')}
                            </div>
                            <button
                              onClick={clearPipelineFilters}
                              style={{
                                minHeight: '40px', padding: '0 18px', borderRadius: '8px',
                                border: `1px solid ${m.accent}`, backgroundColor: m.accent,
                                color: '#fff', fontSize: '14px', fontWeight: '600', cursor: 'pointer',
                              }}
                            >
                              Clear filters
                            </button>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize: '16px', color: m.text, marginBottom: '4px' }}>
                              {mobileFilter === FOLLOW_UP_TAB ? 'Nothing due' : `No ${mobileFilter === 'All' ? '' : mobileFilter + ' '}leads`}
                            </div>
                            <div style={{ fontSize: '13px', color: m.textMuted }}>
                              {mobileFilter === FOLLOW_UP_TAB
                                ? 'Callbacks show up here on the day you promised them.'
                                : 'Leads will appear here as they progress'}
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      mobileLeads.map(lead => {
                        const sc = getStatusColor(lead.status)
                        const srcStyle = getSourceStyle(lead.lead_source)
                        return (
                          <div
                            key={lead.id}
                            onClick={() => openRecord(`/leads/${lead.id}`)}
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
                            {/* THE mobile card. An earlier pass put this on stLeads.map, which is
                                the delivery grouping — so the list a rep actually scrolls had no
                                strip at all and the feature looked missing on the phone. */}
                            {stageIsOpen(lead.status) && (
                              <FollowUpStrip
                                theme={m}
                                lead={lead}
                                rows={followUpRowsByLead.get(String(lead.id)) || []}
                                companyId={companyId}
                                employeeId={currentEmployeeId}
                                onLogged={loadFollowUps}
                                compact
                              />
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
                              {/* Per-stage value, same figure the desktop
                                  column header shows. */}
                              {(() => {
                                const v = stLeads.reduce((s, l) => s + getLeadAmount(l), 0)
                                return v > 0
                                  ? <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: '700', color: '#16a34a' }}>{formatCurrency(v)}</span>
                                  : null
                              })()}
                            </div>
                            {stLeads.map(lead => {
                              const job = lead.jobs?.[0]
                              return (
                                <div
                                  key={lead.id}
                                  onClick={() => openRecord(lead._isJob ? `/jobs/${lead._jobId}` : `/leads/${lead.id}`)}
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
                                  {/* Same strip as desktop. On a phone this is the whole feature —
                                      one line per card, tap to dial and set the next date without
                                      leaving the board. */}
                                  {stageIsOpen(lead.status) && (
                                    <FollowUpStrip
                                      theme={m}
                                      lead={lead}
                                      rows={followUpRowsByLead.get(String(lead.id)) || []}
                                      companyId={companyId}
                                      employeeId={currentEmployeeId}
                                      onLogged={loadFollowUps}
                                      compact
                                    />
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
        <div ref={boardScrollRef} style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', minHeight: 0 }}>

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
                        {getStageCount(stage.id)}
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
                              onClick={() => openRecord(lead._isEstimate ? `/estimates/${lead._quoteId}` : `/leads/${lead.id}`)}
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
                              {/* Follow-up lives on the card, in its real stage. Collapsed it is one
                                  line so a column stays scannable; open it to dial, see the last
                                  touches and set the next date. */}
                              {stageIsOpen(lead.status) && (
                                <FollowUpStrip
                                  theme={theme}
                                  lead={lead}
                                  rows={followUpRowsByLead.get(String(lead.id)) || []}
                                  companyId={companyId}
                                  employeeId={currentEmployeeId}
                                  onLogged={loadFollowUps}
                                />
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
                        {getStageCount(stage.id)}
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
                              onClick={() => openRecord(lead._isJob ? `/jobs/${lead._jobId}` : `/leads/${lead.id}`)}
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
                              {/* Follow-up lives on the card, in its real stage. Collapsed it is one
                                  line so a column stays scannable; open it to dial, see the last
                                  touches and set the next date. */}
                              {stageIsOpen(lead.status) && (
                                <FollowUpStrip
                                  theme={theme}
                                  lead={lead}
                                  rows={followUpRowsByLead.get(String(lead.id)) || []}
                                  companyId={companyId}
                                  employeeId={currentEmployeeId}
                                  onLogged={loadFollowUps}
                                />
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
              onClick={() => openRecord(`/leads/${selectedLead.id}`)}
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

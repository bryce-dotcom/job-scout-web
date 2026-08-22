import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { toZonedInput, fromZonedInput, resolveTimezone, DEFAULT_TZ } from '../lib/dateTz'
import { useTheme } from '../components/Layout'
import { toast } from '../lib/toast'
import { companyNotify } from '../lib/companyNotify'
import { isAdmin as checkAdmin } from '../lib/accessControl'
import {
  Plus, Search, Briefcase, X, Calendar, Clock, MapPin,
  Play, CheckCircle, FileText, ChevronRight, User, Users, Upload, Download,
  Trophy, DollarSign, List, ChevronLeft, Pause, ArrowRight, Coffee, ChevronDown, ChevronUp, ExternalLink,
  Archive, RotateCcw, Repeat
} from 'lucide-react'
import EntityCard from '../components/EntityCard'
import RecurrencePicker from '../components/RecurrencePicker'
import ImportExportModal, { exportToCSV, exportToXLSX } from '../components/ImportExportModal'
import { jobsFields, jobLinesFields, jobSectionsFields } from '../lib/importExportFields'
import { draftToJobLine, draftHasContent } from '../lib/jobLineDraft'
import { splitDateTimeInput, joinDateTimeInput } from '../lib/dateTimeParts'
import { jobStatusColors as statusColors, invoiceStatusColors } from '../lib/statusColors'
import { matchesJobSearch, jobSearchRank } from '../lib/jobSearch'
import PageHeader from '../components/PageHeader'
import SearchableSelect from '../components/SearchableSelect'

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

// Render a UTC ISO timestamp from the DB into the bare "YYYY-MM-DDTHH:MM"
// format an <input type="datetime-local"> expects — anchored to the job's
// REGION timezone (Utah/Mountain by default), not the browser's. Using the
// browser tz made the same job read differently on different devices; tz is
// resolved from the job's business unit. (Christopher's jobs/23309.)
const toLocalDateTimeInput = (isoString, tz = DEFAULT_TZ) => toZonedInput(isoString, tz)

const emptyJob = {
  job_title: '',
  job_address: '',
  gps_location: '',
  customer_id: '',
  salesperson_id: '',
  quote_id: '',
  status: 'Chillin',
  assigned_team: '',
  assigned_employee_ids: [],
  job_lead_id: '',
  business_unit: '',
  start_date: '',
  end_date: '',
  allotted_time_hours: '',
  details: '',
  notes: '',
  recurrence: 'None',
  recurrence_end_date: null,
  recurrence_landing: 'schedule',
  utility_incentive: '',
  discount: '',
  discount_description: ''
}

const formatCurrency = (amount) => {
  if (!amount) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

// Service visit color scheme — keep in sync with JobDetail.jsx Linked
// Services panel + JobCalendar legend so the same kind always means the
// same color across the app. Used for the small chip on board/list cards.
const SERVICE_KIND_COLORS = {
  warranty:  { bg: 'rgba(220,38,38,0.10)', text: '#dc2626', label: 'Warranty' },
  annual:    { bg: 'rgba(34,197,94,0.10)',  text: '#16a34a', label: 'Annual' },
  tune_up:   { bg: 'rgba(14,165,233,0.10)', text: '#0284c7', label: 'Tune-up' },
  repair:    { bg: 'rgba(249,115,22,0.10)', text: '#ea580c', label: 'Repair' },
  upsell:    { bg: 'rgba(168,85,247,0.10)', text: '#9333ea', label: 'Upsell' },
  service:   { bg: 'rgba(107,114,128,0.10)',text: '#6b7280', label: 'Service' },
}
const serviceKindStyle = (kind) => SERVICE_KIND_COLORS[kind] || SERVICE_KIND_COLORS.service

// ============ RECENT WINS CAROUSEL ============
function RecentWins({ wins, theme, isMobile, navigate, formatDate }) {
  const scrollRef = useRef(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const checkScroll = () => {
    const el = scrollRef.current
    if (!el) return
    setCanScrollLeft(el.scrollLeft > 4)
    setCanScrollRight(el.scrollLeft < el.scrollWidth - el.clientWidth - 4)
  }

  useEffect(() => {
    checkScroll()
    const el = scrollRef.current
    if (el) el.addEventListener('scroll', checkScroll)
    return () => { if (el) el.removeEventListener('scroll', checkScroll) }
  }, [wins.length])

  const scroll = (dir) => {
    const el = scrollRef.current
    if (el) el.scrollBy({ left: dir * 300, behavior: 'smooth' })
  }

  if (wins.length === 0) return null

  const totalRevenue = wins.reduce((sum, j) => sum + (parseFloat(j.job_total) || 0), 0)

  return (
    <div style={{
      marginBottom: '24px',
      backgroundColor: 'rgba(74,124,89,0.06)',
      borderRadius: '16px',
      border: '1px solid rgba(74,124,89,0.15)',
      padding: isMobile ? '16px' : '20px',
      position: 'relative'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: '14px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '36px', height: '36px', borderRadius: '10px',
            backgroundColor: 'rgba(74,124,89,0.15)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Trophy size={18} style={{ color: '#4a7c59' }} />
          </div>
          <div>
            <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#4a7c59', margin: 0 }}>
              Recent Wins
            </h3>
            <p style={{ fontSize: '12px', color: '#6b8f73', margin: 0 }}>
              {wins.length} job{wins.length !== 1 ? 's' : ''} completed
              {totalRevenue > 0 && <span style={{ fontWeight: '600' }}> — {formatCurrency(totalRevenue)} revenue</span>}
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px' }}>
          {canScrollLeft && (
            <button onClick={() => scroll(-1)} style={{
              width: '30px', height: '30px', borderRadius: '8px',
              backgroundColor: 'rgba(74,124,89,0.12)', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#4a7c59'
            }}>
              <ChevronLeft size={16} />
            </button>
          )}
          {canScrollRight && (
            <button onClick={() => scroll(1)} style={{
              width: '30px', height: '30px', borderRadius: '8px',
              backgroundColor: 'rgba(74,124,89,0.12)', border: 'none',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#4a7c59'
            }}>
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable cards */}
      <div
        ref={scrollRef}
        style={{
          display: 'flex', gap: '12px', overflowX: 'auto',
          scrollSnapType: 'x mandatory', paddingBottom: '4px',
          scrollbarWidth: 'none', msOverflowStyle: 'none'
        }}
      >
        {wins.map(job => (
          <div
            key={job.id}
            onClick={() => navigate(`/jobs/${job.id}`)}
            style={{
              minWidth: isMobile ? '260px' : '280px',
              backgroundColor: '#ffffff',
              borderRadius: '12px',
              border: '1px solid rgba(74,124,89,0.2)',
              padding: '14px 16px',
              cursor: 'pointer',
              scrollSnapAlign: 'start',
              transition: 'all 0.15s ease',
              flexShrink: 0
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#4a7c59'
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(74,124,89,0.12)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = 'rgba(74,124,89,0.2)'
              e.currentTarget.style.boxShadow = 'none'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{
                  fontSize: '14px', fontWeight: '600', color: theme.text,
                  margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                }}>
                  {job.job_title || 'Untitled Job'}
                </p>
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: '2px 0 0' }}>
                  {job.customer?.name || 'No customer'}
                </p>
              </div>
              {job.job_total > 0 && (
                <span style={{
                  fontSize: '14px', fontWeight: '700', color: '#4a7c59',
                  flexShrink: 0, marginLeft: '8px'
                }}>
                  {formatCurrency(job.job_total)}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '11px', color: theme.textMuted }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                <CheckCircle size={11} style={{ color: '#4a7c59' }} />
                {formatDate(job.completed_at || job.end_date || job.updated_at)}
              </span>
              {job.assigned_team && (
                <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                  <User size={11} />
                  {job.assigned_team}
                </span>
              )}
              {job.invoice_status && (
                <span style={{
                  padding: '1px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: '500',
                  backgroundColor: invoiceStatusColors[job.invoice_status]?.bg || 'rgba(0,0,0,0.05)',
                  color: invoiceStatusColors[job.invoice_status]?.text || theme.textMuted
                }}>
                  {job.invoice_status}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


// ============ MAIN COMPONENT ============
export default function Jobs() {
  const navigate = useNavigate()
  const location = useLocation()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const isAdmin = checkAdmin(user) // only Admin+ may edit allotted hours (bonus driver)
  const jobs = useStore((state) => state.jobs)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const quotes = useStore((state) => state.quotes)
  const businessUnits = useStore((state) => state.businessUnits)
  const storeJobStatuses = useStore((state) => state.jobStatuses)
  const products = useStore((state) => state.products)
  const fetchJobs = useStore((state) => state.fetchJobs)
  const fetchCustomers = useStore((state) => state.fetchCustomers)
  const fetchProducts = useStore((state) => state.fetchProducts)

  const [showModal, setShowModal] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const [formData, setFormData] = useState(emptyJob)
  // Region tz for the job being edited (its business unit -> Mountain default).
  // Anchors the start/end datetime inputs so they don't drift with the device.
  const formTz = resolveTimezone(formData.business_unit, businessUnits, DEFAULT_TZ)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [teamFilter, setTeamFilter] = useState('all')
  const [buFilter, setBuFilter] = useState('all')
  // 'all' (default) | 'installs' (parent_job_id IS NULL) | 'services' (parent_job_id IS NOT NULL)
  // Lets dispatch see only the install backlog or only the service queue.
  const [serviceFilter, setServiceFilter] = useState('all')
  const [showImportExport, setShowImportExport] = useState(false)
  const [customerSearchText, setCustomerSearchText] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [remoteCustomerHits, setRemoteCustomerHits] = useState([])
  const [remoteCustomerLoading, setRemoteCustomerLoading] = useState(false)
  // Optional line items to add when creating a brand-new job (so users don't
  // have to schedule a job, then re-open it just to add line items).
  const [newJobLines, setNewJobLines] = useState([])
  const [newLineDraft, setNewLineDraft] = useState({ item_id: '', description: '', price: '', quantity: 1 })
  // Opens on the LIST. This page is where someone finds a job and checks what
  // stage it is at — the stage strip above answers "what stage", the list
  // answers "which job", and a horizontally-scrolling kanban answered neither
  // without a lot of dragging. The board is still one click away.
  const [viewMode] = useState('list')
  const [historyYear, setHistoryYear] = useState(null)
  const [historyMonth, setHistoryMonth] = useState(null)
  const [isMobile, setIsMobile] = useState(false)
  const customerInputRef = useRef(null)
  // Recently Archived — fetched separately because the store filters them out
  const [archivedJobs, setArchivedJobs] = useState([])
  const [archivedJobsLoading, setArchivedJobsLoading] = useState(false)

  // Build dynamic board columns from DB-driven job statuses
  const boardColumns = (() => {
    const defaultCols = [
      { id: 'Chillin', name: 'Chillin', color: '#6382bf', icon: Coffee },
      { id: 'Scheduled', name: 'Scheduled', color: '#5a6349', icon: Calendar },
      { id: 'In Progress', name: 'In Progress', color: '#c28b38', icon: Play },
      { id: 'Completed', name: 'Completed', color: '#4a7c59', icon: CheckCircle },
    ]
    if (!storeJobStatuses || storeJobStatuses.length === 0) return defaultCols
    // Use DB order — apply known colors/icons for core statuses
    const coreMap = Object.fromEntries(defaultCols.map(c => [c.id, c]))
    const cols = storeJobStatuses.map(s => {
      const name = typeof s === 'string' ? s : s.name
      const core = coreMap[name]
      if (core) return core
      const color = typeof s === 'string' ? '#94a3b8' : (s.color || '#94a3b8')
      return { id: name, name, color, icon: Briefcase }
    })
    // Always ensure Completed column exists so jobs don't vanish
    if (!cols.some(c => c.id === 'Completed')) {
      cols.push({ id: 'Completed', name: 'Completed', color: '#4a7c59', icon: CheckCircle })
    }
    return cols
  })()

  const jobRelatedTables = [
    {
      tableName: 'job_lines',
      sheetName: 'Line Items',
      parentIdField: 'job_id',
      parentRefLabel: 'Job ID',
      fields: jobLinesFields,
      fetchData: async (parentIds) => {
        const { data } = await supabase.from('job_lines').select('*, item:products_services(name)').in('job_id', parentIds)
        return (data || []).map(r => ({
          ...r,
          item_name: r.item?.name || r.item_name || '',
          price: r.price ?? r.unit_price ?? 0,
          total: r.total ?? r.line_total ?? 0,
        }))
      },
    },
    {
      tableName: 'job_sections',
      sheetName: 'Sections',
      parentIdField: 'job_id',
      parentRefLabel: 'Job ID',
      fields: jobSectionsFields,
      fetchData: async (parentIds) => {
        const { data } = await supabase.from('job_sections').select('*').in('job_id', parentIds)
        return data || []
      },
    },
  ]

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Fetch recently archived jobs (last 60 days) for the restore drawer
  const fetchArchivedJobs = useCallback(async () => {
    if (!companyId) return
    setArchivedJobsLoading(true)
    const cutoff = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
    // jobs has no archived_at column — archiving is a status change, and
    // last_status_change_at (trigger-set on any status change) is when it
    // happened. Aliased to archived_at so the render below stays unchanged.
    const { data } = await supabase
      .from('jobs')
      .select('id, job_id, job_title, status, archived_at:last_status_change_at, updated_at, customer:customers!customer_id(name)')
      .eq('company_id', companyId)
      .eq('status', 'Archived')
      .gte('last_status_change_at', cutoff)
      .order('last_status_change_at', { ascending: false })
      .limit(50)
    setArchivedJobs(data || [])
    setArchivedJobsLoading(false)
  }, [companyId])

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchJobs()
    fetchCustomers()
    if (fetchProducts) fetchProducts()
    fetchArchivedJobs()
  }, [companyId, navigate, fetchJobs, fetchCustomers, fetchProducts, fetchArchivedJobs])

  // Auto-open create modal when navigating from CustomerDetail with customer pre-filled
  useEffect(() => {
    if (location.state?.openCreate && location.state?.customerId) {
      const cust = customers.find(c => c.id === location.state.customerId)
      if (cust) {
        setEditingJob(null)
        setFormData({ ...emptyJob, customer_id: cust.id, job_address: cust.address || '' })
        setCustomerSearchText(cust.name || '')
        setShowCustomerDropdown(false)
        setError(null)
        setShowModal(true)
      }
      // Clear the state so it doesn't re-trigger
      navigate(location.pathname, { replace: true, state: {} })
    }
  }, [location.state, customers, navigate, location.pathname])

  // Server-side customer search fallback (debounced) — ensures the picker
  // can find any customer in the DB, even if the local store is stale or
  // the company has more customers than were paginated into memory.
  useEffect(() => {
    const term = (customerSearchText || '').trim()
    if (!showCustomerDropdown || !companyId || term.length < 2) {
      setRemoteCustomerHits([])
      setRemoteCustomerLoading(false)
      return
    }
    let cancelled = false
    setRemoteCustomerLoading(true)
    const handle = setTimeout(async () => {
      try {
        const escaped = term.replace(/[%_,]/g, '\\$&')
        const { data } = await supabase
          .from('customers')
          .select('id, name, business_name, address, phone, email')
          .eq('company_id', companyId)
          .or(`name.ilike.%${escaped}%,business_name.ilike.%${escaped}%`)
          .order('name')
          .limit(50)
        if (!cancelled) setRemoteCustomerHits(data || [])
      } catch (e) {
        if (!cancelled) setRemoteCustomerHits([])
      } finally {
        if (!cancelled) setRemoteCustomerLoading(false)
      }
    }, 220)
    return () => { cancelled = true; clearTimeout(handle) }
  }, [customerSearchText, showCustomerDropdown, companyId])

  // Mobile detection
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Get unique teams for filter
  const teams = [...new Set(jobs.map(j => j.assigned_team).filter(Boolean))]

  // Years present in the job dataset — drives history pills in list view
  const availableYears = [...new Set(
    jobs.flatMap(j =>
      [j.start_date, j.completed_at, j.created_at]
        .filter(Boolean)
        .map(d => new Date(d).getFullYear())
        .filter(y => y >= 2020 && y <= new Date().getFullYear())
    )
  )].sort((a, b) => b - a)

  // Recent wins: completed jobs from last 30 days, sorted most recent first
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentWins = jobs
    .filter(j => j.status === 'Completed' && new Date(j.completed_at || j.end_date || j.updated_at) >= thirtyDaysAgo)
    .sort((a, b) => new Date(b.completed_at || b.updated_at) - new Date(a.completed_at || a.updated_at))

  const filteredJobs = jobs.filter(job => {
    // lib/jobSearch: every word must match something, across any field. The
    // chain this replaced was a single substring test, so "costco draper"
    // found nothing — adding a word emptied the results instead of narrowing
    // them. It also never looked at phone, email, status, crew or business
    // unit, and "o'brien" missed "OBrien".
    const matchesSearch = matchesJobSearch(job, searchTerm)

    // History mode: show all non-archived statuses filtered by year/month
    // Search mode: show all statuses so completed jobs surface
    // Active mode: use statusFilter dropdown
    let matchesStatus
    if (historyYear !== null) {
      matchesStatus = job.status !== 'Archived'
    } else if (searchTerm) {
      matchesStatus = true
    } else {
      matchesStatus = statusFilter === 'all' ? true
        : statusFilter === 'active' ? !['Completed', 'Cancelled', 'Archived'].includes(job.status)
        : job.status === statusFilter
    }

    const matchesTeam = teamFilter === 'all' || job.assigned_team === teamFilter
    const matchesBU = buFilter === 'all' || job.business_unit === buFilter
    const matchesService = serviceFilter === 'all'
      ? true
      : serviceFilter === 'installs'
        ? !job.parent_job_id
        : !!job.parent_job_id

    if (!matchesSearch || !matchesStatus || !matchesTeam || !matchesBU || !matchesService) return false

    // Year/month filter — ONE date decides which year a job belongs to: when
    // the work happened. Scheduled start, else when it was completed, else
    // when the record was created.
    //
    // It used to match if ANY of start / completed / updated_at / created fell
    // in the window, and updated_at is the problem: open a 2019 job, change a
    // note, and its value lands in this year. Measured on the real table,
    // 4,731 jobs worth $3,636,391 counted as 2026 for no reason other than
    // being edited in 2026 — jobs created as far back as 2019. That is why
    // this page read $5.4M against the dashboard's $1.68M.
    //
    // The dashboard dates a job by created_at alone (wonJobsInRange). The two
    // still differ by design — a job created in December and started in
    // January belongs to different years under each — but they are now the
    // same order of magnitude and the difference is explainable.
    if (historyYear !== null) {
      const effective = job.start_date || job.completed_at || job.created_at
      if (!effective) return false
      const date = new Date(effective)
      if (date.getFullYear() !== historyYear) return false
      if (historyMonth !== null && date.getMonth() + 1 !== historyMonth) return false
      return true
    }

    return true
  })

  // Lookups for service-visit display on cards: parent header (for child
  // service visit cards) and child count (for parent install cards).
  // Built from the FULL jobs list — not the filtered list — so a parent
  // hidden by a status filter still resolves its job_id for a visible child.
  const parentJobById = (() => {
    const m = new Map()
    for (const j of jobs) m.set(j.id, j)
    return m
  })()
  const serviceCountByParent = (() => {
    const m = new Map()
    for (const j of jobs) {
      if (j.parent_job_id) m.set(j.parent_job_id, (m.get(j.parent_job_id) || 0) + 1)
    }
    return m
  })()

  // The list, ordered so the thing you typed comes first. Without this an
  // exact job number could sit below thirty loose matches, which is most of
  // why the search felt broken even when it did find the job.
  // No search term = leave the existing order completely alone.
  const rankedJobs = searchTerm.trim()
    ? filteredJobs
      .map((job, i) => ({ job, i, rank: jobSearchRank(job, searchTerm) }))
      .sort((a, b) => a.rank - b.rank || a.i - b.i)
      .map(x => x.job)
    : filteredJobs

  // Board view groups — dynamic from boardColumns
  const boardColumnIds = new Set(boardColumns.map(c => c.id))
  // (jobsByStatus / otherJobs removed with the kanban — the Job Board owns
  //  the by-status view. boardColumnIds still drives the stage strip.)






  const openAddModal = () => {
    setEditingJob(null)
    setFormData(emptyJob)
    setError(null)
    setCustomerSearchText('')
    setShowCustomerDropdown(false)
    setShowModal(true)
    fetchCustomers() // Ensure fresh customer list
  }

  const openEditModal = (job) => {
    setEditingJob(job)
    setFormData({
      job_title: job.job_title || '',
      job_address: job.job_address || '',
      gps_location: job.gps_location || '',
      customer_id: job.customer_id || '',
      salesperson_id: job.salesperson_id || '',
      quote_id: job.quote_id || '',
      status: job.status || 'Scheduled',
      assigned_team: job.assigned_team || '',
      assigned_employee_ids: (() => {
        // Parse existing assigned_team names back to employee IDs
        if (!job.assigned_team) return []
        const names = job.assigned_team.split(',').map(n => n.trim()).filter(Boolean)
        return names.map(name => {
          const emp = employees.find(e => e.name === name)
          return emp ? String(emp.id) : null
        }).filter(Boolean)
      })(),
      business_unit: job.business_unit || '',
      // Convert stored UTC timestamps back to a LOCAL datetime-local string
      // so the input shows the wall-clock time the user originally picked.
      // Naively slicing the ISO would show UTC, which then gets re-saved
      // wrong on the next round-trip.
      start_date: toLocalDateTimeInput(job.start_date, resolveTimezone(job.business_unit, businessUnits, DEFAULT_TZ)),
      end_date:   toLocalDateTimeInput(job.end_date, resolveTimezone(job.business_unit, businessUnits, DEFAULT_TZ)),
      allotted_time_hours: job.allotted_time_hours || '',
      details: job.details || '',
      notes: job.notes || '',
      recurrence: job.recurrence || 'None',
      recurrence_end_date: job.recurrence_end_date || null,
      recurrence_landing: job.recurrence_landing || 'schedule',
      utility_incentive: job.utility_incentive || '',
      discount: job.discount || '',
      discount_description: job.discount_description || ''
    })
    const cust = customers.find(c => c.id === job.customer_id)
    setCustomerSearchText(cust?.name || '')
    setShowCustomerDropdown(false)
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingJob(null)
    setError(null)
    setShowCustomerDropdown(false)
    setNewJobLines([])
    setNewLineDraft({ item_id: '', description: '', price: '', quantity: 1 })
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => {
      const next = { ...prev, [name]: value }

      // Auto-fill address from customer
      if (name === 'customer_id' && value) {
        const customer = customers.find(c => c.id === parseInt(value))
        if (customer?.address) next.job_address = customer.address
      }

      // Auto-sync status ↔ start_date so scheduled jobs always land on calendar
      if (name === 'start_date' && value && prev.status === 'Chillin') {
        next.status = 'Scheduled'
      }
      if (name === 'status' && value === 'Scheduled' && !prev.start_date) {
        // Default to tomorrow 8 AM as a bare wall-clock "YYYY-MM-DDTHH:MM"
        // string — the form's invariant. The save converts it to UTC in the
        // job's region tz (fromZonedInput), so 8 AM means 8 AM Mountain, not
        // "8 AM on the server's clock." (The old `.toISOString().slice(0,16)`
        // wrote a UTC wall-clock and the job landed offset hours off.)
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        const pad = (n) => String(n).padStart(2, '0')
        next.start_date = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}T08:00`
      }

      return next
    })
  }

  // Date and time are two inputs over one stored value. Writing back through
  // handleChange (rather than setFormData) keeps the status <-> start_date
  // auto-sync that puts a scheduled job on the calendar.
  const setDatePart = (name, part, value) => {
    const cur = splitDateTimeInput(formData[name])
    const next = part === 'date'
      ? joinDateTimeInput(value, cur.time)
      : joinDateTimeInput(cur.date, value)
    handleChange({ target: { name, value: next, type: 'text' } })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    // The draft row is folded into the save below, so pressing the small Add
    // button is optional. The one case that cannot be folded in is a draft with
    // something typed that is not a usable line — a quantity of 0. Saying so is
    // the whole point: dropping it quietly is the bug Christopher reported.
    if (draftHasContent(newLineDraft) && !draftToJobLine(newLineDraft, products)) {
      setError('That last line item needs a quantity of at least 1, or clear it before saving.')
      return
    }

    setLoading(true)
    setError(null)

    const jobNumber = editingJob ? editingJob.job_id : `JOB-${Date.now().toString(36).toUpperCase()}`

    const payload = {
      company_id: companyId,
      job_id: jobNumber,
      job_title: formData.job_title,
      job_address: formData.job_address || null,
      gps_location: formData.gps_location || null,
      customer_id: formData.customer_id ? parseInt(formData.customer_id) : null,
      salesperson_id: formData.salesperson_id || null,
      quote_id: formData.quote_id || null,
      status: formData.status,
      assigned_team: formData.assigned_employee_ids.length > 0
        ? formData.assigned_employee_ids.map(id => {
            const emp = employees.find(e => String(e.id) === String(id))
            return emp?.name || ''
          }).filter(Boolean).join(', ')
        : (formData.assigned_team || null),
      job_lead_id: formData.job_lead_id || (formData.assigned_employee_ids.length > 0 ? parseInt(formData.assigned_employee_ids[0]) : null),
      business_unit: formData.business_unit || null,
      // datetime-local inputs emit a bare "YYYY-MM-DDTHH:MM" wall-clock with no
      // timezone. We interpret it in the job's REGION tz (Mountain by default)
      // and store the correct UTC instant — so 2:00 PM saved in Utah comes back
      // as 2:00 PM on every device, not 7:00 AM (Christopher's MST bug).
      start_date: formData.start_date ? fromZonedInput(formData.start_date, formTz) : null,
      end_date:   formData.end_date   ? fromZonedInput(formData.end_date, formTz)   : null,
      allotted_time_hours: formData.allotted_time_hours || null,
      details: formData.details || null,
      notes: formData.notes || null,
      recurrence: formData.recurrence || 'None',
      recurrence_end_date: formData.recurrence_end_date || null,
      recurrence_landing: formData.recurrence_landing || 'schedule',
      utility_incentive: formData.utility_incentive || null,
      discount: formData.discount || null,
      discount_description: formData.discount_description || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingJob) {
      result = await supabase
        .from('jobs')
        .update(payload)
        .eq('id', editingJob.id)
    } else {
      result = await supabase
        .from('jobs')
        .insert([payload])
        .select()
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    // Bulk-insert any line items the user added in the create modal so they
    // don't have to re-open the job afterwards just to add lines.
    // Christopher: "I have been hitting the add job button thinking all of the
    // info is saved." A line typed into the draft row but never handed to the
    // small Add button used to be discarded here in silence, and the job was
    // created without the work on it. Fold it in — pressing Add is now a
    // convenience for entering several lines, not a toll on saving one.
    const pendingLine = draftToJobLine(newLineDraft, products)
    const linesToSave = pendingLine ? [...newJobLines, pendingLine] : newJobLines
    if (!editingJob && result.data?.[0] && linesToSave.length > 0) {
      const newJobId = result.data[0].id
      const linesPayload = linesToSave
        .filter(l => (l.item_id || (l.description && String(l.description).trim())) && Number(l.quantity) > 0)
        .map(l => {
          const product = products.find(p => String(p.id) === String(l.item_id))
          // Custom lines carry a typed price; catalog lines fall back to the
          // product's unit price (preserves the old behavior exactly).
          const price = (l.price != null && l.price !== '' && !isNaN(Number(l.price)))
            ? Number(l.price)
            : Number(product?.unit_price || 0)
          const qty = Number(l.quantity || 1)
          return {
            company_id: companyId,
            job_id: newJobId,
            item_id: product?.id || null,
            description: (l.description && String(l.description).trim()) || product?.name || null,
            quantity: qty,
            price,
            total: price * qty,
            labor_cost: Number(product?.labor_cost || 0)
          }
        })
      if (linesPayload.length > 0) {
        const { error: linesErr } = await supabase.from('job_lines').insert(linesPayload)
        if (linesErr) console.warn('[Jobs] failed to insert job_lines on create:', linesErr)
      }
    }

    // Auto-create tracking lead for new jobs without a lead_id
    if (!editingJob && result.data?.[0]) {
      const newJob = result.data[0]
      const customer = formData.customer_id ? customers.find(c => c.id === parseInt(formData.customer_id)) : null
      const jobStatus = newJob.status || 'Chillin'
      const leadStatusMap = { 'Chillin': 'Job Scheduled', 'Scheduled': 'Job Scheduled', 'In Progress': 'In Progress', 'Completed': 'Job Complete' }
      const leadStatus = leadStatusMap[jobStatus] || 'Job Scheduled'

      const { data: trackingLead } = await supabase
        .from('leads')
        .insert({
          company_id: companyId,
          customer_name: customer?.name || formData.job_title || 'Direct Job',
          phone: customer?.phone || null,
          email: customer?.email || null,
          address: formData.job_address || customer?.address || null,
          business_name: customer?.business_name || null,
          status: leadStatus,
          lead_source: customer ? 'Existing Customer' : 'Direct Job',
          service_type: formData.job_title || null,
          converted_customer_id: customer?.id || null,
          quote_id: formData.quote_id ? parseInt(formData.quote_id) : null,
          quote_amount: newJob.contract_amount || null,
          updated_at: new Date().toISOString()
        })
        .select()
        .single()

      if (trackingLead) {
        // Link job back to tracking lead
        await supabase.from('jobs').update({ lead_id: trackingLead.id }).eq('id', newJob.id)
        toast.info('Added to delivery pipeline')
      }
    }

    // Auto-create appointment when job is scheduled with a date — so it shows on calendar
    const savedJob = editingJob || result.data?.[0]
    if (savedJob && payload.status === 'Scheduled' && payload.start_date) {
      const startTime = new Date(payload.start_date)
      const endTime = payload.end_date ? new Date(payload.end_date) : new Date(startTime.getTime() + 4 * 60 * 60 * 1000)

      const assigneeId = payload.job_lead_id || (user?.employee_id ? parseInt(user.employee_id) : null)
      const jobTitle = payload.job_title || savedJob.job_title || 'Scheduled Job'
      const customer = payload.customer_id ? customers.find(c => c.id === parseInt(payload.customer_id)) : null
      await supabase.from('appointments').insert({
        company_id: companyId,
        title: jobTitle,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        appointment_type: 'Job',
        status: 'Scheduled',
        notes: `Job: ${jobTitle} (#${savedJob.job_id || savedJob.id})`,
        employee_id: assigneeId,
        customer_id: customer?.id || null,
        location: payload.job_address || '',
        created_at: new Date().toISOString()
      })
    }

    await fetchJobs()
    const createdJobId = !editingJob ? result.data?.[0]?.id : null
    closeModal()
    setLoading(false)
    // Land the user ON the newly created job so they can review/add line items
    // in one continuous flow instead of hunting for it on the board afterwards
    // (Alayda #97cce27a "having to touch a job twice"). JobDetail auto-syncs
    // job_total from the lines on load, so the total shows correctly there.
    if (createdJobId) {
      navigate(`/jobs/${createdJobId}`)
    }
  }

  const scheduleJob = async (job) => {
    // Set start_date if missing so job appears on calendar (default tomorrow 8 AM)
    const updateData = {
      status: 'Scheduled',
      updated_at: new Date().toISOString()
    }
    if (!job.start_date) {
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(8, 0, 0, 0)
      updateData.start_date = tomorrow.toISOString()
      updateData.end_date = new Date(tomorrow.getTime() + 4 * 60 * 60 * 1000).toISOString()
    }

    await supabase.from('jobs').update(updateData).eq('id', job.id)

    if (job.lead_id) {
      await supabase.from('leads').update({ status: 'Job Scheduled', updated_at: new Date().toISOString() }).eq('id', job.lead_id)
    }

    // Create appointment so job shows on Appointments calendar too
    const startTime = job.start_date || updateData.start_date
    const endTime = job.end_date || updateData.end_date
    const jobTitle = job.job_title || 'Scheduled Job'
    await supabase.from('appointments').insert({
      company_id: companyId,
      title: jobTitle,
      start_time: startTime,
      end_time: endTime,
      appointment_type: 'Job',
      status: 'Scheduled',
      notes: `Job: ${jobTitle} (#${job.job_id || job.id})`,
      employee_id: job.job_lead_id || null,
      customer_id: job.customer?.id || job.customer_id || null,
      location: job.job_address || '',
      created_at: new Date().toISOString()
    })

    await fetchJobs()
  }

  const startJob = async (job) => {
    await supabase
      .from('jobs')
      .update({
        status: 'In Progress',
        start_date: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)

    // Sync to lead pipeline
    if (job.lead_id) {
      await supabase.from('leads').update({ status: 'In Progress', updated_at: new Date().toISOString() }).eq('id', job.lead_id)
    }

    await fetchJobs()
  }

  const completeJob = async (job) => {
    await supabase
      .from('jobs')
      .update({
        status: 'Completed',
        // completed_at = actual completion time. end_date stays the
        // scheduled end so the job stops painting as a multi-week bar
        // on the calendar (Costco bug, fixed Apr 28 2026).
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)

    // Sync to lead pipeline
    if (job.lead_id) {
      await supabase.from('leads').update({ status: 'Job Complete', updated_at: new Date().toISOString() }).eq('id', job.lead_id)
    }

    const customerName = job.customer?.name || job.customer_name || 'Unknown'
    const amount = parseFloat(job.job_total) || 0
    const amountStr = amount > 0 ? ` — $${amount.toLocaleString()}` : ''
    const needsInvoice = !job.invoice_status || job.invoice_status === 'Not Invoiced'
    companyNotify({
      companyId,
      type: 'job_completed',
      title: 'Job Completed!',
      message: `${customerName}${amountStr} (${job.job_id})`,
      metadata: { job_id: job.id, customer_name: customerName, amount },
      createdBy: user?.id
    })
    if (needsInvoice) {
      companyNotify({
        companyId,
        type: 'job_ready_to_invoice',
        title: 'Ready to invoice',
        message: `${customerName}${amountStr} — ${job.job_title || job.job_id}`,
        metadata: {
          job_id: job.id, human_job_id: job.job_id, customer_name: customerName,
          amount, link: `/jobs/${job.id}#invoice`,
        },
        createdBy: user?.id
      })
    }

    await fetchJobs()
  }

  // Archive a job (soft-delete — sets status to Archived so it disappears
  // from the active board but can be restored from the Recently Archived drawer).
  // This is the safe alternative to hard-deleting: no data loss, reversible.
  const archiveJob = async (job) => {
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'Archived', updated_at: new Date().toISOString() })
      .eq('id', job.id)
    if (error) { toast.error('Failed to archive job'); return }
    toast.success(`"${job.job_title || job.job_id}" archived — restore it from Recently Archived below`)
    await Promise.all([fetchJobs(), fetchArchivedJobs()])
  }

  // Restore a previously archived job back to Chillin (the triage column)
  const restoreJob = async (job) => {
    const { error } = await supabase
      .from('jobs')
      .update({ status: 'Chillin', updated_at: new Date().toISOString() })
      .eq('id', job.id)
    if (error) { toast.error('Failed to restore job'); return }
    toast.success(`"${job.job_title || job.job_id}" restored to Chillin`)
    await Promise.all([fetchJobs(), fetchArchivedJobs()])
  }

  const openMap = (address) => {
    if (address) {
      window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`, '_blank')
    }
  }

  const formatDate = (date) => {
    if (!date) return '-'
    return new Date(date).toLocaleDateString()
  }

  const revenueWon = recentWins.reduce((sum, j) => sum + (parseFloat(j.job_total) || 0), 0)

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

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      <PageHeader
        title="Jobs"
        icon={Briefcase}
        actions={<>
          <button onClick={() => setShowImportExport(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
            <Upload size={16} /> {!isMobile && 'Import'}
          </button>
          <button onClick={() => exportToXLSX(filteredJobs, jobsFields, 'jobs_export', { relatedTables: jobRelatedTables, parentRefField: 'job_id', mainSheetName: 'Jobs', companyId })} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
            <Download size={16} /> {!isMobile && 'Export'}
          </button>
          <button
            onClick={() => navigate('/jobs/calendar')}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', backgroundColor: theme.bgCard, color: theme.text,
              border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '13px', cursor: 'pointer'
            }}
          >
            <Calendar size={16} />
            {!isMobile && 'Calendar'}
          </button>
          <button
            onClick={openAddModal}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px', backgroundColor: theme.accent, color: '#ffffff',
              border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer'
            }}
          >
            <Plus size={16} />
            Add Job
          </button>
        </>}
      />

      {/* Recent Wins Carousel */}
      <RecentWins
        wins={recentWins}
        theme={theme}
        isMobile={isMobile}
        navigate={navigate}
        formatDate={formatDate}
      />

      {/* Stats — all board columns */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '20px',
        overflowX: 'auto',
        paddingBottom: '4px'
      }}>
        {boardColumns.map(col => {
          const colJobs = (historyYear !== null ? filteredJobs : jobs).filter(j => j.status === col.id)
          const count = colJobs.length
          const value = colJobs.reduce((s, j) => s + (parseFloat(j.job_total) || 0), 0)
          const fmtK = (n) => n >= 1000000 ? `$${(n/1000000).toFixed(1)}M` : n >= 1000 ? `$${(n/1000).toFixed(0)}k` : n > 0 ? `$${Math.round(n)}` : null
          // Clicking a stage lists those jobs underneath it. This page is for
          // finding a job and seeing what stage it is at, so the stages drive
          // the list rather than being a read-only scoreboard above a board
          // you then have to scroll sideways through.
          const isActive = statusFilter === col.id
          return (
            <button
              key={col.id}
              onClick={() => setStatusFilter(isActive ? 'all' : col.id)}
              title={isActive ? `Show all jobs` : `Show only ${col.name}`}
              style={{
                backgroundColor: isActive ? col.color : theme.bgCard, borderRadius: '10px',
                border: `1px solid ${isActive ? col.color : theme.border}`, padding: '8px 14px', textAlign: 'center',
                minWidth: '80px', flex: '0 0 auto', cursor: 'pointer', minHeight: '44px',
              }}
            >
              <p style={{ fontSize: '18px', fontWeight: '700', color: isActive ? '#fff' : col.color, margin: 0 }}>{count}</p>
              {fmtK(value) && (
                <p style={{ fontSize: '11px', fontWeight: '600', color: isActive ? '#fff' : col.color, margin: '1px 0 0', opacity: isActive ? 0.9 : 0.75 }}>
                  {fmtK(value)}
                </p>
              )}
              <p style={{ fontSize: '10px', color: isActive ? '#fff' : theme.textMuted, margin: '2px 0 0', whiteSpace: 'nowrap' }}>
                {col.name}
              </p>
            </button>
          )
        })}
        {statusFilter !== 'all' && (
          <button
            onClick={() => setStatusFilter('all')}
            style={{
              backgroundColor: 'transparent', borderRadius: '10px',
              border: `1px dashed ${theme.border}`, padding: '8px 14px',
              minWidth: '80px', flex: '0 0 auto', cursor: 'pointer', minHeight: '44px',
              color: theme.textSecondary, fontSize: '12px', fontWeight: '600',
            }}
          >
            Show all
          </button>
        )}
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: isMobile ? '100%' : '200px' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.textMuted
          }} />
          <input
            type="text"
            placeholder="Search jobs..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, paddingLeft: '40px' }}
          />
        </div>
        {viewMode === 'list' && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              onClick={() => { setHistoryYear(null); setHistoryMonth(null) }}
              style={{
                padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                backgroundColor: historyYear === null ? theme.accent : 'transparent',
                color: historyYear === null ? '#fff' : theme.textMuted,
                fontSize: '13px', fontWeight: '500',
                border: `1px solid ${historyYear === null ? theme.accent : theme.border}`
              }}
            >Active</button>
            {availableYears.map(year => (
              <button key={year}
                onClick={() => { setHistoryYear(year); setHistoryMonth(null) }}
                style={{
                  padding: '8px 12px', borderRadius: '8px', cursor: 'pointer',
                  backgroundColor: historyYear === year ? theme.accent : 'transparent',
                  color: historyYear === year ? '#fff' : theme.textMuted,
                  fontSize: '13px', fontWeight: '500',
                  border: `1px solid ${historyYear === year ? theme.accent : theme.border}`
                }}
              >{year}</button>
            ))}
          </div>
        )}
        {viewMode === 'list' && historyYear === null && (
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{ ...inputStyle, width: isMobile ? '100%' : 'auto', minWidth: isMobile ? 'auto' : '140px' }}
          >
            <option value="active">Active Jobs</option>
            <option value="all">All Status</option>
            {boardColumns.map(col => (
              <option key={col.id} value={col.id}>{col.name}</option>
            ))}
            <option value="On Hold">On Hold</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        )}
        {viewMode === 'list' && historyYear !== null && (
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', width: '100%' }}>
            {['All', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((m, i) => {
              const monthNum = i === 0 ? null : i
              const isActive = historyMonth === monthNum
              return (
                <button key={m}
                  onClick={() => setHistoryMonth(monthNum)}
                  style={{
                    padding: '6px 10px', borderRadius: '7px', cursor: 'pointer',
                    backgroundColor: isActive ? theme.accentBg : 'transparent',
                    color: isActive ? theme.accent : theme.textMuted,
                    fontSize: '12px', fontWeight: isActive ? '600' : '400',
                    border: `1px solid ${isActive ? theme.accent : theme.border}`
                  }}
                >{m}</button>
              )
            })}
          </div>
        )}
        {teams.length > 0 && (
          <SearchableSelect
            options={[{ value: 'all', label: 'All Teams' }, ...teams.map(team => ({ value: team, label: team }))]}
            value={teamFilter}
            onChange={(val) => setTeamFilter(val)}
            placeholder="All Teams"
            theme={theme}
            style={{ width: isMobile ? '100%' : 'auto', minWidth: isMobile ? 'auto' : '140px' }}
          />
        )}
        {businessUnits.length > 1 && (
          <SearchableSelect
            options={[{ value: 'all', label: 'All Business Units' }, ...businessUnits.map(bu => {
              const buName = typeof bu === 'object' ? bu.name : bu
              return { value: buName, label: buName }
            })]}
            value={buFilter}
            onChange={(val) => setBuFilter(val)}
            placeholder="All Business Units"
            theme={theme}
            style={{ width: isMobile ? '100%' : 'auto', minWidth: isMobile ? 'auto' : '160px' }}
          />
        )}
        {/* Install / Service filter — small segmented control. Only
            renders once there's at least one service visit in the
            workspace so we don't add clutter for tenants who never use
            this feature yet. */}
        {jobs.some(j => j.parent_job_id) && (
          <div style={{
            display: 'flex', borderRadius: '8px', overflow: 'hidden',
            border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard,
          }}>
            {[
              { value: 'all',      label: 'All' },
              { value: 'installs', label: 'Installs' },
              { value: 'services', label: 'Services' },
            ].map((opt, i) => (
              <button
                key={opt.value}
                onClick={() => setServiceFilter(opt.value)}
                style={{
                  padding: '8px 12px', border: 'none', cursor: 'pointer',
                  borderLeft: i === 0 ? 'none' : `1px solid ${theme.border}`,
                  backgroundColor: serviceFilter === opt.value ? theme.accent : 'transparent',
                  color: serviceFilter === opt.value ? '#fff' : theme.textMuted,
                  fontSize: '13px', fontWeight: 500,
                }}
                title={opt.value === 'installs'
                  ? 'Show only original install jobs (no parent)'
                  : opt.value === 'services'
                    ? 'Show only follow-up service visits (warranty, annual, repair, etc.)'
                    : 'Show all jobs'}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}
      </div>


        <>
        {historyYear !== null && filteredJobs.length > 0 && (() => {
          const terminalStatuses = ['Completed', 'Complete', 'Verified', 'Verified Complete']
          const closed = filteredJobs.filter(j => terminalStatuses.includes(j.status))
          const totalValue = filteredJobs.reduce((s, j) => s + (parseFloat(j.job_total) || 0), 0)
          const closedRevenue = closed.reduce((s, j) => s + (parseFloat(j.job_total) || 0), 0)
          const label = historyMonth
            ? new Date(historyYear, historyMonth - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            : String(historyYear)
          return (
            <div style={{
              display: 'flex', gap: '24px', flexWrap: 'wrap', alignItems: 'center',
              padding: '12px 18px', marginBottom: '12px',
              backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '10px'
            }}>
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '500' }}>{label} — Jobs</div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>{filteredJobs.length}</div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '500' }}>Total Value</div>
                <div style={{ fontSize: '22px', fontWeight: '700', color: theme.accent }}>{formatCurrency(totalValue) || '$0'}</div>
              </div>
              {closed.length > 0 && (
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '500' }}>Closed Revenue</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(closedRevenue) || '$0'}</div>
                </div>
              )}
              <div style={{ marginLeft: 'auto', fontSize: '12px', color: theme.textMuted }}>
                {closed.length} closed · {filteredJobs.length - closed.length} open
              </div>
            </div>
          )
        })()}
        {filteredJobs.length === 0 ? (
          <div style={{
            textAlign: 'center',
            padding: '48px 24px',
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`
          }}>
            <Briefcase size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
            <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
              {searchTerm || statusFilter !== 'all' ? 'No jobs match your search.' : 'No jobs yet.'}
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {rankedJobs.map((job) => {
              const statusStyle = statusColors[job.status] || statusColors['Scheduled']
              const invoiceStyle = invoiceStatusColors[job.invoice_status] || invoiceStatusColors['Not Invoiced']

              return (
                <EntityCard
                  key={job.id}
                  name={job.customer?.name}
                  businessName={job.customer?.business_name}
                  accentColor={job.recurrence && job.recurrence !== 'None' ? '#8b5cf6' : undefined}
                  onClick={() => navigate(`/jobs/${job.id}`)}
                  style={{ padding: '16px 20px' }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
                    {/* Main Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: '600', color: theme.accent, fontSize: '13px' }}>
                          {job.job_id}
                        </span>
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: '500',
                          backgroundColor: statusStyle.bg,
                          color: statusStyle.text
                        }}>
                          {job.status}
                        </span>
                        {job.recurrence && job.recurrence !== 'None' && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '3px',
                            padding: '2px 8px', borderRadius: '12px', fontSize: '11px', fontWeight: 600,
                            backgroundColor: 'rgba(139,92,246,0.12)', color: '#6b21a8',
                          }}>
                            <Repeat size={10} /> {job.membership_id ? 'Club' : 'Recurring'}
                          </span>
                        )}
                        {job.invoice_status && (
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '11px',
                            fontWeight: '500',
                            backgroundColor: invoiceStyle.bg,
                            color: invoiceStyle.text
                          }}>
                            {job.invoice_status}
                          </span>
                        )}
                        {job.job_total > 0 && (
                          <span style={{ fontSize: '13px', fontWeight: '600', color: theme.accent }}>
                            {formatCurrency(job.job_total)}
                          </span>
                        )}
                      </div>
                      <p style={{
                        fontWeight: '500',
                        color: theme.text,
                        fontSize: '15px',
                        marginBottom: '4px'
                      }}>
                        {job.job_title || 'Untitled Job'}
                      </p>
                      {/* Service-visit signals (same shape as the board
                          card) — surfaces the kind + parent for child
                          visits and the child count for parent installs. */}
                      {(job.parent_job_id || job.service_kind || serviceCountByParent?.get(job.id)) && (() => {
                        const kindStyle = job.service_kind ? serviceKindStyle(job.service_kind) : null
                        const parent = job.parent_job_id ? parentJobById?.get(job.parent_job_id) : null
                        const childCount = !job.parent_job_id ? (serviceCountByParent?.get(job.id) || 0) : 0
                        return (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', margin: '0 0 6px' }}>
                            {kindStyle && (
                              <span style={{
                                padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                                backgroundColor: kindStyle.bg, color: kindStyle.text,
                              }}>
                                {kindStyle.label}
                              </span>
                            )}
                            {parent && (
                              <span
                                onClick={e => { e.stopPropagation(); navigate(`/jobs/${parent.id}`) }}
                                title={`Parent: ${parent.job_title || ''}`}
                                style={{
                                  fontSize: '11px', color: theme.textMuted, cursor: 'pointer',
                                  textDecoration: 'underline', textUnderlineOffset: '2px',
                                }}
                              >
                                ↪ child of {parent.job_title || parent.job_id || `#${parent.id}`}
                              </span>
                            )}
                            {childCount > 0 && (
                              <span style={{
                                fontSize: '11px', color: theme.textMuted,
                                padding: '1px 8px', borderRadius: '10px',
                                backgroundColor: theme.bg, border: `1px solid ${theme.border}`,
                              }}>
                                + {childCount} {childCount === 1 ? 'service' : 'services'}
                              </span>
                            )}
                          </div>
                        )
                      })()}
                      <p style={{ fontSize: '14px', color: theme.textSecondary }}>
                        {job.customer?.name || 'No customer'}
                      </p>
                      {job.job_address && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          marginTop: '6px',
                          color: theme.textMuted,
                          fontSize: '13px'
                        }}>
                          <MapPin size={14} />
                          <span>{job.job_address}</span>
                        </div>
                      )}
                    </div>

                    {/* Date & Time */}
                    {!isMobile && (
                      <div style={{ textAlign: 'right', minWidth: '120px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', color: theme.textSecondary, fontSize: '13px' }}>
                          <Calendar size={14} />
                          <span>{formatDate(job.start_date || job.created_at)}</span>
                          {!job.start_date && job.created_at && <span style={{ fontSize: '10px', color: theme.textMuted }}>(created)</span>}
                        </div>
                        {job.allotted_time_hours && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px', color: theme.textMuted, fontSize: '12px' }}>
                            <Clock size={12} />
                            <span>{job.allotted_time_hours}h allotted</span>
                          </div>
                        )}
                        {job.assigned_team && (
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '4px', marginTop: '4px', color: theme.textMuted, fontSize: '12px' }}>
                            <User size={12} />
                            <span>{job.assigned_team}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      {job.status === 'Chillin' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); scheduleJob(job); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '6px 10px', backgroundColor: '#5a6349', color: '#ffffff',
                            border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                          }}
                        >
                          <ArrowRight size={14} />
                          Schedule
                        </button>
                      )}
                      {job.status === 'Scheduled' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); startJob(job); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '6px 10px', backgroundColor: '#c28b38', color: '#ffffff',
                            border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                          }}
                        >
                          <Play size={14} />
                          Start
                        </button>
                      )}
                      {job.status === 'In Progress' && (
                        <button
                          onClick={(e) => { e.stopPropagation(); completeJob(job); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '4px',
                            padding: '6px 10px', backgroundColor: '#4a7c59', color: '#ffffff',
                            border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                          }}
                        >
                          <CheckCircle size={14} />
                          Complete
                        </button>
                      )}
                      {job.job_address && (
                        <button
                          onClick={(e) => { e.stopPropagation(); openMap(job.job_address); }}
                          style={{
                            padding: '6px', backgroundColor: theme.accentBg, color: theme.accent,
                            border: 'none', borderRadius: '6px', cursor: 'pointer'
                          }}
                        >
                          <MapPin size={16} />
                        </button>
                      )}
                      <ChevronRight size={20} style={{ color: theme.textMuted }} />
                    </div>
                  </div>
                </EntityCard>
              )
            })}
          </div>
        )
        }
        </>

      {/* Add/Edit Modal */}
      {showModal && (
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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '600px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`,
              position: 'sticky',
              top: 0,
              backgroundColor: theme.bgCard,
              borderRadius: '16px 16px 0 0'
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                {editingJob ? 'Edit Job' : 'Add Job'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              {error && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Job Title *</label>
                  <input type="text" name="job_title" value={formData.job_title} onChange={handleChange} required style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Job Address</label>
                  <input type="text" name="job_address" value={formData.job_address} onChange={handleChange} style={inputStyle} placeholder="123 Main St, City, State" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div style={{ position: 'relative' }}>
                    <label style={labelStyle}>Customer</label>
                    <div style={{ position: 'relative' }} ref={customerInputRef}>
                      <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted, pointerEvents: 'none' }} />
                      <input
                        type="text"
                        value={customerSearchText}
                        onChange={(e) => {
                          setCustomerSearchText(e.target.value)
                          setShowCustomerDropdown(true)
                          if (!e.target.value) {
                            setFormData(prev => ({ ...prev, customer_id: '' }))
                          }
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
                      const term = (customerSearchText || '').toLowerCase()
                      const normalize = (s) => (s || '').toLowerCase().replace(/[''`]/g, '')
                      const termNorm = normalize(term)
                      const termWords = termNorm.split(/\s+/).filter(Boolean)
                      const matchesAllWords = (str) => {
                        const norm = normalize(str)
                        return termWords.every(w => norm.includes(w))
                      }
                      const localFiltered = termNorm
                        ? customers.filter(c =>
                            matchesAllWords(c.name) ||
                            matchesAllWords(c.business_name) ||
                            c.email?.toLowerCase().includes(term) ||
                            c.phone?.replace(/\D/g, '').includes(term.replace(/\D/g, ''))
                          )
                        : customers.slice(0, 20)
                      // Merge in any remote (server-side) hits not already in local results
                      const seen = new Set(localFiltered.map(c => c.id))
                      const merged = [...localFiltered]
                      for (const r of remoteCustomerHits) {
                        if (!seen.has(r.id)) { merged.push(r); seen.add(r.id) }
                      }
                      const filtered = merged
                      const rect = customerInputRef.current?.getBoundingClientRect()
                      const dropdownStyle = rect ? {
                        position: 'fixed',
                        top: rect.bottom + 2,
                        left: rect.left,
                        width: rect.width,
                        zIndex: 9999
                      } : { position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 9999 }
                      return filtered.length > 0 ? (
                        <div style={{
                          ...dropdownStyle,
                          backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
                          borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                          maxHeight: '240px', overflowY: 'auto'
                        }}>
                          {filtered.map(c => (
                            <div
                              key={c.id}
                              onMouseDown={(e) => {
                                e.preventDefault()
                                setFormData(prev => ({ ...prev, customer_id: c.id, job_address: prev.job_address || c.address || '' }))
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
                              {c.business_name && <span style={{ color: theme.textMuted, fontSize: '12px', marginLeft: '8px' }}>{c.business_name}</span>}
                            </div>
                          ))}
                        </div>
                      ) : customerSearchText ? (
                        <div style={{
                          ...dropdownStyle,
                          backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
                          borderRadius: '8px', padding: '12px',
                          fontSize: '13px', color: theme.textMuted, textAlign: 'center'
                        }}>
                          {remoteCustomerLoading ? 'Searching…' : 'No customers found'}
                        </div>
                      ) : null
                    })()}
                  </div>
                  <div>
                    <label style={labelStyle}>Salesperson</label>
                    <SearchableSelect
                      options={employees.map(e => ({ value: e.id, label: e.name }))}
                      value={formData.salesperson_id}
                      onChange={(val) => setFormData(prev => ({ ...prev, salesperson_id: val }))}
                      placeholder="Search salesperson..."
                      theme={theme}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select name="status" value={formData.status} onChange={handleChange} style={inputStyle}>
                      <option value="Chillin">Chillin</option>
                      <option value="Scheduled">Scheduled</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Completed">Completed</option>
                      <option value="On Hold">On Hold</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Estimate (optional)</label>
                    <SearchableSelect
                      options={quotes.filter(q => q.status === 'Approved').map(q => ({ value: q.id, label: `${q.quote_id} - ${q.customer?.name || q.lead?.customer_name}` }))}
                      value={formData.quote_id}
                      onChange={(val) => setFormData(prev => ({ ...prev, quote_id: val }))}
                      placeholder="Search estimates..."
                      theme={theme}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Assigned To</label>
                  <SearchableSelect
                    options={employees.map(emp => ({ value: emp.id, label: emp.name }))}
                    value={formData.job_lead_id || ''}
                    onChange={(val) => setFormData(prev => ({ ...prev, job_lead_id: val ? parseInt(val) : null }))}
                    placeholder="-- Select Employee --"
                    theme={theme}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Assigned Team</label>
                    <div style={{
                      maxHeight: '160px',
                      overflowY: 'auto',
                      border: `1px solid ${theme.border}`,
                      borderRadius: '10px',
                      backgroundColor: theme.bg
                    }}>
                      {employees.filter(e => e.active !== false).map(emp => (
                        <label
                          key={emp.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            padding: '8px 12px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            color: theme.text,
                            borderBottom: `1px solid ${theme.border}`,
                            backgroundColor: formData.assigned_employee_ids.includes(String(emp.id))
                              ? theme.accentBg : 'transparent'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={formData.assigned_employee_ids.includes(String(emp.id))}
                            onChange={(e) => {
                              setFormData(prev => ({
                                ...prev,
                                assigned_employee_ids: e.target.checked
                                  ? [...prev.assigned_employee_ids, String(emp.id)]
                                  : prev.assigned_employee_ids.filter(id => id !== String(emp.id))
                              }))
                            }}
                            style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                          />
                          <Users size={14} style={{ color: theme.textMuted, flexShrink: 0 }} />
                          <span>{emp.name}</span>
                          {emp.role && (
                            <span style={{ marginLeft: 'auto', fontSize: '11px', color: theme.textMuted }}>
                              {emp.role}
                            </span>
                          )}
                        </label>
                      ))}
                    </div>
                    {formData.assigned_employee_ids.length > 0 && (
                      <div style={{ marginTop: '6px', fontSize: '12px', color: theme.textMuted }}>
                        {formData.assigned_employee_ids.length} employee{formData.assigned_employee_ids.length !== 1 ? 's' : ''} selected
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>Business Unit</label>
                    <SearchableSelect
                      options={businessUnits.map(bu => {
                        const buName = typeof bu === 'object' ? bu.name : bu
                        return { value: buName, label: buName }
                      })}
                      value={formData.business_unit}
                      onChange={(val) => setFormData(prev => ({ ...prev, business_unit: val }))}
                      placeholder="Search business units..."
                      theme={theme}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={{ ...labelStyle, color: formData.status === 'Scheduled' && !formData.start_date ? '#ef4444' : labelStyle.color }}>
                      Start Date/Time {formData.status === 'Scheduled' ? '*' : ''}
                    </label>
                    {/* Two inputs, one value. A type="date" picker closes the
                        moment a day is clicked; datetime-local's does not,
                        because it still wants a time, and there is no API to
                        dismiss a native picker. */}
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="date"
                        name="start_date_date"
                        value={splitDateTimeInput(formData.start_date).date}
                        onChange={(e) => setDatePart('start_date', 'date', e.target.value)}
                        required={formData.status === 'Scheduled'}
                        style={{
                          ...inputStyle, flex: 2, minWidth: 0,
                          ...(formData.status === 'Scheduled' && !formData.start_date ? { borderColor: '#ef4444', boxShadow: '0 0 0 2px rgba(239,68,68,0.15)' } : {})
                        }}
                      />
                      <input
                        type="time"
                        name="start_date_time"
                        value={splitDateTimeInput(formData.start_date).time}
                        onChange={(e) => setDatePart('start_date', 'time', e.target.value)}
                        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                      />
                    </div>
                    {formData.status === 'Scheduled' && !formData.start_date && (
                      <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                        Required for calendar display
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>End Date/Time</label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <input
                        type="date"
                        name="end_date_date"
                        value={splitDateTimeInput(formData.end_date).date}
                        onChange={(e) => setDatePart('end_date', 'date', e.target.value)}
                        style={{ ...inputStyle, flex: 2, minWidth: 0 }}
                      />
                      <input
                        type="time"
                        name="end_date_time"
                        value={splitDateTimeInput(formData.end_date).time}
                        onChange={(e) => setDatePart('end_date', 'time', e.target.value)}
                        style={{ ...inputStyle, flex: 1, minWidth: 0 }}
                      />
                    </div>
                  </div>
                </div>

                <div style={{ marginBottom: '16px' }}>
                  <label style={labelStyle}>Allotted Hours{!isAdmin && <span style={{ fontWeight: 400, color: theme.textMuted, fontSize: '11px' }}> · admin only</span>}</label>
                  {/* Allotted hours drives the efficiency-bonus math (saved = allotted - actual) — Admin+ only. */}
                  <input type="number" name="allotted_time_hours" value={formData.allotted_time_hours} onChange={handleChange} step="0.25" disabled={!isAdmin} title={!isAdmin ? 'Only an admin can change allotted hours' : undefined} style={{ ...inputStyle, ...(!isAdmin ? { opacity: 0.6, cursor: 'not-allowed' } : {}) }} />
                </div>
                <div>
                  <label style={labelStyle}>Repeat</label>
                  {/* Unified recurrence picker — writes recurrence + recurrence_end_date + recurrence_landing; the DB trigger spawns each occurrence on completion. */}
                  <RecurrencePicker
                    value={{ recurrence: formData.recurrence, recurrence_end_date: formData.recurrence_end_date, recurrence_landing: formData.recurrence_landing }}
                    startDate={formData.start_date}
                    onChange={(r) => setFormData(prev => ({ ...prev, recurrence: r.recurrence, recurrence_end_date: r.recurrence_end_date, recurrence_landing: r.recurrence_landing }))}
                    theme={theme}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Utility Incentive</label>
                    <input type="number" name="utility_incentive" value={formData.utility_incentive} onChange={handleChange} step="0.01" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Discount</label>
                    <input type="number" name="discount" value={formData.discount} onChange={handleChange} step="0.01" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Discount Desc</label>
                    <input type="text" name="discount_description" value={formData.discount_description} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Details</label>
                  <textarea name="details" value={formData.details} onChange={handleChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>

                {!editingJob && (
                  <div style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: '10px',
                    padding: '14px',
                    backgroundColor: theme.bg
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <label style={{ ...labelStyle, margin: 0 }}>Line Items (optional)</label>
                      <span style={{ fontSize: '12px', color: theme.textMuted }}>
                        Add now or later from the Job page
                      </span>
                    </div>
                    {newJobLines.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                        {newJobLines.map((l, idx) => {
                          const prod = products.find(p => String(p.id) === String(l.item_id))
                          const price = Number(l.price != null && l.price !== '' ? l.price : (prod?.unit_price || 0))
                          const qty = Number(l.quantity || 1)
                          return (
                            <div key={idx} style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '8px 10px', backgroundColor: theme.bgCard,
                              border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '13px'
                            }}>
                              <div style={{ flex: 1, minWidth: 0, color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.description || prod?.name || 'Custom line'}</div>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={l.quantity}
                                onChange={(e) => {
                                  const v = e.target.value
                                  setNewJobLines(prev => prev.map((row, i) => i === idx ? { ...row, quantity: v } : row))
                                }}
                                style={{ ...inputStyle, width: '70px', padding: '6px 8px' }}
                              />
                              <div style={{ width: '90px', textAlign: 'right', color: theme.textSecondary }}>
                                ${(price * qty).toFixed(2)}
                              </div>
                              <button
                                type="button"
                                onClick={() => setNewJobLines(prev => prev.filter((_, i) => i !== idx))}
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}
                                title="Remove line"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <SearchableSelect
                        options={(products || []).filter(p => p.active !== false).map(p => ({
                          value: p.id,
                          label: `${p.name}${p.unit_price != null ? ` — $${Number(p.unit_price).toFixed(2)}` : ''}`
                        }))}
                        value={newLineDraft.item_id}
                        onChange={(val) => {
                          const p = (products || []).find(pp => String(pp.id) === String(val))
                          setNewLineDraft(prev => ({
                            ...prev,
                            item_id: val,
                            description: p?.name || prev.description,
                            price: p?.unit_price != null ? String(p.unit_price) : prev.price,
                          }))
                        }}
                        placeholder="Search products & services (optional)..."
                        theme={theme}
                      />
                      <input
                        type="text"
                        value={newLineDraft.description}
                        onChange={(e) => setNewLineDraft(prev => ({ ...prev, description: e.target.value }))}
                        placeholder="Description of work (for a custom line)"
                        style={{ ...inputStyle, minWidth: 0, boxSizing: 'border-box' }}
                      />
                      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) auto', gap: '8px', alignItems: 'end' }}>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={newLineDraft.price}
                          onChange={(e) => setNewLineDraft(prev => ({ ...prev, price: e.target.value }))}
                          placeholder="$ Price"
                          style={{ ...inputStyle, minWidth: 0, boxSizing: 'border-box' }}
                        />
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={newLineDraft.quantity}
                          onChange={(e) => setNewLineDraft(prev => ({ ...prev, quantity: e.target.value }))}
                          placeholder="Qty"
                          style={{ ...inputStyle, minWidth: 0, boxSizing: 'border-box' }}
                        />
                        {(() => {
                          const canAdd = !!newLineDraft.item_id || !!(newLineDraft.description || '').trim()
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                // Same rule submit uses, so the two can never
                                // disagree about what a draft is worth.
                                const line = draftToJobLine(newLineDraft, products)
                                if (!line) return
                                setNewJobLines(prev => [...prev, line])
                                setNewLineDraft({ item_id: '', description: '', price: '', quantity: 1 })
                              }}
                              disabled={!canAdd}
                              style={{
                                minHeight: '40px',
                                padding: '8px 14px',
                                backgroundColor: canAdd ? theme.accent : theme.bgCardHover,
                                color: canAdd ? '#ffffff' : theme.textMuted,
                                border: 'none',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: '600',
                                cursor: canAdd ? 'pointer' : 'not-allowed',
                                display: 'flex', alignItems: 'center', gap: '6px', whiteSpace: 'nowrap'
                              }}
                            >
                              <Plus size={14} /> Add
                            </button>
                          )
                        })()}
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={closeModal} style={{
                  flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent', color: theme.text, borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
                }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} style={{
                  flex: 1, padding: '10px 16px', backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1
                }}>
                  {loading ? 'Saving...' : (editingJob ? 'Update' : 'Add Job')}
                </button>
              </div>
              {!editingJob && (
                <p style={{ fontSize: '11px', color: theme.textMuted, textAlign: 'center', margin: '8px 0 0' }}>
                  This job will appear in your delivery pipeline
                </p>
              )}
            </form>
          </div>
        </div>
      )}
      {showImportExport && (
        <ImportExportModal
          tableName="jobs"
          entityName="Jobs"
          fields={jobsFields}
          companyId={companyId}
          requiredField="job_id"
          defaultValues={{ company_id: companyId, status: 'Chillin' }}
          relatedTables={jobRelatedTables}
          parentRefField="job_id"
          extraContext="Field service / construction job management data. Map as many columns as possible. IMPORTANT: 'Customer name' or 'Customer' columns must map to customer_name (NOT job_title). 'Job description' or 'Description' columns must map to job_title. 'Job amount' or 'Amount' or 'Revenue' or 'Price' must map to job_total. Common aliases: customer_name=Customer/Client/Client Name/Customer Name/Account Name, job_title=Job Name/Project Name/Work Order/Job Description/Description/Service Type, job_id=Job Number/Work Order #/Job #/Job No, job_address=Site Address/Service Address/Location/Address, status=Job Status/Stage, business_unit=Division/Department/Business Unit, start_date=Start/Begin Date/Job Created Date/Created/Date, end_date=End/Completion Date, assigned_team=Team/Crew Name/Assigned To, allotted_time_hours=Budgeted Hours/Estimated Hours, job_total=Job Amount/Amount/Revenue/Price/Contract Value/Total, expense_amount=Expense/Commission Cost/Labor Cost/Cost, details=Details/Job Details/Scope/SOW, notes=Notes/Comments"
          onImportComplete={() => fetchJobs()}
          onClose={() => setShowImportExport(false)}
        />
      )}
    </div>
  )
}

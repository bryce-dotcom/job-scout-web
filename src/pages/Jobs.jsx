import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { toast } from '../lib/toast'
import { companyNotify } from '../lib/companyNotify'
import {
  Plus, Search, Briefcase, X, Calendar, Clock, MapPin, Map,
  Play, CheckCircle, FileText, ChevronRight, User, Users, Upload, Download,
  Trophy, DollarSign, Columns3, List, ChevronLeft, Pause, ArrowRight, Coffee, ChevronDown, ChevronUp, Navigation, ExternalLink
} from 'lucide-react'
import EntityCard from '../components/EntityCard'
import ImportExportModal, { exportToCSV, exportToXLSX } from '../components/ImportExportModal'
import { jobsFields, jobLinesFields, jobSectionsFields } from '../lib/importExportFields'
import { jobStatusColors as statusColors, invoiceStatusColors } from '../lib/statusColors'
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
  utility_incentive: '',
  discount: '',
  discount_description: ''
}

const formatCurrency = (amount) => {
  if (!amount) return null
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount)
}

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
                {formatDate(job.end_date || job.updated_at)}
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

// ============ KANBAN COLUMN ============
function KanbanColumn({ title, icon: Icon, jobs, color, theme, isMobile, navigate, formatDate, scheduleJob, startJob, completeJob, openMap }) {
  return (
    <div style={{
      flex: 1,
      minWidth: isMobile ? '100%' : '280px',
      backgroundColor: theme.bg,
      borderRadius: '14px',
      border: `1px solid ${theme.border}`,
      display: 'flex',
      flexDirection: 'column',
      maxHeight: isMobile ? 'none' : 'calc(100vh - 420px)',
      overflow: 'hidden'
    }}>
      {/* Column header */}
      <div style={{
        padding: '14px 16px',
        borderBottom: `1px solid ${theme.border}`,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: theme.bgCard,
        borderRadius: '14px 14px 0 0'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon size={16} style={{ color: color }} />
          <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>{title}</span>
        </div>
        <span style={{
          padding: '2px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '600',
          backgroundColor: `${color}18`, color: color
        }}>
          {jobs.length}
        </span>
      </div>

      {/* Cards */}
      <div style={{
        padding: '10px',
        overflowY: 'auto',
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px'
      }}>
        {jobs.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '24px 12px', color: theme.textMuted,
            fontSize: '13px', fontStyle: 'italic'
          }}>
            No {title.toLowerCase()} jobs
          </div>
        )}
        {jobs.map(job => {
          const invoiceStyle = invoiceStatusColors[job.invoice_status] || invoiceStatusColors['Not Invoiced']
          return (
            <div
              key={job.id}
              onClick={() => navigate(`/jobs/${job.id}`)}
              style={{
                backgroundColor: theme.bgCard,
                borderRadius: '10px',
                border: `1px solid ${theme.border}`,
                padding: '12px 14px',
                cursor: 'pointer',
                transition: 'all 0.12s ease'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = color
                e.currentTarget.style.boxShadow = `0 2px 8px ${color}15`
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = theme.border
                e.currentTarget.style.boxShadow = 'none'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontSize: '11px', fontWeight: '600', color: color, display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {job.job_id}
                  <ExternalLink size={10} color={theme.textMuted} />
                </span>
                {job.job_total > 0 && (
                  <span style={{ fontSize: '12px', fontWeight: '600', color: theme.accent }}>
                    {formatCurrency(job.job_total)}
                  </span>
                )}
              </div>
              <p style={{
                fontSize: '13px', fontWeight: '600', color: theme.text, margin: '0 0 4px',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
              }}>
                {job.job_title || 'Untitled Job'}
              </p>
              <p style={{ fontSize: '12px', color: theme.textSecondary, margin: '0 0 8px' }}>
                {job.customer?.name || 'No customer'}
              </p>
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: '6px', flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: theme.textMuted }}>
                  {(job.start_date || job.created_at) && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Calendar size={10} />
                      {job.start_date ? formatDate(job.start_date) : formatDate(job.created_at)}
                      {!job.start_date && <span style={{ fontSize: '9px', opacity: 0.7 }}>(created)</span>}
                    </span>
                  )}
                  {(job.job_lead?.name || job.assigned_team) && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <User size={10} />
                      {job.job_lead?.name || job.assigned_team}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: '4px' }}>
                  {job.invoice_status && (
                    <span style={{
                      padding: '2px 6px', borderRadius: '8px', fontSize: '10px', fontWeight: '500',
                      backgroundColor: invoiceStyle.bg, color: invoiceStyle.text
                    }}>
                      {job.invoice_status}
                    </span>
                  )}
                  {job.status === 'Chillin' && scheduleJob && (
                    <button
                      onClick={e => { e.stopPropagation(); scheduleJob(job) }}
                      style={{
                        padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                        backgroundColor: '#5a6349', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '3px'
                      }}
                    >
                      <ArrowRight size={9} /> Schedule
                    </button>
                  )}
                  {job.status === 'Scheduled' && (
                    <button
                      onClick={e => { e.stopPropagation(); startJob(job) }}
                      style={{
                        padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                        backgroundColor: '#c28b38', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '3px'
                      }}
                    >
                      <Play size={9} /> Start
                    </button>
                  )}
                  {job.status === 'In Progress' && (
                    <button
                      onClick={e => { e.stopPropagation(); completeJob(job) }}
                      style={{
                        padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                        backgroundColor: '#4a7c59', color: '#fff', border: 'none', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '3px'
                      }}
                    >
                      <CheckCircle size={9} /> Done
                    </button>
                  )}
                </div>
              </div>
            </div>
          )
        })}
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
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [teamFilter, setTeamFilter] = useState('all')
  const [buFilter, setBuFilter] = useState('all')
  const [showImportExport, setShowImportExport] = useState(false)
  const [customerSearchText, setCustomerSearchText] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [remoteCustomerHits, setRemoteCustomerHits] = useState([])
  const [remoteCustomerLoading, setRemoteCustomerLoading] = useState(false)
  // Optional line items to add when creating a brand-new job (so users don't
  // have to schedule a job, then re-open it just to add line items).
  const [newJobLines, setNewJobLines] = useState([])
  const [newLineDraft, setNewLineDraft] = useState({ item_id: '', quantity: 1 })
  const [viewMode, setViewMode] = useState('board')
  const [isMobile, setIsMobile] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(() => new Date())
  const [showMap, setShowMap] = useState(false)
  const [mapLoaded, setMapLoaded] = useState(false)
  const [jobCoords, setJobCoords] = useState({})
  const mapRef = useRef(null)
  const mapInstanceRef = useRef(null)
  const geocodeCacheRef = useRef({})
  const customerInputRef = useRef(null)

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

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchJobs()
    fetchCustomers()
    if (fetchProducts) fetchProducts()
  }, [companyId, navigate, fetchJobs, fetchCustomers, fetchProducts])

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

  // Recent wins: completed jobs from last 30 days, sorted most recent first
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
  const recentWins = jobs
    .filter(j => j.status === 'Completed' && new Date(j.end_date || j.updated_at) >= thirtyDaysAgo)
    .sort((a, b) => new Date(b.end_date || b.updated_at) - new Date(a.end_date || a.updated_at))

  const filteredJobs = jobs.filter(job => {
    const term = searchTerm.toLowerCase()
    const matchesSearch = searchTerm === '' ||
      job.job_title?.toLowerCase().includes(term) ||
      job.job_address?.toLowerCase().includes(term) ||
      job.customer?.name?.toLowerCase().includes(term) ||
      job.customer_name?.toLowerCase().includes(term) ||
      job.job_id?.toLowerCase().includes(term) ||
      job.customer?.business_name?.toLowerCase().includes(term) ||
      job.business_name?.toLowerCase().includes(term) ||
      job.notes?.toLowerCase().includes(term)

    // When searching, show results from ALL statuses so you can find completed jobs
    const matchesStatus = searchTerm
      ? true
      : statusFilter === 'all' ? true
      : statusFilter === 'active' ? !['Completed', 'Cancelled', 'Archived'].includes(job.status)
      : job.status === statusFilter
    const matchesTeam = teamFilter === 'all' || job.assigned_team === teamFilter
    const matchesBU = buFilter === 'all' || job.business_unit === buFilter

    return matchesSearch && matchesStatus && matchesTeam && matchesBU
  })

  // Board view groups — dynamic from boardColumns
  const boardColumnIds = new Set(boardColumns.map(c => c.id))
  const jobsByStatus = {}
  boardColumns.forEach(col => {
    jobsByStatus[col.id] = filteredJobs.filter(j => j.status === col.id)
      .sort((a, b) => new Date(b.start_date || b.created_at || 0) - new Date(a.start_date || a.created_at || 0))
  })
  // Jobs not in any board column (e.g. Cancelled, On Hold, or statuses not in the board)
  const otherJobs = filteredJobs.filter(j => !boardColumnIds.has(j.status))

  // Load Leaflet CSS & JS from CDN when map is shown
  useEffect(() => {
    if (!showMap) return
    if (document.getElementById('leaflet-css')) { setMapLoaded(true); return }
    const link = document.createElement('link')
    link.id = 'leaflet-css'; link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.id = 'leaflet-js'; script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setMapLoaded(true)
    document.head.appendChild(script)
  }, [showMap])

  const geocodeAddress = useCallback(async (address) => {
    if (!address) return null
    if (geocodeCacheRef.current[address]) return geocodeCacheRef.current[address]
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`)
      const data = await res.json()
      if (data?.[0]) {
        const coords = { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }
        geocodeCacheRef.current[address] = coords
        return coords
      }
    } catch { /* ignore */ }
    return null
  }, [])

  const parseGpsLocation = useCallback((gpsStr) => {
    if (!gpsStr) return null
    const parts = gpsStr.split(',').map(s => parseFloat(s.trim()))
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1]) && (Math.abs(parts[0]) > 0.01 || Math.abs(parts[1]) > 0.01)) {
      return { lat: parts[0], lng: parts[1] }
    }
    return null
  }, [])

  useEffect(() => {
    if (!showMap || filteredJobs.length === 0) return
    let cancelled = false
    const geocodeAll = async () => {
      const newCoords = {}
      for (const job of filteredJobs) {
        if (cancelled) break
        const gps = parseGpsLocation(job.gps_location)
        if (gps) { newCoords[job.id] = gps; continue }
        const addr = job.job_address || job.customer?.address
        if (!addr) continue
        if (geocodeCacheRef.current[addr]) { newCoords[job.id] = geocodeCacheRef.current[addr]; continue }
        await new Promise(r => setTimeout(r, 1100))
        if (cancelled) break
        const coords = await geocodeAddress(addr)
        if (coords) newCoords[job.id] = coords
      }
      if (!cancelled) setJobCoords(prev => ({ ...prev, ...newCoords }))
    }
    geocodeAll()
    return () => { cancelled = true }
  }, [showMap, filteredJobs.length])

  useEffect(() => {
    if (!showMap || !mapLoaded || !mapRef.current || typeof window.L === 'undefined') return
    const coordEntries = Object.entries(jobCoords)

    const timer = setTimeout(() => {
      if (!mapRef.current) return
      if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null }

      const L = window.L
      const map = L.map(mapRef.current, { zoomControl: false, attributionControl: false })
      L.control.zoom({ position: 'bottomright' }).addTo(map)
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
      mapInstanceRef.current = map

      const bounds = []
      coordEntries.forEach(([jobId, coords]) => {
        const job = filteredJobs.find(j => j.id === parseInt(jobId))
        if (!job) return
        const col = boardColumns.find(c => c.id === job.status)
        const color = col?.color || theme.accent
        const marker = L.circleMarker([coords.lat, coords.lng], { radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 }).addTo(map)
        marker.bindTooltip(`<b>${job.job_title || 'Job'}</b><br/>${job.customer?.name || ''}<br/><small>${job.status}</small>`, { direction: 'top', offset: [0, -10] })
        marker.on('click', () => navigate(`/jobs/${job.id}`))
        bounds.push([coords.lat, coords.lng])
      })

      if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })
      } else {
        map.setView([40.76, -111.89], 10)
      }
      map.invalidateSize()
    }, 100)

    return () => { clearTimeout(timer); if (mapInstanceRef.current) { mapInstanceRef.current.remove(); mapInstanceRef.current = null } }
  }, [showMap, mapLoaded, jobCoords, filteredJobs, boardColumns, theme.accent, navigate])

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
      start_date: job.start_date ? job.start_date.slice(0, 16) : '',
      end_date: job.end_date ? job.end_date.slice(0, 16) : '',
      allotted_time_hours: job.allotted_time_hours || '',
      details: job.details || '',
      notes: job.notes || '',
      recurrence: job.recurrence || 'None',
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
    setNewLineDraft({ item_id: '', quantity: 1 })
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
        // Default to tomorrow 8 AM so the calendar has a date to render
        const tomorrow = new Date()
        tomorrow.setDate(tomorrow.getDate() + 1)
        tomorrow.setHours(8, 0, 0, 0)
        next.start_date = tomorrow.toISOString().slice(0, 16)
      }

      return next
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
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
      start_date: formData.start_date || null,
      end_date: formData.end_date || null,
      allotted_time_hours: formData.allotted_time_hours || null,
      details: formData.details || null,
      notes: formData.notes || null,
      recurrence: formData.recurrence || 'None',
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
    if (!editingJob && result.data?.[0] && newJobLines.length > 0) {
      const newJobId = result.data[0].id
      const linesPayload = newJobLines
        .filter(l => l.item_id && Number(l.quantity) > 0)
        .map(l => {
          const product = products.find(p => String(p.id) === String(l.item_id))
          const price = Number(product?.unit_price || 0)
          const qty = Number(l.quantity || 1)
          return {
            company_id: companyId,
            job_id: newJobId,
            item_id: product?.id || null,
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
    closeModal()
    setLoading(false)
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
        end_date: new Date().toISOString(),
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
    companyNotify({
      companyId,
      type: 'job_completed',
      title: 'Job Completed!',
      message: `${customerName}${amountStr} (${job.job_id})`,
      metadata: { job_id: job.id, customer_name: customerName, amount },
      createdBy: user?.id
    })

    await fetchJobs()
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
          <div style={{
            display: 'flex', borderRadius: '8px', overflow: 'hidden',
            border: `1px solid ${theme.border}`
          }}>
            <button
              onClick={() => setViewMode('board')}
              style={{
                padding: '8px 12px', border: 'none', cursor: 'pointer',
                backgroundColor: viewMode === 'board' ? theme.accent : 'transparent',
                color: viewMode === 'board' ? '#fff' : theme.textMuted,
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px'
              }}
            >
              <Columns3 size={15} />
              {!isMobile && 'Board'}
            </button>
            <button
              onClick={() => setViewMode('list')}
              style={{
                padding: '8px 12px', border: 'none', cursor: 'pointer',
                borderLeft: `1px solid ${theme.border}`,
                backgroundColor: viewMode === 'list' ? theme.accent : 'transparent',
                color: viewMode === 'list' ? '#fff' : theme.textMuted,
                display: 'flex', alignItems: 'center', gap: '4px', fontSize: '13px'
              }}
            >
              <List size={15} />
              {!isMobile && 'List'}
            </button>
          </div>
          <button onClick={() => setShowImportExport(true)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
            <Upload size={16} /> {!isMobile && 'Import'}
          </button>
          <button onClick={() => exportToXLSX(filteredJobs, jobsFields, 'jobs_export', { relatedTables: jobRelatedTables, parentRefField: 'job_id', mainSheetName: 'Jobs', companyId })} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px', backgroundColor: 'transparent', color: theme.textSecondary, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
            <Download size={16} /> {!isMobile && 'Export'}
          </button>
          <button
            onClick={() => setShowMap(prev => !prev)}
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '8px 14px',
              backgroundColor: showMap ? theme.accent : theme.bgCard,
              color: showMap ? '#fff' : theme.text,
              border: `1px solid ${showMap ? theme.accent : theme.border}`,
              borderRadius: '8px', fontSize: '13px', cursor: 'pointer'
            }}
          >
            <Map size={16} />
            {!isMobile && 'Map'}
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
          const count = jobs.filter(j => j.status === col.id).length
          return (
            <div key={col.id} style={{
              backgroundColor: theme.bgCard, borderRadius: '10px',
              border: `1px solid ${theme.border}`, padding: '8px 14px', textAlign: 'center',
              minWidth: '80px', flex: '0 0 auto'
            }}>
              <p style={{ fontSize: '18px', fontWeight: '700', color: col.color, margin: 0 }}>{count}</p>
              <p style={{ fontSize: '10px', color: theme.textMuted, margin: '2px 0 0', whiteSpace: 'nowrap' }}>
                {col.name}
              </p>
            </div>
          )
        })}
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
      </div>

      {/* ============ BOARD VIEW ============ */}
      {viewMode === 'board' ? (
        <div>
          {/* Colored status header bars — scrollable */}
          <div style={{
            display: 'flex',
            gap: '6px',
            marginBottom: '16px',
            overflowX: 'auto',
            paddingBottom: '4px'
          }}>
            {boardColumns.map(col => {
              const count = (jobsByStatus[col.id] || []).length
              return (
                <div key={col.id} style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 14px',
                  backgroundColor: col.color,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  flex: '0 0 auto',
                  minWidth: '100px',
                  justifyContent: 'center'
                }}>
                  <span style={{ fontSize: '12px', fontWeight: '600', color: '#fff', whiteSpace: 'nowrap' }}>
                    {col.name}
                  </span>
                  <span style={{
                    padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: '700',
                    backgroundColor: 'rgba(255,255,255,0.3)', color: '#fff'
                  }}>
                    {count}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Kanban columns — FULL WIDTH, horizontally scrollable */}
          <div style={{
            display: 'flex',
            gap: '10px',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: 'flex-start',
            overflowX: isMobile ? 'visible' : 'auto',
            paddingBottom: isMobile ? 0 : '8px'
          }}>
            {boardColumns.map(col => (
              <KanbanColumn
                key={col.id}
                title={col.name}
                icon={col.icon}
                jobs={jobsByStatus[col.id] || []}
                color={col.color}
                theme={theme}
                isMobile={isMobile}
                navigate={navigate}
                formatDate={formatDate}
                scheduleJob={scheduleJob}
                startJob={startJob}
                completeJob={completeJob}
                openMap={openMap}
              />
            ))}
          </div>

          {/* Other jobs not in board columns (On Hold, Cancelled, etc.) */}
          {otherJobs.length > 0 && (
            <details style={{ marginTop: '16px' }}>
              <summary style={{
                fontSize: '13px', fontWeight: '600', color: theme.textMuted,
                cursor: 'pointer', padding: '8px 0', userSelect: 'none'
              }}>
                Other ({otherJobs.length})
              </summary>
              <div style={{
                display: 'grid',
                gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))',
                gap: '10px', marginTop: '10px'
              }}>
                {otherJobs.map(job => (
                  <div
                    key={job.id}
                    onClick={() => navigate(`/jobs/${job.id}`)}
                    style={{
                      backgroundColor: theme.bgCard, borderRadius: '10px',
                      border: `1px solid ${theme.border}`, padding: '12px 14px',
                      cursor: 'pointer', opacity: 0.7
                    }}
                  >
                    <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '600' }}>{job.job_id}</span>
                    <p style={{ fontSize: '13px', fontWeight: '500', color: theme.text, margin: '4px 0 0' }}>
                      {job.job_title || 'Untitled'}
                    </p>
                    <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '8px', backgroundColor: theme.bg, color: theme.textMuted }}>
                      {job.status}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          )}

          {/* Job Map — interactive Leaflet map with all job locations */}
          {showMap && (
            <div style={{
              marginTop: '20px',
              backgroundColor: theme.bgCard,
              borderRadius: '14px',
              border: `1px solid ${theme.border}`,
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '14px 16px',
                borderBottom: `1px solid ${theme.border}`,
                display: 'flex', alignItems: 'center', justifyContent: 'space-between'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Map size={16} color={theme.accent} />
                  <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                    Job Map
                  </span>
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>
                    {Object.keys(jobCoords).length} of {filteredJobs.filter(j => j.job_address || j.customer?.address || j.gps_location).length} located
                  </span>
                </div>
                <button
                  onClick={() => setShowMap(false)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}
                >
                  <X size={16} />
                </button>
              </div>
              <div
                ref={mapRef}
                style={{
                  height: isMobile ? '300px' : '400px',
                  width: '100%',
                  backgroundColor: theme.bg
                }}
              >
                {!mapLoaded && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    height: '100%', color: theme.textMuted, fontSize: '13px'
                  }}>
                    Loading map...
                  </div>
                )}
              </div>
              {/* Map legend */}
              <div style={{
                padding: '8px 16px',
                borderTop: `1px solid ${theme.border}`,
                display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center'
              }}>
                {boardColumns.map(col => {
                  const count = Object.entries(jobCoords).filter(([id]) => {
                    const job = filteredJobs.find(j => j.id === parseInt(id))
                    return job?.status === col.id
                  }).length
                  if (count === 0) return null
                  return (
                    <div key={col.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: col.color }} />
                      <span style={{ fontSize: '11px', color: theme.textMuted }}>{col.name} ({count})</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Route Suggestions — groups "Needs scheduling" jobs by area */}
          {(() => {
            // Find jobs that need scheduling and have an address
            const needsScheduling = filteredJobs.filter(j => {
              const status = (j.status || '').toLowerCase()
              return (status === 'needs scheduling' || status === 'chillin') && (j.job_address || j.customer?.address)
            })
            if (needsScheduling.length < 2) return null

            // Simple city/zip grouping from address strings
            const getArea = (job) => {
              const addr = job.job_address || job.customer?.address || ''
              // Try to extract city from "123 Main St, City, ST 12345"
              const parts = addr.split(',').map(s => s.trim())
              if (parts.length >= 2) {
                // Get city (second-to-last part, or last part before state/zip)
                const cityPart = parts.length >= 3 ? parts[parts.length - 2] : parts[1]
                // Strip zip codes and state abbreviations for grouping
                return cityPart.replace(/\d{5}(-\d{4})?/, '').replace(/\b[A-Z]{2}\b/, '').trim() || 'Unknown Area'
              }
              // Fallback: first 20 chars of address
              return addr.slice(0, 20) || 'No Address'
            }

            const areaGroups = {}
            needsScheduling.forEach(job => {
              const area = getArea(job)
              if (!areaGroups[area]) areaGroups[area] = []
              areaGroups[area].push(job)
            })

            // Only show areas with 2+ jobs (route-worthy clusters)
            const routeAreas = Object.entries(areaGroups)
              .filter(([, jobs]) => jobs.length >= 2)
              .sort((a, b) => b[1].length - a[1].length)

            if (routeAreas.length === 0) return null

            return (
              <div style={{
                marginTop: '20px',
                backgroundColor: theme.bgCard,
                borderRadius: '14px',
                border: `1px solid ${theme.border}`,
                overflow: 'hidden'
              }}>
                <div style={{
                  padding: '14px 16px',
                  borderBottom: `1px solid ${theme.border}`,
                  display: 'flex', alignItems: 'center', gap: '8px'
                }}>
                  <MapPin size={16} color={theme.accent} />
                  <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                    Route Suggestions
                  </span>
                  <span style={{ fontSize: '12px', color: theme.textMuted }}>
                    {needsScheduling.length} jobs need scheduling
                  </span>
                </div>
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {routeAreas.map(([area, areaJobs]) => (
                    <div key={area} style={{
                      padding: '12px',
                      backgroundColor: theme.bg,
                      borderRadius: '10px',
                      border: `1px solid ${theme.border}`
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <MapPin size={13} color={theme.accent} />
                          <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{area}</span>
                          <span style={{
                            padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600',
                            backgroundColor: theme.accentBg, color: theme.accent
                          }}>
                            {areaJobs.length} jobs
                          </span>
                        </div>
                        <button
                          onClick={() => {
                            // Open all addresses in Google Maps as waypoints
                            const addresses = areaJobs
                              .map(j => j.job_address || j.customer?.address)
                              .filter(Boolean)
                            if (addresses.length > 0) {
                              const origin = encodeURIComponent(addresses[0])
                              const dest = encodeURIComponent(addresses[addresses.length - 1])
                              const waypoints = addresses.slice(1, -1).map(a => encodeURIComponent(a)).join('|')
                              const url = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`
                              window.open(url, '_blank')
                            }
                          }}
                          style={{
                            padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                            backgroundColor: theme.accent, color: '#fff', border: 'none', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <MapPin size={11} /> View Route
                        </button>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        {areaJobs.map((job, idx) => (
                          <div
                            key={job.id}
                            onClick={() => navigate(`/jobs/${job.id}`)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                              backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`
                            }}
                          >
                            <span style={{
                              width: '20px', height: '20px', borderRadius: '50%',
                              backgroundColor: theme.accentBg, color: theme.accent,
                              fontSize: '11px', fontWeight: '700',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                            }}>
                              {idx + 1}
                            </span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ fontSize: '12px', fontWeight: '500', color: theme.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {job.job_title || 'Untitled'} — {job.customer?.name || 'No customer'}
                              </p>
                              <p style={{ fontSize: '10px', color: theme.textMuted, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {job.job_address || job.customer?.address || 'No address'}
                              </p>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); scheduleJob(job) }}
                              style={{
                                padding: '3px 8px', borderRadius: '6px', fontSize: '10px', fontWeight: '600',
                                backgroundColor: '#5a6349', color: '#fff', border: 'none', cursor: 'pointer',
                                whiteSpace: 'nowrap', flexShrink: 0
                              }}
                            >
                              Schedule
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                  {needsScheduling.filter(j => {
                    const area = getArea(j)
                    return !routeAreas.some(([a]) => a === area)
                  }).length > 0 && (
                    <p style={{ fontSize: '11px', color: theme.textMuted, margin: '4px 0 0' }}>
                      {needsScheduling.filter(j => {
                        const area = getArea(j)
                        return !routeAreas.some(([a]) => a === area)
                      }).length} additional jobs are in unique locations (no nearby cluster)
                    </p>
                  )}
                </div>
              </div>
            )
          })()}

          {/* Month Calendar — BELOW the kanban */}
          {(() => {
            const year = calendarMonth.getFullYear()
            const month = calendarMonth.getMonth()
            const firstDay = new Date(year, month, 1)
            const lastDay = new Date(year, month + 1, 0)
            const startOffset = firstDay.getDay()
            const daysInMonth = lastDay.getDate()
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const calendarCells = []
            for (let i = 0; i < startOffset; i++) calendarCells.push(null)
            for (let d = 1; d <= daysInMonth; d++) calendarCells.push(d)
            while (calendarCells.length % 7 !== 0) calendarCells.push(null)

            const getJobsForDay = (dayNum) => {
              const dayStr = new Date(year, month, dayNum).toISOString().split('T')[0]
              return filteredJobs.filter(j => {
                if (!j.start_date) return false
                return new Date(j.start_date).toISOString().split('T')[0] === dayStr
              })
            }

            const shiftMonth = (dir) => {
              setCalendarMonth(prev => {
                const d = new Date(prev)
                d.setMonth(d.getMonth() + dir)
                return d
              })
            }

            const monthLabel = calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
            const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

            return (
              <div style={{
                marginTop: '20px',
                backgroundColor: theme.bgCard,
                borderRadius: '14px',
                border: `1px solid ${theme.border}`,
                overflow: 'hidden'
              }}>
                {/* Calendar header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderBottom: `1px solid ${theme.border}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <button onClick={() => shiftMonth(-1)} style={{ padding: '4px 8px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer', color: theme.textMuted, minHeight: '30px', display: 'flex', alignItems: 'center' }}>
                      <ChevronLeft size={14} />
                    </button>
                    <button onClick={() => setCalendarMonth(new Date())} style={{ padding: '4px 10px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer', color: theme.text, fontSize: '12px', fontWeight: '500', minHeight: '30px' }}>
                      Today
                    </button>
                    <button onClick={() => shiftMonth(1)} style={{ padding: '4px 8px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer', color: theme.textMuted, minHeight: '30px', display: 'flex', alignItems: 'center' }}>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <span style={{ fontSize: '15px', fontWeight: '600', color: theme.text }}>{monthLabel}</span>
                  <button
                    onClick={() => navigate('/jobs/calendar')}
                    style={{ fontSize: '12px', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '500', textDecoration: 'underline' }}
                  >
                    Full Calendar
                  </button>
                </div>

                {/* Day names */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${theme.border}` }}>
                  {dayNames.map(d => (
                    <div key={d} style={{ textAlign: 'center', padding: '6px 0', fontSize: '11px', fontWeight: '600', color: theme.textMuted }}>{d}</div>
                  ))}
                </div>

                {/* Calendar grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {calendarCells.map((dayNum, idx) => {
                    if (dayNum === null) {
                      return <div key={`empty-${idx}`} style={{ minHeight: '68px', borderBottom: `1px solid ${theme.border}`, borderRight: idx % 7 < 6 ? `1px solid ${theme.border}` : 'none' }} />
                    }
                    const isToday = dayNum === today.getDate() && month === today.getMonth() && year === today.getFullYear()
                    const dayJobs = getJobsForDay(dayNum)
                    return (
                      <div key={dayNum} style={{
                        minHeight: '68px', padding: '3px 4px',
                        borderBottom: `1px solid ${theme.border}`,
                        borderRight: idx % 7 < 6 ? `1px solid ${theme.border}` : 'none',
                        backgroundColor: isToday ? theme.accentBg : 'transparent'
                      }}>
                        <div style={{
                          fontSize: '12px', fontWeight: isToday ? '700' : '400',
                          color: isToday ? theme.accent : theme.text,
                          marginBottom: '2px', textAlign: 'right', paddingRight: '2px'
                        }}>
                          {dayNum}
                        </div>
                        {dayJobs.slice(0, 3).map(job => {
                          const col = boardColumns.find(c => c.id === job.status)
                          return (
                            <div
                              key={job.id}
                              onClick={() => navigate(`/jobs/${job.id}`)}
                              style={{
                                padding: '1px 4px', borderRadius: '3px', fontSize: '10px',
                                backgroundColor: col ? `${col.color}20` : theme.bg,
                                color: col?.color || theme.textSecondary,
                                fontWeight: '500', cursor: 'pointer',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                marginBottom: '1px', lineHeight: '1.5'
                              }}
                              title={`${job.job_title} — ${job.customer?.name || ''}`}
                            >
                              {job.customer?.name || job.job_title || 'Job'}
                            </div>
                          )
                        })}
                        {dayJobs.length > 3 && (
                          <div style={{ fontSize: '9px', color: theme.textMuted, textAlign: 'center' }}>+{dayJobs.length - 3} more</div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      ) : (
        /* ============ LIST VIEW ============ */
        filteredJobs.length === 0 ? (
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
            {filteredJobs.map((job) => {
              const statusStyle = statusColors[job.status] || statusColors['Scheduled']
              const invoiceStyle = invoiceStatusColors[job.invoice_status] || invoiceStatusColors['Not Invoiced']

              return (
                <EntityCard
                  key={job.id}
                  name={job.customer?.name}
                  businessName={job.customer?.business_name}
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
      )}

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
                    <input
                      type="datetime-local"
                      name="start_date"
                      value={formData.start_date}
                      onChange={handleChange}
                      required={formData.status === 'Scheduled'}
                      style={{
                        ...inputStyle,
                        ...(formData.status === 'Scheduled' && !formData.start_date ? { borderColor: '#ef4444', boxShadow: '0 0 0 2px rgba(239,68,68,0.15)' } : {})
                      }}
                    />
                    {formData.status === 'Scheduled' && !formData.start_date && (
                      <div style={{ fontSize: '12px', color: '#ef4444', marginTop: '4px' }}>
                        Required for calendar display
                      </div>
                    )}
                  </div>
                  <div>
                    <label style={labelStyle}>End Date/Time</label>
                    <input type="datetime-local" name="end_date" value={formData.end_date} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Allotted Hours</label>
                    <input type="number" name="allotted_time_hours" value={formData.allotted_time_hours} onChange={handleChange} step="0.25" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Recurrence</label>
                    <select name="recurrence" value={formData.recurrence} onChange={handleChange} style={inputStyle}>
                      <option value="None">None</option>
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Bi-Weekly">Bi-Weekly (every 2 weeks)</option>
                      <option value="Monthly">Monthly</option>
                      <option value="Every 6 Weeks">Every 6 Weeks</option>
                      <option value="Bi-Monthly">Bi-Monthly (every 2 months)</option>
                      <option value="Quarterly">Quarterly (every 3 months)</option>
                      <option value="Bi-Annually">Bi-Annually (every 6 months)</option>
                      <option value="Annually">Annually</option>
                    </select>
                  </div>
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
                          const price = Number(prod?.unit_price || 0)
                          const qty = Number(l.quantity || 1)
                          return (
                            <div key={idx} style={{
                              display: 'flex', alignItems: 'center', gap: '8px',
                              padding: '8px 10px', backgroundColor: theme.bgCard,
                              border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '13px'
                            }}>
                              <div style={{ flex: 1, color: theme.text }}>{prod?.name || 'Unknown product'}</div>
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
                    <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 100px auto', gap: '8px', alignItems: 'end' }}>
                      <SearchableSelect
                        options={(products || []).filter(p => p.active !== false).map(p => ({
                          value: p.id,
                          label: `${p.name}${p.unit_price != null ? ` — $${Number(p.unit_price).toFixed(2)}` : ''}`
                        }))}
                        value={newLineDraft.item_id}
                        onChange={(val) => setNewLineDraft(prev => ({ ...prev, item_id: val }))}
                        placeholder="Search products & services..."
                        theme={theme}
                      />
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={newLineDraft.quantity}
                        onChange={(e) => setNewLineDraft(prev => ({ ...prev, quantity: e.target.value }))}
                        placeholder="Qty"
                        style={inputStyle}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (!newLineDraft.item_id) return
                          const qty = Number(newLineDraft.quantity || 1)
                          if (qty <= 0) return
                          setNewJobLines(prev => [...prev, { item_id: newLineDraft.item_id, quantity: qty }])
                          setNewLineDraft({ item_id: '', quantity: 1 })
                        }}
                        disabled={!newLineDraft.item_id}
                        style={{
                          minHeight: '40px',
                          padding: '8px 14px',
                          backgroundColor: newLineDraft.item_id ? theme.accent : theme.bgCardHover,
                          color: newLineDraft.item_id ? '#ffffff' : theme.textMuted,
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '13px',
                          fontWeight: '600',
                          cursor: newLineDraft.item_id ? 'pointer' : 'not-allowed',
                          display: 'flex', alignItems: 'center', gap: '6px'
                        }}
                      >
                        <Plus size={14} /> Add
                      </button>
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

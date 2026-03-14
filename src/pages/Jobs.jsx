import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { toast } from '../lib/toast'
import {
  Plus, Search, Briefcase, X, Calendar, Clock, MapPin,
  Play, CheckCircle, FileText, ChevronRight, User, Upload, Download,
  Trophy, DollarSign, Columns3, List, ChevronLeft, Pause, ArrowRight, Coffee
} from 'lucide-react'
import EntityCard from '../components/EntityCard'
import ImportExportModal, { exportToCSV, exportToXLSX } from '../components/ImportExportModal'
import { jobsFields, jobLinesFields, jobSectionsFields } from '../lib/importExportFields'

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

const invoiceStatusColors = {
  'Not Invoiced': { bg: 'rgba(125,138,127,0.12)', text: '#7d8a7f' },
  'Invoiced': { bg: 'rgba(90,99,73,0.12)', text: '#5a6349' },
  'Paid': { bg: 'rgba(74,124,89,0.12)', text: '#4a7c59' }
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
                <span style={{ fontSize: '11px', fontWeight: '600', color: color }}>{job.job_id}</span>
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
                  {job.start_date && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <Calendar size={10} />
                      {formatDate(job.start_date)}
                    </span>
                  )}
                  {job.assigned_team && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <User size={10} />
                      {job.assigned_team}
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
  const companyId = useStore((state) => state.companyId)
  const jobs = useStore((state) => state.jobs)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const quotes = useStore((state) => state.quotes)
  const businessUnits = useStore((state) => state.businessUnits)
  const storeJobStatuses = useStore((state) => state.jobStatuses)
  const fetchJobs = useStore((state) => state.fetchJobs)

  const [showModal, setShowModal] = useState(false)
  const [editingJob, setEditingJob] = useState(null)
  const [formData, setFormData] = useState(emptyJob)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [teamFilter, setTeamFilter] = useState('all')
  const [showImportExport, setShowImportExport] = useState(false)
  const [customerSearchText, setCustomerSearchText] = useState('')
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false)
  const [viewMode, setViewMode] = useState('board')
  const [isMobile, setIsMobile] = useState(false)
  const [calendarWeekStart, setCalendarWeekStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - d.getDay()); d.setHours(0,0,0,0); return d
  })

  // Build dynamic board columns from DB-driven job statuses
  const boardColumns = (() => {
    const defaultCols = [
      { id: 'Chillin', name: 'Chillin', color: '#6382bf', icon: Coffee },
      { id: 'Scheduled', name: 'Scheduled', color: '#5a6349', icon: Calendar },
      { id: 'In Progress', name: 'In Progress', color: '#c28b38', icon: Play },
      { id: 'Completed', name: 'Completed', color: '#4a7c59', icon: CheckCircle },
    ]
    if (!storeJobStatuses || storeJobStatuses.length === 0) return defaultCols
    return storeJobStatuses.map(s => {
      const name = typeof s === 'string' ? s : s.name
      const color = typeof s === 'string' ? '#94a3b8' : (s.color || '#94a3b8')
      return { id: name, name, color, icon: Briefcase }
    })
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
  }, [companyId, navigate, fetchJobs])

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
    const matchesSearch = searchTerm === '' ||
      job.job_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.job_address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      job.job_id?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || job.status === statusFilter
    const matchesTeam = teamFilter === 'all' || job.assigned_team === teamFilter

    return matchesSearch && matchesStatus && matchesTeam
  })

  // Board view groups — dynamic from boardColumns
  const boardColumnIds = new Set(boardColumns.map(c => c.id))
  const jobsByStatus = {}
  boardColumns.forEach(col => {
    jobsByStatus[col.id] = filteredJobs.filter(j => j.status === col.id)
      .sort((a, b) => new Date(a.start_date || a.created_at || 0) - new Date(b.start_date || b.created_at || 0))
  })
  // Jobs not in any board column (e.g. Cancelled, On Hold, or statuses not in the board)
  const otherJobs = filteredJobs.filter(j => !boardColumnIds.has(j.status))

  const openAddModal = () => {
    setEditingJob(null)
    setFormData(emptyJob)
    setError(null)
    setCustomerSearchText('')
    setShowCustomerDropdown(false)
    setShowModal(true)
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
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    // Auto-fill address from customer
    if (name === 'customer_id' && value) {
      const customer = customers.find(c => c.id === parseInt(value))
      if (customer?.address) {
        setFormData(prev => ({ ...prev, job_address: customer.address }))
      }
    }
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
      assigned_team: formData.assigned_team || null,
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

    await fetchJobs()
    closeModal()
    setLoading(false)
  }

  const scheduleJob = async (job) => {
    await supabase
      .from('jobs')
      .update({
        status: 'Scheduled',
        updated_at: new Date().toISOString()
      })
      .eq('id', job.id)

    if (job.lead_id) {
      await supabase.from('leads').update({ status: 'Job Scheduled', updated_at: new Date().toISOString() }).eq('id', job.lead_id)
    }

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

  // Stats — first 4 board columns get stat cards
  const statColumns = boardColumns.slice(0, 4)
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
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
          Jobs
        </h1>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* View toggle */}
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
        </div>
      </div>

      {/* Recent Wins Carousel */}
      <RecentWins
        wins={recentWins}
        theme={theme}
        isMobile={isMobile}
        navigate={navigate}
        formatDate={formatDate}
      />

      {/* Stats */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? 'repeat(3, 1fr)' : `repeat(${Math.min(statColumns.length + 1, 6)}, 1fr)`,
        gap: '10px',
        marginBottom: '24px'
      }}>
        {statColumns.map(col => {
          const count = jobs.filter(j => j.status === col.id).length
          return (
            <div key={col.id} style={{
              backgroundColor: theme.bgCard, borderRadius: '12px',
              border: `1px solid ${theme.border}`, padding: '12px', textAlign: 'center'
            }}>
              <p style={{ fontSize: '11px', color: col.color, marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {col.name}
              </p>
              <p style={{ fontSize: '20px', fontWeight: '600', color: col.color }}>{count}</p>
            </div>
          )
        })}
        <div style={{
          backgroundColor: theme.bgCard, borderRadius: '12px',
          border: `1px solid ${theme.border}`, padding: '12px', textAlign: 'center'
        }}>
          <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
            <Trophy size={11} /> Won (30d)
          </p>
          <p style={{ fontSize: '20px', fontWeight: '600', color: '#4a7c59' }}>
            {revenueWon > 0 ? formatCurrency(revenueWon) : recentWins.length > 0 ? recentWins.length : '0'}
          </p>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
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
            style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
          >
            <option value="all">All Status</option>
            <option value="Chillin">Chillin</option>
            <option value="Scheduled">Scheduled</option>
            <option value="In Progress">In Progress</option>
            <option value="Completed">Completed</option>
            <option value="On Hold">On Hold</option>
            <option value="Cancelled">Cancelled</option>
          </select>
        )}
        {teams.length > 0 && (
          <select
            value={teamFilter}
            onChange={(e) => setTeamFilter(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
          >
            <option value="all">All Teams</option>
            {teams.map(team => (
              <option key={team} value={team}>{team}</option>
            ))}
          </select>
        )}
      </div>

      {/* ============ BOARD VIEW ============ */}
      {viewMode === 'board' ? (
        <div>
          {/* Kanban columns — horizontally scrollable on desktop */}
          <div style={{
            display: 'flex',
            gap: '12px',
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
            <details style={{ marginTop: '20px' }}>
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

          {/* Inline Week Calendar */}
          {(() => {
            const weekDays = Array.from({ length: 7 }, (_, i) => {
              const d = new Date(calendarWeekStart)
              d.setDate(d.getDate() + i)
              return d
            })
            const today = new Date()
            today.setHours(0, 0, 0, 0)

            const getJobsForDay = (day) => {
              const dayStr = day.toISOString().split('T')[0]
              return filteredJobs.filter(j => {
                if (!j.start_date) return false
                const jobDay = new Date(j.start_date).toISOString().split('T')[0]
                return jobDay === dayStr
              })
            }

            const shiftWeek = (dir) => {
              setCalendarWeekStart(prev => {
                const d = new Date(prev)
                d.setDate(d.getDate() + (dir * 7))
                return d
              })
            }

            const weekLabel = `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} — ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

            return (
              <div style={{
                marginTop: '24px',
                backgroundColor: theme.bgCard,
                borderRadius: '14px',
                border: `1px solid ${theme.border}`,
                overflow: 'hidden'
              }}>
                {/* Calendar header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '14px 16px', borderBottom: `1px solid ${theme.border}`
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Calendar size={16} color={theme.accent} />
                    <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Schedule</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button onClick={() => shiftWeek(-1)} style={{ padding: '6px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer', color: theme.textMuted, minHeight: '32px', minWidth: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ChevronLeft size={14} />
                    </button>
                    <span style={{ fontSize: '13px', color: theme.textSecondary, fontWeight: '500', minWidth: '160px', textAlign: 'center' }}>
                      {weekLabel}
                    </span>
                    <button onClick={() => shiftWeek(1)} style={{ padding: '6px', background: 'none', border: `1px solid ${theme.border}`, borderRadius: '6px', cursor: 'pointer', color: theme.textMuted, minHeight: '32px', minWidth: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                  <button
                    onClick={() => navigate('/jobs/calendar')}
                    style={{ fontSize: '12px', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', fontWeight: '500', textDecoration: 'underline' }}
                  >
                    Full Calendar
                  </button>
                </div>

                {/* Week grid */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(7, 1fr)',
                  minHeight: isMobile ? 'auto' : '140px'
                }}>
                  {weekDays.map((day, idx) => {
                    const dayJobs = getJobsForDay(day)
                    const isToday = day.getTime() === today.getTime()
                    const isPast = day < today
                    return (
                      <div key={idx} style={{
                        borderRight: idx < 6 ? `1px solid ${theme.border}` : 'none',
                        padding: '8px 6px',
                        backgroundColor: isToday ? theme.accentBg : isPast ? `${theme.bg}80` : 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '4px'
                      }}>
                        <div style={{ textAlign: 'center', marginBottom: '4px' }}>
                          <div style={{ fontSize: '10px', fontWeight: '600', color: isToday ? theme.accent : theme.textMuted, textTransform: 'uppercase' }}>
                            {day.toLocaleDateString('en-US', { weekday: 'short' })}
                          </div>
                          <div style={{
                            fontSize: '16px', fontWeight: isToday ? '700' : '500',
                            color: isToday ? theme.accent : theme.text
                          }}>
                            {day.getDate()}
                          </div>
                        </div>
                        {dayJobs.slice(0, isMobile ? 2 : 4).map(job => {
                          const col = boardColumns.find(c => c.id === job.status)
                          return (
                            <div
                              key={job.id}
                              onClick={() => navigate(`/jobs/${job.id}`)}
                              style={{
                                padding: '4px 6px', borderRadius: '6px', fontSize: '10px',
                                backgroundColor: col ? `${col.color}18` : theme.bg,
                                color: col?.color || theme.text,
                                fontWeight: '500', cursor: 'pointer',
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                                borderLeft: `3px solid ${col?.color || theme.textMuted}`
                              }}
                              title={`${job.job_title} — ${job.customer?.name || ''}`}
                            >
                              {job.job_title || job.customer?.name || 'Job'}
                            </div>
                          )
                        })}
                        {dayJobs.length > (isMobile ? 2 : 4) && (
                          <div style={{ fontSize: '10px', color: theme.textMuted, textAlign: 'center' }}>
                            +{dayJobs.length - (isMobile ? 2 : 4)} more
                          </div>
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
                          <span>{formatDate(job.start_date)}</span>
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
            maxWidth: '600px',
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                      const filtered = customers.filter(c =>
                        c.name?.toLowerCase().includes((customerSearchText || '').toLowerCase())
                      )
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
                              {c.business_name && <span style={{ color: theme.textMuted, fontSize: '12px', marginLeft: '8px' }}>{c.business_name}</span>}
                            </div>
                          ))}
                        </div>
                      ) : customerSearchText ? (
                        <div style={{
                          position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000,
                          backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
                          borderRadius: '8px', padding: '12px', marginTop: '2px',
                          fontSize: '13px', color: theme.textMuted, textAlign: 'center'
                        }}>
                          No customers found
                        </div>
                      ) : null
                    })()}
                  </div>
                  <div>
                    <label style={labelStyle}>Salesperson</label>
                    <select name="salesperson_id" value={formData.salesperson_id} onChange={handleChange} style={inputStyle}>
                      <option value="">-- Select --</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                    <label style={labelStyle}>Quote (optional)</label>
                    <select name="quote_id" value={formData.quote_id} onChange={handleChange} style={inputStyle}>
                      <option value="">-- None --</option>
                      {quotes.filter(q => q.status === 'Approved').map(q => (
                        <option key={q.id} value={q.id}>{q.quote_id} - {q.customer?.name || q.lead?.customer_name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Assigned Team</label>
                    <input type="text" name="assigned_team" value={formData.assigned_team} onChange={handleChange} style={inputStyle} placeholder="Team A" />
                  </div>
                  <div>
                    <label style={labelStyle}>Business Unit</label>
                    <select name="business_unit" value={formData.business_unit} onChange={handleChange} style={inputStyle}>
                      <option value="">-- Select --</option>
                      {businessUnits.map(bu => {
                        const buName = typeof bu === 'object' ? bu.name : bu
                        return <option key={buName} value={buName}>{buName}</option>
                      })}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Start Date/Time</label>
                    <input type="datetime-local" name="start_date" value={formData.start_date} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>End Date/Time</label>
                    <input type="datetime-local" name="end_date" value={formData.end_date} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
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
                      <option value="Monthly">Monthly</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
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

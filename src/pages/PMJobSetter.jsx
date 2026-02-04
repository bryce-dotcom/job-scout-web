import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import HelpBadge from '../components/HelpBadge'
import {
  ChevronDown, ChevronRight, ChevronLeft, X, Calendar, Clock, User, MapPin,
  RefreshCw, Filter, Search, Settings, Plus, Briefcase, CheckCircle2,
  AlertCircle, PauseCircle, PlayCircle, ClipboardList, CalendarPlus, Trash2
} from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

// Job statuses for Kanban columns
const jobStatuses = [
  { id: 'Scheduled', label: 'Scheduled', color: '#3b82f6', icon: Calendar },
  { id: 'In Progress', label: 'In Progress', color: '#f59e0b', icon: PlayCircle },
  { id: 'On Hold', label: 'On Hold', color: '#6b7280', icon: PauseCircle },
  { id: 'Complete', label: 'Complete', color: '#22c55e', icon: CheckCircle2 }
]

// Section status colors
const sectionStatusColors = {
  'Not Started': { bg: '#f3f4f6', text: '#6b7280' },
  'In Progress': { bg: '#fef3c7', text: '#d97706' },
  'Complete': { bg: '#d1fae5', text: '#059669' },
  'Verified': { bg: '#dbeafe', text: '#2563eb' }
}

export default function PMJobSetter() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const employees = useStore((state) => state.employees)
  const businessUnits = useStore((state) => state.businessUnits)

  // Data
  const [jobs, setJobs] = useState([])
  const [jobSections, setJobSections] = useState([])
  const [loading, setLoading] = useState(true)

  // UI State
  const [expandedJobs, setExpandedJobs] = useState({})
  const [currentDate, setCurrentDate] = useState(new Date())
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [selectedSection, setSelectedSection] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)

  // Filters
  const [filterPM, setFilterPM] = useState('')
  const [filterBusinessUnit, setFilterBusinessUnit] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // Drag state
  const [draggedSection, setDraggedSection] = useState(null)
  const [dragOverSlot, setDragOverSlot] = useState(null)
  const [dragOverStatus, setDragOverStatus] = useState(null)

  // Section form
  const [sectionForm, setSectionForm] = useState({
    name: '',
    description: '',
    percent_of_job: 0,
    assigned_to: '',
    estimated_hours: '',
    scheduled_date: ''
  })

  const [isMobile, setIsMobile] = useState(false)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Fetch data
  const fetchData = async () => {
    if (!companyId) return
    setLoading(true)

    // Fetch jobs with customer and PM info
    const { data: jobsData } = await supabase
      .from('jobs')
      .select('*, customer:customers(id, name, address), pm:employees!jobs_pm_id_fkey(id, name)')
      .eq('company_id', companyId)
      .in('status', ['Scheduled', 'In Progress', 'On Hold', 'Complete'])
      .order('start_date', { ascending: true })

    // Fetch all job sections
    const { data: sectionsData } = await supabase
      .from('job_sections')
      .select('*, assigned_employee:employees!job_sections_assigned_to_fkey(id, name)')
      .eq('company_id', companyId)
      .order('sort_order')

    setJobs(jobsData || [])
    setJobSections(sectionsData || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchData()
  }, [companyId])

  // Get Project Managers from employees
  const projectManagers = employees.filter(e =>
    e.role?.includes('Project Manager') || e.role === 'Admin' || e.role === 'Manager'
  )

  // Filter jobs
  const getFilteredJobs = () => {
    let filtered = jobs
    if (filterPM) {
      filtered = filtered.filter(j => j.pm_id === parseInt(filterPM))
    }
    if (filterBusinessUnit) {
      filtered = filtered.filter(j => j.business_unit === filterBusinessUnit)
    }
    if (searchTerm) {
      filtered = filtered.filter(j =>
        j.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        j.customer?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        j.customer?.address?.toLowerCase().includes(searchTerm.toLowerCase())
      )
    }
    return filtered
  }

  // Get jobs by status
  const getJobsByStatus = (statusId) => {
    return getFilteredJobs().filter(j => j.status === statusId)
  }

  // Get sections for a job
  const getSectionsForJob = (jobId) => {
    return jobSections.filter(s => s.job_id === jobId)
  }

  // Calculate job progress from sections
  const calculateJobProgress = (jobId) => {
    const sections = getSectionsForJob(jobId)
    if (sections.length === 0) return 0

    const completedPercent = sections
      .filter(s => s.status === 'Complete' || s.status === 'Verified')
      .reduce((sum, s) => sum + (parseFloat(s.percent_of_job) || 0), 0)

    return Math.min(100, completedPercent)
  }

  // Toggle job expansion
  const toggleJobExpanded = (jobId) => {
    setExpandedJobs(prev => ({ ...prev, [jobId]: !prev[jobId] }))
  }

  // Calendar helpers
  const getWeekStart = (date) => {
    const d = new Date(date)
    const day = d.getDay()
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d
  }

  const getWeekDays = () => {
    const start = getWeekStart(currentDate)
    const days = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(start)
      d.setDate(d.getDate() + i)
      days.push(d)
    }
    return days
  }

  const getHourSlots = () => {
    const slots = []
    for (let h = 7; h <= 17; h++) {
      slots.push(h)
    }
    return slots
  }

  const getSectionsForSlot = (date, hour) => {
    return jobSections.filter(section => {
      if (!section.scheduled_date) return false
      const sectionDate = new Date(section.scheduled_date)
      const sameDay = sectionDate.toDateString() === date.toDateString()

      // If section has start_time, use that hour, otherwise show at 8am
      if (section.start_time) {
        const startHour = new Date(section.start_time).getHours()
        return sameDay && startHour === hour
      }
      return sameDay && hour === 8
    })
  }

  const isToday = (date) => {
    const today = new Date()
    return date.toDateString() === today.toDateString()
  }

  const formatTime = (hour) => {
    const ampm = hour >= 12 ? 'PM' : 'AM'
    const h = hour > 12 ? hour - 12 : hour
    return `${h}:00 ${ampm}`
  }

  // Navigation
  const prevWeek = () => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() - 7)
      return d
    })
  }

  const nextWeek = () => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setDate(d.getDate() + 7)
      return d
    })
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Drag handlers for sections
  const handleSectionDragStart = (e, section, job) => {
    setDraggedSection({ ...section, job })
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', section.id.toString())
  }

  const handleDragEnd = () => {
    setDraggedSection(null)
    setDragOverSlot(null)
    setDragOverStatus(null)
  }

  const handleSlotDragOver = (e, date, hour) => {
    e.preventDefault()
    setDragOverSlot({ date, hour })
  }

  const handleSlotDrop = async (e, date, hour) => {
    e.preventDefault()
    setDragOverSlot(null)

    if (!draggedSection) return

    // Update section scheduled_date
    const startTime = new Date(date)
    startTime.setHours(hour, 0, 0, 0)

    await supabase
      .from('job_sections')
      .update({
        scheduled_date: date.toISOString().split('T')[0],
        start_time: startTime.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', draggedSection.id)

    await fetchData()
  }

  // Drag job to status column
  const handleStatusDragOver = (e, statusId) => {
    e.preventDefault()
    setDragOverStatus(statusId)
  }

  const handleStatusDrop = async (e, statusId) => {
    e.preventDefault()
    setDragOverStatus(null)

    // This is for dragging jobs between status columns
    // We can implement this if needed
  }

  // Add new section
  const handleAddSection = async (e) => {
    e.preventDefault()
    if (!selectedJob || !sectionForm.name) return

    await supabase.from('job_sections').insert({
      company_id: companyId,
      job_id: selectedJob.id,
      name: sectionForm.name,
      description: sectionForm.description,
      percent_of_job: parseFloat(sectionForm.percent_of_job) || 0,
      assigned_to: sectionForm.assigned_to || null,
      estimated_hours: parseFloat(sectionForm.estimated_hours) || null,
      scheduled_date: sectionForm.scheduled_date || null,
      status: 'Not Started',
      sort_order: getSectionsForJob(selectedJob.id).length
    })

    setShowSectionModal(false)
    setSectionForm({ name: '', description: '', percent_of_job: 0, assigned_to: '', estimated_hours: '', scheduled_date: '' })
    setSelectedJob(null)
    await fetchData()
  }

  // Update section status
  const updateSectionStatus = async (sectionId, newStatus) => {
    await supabase
      .from('job_sections')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', sectionId)
    await fetchData()
  }

  // Styles
  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    minHeight: '44px',
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    fontSize: '14px',
    color: theme.text,
    backgroundColor: theme.bgCard
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  if (!companyId) return null

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
        Loading...
      </div>
    )
  }

  const weekDays = getWeekDays()
  const hourSlots = getHourSlots()

  return (
    <div style={{ padding: isMobile ? '12px' : '16px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexDirection: isMobile ? 'column' : 'row',
        gap: '12px'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: isMobile ? '20px' : '22px', fontWeight: '700', color: theme.text, margin: 0 }}>
              Job Board
            </h1>
            <HelpBadge text="Drag job sections to the calendar to schedule work. Track progress across all jobs." />
          </div>
          <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
            Drag sections to calendar to schedule work
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* PM Filter */}
          <select
            value={filterPM}
            onChange={(e) => setFilterPM(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
          >
            <option value="">All PMs</option>
            {projectManagers.map(pm => (
              <option key={pm.id} value={pm.id}>{pm.name}</option>
            ))}
          </select>

          {/* Business Unit Filter */}
          <select
            value={filterBusinessUnit}
            onChange={(e) => setFilterBusinessUnit(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
          >
            <option value="">All Units</option>
            {businessUnits.map(unit => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
            <input
              type="text"
              placeholder="Search jobs..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ ...inputStyle, paddingLeft: '34px', width: isMobile ? '100%' : '180px' }}
            />
          </div>

          <button
            onClick={fetchData}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px',
              minWidth: '44px',
              minHeight: '44px',
              backgroundColor: 'transparent',
              border: `1px solid ${theme.border}`,
              color: theme.textSecondary,
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={16} />
          </button>

          <button
            onClick={() => setShowSettingsModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px',
              minWidth: '44px',
              minHeight: '44px',
              backgroundColor: 'transparent',
              border: `1px solid ${theme.border}`,
              color: theme.textSecondary,
              borderRadius: '8px',
              cursor: 'pointer'
            }}
          >
            <Settings size={16} />
          </button>
        </div>
      </div>

      {/* Main Content - Split View */}
      <div style={{ display: 'flex', flex: 1, gap: '16px', overflow: 'hidden', flexDirection: isMobile ? 'column' : 'row' }}>
        {/* Left: Kanban Jobs */}
        <div style={{
          width: isMobile ? '100%' : '500px',
          flexShrink: 0,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          maxHeight: isMobile ? '50vh' : 'none'
        }}>
          {/* Stats Row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${jobStatuses.length}, 1fr)`,
            gap: '8px',
            marginBottom: '12px'
          }}>
            {jobStatuses.map(status => (
              <div
                key={status.id}
                style={{
                  padding: '8px',
                  backgroundColor: theme.bgCard,
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  textAlign: 'center'
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: '700', color: status.color }}>
                  {getJobsByStatus(status.id).length}
                </div>
                <div style={{ fontSize: '10px', color: theme.textMuted }}>{status.label}</div>
              </div>
            ))}
          </div>

          {/* Kanban Columns */}
          <div style={{ display: 'flex', gap: '8px', flex: 1, overflow: 'hidden' }}>
            {jobStatuses.map(status => {
              const StatusIcon = status.icon
              return (
                <div
                  key={status.id}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden'
                  }}
                  onDragOver={(e) => handleStatusDragOver(e, status.id)}
                  onDrop={(e) => handleStatusDrop(e, status.id)}
                >
                  {/* Status Header */}
                  <div style={{
                    backgroundColor: status.color,
                    color: '#fff',
                    padding: '8px',
                    borderRadius: '8px 8px 0 0',
                    fontSize: '11px',
                    fontWeight: '600',
                    textAlign: 'center',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '4px'
                  }}>
                    <StatusIcon size={12} />
                    <span>{status.label.split(' ')[0]}</span>
                    <span style={{
                      marginLeft: '4px',
                      backgroundColor: 'rgba(255,255,255,0.25)',
                      padding: '1px 6px',
                      borderRadius: '8px',
                      fontSize: '10px'
                    }}>
                      {getJobsByStatus(status.id).length}
                    </span>
                  </div>

                  {/* Status Content */}
                  <div style={{
                    flex: 1,
                    backgroundColor: dragOverStatus === status.id ? theme.accentBg : 'rgba(0,0,0,0.02)',
                    borderRadius: '0 0 8px 8px',
                    padding: '6px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px'
                  }}>
                    {getJobsByStatus(status.id).map(job => {
                      const progress = calculateJobProgress(job.id)
                      const sections = getSectionsForJob(job.id)
                      const isExpanded = expandedJobs[job.id]

                      return (
                        <div
                          key={job.id}
                          style={{
                            backgroundColor: theme.bgCard,
                            borderRadius: '8px',
                            border: `1px solid ${theme.border}`,
                            overflow: 'hidden'
                          }}
                        >
                          {/* Job Card Header */}
                          <div
                            onClick={() => toggleJobExpanded(job.id)}
                            style={{
                              padding: '10px',
                              cursor: 'pointer'
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <div style={{
                                fontWeight: '600',
                                color: theme.text,
                                fontSize: '12px',
                                flex: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {job.title || `Job #${job.id}`}
                              </div>
                              {isExpanded ? <ChevronDown size={14} color={theme.textMuted} /> : <ChevronRight size={14} color={theme.textMuted} />}
                            </div>

                            {/* Customer & Address */}
                            <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                              {job.customer?.name}
                            </div>
                            {job.customer?.address && (
                              <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <MapPin size={10} />
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {job.customer.address}
                                </span>
                              </div>
                            )}

                            {/* Progress Bar */}
                            <div style={{
                              height: '6px',
                              backgroundColor: theme.border,
                              borderRadius: '3px',
                              overflow: 'hidden',
                              marginBottom: '6px'
                            }}>
                              <div style={{
                                height: '100%',
                                width: `${progress}%`,
                                backgroundColor: progress === 100 ? '#22c55e' : status.color,
                                borderRadius: '3px',
                                transition: 'width 0.3s ease'
                              }} />
                            </div>

                            {/* Meta Row */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: theme.textMuted }}>
                              <span>{Math.round(progress)}% complete</span>
                              <span>{sections.length} sections</span>
                            </div>

                            {/* PM & Date */}
                            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', color: theme.textMuted, marginTop: '4px' }}>
                              {job.pm && <span>PM: {job.pm.name}</span>}
                              {job.start_date && <span>{new Date(job.start_date).toLocaleDateString()}</span>}
                            </div>
                          </div>

                          {/* Expanded Sections */}
                          {isExpanded && (
                            <div style={{
                              borderTop: `1px solid ${theme.border}`,
                              padding: '8px',
                              backgroundColor: theme.bg
                            }}>
                              {sections.length === 0 ? (
                                <div style={{ fontSize: '11px', color: theme.textMuted, textAlign: 'center', padding: '8px' }}>
                                  No sections yet
                                </div>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                  {sections.map(section => {
                                    const statusColor = sectionStatusColors[section.status] || sectionStatusColors['Not Started']
                                    return (
                                      <div
                                        key={section.id}
                                        draggable
                                        onDragStart={(e) => handleSectionDragStart(e, section, job)}
                                        onDragEnd={handleDragEnd}
                                        style={{
                                          padding: '8px',
                                          backgroundColor: theme.bgCard,
                                          borderRadius: '6px',
                                          border: `1px solid ${theme.border}`,
                                          cursor: 'grab',
                                          fontSize: '11px'
                                        }}
                                      >
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                                          <span style={{ fontWeight: '500', color: theme.text }}>{section.name}</span>
                                          <span style={{
                                            padding: '2px 6px',
                                            borderRadius: '4px',
                                            backgroundColor: statusColor.bg,
                                            color: statusColor.text,
                                            fontSize: '9px',
                                            fontWeight: '500'
                                          }}>
                                            {section.status}
                                          </span>
                                        </div>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', color: theme.textMuted, fontSize: '10px' }}>
                                          <span>{section.percent_of_job || 0}% of job</span>
                                          {section.assigned_employee && <span>{section.assigned_employee.name}</span>}
                                        </div>
                                        {section.scheduled_date && (
                                          <div style={{ fontSize: '9px', color: theme.accent, marginTop: '4px' }}>
                                            Scheduled: {new Date(section.scheduled_date).toLocaleDateString()}
                                          </div>
                                        )}
                                      </div>
                                    )
                                  })}
                                </div>
                              )}

                              {/* Add Section Button */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setSelectedJob(job)
                                  setShowSectionModal(true)
                                }}
                                style={{
                                  width: '100%',
                                  marginTop: '8px',
                                  padding: '8px',
                                  minHeight: '36px',
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: '4px',
                                  backgroundColor: 'transparent',
                                  border: `1px dashed ${theme.border}`,
                                  borderRadius: '6px',
                                  color: theme.textMuted,
                                  fontSize: '11px',
                                  cursor: 'pointer'
                                }}
                              >
                                <Plus size={12} />
                                Add Section
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}

                    {getJobsByStatus(status.id).length === 0 && (
                      <div style={{
                        textAlign: 'center',
                        padding: '16px 8px',
                        color: theme.textMuted,
                        fontSize: '11px'
                      }}>
                        No jobs
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Right: Calendar */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'hidden',
          minHeight: isMobile ? '400px' : 'auto'
        }}>
          {/* Calendar Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            flexWrap: 'wrap',
            gap: '8px'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={prevWeek}
                style={{
                  padding: '8px 12px',
                  minWidth: '44px',
                  minHeight: '44px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.textSecondary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToToday}
                style={{
                  padding: '8px 16px',
                  minHeight: '44px',
                  backgroundColor: '#22c55e',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: '#fff',
                  fontSize: '13px',
                  fontWeight: '600'
                }}
              >
                Today
              </button>
              <button
                onClick={nextWeek}
                style={{
                  padding: '8px 12px',
                  minWidth: '44px',
                  minHeight: '44px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.textSecondary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
              {weekDays[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>
              {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>

          {/* Calendar Grid */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <thead>
                <tr>
                  <th style={{
                    width: '60px',
                    padding: '8px',
                    borderBottom: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    position: 'sticky',
                    top: 0,
                    zIndex: 1
                  }}></th>
                  {weekDays.map((day, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '8px',
                        borderBottom: `1px solid ${theme.border}`,
                        borderLeft: `1px solid ${theme.border}`,
                        backgroundColor: isToday(day) ? theme.accentBg : theme.bg,
                        position: 'sticky',
                        top: 0,
                        zIndex: 1
                      }}
                    >
                      <div style={{
                        fontSize: '10px',
                        color: theme.textMuted,
                        textTransform: 'uppercase'
                      }}>
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: isToday(day) ? '700' : '500',
                        color: isToday(day) ? theme.accent : theme.text
                      }}>
                        {day.getDate()}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hourSlots.map(hour => (
                  <tr key={hour}>
                    <td style={{
                      padding: '4px 8px',
                      fontSize: '10px',
                      color: theme.textMuted,
                      textAlign: 'right',
                      verticalAlign: 'top',
                      borderBottom: `1px solid ${theme.border}`
                    }}>
                      {formatTime(hour)}
                    </td>
                    {weekDays.map((day, i) => {
                      const slotSections = getSectionsForSlot(day, hour)
                      const isSlotDragOver = dragOverSlot?.date?.toDateString() === day.toDateString() && dragOverSlot?.hour === hour

                      return (
                        <td
                          key={i}
                          onDragOver={(e) => handleSlotDragOver(e, day, hour)}
                          onDragLeave={() => setDragOverSlot(null)}
                          onDrop={(e) => handleSlotDrop(e, day, hour)}
                          style={{
                            padding: '2px',
                            borderBottom: `1px solid ${theme.border}`,
                            borderLeft: `1px solid ${theme.border}`,
                            height: '50px',
                            verticalAlign: 'top',
                            backgroundColor: isSlotDragOver ? theme.accentBg : (isToday(day) ? 'rgba(90,99,73,0.04)' : 'transparent'),
                            transition: 'background-color 0.15s'
                          }}
                        >
                          {slotSections.map(section => {
                            const statusColor = sectionStatusColors[section.status] || sectionStatusColors['Not Started']
                            const job = jobs.find(j => j.id === section.job_id)
                            return (
                              <div
                                key={section.id}
                                draggable
                                onDragStart={(e) => handleSectionDragStart(e, section, job)}
                                onDragEnd={handleDragEnd}
                                style={{
                                  backgroundColor: statusColor.bg,
                                  borderLeft: `3px solid ${statusColor.text}`,
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  fontSize: '9px',
                                  overflow: 'hidden',
                                  cursor: 'grab',
                                  marginBottom: '2px'
                                }}
                                onClick={() => {
                                  setSelectedSection(section)
                                }}
                              >
                                <div style={{
                                  fontWeight: '600',
                                  color: theme.text,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap'
                                }}>
                                  {section.name}
                                </div>
                                <div style={{ color: theme.textMuted, fontSize: '8px' }}>
                                  {job?.title || `Job #${section.job_id}`}
                                </div>
                              </div>
                            )
                          })}

                          {isSlotDragOver && slotSections.length === 0 && (
                            <div style={{
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: `2px dashed ${theme.accent}`,
                              borderRadius: '4px',
                              color: theme.accent,
                              fontSize: '10px'
                            }}>
                              <CalendarPlus size={14} />
                            </div>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Add Section Modal */}
      {showSectionModal && selectedJob && (
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
            maxWidth: '440px',
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
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Add Section
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '2px' }}>
                  {selectedJob.title || `Job #${selectedJob.id}`}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSectionModal(false)
                  setSelectedJob(null)
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

            <form onSubmit={handleAddSection} style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Section Name *</label>
                  <input
                    type="text"
                    value={sectionForm.name}
                    onChange={(e) => setSectionForm(prev => ({ ...prev, name: e.target.value }))}
                    required
                    placeholder="e.g., Install fixtures, Paint walls"
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
                    <label style={labelStyle}>% of Job</label>
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
                  type="button"
                  onClick={() => {
                    setShowSectionModal(false)
                    setSelectedJob(null)
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
                  type="submit"
                  style={{
                    flex: 1,
                    padding: '12px',
                    minHeight: '44px',
                    backgroundColor: theme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Add Section
                </button>
              </div>
            </form>
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
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Job Board Settings
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '2px' }}>
                  Configure job statuses and section templates
                </p>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
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
              {/* Job Statuses */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ ...labelStyle, marginBottom: '12px' }}>Job Statuses</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {jobStatuses.map(status => (
                    <div
                      key={status.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 12px',
                        backgroundColor: theme.bg,
                        borderRadius: '8px'
                      }}
                    >
                      <div style={{
                        width: '12px',
                        height: '12px',
                        borderRadius: '50%',
                        backgroundColor: status.color
                      }} />
                      <span style={{ fontSize: '14px', color: theme.text }}>{status.label}</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px' }}>
                  Job statuses are system defaults. Contact support to customize.
                </p>
              </div>

              {/* Section Templates */}
              <div style={{ marginBottom: '24px' }}>
                <label style={{ ...labelStyle, marginBottom: '12px' }}>Section Status Options</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {Object.entries(sectionStatusColors).map(([status, colors]) => (
                    <div
                      key={status}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '10px 12px',
                        backgroundColor: colors.bg,
                        borderRadius: '8px'
                      }}
                    >
                      <span style={{ fontSize: '14px', color: colors.text, fontWeight: '500' }}>{status}</span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  width: '100%',
                  padding: '12px',
                  minHeight: '44px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

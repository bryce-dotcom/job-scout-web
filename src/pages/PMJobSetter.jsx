import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import HelpBadge from '../components/HelpBadge'
import {
  ChevronDown, ChevronRight, ChevronLeft, X, Calendar, Clock, User, MapPin,
  RefreshCw, Filter, Search, Settings, Plus, Briefcase, CheckCircle2,
  AlertCircle, PauseCircle, PlayCircle, ClipboardList, CalendarPlus, Trash2,
  LayoutGrid, GanttChart, Download, ZoomIn, ZoomOut, Users, Building2,
  Palette, Edit2, Layers
} from 'lucide-react'

// Default calendar colors for visual distinction
const calendarColors = [
  '#3b82f6', // blue
  '#22c55e', // green
  '#f59e0b', // amber
  '#8b5cf6', // purple
  '#ec4899', // pink
  '#14b8a6', // teal
  '#f97316', // orange
  '#6366f1'  // indigo
]

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

// Gantt chart section colors (solid colors for blocks)
const ganttSectionColors = {
  'Not Started': '#9ca3af',  // gray
  'In Progress': '#3b82f6',  // blue
  'Complete': '#22c55e',     // green
  'Verified': '#8b5cf6'      // purple
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
  const [jobCalendars, setJobCalendars] = useState([])

  // Calendar management
  const [selectedCalendar, setSelectedCalendar] = useState('all') // 'all' or calendar id
  const [showCalendarForm, setShowCalendarForm] = useState(false)
  const [editingCalendar, setEditingCalendar] = useState(null)
  const [calendarForm, setCalendarForm] = useState({
    name: '',
    business_unit: '',
    color: calendarColors[0]
  })

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

  // View Mode: 'kanban' or 'gantt'
  const [viewMode, setViewMode] = useState('kanban')
  const [ganttGroupBy, setGanttGroupBy] = useState('pm') // 'pm' or 'unit'
  const [zoomLevel, setZoomLevel] = useState('week') // 'day', 'week', 'month'
  const [ganttStartDate, setGanttStartDate] = useState(new Date())
  const ganttRef = useRef(null)

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

    // Fetch job calendars from settings
    const { data: calendarsSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('company_id', companyId)
      .eq('key', 'job_calendars')
      .single()

    if (calendarsSetting?.value) {
      try {
        const cals = JSON.parse(calendarsSetting.value)
        setJobCalendars(Array.isArray(cals) ? cals : [])
      } catch {
        setJobCalendars([])
      }
    }

    setJobs(jobsData || [])
    setJobSections(sectionsData || [])
    setLoading(false)
  }

  // Save calendars to settings
  const saveCalendars = async (calendars) => {
    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .eq('company_id', companyId)
      .eq('key', 'job_calendars')
      .single()

    if (existing) {
      await supabase
        .from('settings')
        .update({ value: JSON.stringify(calendars) })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('settings')
        .insert({ company_id: companyId, key: 'job_calendars', value: JSON.stringify(calendars) })
    }

    setJobCalendars(calendars)
  }

  // Add or update calendar
  const handleSaveCalendar = async () => {
    if (!calendarForm.name) return

    let updatedCalendars
    if (editingCalendar) {
      updatedCalendars = jobCalendars.map(c =>
        c.id === editingCalendar.id ? { ...c, ...calendarForm } : c
      )
    } else {
      const newCalendar = {
        id: Date.now().toString(),
        ...calendarForm
      }
      updatedCalendars = [...jobCalendars, newCalendar]
    }

    await saveCalendars(updatedCalendars)
    setShowCalendarForm(false)
    setEditingCalendar(null)
    setCalendarForm({ name: '', business_unit: '', color: calendarColors[0] })
  }

  // Delete calendar
  const handleDeleteCalendar = async (calendarId) => {
    const updatedCalendars = jobCalendars.filter(c => c.id !== calendarId)
    await saveCalendars(updatedCalendars)
    if (selectedCalendar === calendarId) {
      setSelectedCalendar('all')
    }
  }

  // Get calendar for a job based on business unit
  const getCalendarForJob = (job) => {
    if (!job.business_unit) return null
    return jobCalendars.find(c => c.business_unit === job.business_unit)
  }

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchData()
  }, [companyId])

  // Get Project Managers - filter by business unit if selected
  const getProjectManagers = () => {
    let pms = employees.filter(e =>
      e.role?.includes('Project Manager') || e.role === 'Admin' || e.role === 'Manager'
    )
    // If a calendar is selected, only show PMs for that business unit
    if (selectedCalendar !== 'all') {
      const cal = jobCalendars.find(c => c.id === selectedCalendar)
      if (cal?.business_unit) {
        pms = pms.filter(pm => pm.business_unit === cal.business_unit || !pm.business_unit)
      }
    }
    // If business unit filter is set, filter PMs
    if (filterBusinessUnit) {
      pms = pms.filter(pm => pm.business_unit === filterBusinessUnit || !pm.business_unit)
    }
    return pms
  }

  const projectManagers = getProjectManagers()

  // Filter jobs
  const getFilteredJobs = () => {
    let filtered = jobs

    // Filter by selected calendar (based on business unit)
    if (selectedCalendar !== 'all') {
      const cal = jobCalendars.find(c => c.id === selectedCalendar)
      if (cal?.business_unit) {
        filtered = filtered.filter(j => j.business_unit === cal.business_unit)
      }
    }

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

  // Gantt Chart Helpers
  const getGanttDateRange = () => {
    const today = ganttStartDate
    let start = new Date(today)
    let end = new Date(today)
    let colCount = 7
    let colWidth = 120

    if (zoomLevel === 'day') {
      start.setDate(start.getDate() - 3)
      end.setDate(start.getDate() + 6)
      colCount = 7
      colWidth = isMobile ? 80 : 120
    } else if (zoomLevel === 'week') {
      start.setDate(start.getDate() - start.getDay())
      end.setDate(start.getDate() + 27) // 4 weeks
      colCount = 28
      colWidth = isMobile ? 30 : 40
    } else if (zoomLevel === 'month') {
      start.setDate(1)
      end = new Date(start.getFullYear(), start.getMonth() + 3, 0) // 3 months
      colCount = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
      colWidth = isMobile ? 10 : 15
    }

    return { start, end, colCount, colWidth }
  }

  const getGanttColumns = () => {
    const { start, end, colWidth } = getGanttDateRange()
    const cols = []
    const current = new Date(start)

    while (current <= end) {
      cols.push({
        date: new Date(current),
        width: colWidth
      })
      current.setDate(current.getDate() + 1)
    }
    return cols
  }

  const getGroupedJobs = () => {
    const filtered = getFilteredJobs()
    const groups = {}

    if (ganttGroupBy === 'pm') {
      filtered.forEach(job => {
        const key = job.pm?.id || 'unassigned'
        const name = job.pm?.name || 'Unassigned'
        if (!groups[key]) {
          groups[key] = { id: key, name, jobs: [] }
        }
        groups[key].jobs.push(job)
      })
    } else {
      filtered.forEach(job => {
        const key = job.business_unit || 'other'
        if (!groups[key]) {
          groups[key] = { id: key, name: key || 'Other', jobs: [] }
        }
        groups[key].jobs.push(job)
      })
    }

    return Object.values(groups)
  }

  const getSectionPosition = (section) => {
    if (!section.scheduled_date) return null

    const { start, colWidth } = getGanttDateRange()
    const sectionDate = new Date(section.scheduled_date)
    const daysDiff = Math.floor((sectionDate - start) / (1000 * 60 * 60 * 24))

    if (daysDiff < 0) return null

    const hours = parseFloat(section.estimated_hours) || 4
    // Each hour = ~0.125 of a day width (8 hour day)
    const widthDays = Math.max(0.5, hours / 8)

    return {
      left: daysDiff * colWidth,
      width: Math.max(colWidth * widthDays, 40) // minimum 40px
    }
  }

  const formatGanttDate = (date) => {
    if (zoomLevel === 'day') {
      return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    } else if (zoomLevel === 'week') {
      return date.getDate().toString()
    } else {
      return date.getDate() === 1 ? date.toLocaleDateString('en-US', { month: 'short' }) : ''
    }
  }

  const isWeekend = (date) => {
    const day = date.getDay()
    return day === 0 || day === 6
  }

  // Gantt navigation
  const prevGanttPeriod = () => {
    setGanttStartDate(prev => {
      const d = new Date(prev)
      if (zoomLevel === 'day') d.setDate(d.getDate() - 7)
      else if (zoomLevel === 'week') d.setDate(d.getDate() - 28)
      else d.setMonth(d.getMonth() - 1)
      return d
    })
  }

  const nextGanttPeriod = () => {
    setGanttStartDate(prev => {
      const d = new Date(prev)
      if (zoomLevel === 'day') d.setDate(d.getDate() + 7)
      else if (zoomLevel === 'week') d.setDate(d.getDate() + 28)
      else d.setMonth(d.getMonth() + 1)
      return d
    })
  }

  const goToGanttToday = () => {
    setGanttStartDate(new Date())
  }

  // PDF Export
  const exportGanttToPDF = async () => {
    if (!ganttRef.current) return

    try {
      // Dynamically import html2canvas
      const html2canvas = (await import('html2canvas')).default

      const canvas = await html2canvas(ganttRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: theme.bgCard
      })

      // Create PDF using jspdf (dynamically import)
      const { jsPDF } = await import('jspdf')

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2 + 100]
      })

      // Add header
      const company = useStore.getState().company
      pdf.setFontSize(20)
      pdf.setTextColor(44, 53, 48)
      pdf.text(company?.name || 'Job Board', 40, 40)

      pdf.setFontSize(12)
      pdf.setTextColor(77, 90, 82)
      pdf.text(`Gantt Chart - ${ganttGroupBy === 'pm' ? 'By Project Manager' : 'By Business Unit'}`, 40, 60)

      const { start, end } = getGanttDateRange()
      pdf.text(`${start.toLocaleDateString()} - ${end.toLocaleDateString()}`, 40, 75)
      pdf.text(`Generated: ${new Date().toLocaleString()}`, 40, 90)

      // Add the chart image
      pdf.addImage(imgData, 'PNG', 20, 110, canvas.width / 2 - 40, canvas.height / 2 - 20)

      pdf.save(`gantt-chart-${new Date().toISOString().split('T')[0]}.pdf`)
    } catch (error) {
      console.error('PDF export failed:', error)
      alert('PDF export failed. Please try again.')
    }
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
          {/* View Toggle */}
          <div style={{
            display: 'flex',
            backgroundColor: theme.bg,
            borderRadius: '8px',
            padding: '4px',
            border: `1px solid ${theme.border}`
          }}>
            <button
              onClick={() => setViewMode('kanban')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                minHeight: '36px',
                backgroundColor: viewMode === 'kanban' ? theme.bgCard : 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: viewMode === 'kanban' ? theme.accent : theme.textMuted,
                fontSize: '13px',
                fontWeight: viewMode === 'kanban' ? '600' : '400',
                cursor: 'pointer',
                boxShadow: viewMode === 'kanban' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <LayoutGrid size={14} />
              {!isMobile && 'Kanban'}
            </button>
            <button
              onClick={() => setViewMode('gantt')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                minHeight: '36px',
                backgroundColor: viewMode === 'gantt' ? theme.bgCard : 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: viewMode === 'gantt' ? theme.accent : theme.textMuted,
                fontSize: '13px',
                fontWeight: viewMode === 'gantt' ? '600' : '400',
                cursor: 'pointer',
                boxShadow: viewMode === 'gantt' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
              }}
            >
              <GanttChart size={14} />
              {!isMobile && 'Gantt'}
            </button>
          </div>

          {/* Calendar Selector */}
          {jobCalendars.length > 0 && (
            <div style={{
              display: 'flex',
              backgroundColor: theme.bg,
              borderRadius: '8px',
              padding: '4px',
              border: `1px solid ${theme.border}`,
              gap: '2px',
              flexWrap: 'wrap'
            }}>
              <button
                onClick={() => setSelectedCalendar('all')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '6px 10px',
                  minHeight: '32px',
                  backgroundColor: selectedCalendar === 'all' ? theme.bgCard : 'transparent',
                  border: 'none',
                  borderRadius: '5px',
                  color: selectedCalendar === 'all' ? theme.accent : theme.textMuted,
                  fontSize: '12px',
                  fontWeight: selectedCalendar === 'all' ? '600' : '400',
                  cursor: 'pointer'
                }}
              >
                <Layers size={12} />
                All
              </button>
              {jobCalendars.map(cal => (
                <button
                  key={cal.id}
                  onClick={() => setSelectedCalendar(cal.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '6px 10px',
                    minHeight: '32px',
                    backgroundColor: selectedCalendar === cal.id ? theme.bgCard : 'transparent',
                    border: 'none',
                    borderRadius: '5px',
                    color: selectedCalendar === cal.id ? cal.color : theme.textMuted,
                    fontSize: '12px',
                    fontWeight: selectedCalendar === cal.id ? '600' : '400',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '2px',
                    backgroundColor: cal.color
                  }} />
                  {!isMobile && cal.name}
                </button>
              ))}
            </div>
          )}

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

      {/* Main Content */}
      {viewMode === 'kanban' ? (
      /* Kanban + Calendar Split View */
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
                      const jobCalendar = getCalendarForJob(job)

                      return (
                        <div
                          key={job.id}
                          style={{
                            backgroundColor: theme.bgCard,
                            borderRadius: '8px',
                            border: `1px solid ${theme.border}`,
                            borderLeft: jobCalendar ? `4px solid ${jobCalendar.color}` : `1px solid ${theme.border}`,
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
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flex: 1, overflow: 'hidden' }}>
                                {jobCalendar && (
                                  <div style={{
                                    width: '8px',
                                    height: '8px',
                                    borderRadius: '2px',
                                    backgroundColor: jobCalendar.color,
                                    flexShrink: 0
                                  }} />
                                )}
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
                            const calendar = job ? getCalendarForJob(job) : null
                            return (
                              <div
                                key={section.id}
                                draggable
                                onDragStart={(e) => handleSectionDragStart(e, section, job)}
                                onDragEnd={handleDragEnd}
                                style={{
                                  backgroundColor: statusColor.bg,
                                  borderLeft: `3px solid ${calendar?.color || statusColor.text}`,
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  fontSize: '9px',
                                  overflow: 'hidden',
                                  cursor: 'grab',
                                  marginBottom: '2px'
                                }}
                                onClick={() => {
                                  navigate(`/jobs/${section.job_id}`)
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {calendar && (
                                    <div style={{
                                      width: '6px',
                                      height: '6px',
                                      borderRadius: '2px',
                                      backgroundColor: calendar.color,
                                      flexShrink: 0
                                    }} />
                                  )}
                                  <div style={{
                                    fontWeight: '600',
                                    color: theme.text,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    flex: 1
                                  }}>
                                    {section.name}
                                  </div>
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
      ) : (
      /* Gantt Chart View */
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Gantt Controls */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          flexWrap: 'wrap',
          gap: '8px'
        }}>
          {/* Navigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <button
              onClick={prevGanttPeriod}
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
              onClick={goToGanttToday}
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
              onClick={nextGanttPeriod}
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

          {/* Group By Toggle */}
          <div style={{
            display: 'flex',
            backgroundColor: theme.bg,
            borderRadius: '8px',
            padding: '4px',
            border: `1px solid ${theme.border}`
          }}>
            <button
              onClick={() => setGanttGroupBy('pm')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                minHeight: '36px',
                backgroundColor: ganttGroupBy === 'pm' ? theme.bgCard : 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: ganttGroupBy === 'pm' ? theme.accent : theme.textMuted,
                fontSize: '12px',
                fontWeight: ganttGroupBy === 'pm' ? '600' : '400',
                cursor: 'pointer'
              }}
            >
              <Users size={14} />
              By PM
            </button>
            <button
              onClick={() => setGanttGroupBy('unit')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 12px',
                minHeight: '36px',
                backgroundColor: ganttGroupBy === 'unit' ? theme.bgCard : 'transparent',
                border: 'none',
                borderRadius: '6px',
                color: ganttGroupBy === 'unit' ? theme.accent : theme.textMuted,
                fontSize: '12px',
                fontWeight: ganttGroupBy === 'unit' ? '600' : '400',
                cursor: 'pointer'
              }}
            >
              <Building2 size={14} />
              By Unit
            </button>
          </div>

          {/* Zoom Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span style={{ fontSize: '12px', color: theme.textMuted, marginRight: '8px' }}>Zoom:</span>
            {['day', 'week', 'month'].map(level => (
              <button
                key={level}
                onClick={() => setZoomLevel(level)}
                style={{
                  padding: '8px 12px',
                  minHeight: '36px',
                  backgroundColor: zoomLevel === level ? theme.accent : 'transparent',
                  border: `1px solid ${zoomLevel === level ? theme.accent : theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: zoomLevel === level ? '#fff' : theme.textSecondary,
                  fontSize: '12px',
                  fontWeight: zoomLevel === level ? '600' : '400',
                  textTransform: 'capitalize'
                }}
              >
                {level}
              </button>
            ))}
          </div>

          {/* Export Button */}
          <button
            onClick={exportGanttToPDF}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              minHeight: '44px',
              backgroundColor: theme.accent,
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              color: '#fff',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            <Download size={14} />
            Export PDF
          </button>
        </div>

        {/* Legend */}
        <div style={{
          display: 'flex',
          gap: '16px',
          marginBottom: '12px',
          flexWrap: 'wrap'
        }}>
          {Object.entries(ganttSectionColors).map(([status, color]) => (
            <div key={status} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div style={{
                width: '12px',
                height: '12px',
                backgroundColor: color,
                borderRadius: '3px'
              }} />
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{status}</span>
            </div>
          ))}
        </div>

        {/* Gantt Chart Container */}
        <div
          ref={ganttRef}
          style={{
            flex: 1,
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'auto',
            position: 'relative'
          }}
        >
          {(() => {
            const ganttCols = getGanttColumns()
            const groups = getGroupedJobs()
            const { colWidth } = getGanttDateRange()
            const rowHeight = 60
            const headerHeight = 50
            const jobLabelWidth = 200

            return (
              <div style={{ minWidth: jobLabelWidth + ganttCols.length * colWidth, minHeight: 'fit-content' }}>
                {/* Timeline Header */}
                <div style={{
                  display: 'flex',
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  backgroundColor: theme.bg
                }}>
                  {/* Empty corner */}
                  <div style={{
                    width: jobLabelWidth,
                    flexShrink: 0,
                    padding: '8px 12px',
                    borderBottom: `1px solid ${theme.border}`,
                    borderRight: `1px solid ${theme.border}`,
                    fontWeight: '600',
                    color: theme.text,
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center'
                  }}>
                    {ganttGroupBy === 'pm' ? 'Project Manager / Jobs' : 'Business Unit / Jobs'}
                  </div>
                  {/* Date columns */}
                  <div style={{ display: 'flex' }}>
                    {ganttCols.map((col, i) => {
                      const isWeekendDay = isWeekend(col.date)
                      const isTodayCol = isToday(col.date)
                      return (
                        <div
                          key={i}
                          style={{
                            width: colWidth,
                            flexShrink: 0,
                            padding: '4px',
                            borderBottom: `1px solid ${theme.border}`,
                            borderRight: `1px solid ${theme.border}`,
                            backgroundColor: isTodayCol ? theme.accentBg : isWeekendDay ? 'rgba(0,0,0,0.03)' : 'transparent',
                            textAlign: 'center',
                            fontSize: zoomLevel === 'day' ? '10px' : '9px',
                            color: isTodayCol ? theme.accent : theme.textMuted
                          }}
                        >
                          {formatGanttDate(col.date)}
                          {zoomLevel === 'week' && col.date.getDay() === 0 && (
                            <div style={{ fontSize: '8px', marginTop: '2px' }}>
                              {col.date.toLocaleDateString('en-US', { month: 'short' })}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Groups and Jobs */}
                {groups.map(group => (
                  <div key={group.id}>
                    {/* Group Header */}
                    <div style={{
                      display: 'flex',
                      backgroundColor: theme.bg,
                      position: 'sticky',
                      left: 0
                    }}>
                      <div style={{
                        width: jobLabelWidth,
                        flexShrink: 0,
                        padding: '10px 12px',
                        borderBottom: `1px solid ${theme.border}`,
                        borderRight: `1px solid ${theme.border}`,
                        fontWeight: '600',
                        color: theme.accent,
                        fontSize: '13px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}>
                        {ganttGroupBy === 'pm' ? <User size={14} /> : <Building2 size={14} />}
                        {group.name}
                        <span style={{
                          backgroundColor: theme.accentBg,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '10px',
                          color: theme.accent
                        }}>
                          {group.jobs.length}
                        </span>
                      </div>
                      <div style={{ flex: 1, borderBottom: `1px solid ${theme.border}` }} />
                    </div>

                    {/* Jobs in Group */}
                    {group.jobs.map(job => {
                      const sections = getSectionsForJob(job.id)
                      const progress = calculateJobProgress(job.id)

                      return (
                        <div
                          key={job.id}
                          style={{
                            display: 'flex',
                            minHeight: rowHeight,
                            position: 'relative'
                          }}
                        >
                          {/* Job Label */}
                          <div
                            style={{
                              width: jobLabelWidth,
                              flexShrink: 0,
                              padding: '8px 12px',
                              borderBottom: `1px solid ${theme.border}`,
                              borderRight: `1px solid ${theme.border}`,
                              backgroundColor: theme.bgCard,
                              position: 'sticky',
                              left: 0,
                              zIndex: 1
                            }}
                          >
                            <div style={{
                              fontWeight: '500',
                              color: theme.text,
                              fontSize: '12px',
                              marginBottom: '4px',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap'
                            }}>
                              {job.title || `Job #${job.id}`}
                            </div>
                            <div style={{
                              fontSize: '10px',
                              color: theme.textMuted,
                              marginBottom: '4px'
                            }}>
                              {job.customer?.name}
                            </div>
                            {/* Mini progress bar */}
                            <div style={{
                              height: '4px',
                              backgroundColor: theme.border,
                              borderRadius: '2px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                height: '100%',
                                width: `${progress}%`,
                                backgroundColor: progress === 100 ? '#22c55e' : theme.accent,
                                borderRadius: '2px'
                              }} />
                            </div>
                          </div>

                          {/* Timeline Area */}
                          <div style={{
                            flex: 1,
                            position: 'relative',
                            borderBottom: `1px solid ${theme.border}`,
                            display: 'flex'
                          }}>
                            {/* Background grid */}
                            {ganttCols.map((col, i) => {
                              const isWeekendDay = isWeekend(col.date)
                              const isTodayCol = isToday(col.date)
                              return (
                                <div
                                  key={i}
                                  style={{
                                    width: colWidth,
                                    flexShrink: 0,
                                    borderRight: `1px solid ${theme.border}`,
                                    backgroundColor: isTodayCol ? 'rgba(90,99,73,0.08)' : isWeekendDay ? 'rgba(0,0,0,0.02)' : 'transparent'
                                  }}
                                />
                              )
                            })}

                            {/* Section Blocks */}
                            {sections.map(section => {
                              const pos = getSectionPosition(section)
                              if (!pos) return null

                              const statusColor = ganttSectionColors[section.status] || ganttSectionColors['Not Started']

                              return (
                                <div
                                  key={section.id}
                                  style={{
                                    position: 'absolute',
                                    left: pos.left,
                                    top: '8px',
                                    width: pos.width,
                                    height: rowHeight - 20,
                                    backgroundColor: statusColor,
                                    borderRadius: '4px',
                                    padding: '4px 6px',
                                    overflow: 'hidden',
                                    cursor: 'pointer',
                                    boxShadow: '0 1px 3px rgba(0,0,0,0.15)'
                                  }}
                                  title={`${section.name} - ${section.status} (${section.percent_of_job || 0}%)`}
                                >
                                  <div style={{
                                    fontWeight: '500',
                                    color: '#fff',
                                    fontSize: '10px',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap',
                                    textShadow: '0 1px 1px rgba(0,0,0,0.2)'
                                  }}>
                                    {section.name}
                                  </div>
                                  <div style={{
                                    fontSize: '9px',
                                    color: 'rgba(255,255,255,0.8)',
                                    marginTop: '2px'
                                  }}>
                                    {section.percent_of_job || 0}%
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                ))}

                {/* Empty state */}
                {groups.length === 0 && (
                  <div style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: theme.textMuted
                  }}>
                    No jobs found. Adjust filters or add new jobs.
                  </div>
                )}
              </div>
            )
          })()}
        </div>
      </div>
      )}

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
            maxWidth: '540px',
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
                  Manage calendars, statuses and sections
                </p>
              </div>
              <button
                onClick={() => {
                  setShowSettingsModal(false)
                  setShowCalendarForm(false)
                  setEditingCalendar(null)
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
              {/* Job Calendars Section */}
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>
                    <Layers size={14} style={{ marginRight: '6px', verticalAlign: 'middle' }} />
                    Job Calendars
                  </label>
                  <button
                    onClick={() => {
                      setShowCalendarForm(true)
                      setEditingCalendar(null)
                      setCalendarForm({ name: '', business_unit: '', color: calendarColors[jobCalendars.length % calendarColors.length] })
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '6px 12px',
                      minHeight: '36px',
                      backgroundColor: theme.accent,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer'
                    }}
                  >
                    <Plus size={14} />
                    Add Calendar
                  </button>
                </div>

                {/* Calendar Form */}
                {showCalendarForm && (
                  <div style={{
                    padding: '16px',
                    backgroundColor: theme.bg,
                    borderRadius: '8px',
                    marginBottom: '12px'
                  }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                      <div>
                        <label style={labelStyle}>Calendar Name *</label>
                        <input
                          type="text"
                          value={calendarForm.name}
                          onChange={(e) => setCalendarForm(prev => ({ ...prev, name: e.target.value }))}
                          placeholder="e.g., Plumbing Calendar"
                          style={inputStyle}
                        />
                      </div>
                      <div>
                        <label style={labelStyle}>Business Unit</label>
                        <select
                          value={calendarForm.business_unit}
                          onChange={(e) => setCalendarForm(prev => ({ ...prev, business_unit: e.target.value }))}
                          style={inputStyle}
                        >
                          <option value="">-- All Units --</option>
                          {businessUnits.map(unit => (
                            <option key={unit} value={unit}>{unit}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>Color</label>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                          {calendarColors.map(color => (
                            <button
                              key={color}
                              type="button"
                              onClick={() => setCalendarForm(prev => ({ ...prev, color }))}
                              style={{
                                width: '32px',
                                height: '32px',
                                borderRadius: '6px',
                                backgroundColor: color,
                                border: calendarForm.color === color ? '3px solid #000' : '2px solid transparent',
                                cursor: 'pointer',
                                boxShadow: calendarForm.color === color ? '0 0 0 2px #fff' : 'none'
                              }}
                            />
                          ))}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                        <button
                          onClick={() => {
                            setShowCalendarForm(false)
                            setEditingCalendar(null)
                          }}
                          style={{
                            flex: 1,
                            padding: '10px',
                            minHeight: '44px',
                            backgroundColor: 'transparent',
                            border: `1px solid ${theme.border}`,
                            borderRadius: '6px',
                            color: theme.text,
                            cursor: 'pointer'
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveCalendar}
                          style={{
                            flex: 1,
                            padding: '10px',
                            minHeight: '44px',
                            backgroundColor: theme.accent,
                            border: 'none',
                            borderRadius: '6px',
                            color: '#fff',
                            fontWeight: '500',
                            cursor: 'pointer'
                          }}
                        >
                          {editingCalendar ? 'Update' : 'Create'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Existing Calendars */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {jobCalendars.length === 0 && !showCalendarForm && (
                    <div style={{
                      padding: '16px',
                      backgroundColor: theme.bg,
                      borderRadius: '8px',
                      textAlign: 'center',
                      color: theme.textMuted,
                      fontSize: '13px'
                    }}>
                      No calendars created yet. Add calendars to organize jobs by business unit.
                    </div>
                  )}
                  {jobCalendars.map(cal => (
                    <div
                      key={cal.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '12px',
                        backgroundColor: theme.bg,
                        borderRadius: '8px',
                        borderLeft: `4px solid ${cal.color}`
                      }}
                    >
                      <div style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        backgroundColor: cal.color,
                        flexShrink: 0
                      }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>{cal.name}</div>
                        {cal.business_unit && (
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>{cal.business_unit}</div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          setEditingCalendar(cal)
                          setCalendarForm({ name: cal.name, business_unit: cal.business_unit || '', color: cal.color })
                          setShowCalendarForm(true)
                        }}
                        style={{
                          padding: '6px',
                          minWidth: '32px',
                          minHeight: '32px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: theme.textMuted,
                          cursor: 'pointer',
                          borderRadius: '4px'
                        }}
                      >
                        <Edit2 size={14} />
                      </button>
                      <button
                        onClick={() => handleDeleteCalendar(cal.id)}
                        style={{
                          padding: '6px',
                          minWidth: '32px',
                          minHeight: '32px',
                          backgroundColor: 'transparent',
                          border: 'none',
                          color: '#ef4444',
                          cursor: 'pointer',
                          borderRadius: '4px'
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

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
              </div>

              {/* Section Status Options */}
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
                onClick={() => {
                  setShowSettingsModal(false)
                  setShowCalendarForm(false)
                  setEditingCalendar(null)
                }}
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

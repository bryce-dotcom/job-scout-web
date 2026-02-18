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
  Palette, Edit2, Layers, ChevronUp
} from 'lucide-react'
import EntityCard from '../components/EntityCard'

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

// Default status colors (used when store value is plain string)
const defaultStatusColors = {
  'Scheduled': '#3b82f6',
  'In Progress': '#f59e0b',
  'On Hold': '#6b7280',
  'Complete': '#22c55e',
  'Not Started': '#9ca3af',
  'Verified': '#8b5cf6'
}

// Status icons
const statusIcons = {
  'Scheduled': Calendar,
  'In Progress': PlayCircle,
  'On Hold': PauseCircle,
  'Complete': CheckCircle2,
  'Not Started': AlertCircle,
  'Verified': CheckCircle2
}

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

export default function PMJobSetter() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const employees = useStore((state) => state.employees)
  const businessUnits = useStore((state) => state.businessUnits)
  const fetchSettings = useStore((state) => state.fetchSettings)
  const createJobSection = useStore((state) => state.createJobSection)
  const updateJobSection = useStore((state) => state.updateJobSection)

  // Data-driven statuses from store
  const storeJobStatuses = useStore((state) => state.jobStatuses)
  const storeJobSectionStatuses = useStore((state) => state.jobSectionStatuses)
  const storeJobCalendars = useStore((state) => state.jobCalendars)

  // Normalize statuses to objects with id, name, color
  const normalizeStatuses = (statuses, defaultColors = defaultStatusColors) => {
    if (!statuses || statuses.length === 0) return []
    return statuses.map((s, idx) => {
      if (typeof s === 'string') {
        return { id: s, name: s, color: defaultColors[s] || calendarColors[idx % calendarColors.length] }
      }
      return { id: s.id || s.name, name: s.name, color: s.color || defaultColors[s.name] || calendarColors[idx % calendarColors.length] }
    })
  }

  // Use normalized versions
  const jobStatuses = normalizeStatuses(storeJobStatuses, defaultStatusColors)
  const sectionStatuses = normalizeStatuses(storeJobSectionStatuses, defaultStatusColors)
  const jobCalendarsFromStore = storeJobCalendars || []

  // Data
  const [jobs, setJobs] = useState([])
  const [jobSections, setJobSections] = useState([])
  const [loading, setLoading] = useState(true)
  const [jobCalendars, setJobCalendars] = useState([])

  // Settings modal state
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsTab, setSettingsTab] = useState('job_statuses') // job_statuses, section_statuses, calendars
  const [statusForm, setStatusForm] = useState([])
  const [sectionStatusForm, setSectionStatusForm] = useState([])
  const [calendarsForm, setCalendarsForm] = useState([])
  const [isSaving, setIsSaving] = useState(false)

  // Calendar management
  const [selectedCalendar, setSelectedCalendar] = useState('all')
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
  const [showSectionModal, setShowSectionModal] = useState(false)
  const [selectedSection, setSelectedSection] = useState(null)
  const [selectedJob, setSelectedJob] = useState(null)

  // Filters
  const [filterPM, setFilterPM] = useState('')
  const [filterBusinessUnit, setFilterBusinessUnit] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  // View Mode
  const [viewMode, setViewMode] = useState('kanban')
  const [ganttGroupBy, setGanttGroupBy] = useState('pm')
  const [zoomLevel, setZoomLevel] = useState('week')
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
      .select('*, customer:customers(id, name, business_name, address), pm:employees!jobs_pm_id_fkey(id, name)')
      .eq('company_id', companyId)
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

  // Initialize settings forms when modal opens
  const openSettingsModal = () => {
    // Initialize job statuses form
    setStatusForm(jobStatuses.map(s => ({ ...s })))
    setSectionStatusForm(sectionStatuses.map(s => ({ ...s })))
    setCalendarsForm(jobCalendars.map(c => ({ ...c })))
    setShowSettingsModal(true)
  }

  // Save settings to Supabase
  const saveSetting = async (key, value) => {
    const { data: existing } = await supabase
      .from('settings')
      .select('id')
      .eq('company_id', companyId)
      .eq('key', key)
      .single()

    if (existing) {
      await supabase
        .from('settings')
        .update({ value: JSON.stringify(value) })
        .eq('id', existing.id)
    } else {
      await supabase
        .from('settings')
        .insert({ company_id: companyId, key, value: JSON.stringify(value) })
    }
  }

  // Save all settings
  const saveAllSettings = async () => {
    setIsSaving(true)
    try {
      // Save job statuses
      const jobStatusesToSave = statusForm.filter(s => s.name?.trim()).map(s => ({
        id: s.name.trim(),
        name: s.name.trim(),
        color: s.color
      }))
      await saveSetting('job_statuses', jobStatusesToSave)

      // Save section statuses
      const sectionStatusesToSave = sectionStatusForm.filter(s => s.name?.trim()).map(s => ({
        id: s.name.trim(),
        name: s.name.trim(),
        color: s.color
      }))
      await saveSetting('job_section_statuses', sectionStatusesToSave)

      // Save calendars
      await saveSetting('job_calendars', calendarsForm)
      setJobCalendars(calendarsForm)

      // Refresh store settings
      await fetchSettings()

      setShowSettingsModal(false)
    } catch (error) {
      console.error('Error saving settings:', error)
    }
    setIsSaving(false)
  }

  // Status form helpers
  const addStatus = (formSetter, form) => {
    formSetter([...form, { id: '', name: '', color: calendarColors[form.length % calendarColors.length], isNew: true }])
  }

  const updateStatus = (formSetter, form, index, field, value) => {
    const updated = [...form]
    updated[index] = { ...updated[index], [field]: value }
    formSetter(updated)
  }

  const deleteStatus = (formSetter, form, index) => {
    formSetter(form.filter((_, i) => i !== index))
  }

  const moveStatusUp = (formSetter, form, index) => {
    if (index === 0) return
    const updated = [...form]
    ;[updated[index - 1], updated[index]] = [updated[index], updated[index - 1]]
    formSetter(updated)
  }

  const moveStatusDown = (formSetter, form, index) => {
    if (index >= form.length - 1) return
    const updated = [...form]
    ;[updated[index], updated[index + 1]] = [updated[index + 1], updated[index]]
    formSetter(updated)
  }

  // Calendar form helpers
  const addCalendar = () => {
    setCalendarsForm([...calendarsForm, {
      id: Date.now().toString(),
      name: '',
      business_unit: '',
      color: calendarColors[calendarsForm.length % calendarColors.length]
    }])
  }

  const updateCalendar = (index, field, value) => {
    const updated = [...calendarsForm]
    updated[index] = { ...updated[index], [field]: value }
    setCalendarsForm(updated)
  }

  const deleteCalendar = (index) => {
    setCalendarsForm(calendarsForm.filter((_, i) => i !== index))
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
    if (selectedCalendar !== 'all') {
      const cal = jobCalendars.find(c => c.id === selectedCalendar)
      if (cal?.business_unit) {
        pms = pms.filter(pm => pm.business_unit === cal.business_unit || !pm.business_unit)
      }
    }
    if (filterBusinessUnit) {
      pms = pms.filter(pm => pm.business_unit === filterBusinessUnit || !pm.business_unit)
    }
    return pms
  }

  const projectManagers = getProjectManagers()

  // Filter jobs
  const getFilteredJobs = () => {
    let filtered = jobs

    // Only show jobs with statuses that exist in our jobStatuses
    const validStatuses = jobStatuses.map(s => s.id)
    if (validStatuses.length > 0) {
      filtered = filtered.filter(j => validStatuses.includes(j.status))
    }

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
        j.job_title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
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

  // Get section status color
  const getSectionStatusColor = (status) => {
    const found = sectionStatuses.find(s => s.id === status || s.name === status)
    if (found) return { bg: found.color + '20', text: found.color }
    return { bg: '#f3f4f6', text: '#6b7280' }
  }

  // Get calendar for a job based on business unit
  const getCalendarForJob = (job) => {
    if (!job.business_unit) return null
    return jobCalendars.find(c => c.business_unit === job.business_unit)
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

      // Filter by selected calendar (via job's business unit)
      if (selectedCalendar !== 'all') {
        const job = jobs.find(j => j.id === section.job_id)
        const cal = jobCalendars.find(c => c.id === selectedCalendar)
        if (cal?.business_unit && job?.business_unit !== cal.business_unit) {
          return false
        }
      }

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

  // Drag handlers
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

    if (!draggedSection) return

    await updateJobSection(draggedSection.id, {
      status: statusId,
      updated_at: new Date().toISOString()
    })

    setDraggedSection(null)
    await fetchData()
  }

  // Add new section
  const handleAddSection = async (e) => {
    e.preventDefault()
    if (!selectedJob || !sectionForm.name) return

    await createJobSection({
      company_id: companyId,
      job_id: selectedJob.id,
      name: sectionForm.name,
      description: sectionForm.description,
      percent_of_job: parseFloat(sectionForm.percent_of_job) || 0,
      assigned_to: sectionForm.assigned_to || null,
      estimated_hours: parseFloat(sectionForm.estimated_hours) || null,
      scheduled_date: sectionForm.scheduled_date || null,
      status: sectionStatuses[0]?.id || 'Not Started',
      sort_order: getSectionsForJob(selectedJob.id).length
    })

    setShowSectionModal(false)
    setSectionForm({ name: '', description: '', percent_of_job: 0, assigned_to: '', estimated_hours: '', scheduled_date: '' })
    setSelectedJob(null)
    await fetchData()
  }

  // Update section status
  const updateSectionStatus = async (sectionId, newStatus) => {
    await updateJobSection(sectionId, { status: newStatus, updated_at: new Date().toISOString() })
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
      end.setDate(start.getDate() + 27)
      colCount = 28
      colWidth = isMobile ? 30 : 40
    } else if (zoomLevel === 'month') {
      start.setDate(1)
      end = new Date(start.getFullYear(), start.getMonth() + 3, 0)
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
    const widthDays = Math.max(0.5, hours / 8)

    return {
      left: daysDiff * colWidth,
      width: Math.max(colWidth * widthDays, 40)
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
      const html2canvas = (await import('html2canvas')).default

      const canvas = await html2canvas(ganttRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: theme.bgCard
      })

      const { jsPDF } = await import('jspdf')

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'landscape',
        unit: 'px',
        format: [canvas.width / 2, canvas.height / 2 + 100]
      })

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

  // Render status list in settings
  const renderStatusList = (form, setForm, title) => (
    <div>
      <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 12px' }}>
        {title}
      </h3>
      {form.map((status, index) => {
        const canMoveUp = index > 0
        const canMoveDown = index < form.length - 1

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
                onClick={() => moveStatusUp(setForm, form, index)}
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
                onClick={() => moveStatusDown(setForm, form, index)}
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
              value={status.color || '#3b82f6'}
              onChange={(e) => updateStatus(setForm, form, index, 'color', e.target.value)}
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
              value={status.name || ''}
              onChange={(e) => updateStatus(setForm, form, index, 'name', e.target.value)}
              placeholder="Status name"
              style={{
                ...inputStyle,
                flex: 1,
                minHeight: '36px',
                padding: '8px 10px'
              }}
            />
            <button
              onClick={() => deleteStatus(setForm, form, index)}
              style={{
                padding: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#dc2626'
              }}
              title="Delete status"
            >
              <Trash2 size={16} />
            </button>
          </div>
        )
      })}

      <button
        onClick={() => addStatus(setForm, form)}
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
          marginTop: '8px',
          minHeight: '44px'
        }}
      >
        <Plus size={16} />
        Add Status
      </button>
    </div>
  )

  // Render calendars list in settings
  const renderCalendarsList = () => (
    <div>
      <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 12px' }}>
        Job Calendars
      </h3>
      <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 12px' }}>
        Create calendars for different business units to organize jobs
      </p>
      {calendarsForm.map((cal, index) => (
        <div
          key={cal.id}
          style={{
            padding: '12px',
            backgroundColor: theme.bg,
            borderRadius: '6px',
            marginBottom: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <input
              type="color"
              value={cal.color || '#3b82f6'}
              onChange={(e) => updateCalendar(index, 'color', e.target.value)}
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
              value={cal.name}
              onChange={(e) => updateCalendar(index, 'name', e.target.value)}
              placeholder="Calendar name"
              style={{
                ...inputStyle,
                flex: 1,
                minHeight: '36px',
                padding: '8px 10px'
              }}
            />
            <button
              onClick={() => deleteCalendar(index)}
              style={{
                padding: '8px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: '#dc2626'
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
          <select
            value={cal.business_unit || ''}
            onChange={(e) => updateCalendar(index, 'business_unit', e.target.value)}
            style={{ ...inputStyle, minHeight: '36px', padding: '6px 10px' }}
          >
            <option value="">Select Business Unit</option>
            {businessUnits.map(unit => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </div>
      ))}

      <button
        onClick={addCalendar}
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
          marginTop: '8px',
          minHeight: '44px'
        }}
      >
        <Plus size={16} />
        Add Calendar
      </button>
    </div>
  )

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
            onClick={openSettingsModal}
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
          {jobStatuses.length > 0 && (
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
                  <div style={{ fontSize: '10px', color: theme.textMuted }}>{status.name}</div>
                </div>
              ))}
            </div>
          )}

          {/* Kanban Columns */}
          {jobStatuses.length === 0 ? (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              backgroundColor: theme.bgCard,
              borderRadius: '8px',
              border: `1px solid ${theme.border}`
            }}>
              <AlertCircle size={32} style={{ color: theme.textMuted, marginBottom: '12px' }} />
              <p style={{ fontSize: '14px', color: theme.textSecondary, margin: '0 0 12px' }}>
                No job statuses configured
              </p>
              <button
                onClick={openSettingsModal}
                style={{
                  padding: '10px 16px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  minHeight: '44px'
                }}
              >
                Configure Statuses
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', flex: 1, overflow: 'hidden' }}>
              {jobStatuses.map(status => {
                const StatusIcon = statusIcons[status.name] || Briefcase
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
                      <span>{status.name.split(' ')[0]}</span>
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
                        const calendar = getCalendarForJob(job)

                        return (
                          <div key={job.id}>
                            {/* Job Card */}
                            <EntityCard
                              name={job.customer?.name}
                              businessName={job.customer?.business_name}
                              style={{ padding: '0px', overflow: 'hidden', fontSize: '12px' }}
                            >
                              {/* Job Header */}
                              <div
                                onClick={() => toggleJobExpanded(job.id)}
                                style={{
                                  padding: '8px 10px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '6px'
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronDown size={14} style={{ color: theme.textMuted, flexShrink: 0, marginTop: '2px' }} />
                                ) : (
                                  <ChevronRight size={14} style={{ color: theme.textMuted, flexShrink: 0, marginTop: '2px' }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    fontSize: '12px',
                                    fontWeight: '600',
                                    color: theme.text,
                                    marginBottom: '2px',
                                    whiteSpace: 'nowrap',
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis'
                                  }}>
                                    {job.job_title || `Job #${job.id}`}
                                  </div>
                                  <div style={{ fontSize: '10px', color: theme.textMuted, marginBottom: '4px' }}>
                                    {job.customer?.name}
                                  </div>

                                  {/* Progress Bar */}
                                  <div style={{
                                    height: '4px',
                                    backgroundColor: theme.border,
                                    borderRadius: '2px',
                                    overflow: 'hidden',
                                    marginBottom: '4px'
                                  }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${progress}%`,
                                      backgroundColor: progress === 100 ? '#22c55e' : '#3b82f6',
                                      borderRadius: '2px',
                                      transition: 'width 0.3s'
                                    }} />
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '9px', color: theme.textMuted }}>
                                      {Math.round(progress)}% complete
                                    </span>
                                    {job.pm?.name && (
                                      <span style={{ fontSize: '9px', color: theme.textSecondary }}>
                                        <User size={9} style={{ marginRight: '2px' }} />
                                        {job.pm.name}
                                      </span>
                                    )}
                                    {job.start_date && (
                                      <span style={{ fontSize: '9px', color: theme.textSecondary }}>
                                        <Calendar size={9} style={{ marginRight: '2px' }} />
                                        {new Date(job.start_date).toLocaleDateString()}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Expanded Sections */}
                              {isExpanded && (
                                <div style={{
                                  borderTop: `1px solid ${theme.border}`,
                                  padding: '6px',
                                  backgroundColor: theme.bg
                                }}>
                                  {sections.length === 0 ? (
                                    <div style={{ fontSize: '10px', color: theme.textMuted, textAlign: 'center', padding: '8px' }}>
                                      No sections yet
                                    </div>
                                  ) : (
                                    sections.map(section => {
                                      const statusColor = getSectionStatusColor(section.status)
                                      return (
                                        <div
                                          key={section.id}
                                          draggable
                                          onDragStart={(e) => handleSectionDragStart(e, section, job)}
                                          onDragEnd={handleDragEnd}
                                          style={{
                                            backgroundColor: theme.bgCard,
                                            borderRadius: '4px',
                                            padding: '6px 8px',
                                            marginBottom: '4px',
                                            border: `1px solid ${theme.border}`,
                                            cursor: 'grab',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '6px'
                                          }}
                                        >
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                              fontSize: '11px',
                                              fontWeight: '500',
                                              color: theme.text,
                                              whiteSpace: 'nowrap',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis'
                                            }}>
                                              {section.name}
                                            </div>
                                            <div style={{ fontSize: '9px', color: theme.textMuted }}>
                                              {section.percent_of_job || 0}%
                                              {section.assigned_employee?.name && ` · ${section.assigned_employee.name}`}
                                            </div>
                                          </div>
                                          <select
                                            value={section.status}
                                            onChange={(e) => {
                                              e.stopPropagation()
                                              updateSectionStatus(section.id, e.target.value)
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                              padding: '2px 4px',
                                              fontSize: '9px',
                                              borderRadius: '4px',
                                              border: 'none',
                                              backgroundColor: statusColor.bg,
                                              color: statusColor.text,
                                              cursor: 'pointer',
                                              fontWeight: '500'
                                            }}
                                          >
                                            {sectionStatuses.map(s => (
                                              <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                          </select>
                                        </div>
                                      )
                                    })
                                  )}

                                  {/* Add Section Button */}
                                  <button
                                    onClick={() => {
                                      setSelectedJob(job)
                                      setShowSectionModal(true)
                                    }}
                                    style={{
                                      width: '100%',
                                      padding: '6px',
                                      backgroundColor: 'transparent',
                                      border: `1px dashed ${theme.border}`,
                                      borderRadius: '4px',
                                      color: theme.textMuted,
                                      cursor: 'pointer',
                                      fontSize: '10px',
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      gap: '4px',
                                      minHeight: '28px'
                                    }}
                                  >
                                    <Plus size={10} />
                                    Add Section
                                  </button>
                                </div>
                              )}
                            </EntityCard>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Right: Calendar */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          {/* Calendar Header */}
          <div style={{
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={prevWeek}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '36px',
                  minHeight: '36px',
                  color: theme.textSecondary
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToToday}
                style={{
                  padding: '6px 12px',
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  minHeight: '36px'
                }}
              >
                Today
              </button>
              <button
                onClick={nextWeek}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '36px',
                  minHeight: '36px',
                  color: theme.textSecondary
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
              {weekDays[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
          </div>

          {/* Calendar Legend - show when viewing all calendars */}
          {selectedCalendar === 'all' && jobCalendars.length > 0 && (
            <div style={{
              padding: '8px 16px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              flexWrap: 'wrap',
              backgroundColor: theme.bg
            }}>
              <span style={{ fontSize: '11px', color: theme.textMuted, fontWeight: '500' }}>Calendars:</span>
              {jobCalendars.map(cal => (
                <div
                  key={cal.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '11px',
                    color: theme.textSecondary
                  }}
                >
                  <div style={{
                    width: '10px',
                    height: '10px',
                    borderRadius: '2px',
                    backgroundColor: cal.color
                  }} />
                  <span>{cal.name}</span>
                  {cal.business_unit && (
                    <span style={{ fontSize: '10px', color: theme.textMuted }}>({cal.business_unit})</span>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Calendar Grid */}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <div style={{ display: 'flex', minWidth: '700px' }}>
              {/* Time Column */}
              <div style={{ width: '60px', flexShrink: 0 }}>
                <div style={{ height: '40px', borderBottom: `1px solid ${theme.border}` }} />
                {hourSlots.map(hour => (
                  <div
                    key={hour}
                    style={{
                      height: '60px',
                      padding: '4px 8px',
                      fontSize: '10px',
                      color: theme.textMuted,
                      borderBottom: `1px solid ${theme.border}`,
                      textAlign: 'right'
                    }}
                  >
                    {formatTime(hour)}
                  </div>
                ))}
              </div>

              {/* Day Columns */}
              {weekDays.map(day => (
                <div
                  key={day.toISOString()}
                  style={{
                    flex: 1,
                    minWidth: '100px',
                    borderLeft: `1px solid ${theme.border}`
                  }}
                >
                  {/* Day Header */}
                  <div style={{
                    height: '40px',
                    padding: '8px',
                    textAlign: 'center',
                    borderBottom: `1px solid ${theme.border}`,
                    backgroundColor: isToday(day) ? theme.accentBg : 'transparent'
                  }}>
                    <div style={{ fontSize: '10px', color: theme.textMuted }}>
                      {day.toLocaleDateString('en-US', { weekday: 'short' })}
                    </div>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: isToday(day) ? '700' : '500',
                      color: isToday(day) ? theme.accent : theme.text
                    }}>
                      {day.getDate()}
                    </div>
                  </div>

                  {/* Hour Slots */}
                  {hourSlots.map(hour => {
                    const slotSections = getSectionsForSlot(day, hour)
                    const isOver = dragOverSlot?.date?.toDateString() === day.toDateString() && dragOverSlot?.hour === hour

                    return (
                      <div
                        key={hour}
                        onDragOver={(e) => handleSlotDragOver(e, day, hour)}
                        onDrop={(e) => handleSlotDrop(e, day, hour)}
                        style={{
                          height: '60px',
                          borderBottom: `1px solid ${theme.border}`,
                          padding: '2px',
                          backgroundColor: isOver ? theme.accentBg : 'transparent',
                          transition: 'background-color 0.15s'
                        }}
                      >
                        {slotSections.map(section => {
                          const job = jobs.find(j => j.id === section.job_id)
                          const calendar = job ? getCalendarForJob(job) : null
                          const statusColor = getSectionStatusColor(section.status)
                          const calColor = calendar?.color || theme.accent

                          return (
                            <div
                              key={section.id}
                              draggable
                              onDragStart={(e) => handleSectionDragStart(e, section, job)}
                              onDragEnd={handleDragEnd}
                              style={{
                                backgroundColor: calendar ? `${calColor}15` : statusColor.bg,
                                borderRadius: '4px',
                                padding: '4px 6px',
                                marginBottom: '2px',
                                cursor: 'grab',
                                fontSize: '10px',
                                color: calendar ? calColor : statusColor.text,
                                fontWeight: '500',
                                borderLeft: `3px solid ${calColor}`,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                position: 'relative'
                              }}
                              title={`${section.name} - ${job?.job_title || 'Unknown Job'}${calendar ? ` (${calendar.name})` : ''}`}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                {calendar && (
                                  <div style={{
                                    width: '6px',
                                    height: '6px',
                                    borderRadius: '50%',
                                    backgroundColor: calColor,
                                    flexShrink: 0
                                  }} />
                                )}
                                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{section.name}</span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
      ) : (
        /* Gantt View */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Gantt Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '12px',
            gap: '12px',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={prevGanttPeriod}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '36px',
                  minHeight: '36px',
                  color: theme.textSecondary
                }}
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={goToGanttToday}
                style={{
                  padding: '6px 12px',
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  minHeight: '36px'
                }}
              >
                Today
              </button>
              <button
                onClick={nextGanttPeriod}
                style={{
                  padding: '8px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: '36px',
                  minHeight: '36px',
                  color: theme.textSecondary
                }}
              >
                <ChevronRight size={16} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {/* Group By */}
              <select
                value={ganttGroupBy}
                onChange={(e) => setGanttGroupBy(e.target.value)}
                style={{ ...inputStyle, width: 'auto', minWidth: '120px' }}
              >
                <option value="pm">By PM</option>
                <option value="unit">By Unit</option>
              </select>

              {/* Zoom */}
              <div style={{
                display: 'flex',
                backgroundColor: theme.bg,
                borderRadius: '6px',
                padding: '2px',
                border: `1px solid ${theme.border}`
              }}>
                {['day', 'week', 'month'].map(level => (
                  <button
                    key={level}
                    onClick={() => setZoomLevel(level)}
                    style={{
                      padding: '6px 10px',
                      backgroundColor: zoomLevel === level ? theme.bgCard : 'transparent',
                      border: 'none',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: zoomLevel === level ? '600' : '400',
                      color: zoomLevel === level ? theme.accent : theme.textMuted,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      minHeight: '32px'
                    }}
                  >
                    {level}
                  </button>
                ))}
              </div>

              {/* Export */}
              <button
                onClick={exportGanttToPDF}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '8px 12px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  minHeight: '36px'
                }}
              >
                <Download size={14} />
                {!isMobile && 'Export PDF'}
              </button>
            </div>
          </div>

          {/* Calendar Legend for Gantt */}
          {jobCalendars.length > 0 && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '12px',
              padding: '10px 16px',
              backgroundColor: theme.bgCard,
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              flexWrap: 'wrap'
            }}>
              <span style={{ fontSize: '12px', color: theme.textMuted, fontWeight: '500' }}>Calendar Colors:</span>
              {jobCalendars.map(cal => (
                <div
                  key={cal.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '12px',
                    color: theme.textSecondary
                  }}
                >
                  <div style={{
                    width: '14px',
                    height: '14px',
                    borderRadius: '3px',
                    backgroundColor: cal.color
                  }} />
                  <span>{cal.name}</span>
                </div>
              ))}
            </div>
          )}

          {/* Gantt Chart */}
          <div
            ref={ganttRef}
            style={{
              flex: 1,
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              overflow: 'auto'
            }}
          >
            <div style={{ display: 'flex', minWidth: 'max-content' }}>
              {/* Left Labels */}
              <div style={{
                width: isMobile ? '120px' : '180px',
                flexShrink: 0,
                borderRight: `1px solid ${theme.border}`,
                position: 'sticky',
                left: 0,
                backgroundColor: theme.bgCard,
                zIndex: 2
              }}>
                {/* Header */}
                <div style={{
                  height: '50px',
                  padding: '12px',
                  borderBottom: `1px solid ${theme.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  fontSize: '12px',
                  fontWeight: '600',
                  color: theme.text
                }}>
                  {ganttGroupBy === 'pm' ? 'Project Manager' : 'Business Unit'}
                </div>

                {/* Groups */}
                {getGroupedJobs().map(group => (
                  <div key={group.id}>
                    <div style={{
                      padding: '8px 12px',
                      backgroundColor: theme.bg,
                      borderBottom: `1px solid ${theme.border}`,
                      fontSize: '12px',
                      fontWeight: '600',
                      color: theme.text
                    }}>
                      {group.name}
                    </div>
                    {group.jobs.map(job => (
                      <div
                        key={job.id}
                        style={{
                          height: '40px',
                          padding: '8px 12px',
                          borderBottom: `1px solid ${theme.border}`,
                          fontSize: '11px',
                          color: theme.textSecondary,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          overflow: 'hidden'
                        }}
                      >
                        <span style={{
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis'
                        }}>
                          {job.job_title || `Job #${job.id}`}
                        </span>
                      </div>
                    ))}
                  </div>
                ))}
              </div>

              {/* Timeline */}
              <div style={{ flex: 1 }}>
                {/* Date Headers */}
                <div style={{
                  height: '50px',
                  display: 'flex',
                  borderBottom: `1px solid ${theme.border}`,
                  position: 'sticky',
                  top: 0,
                  backgroundColor: theme.bgCard,
                  zIndex: 1
                }}>
                  {getGanttColumns().map((col, i) => (
                    <div
                      key={i}
                      style={{
                        width: `${col.width}px`,
                        flexShrink: 0,
                        padding: '4px',
                        borderRight: `1px solid ${theme.border}`,
                        textAlign: 'center',
                        fontSize: '10px',
                        color: isWeekend(col.date) ? theme.textMuted : theme.textSecondary,
                        backgroundColor: isWeekend(col.date) ? 'rgba(0,0,0,0.02)' : 'transparent',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'center'
                      }}
                    >
                      {formatGanttDate(col.date)}
                    </div>
                  ))}
                </div>

                {/* Job Rows */}
                {getGroupedJobs().map(group => (
                  <div key={group.id}>
                    {/* Group Header Row */}
                    <div style={{
                      height: '28px',
                      backgroundColor: theme.bg,
                      borderBottom: `1px solid ${theme.border}`,
                      display: 'flex'
                    }}>
                      {getGanttColumns().map((col, i) => (
                        <div
                          key={i}
                          style={{
                            width: `${col.width}px`,
                            flexShrink: 0,
                            borderRight: `1px solid ${theme.border}`,
                            backgroundColor: isWeekend(col.date) ? 'rgba(0,0,0,0.02)' : 'transparent'
                          }}
                        />
                      ))}
                    </div>

                    {/* Job Rows */}
                    {group.jobs.map(job => {
                      const sections = getSectionsForJob(job.id)
                      return (
                        <div
                          key={job.id}
                          style={{
                            height: '40px',
                            borderBottom: `1px solid ${theme.border}`,
                            display: 'flex',
                            position: 'relative'
                          }}
                        >
                          {/* Grid Lines */}
                          {getGanttColumns().map((col, i) => (
                            <div
                              key={i}
                              style={{
                                width: `${col.width}px`,
                                flexShrink: 0,
                                borderRight: `1px solid ${theme.border}`,
                                backgroundColor: isWeekend(col.date) ? 'rgba(0,0,0,0.02)' : 'transparent'
                              }}
                            />
                          ))}

                          {/* Section Bars */}
                          {sections.map(section => {
                            const pos = getSectionPosition(section)
                            if (!pos) return null

                            const statusColor = getSectionStatusColor(section.status)
                            const calendar = getCalendarForJob(job)
                            const barColor = calendar?.color || statusColor.text

                            return (
                              <div
                                key={section.id}
                                style={{
                                  position: 'absolute',
                                  top: '6px',
                                  left: `${pos.left}px`,
                                  width: `${pos.width}px`,
                                  height: '28px',
                                  backgroundColor: barColor,
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  fontSize: '9px',
                                  color: '#fff',
                                  fontWeight: '500',
                                  overflow: 'hidden',
                                  whiteSpace: 'nowrap',
                                  textOverflow: 'ellipsis',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'center',
                                  boxShadow: '0 1px 2px rgba(0,0,0,0.1)'
                                }}
                                title={`${section.name} (${section.status})${calendar ? ` - ${calendar.name}` : ''}`}
                              >
                                {section.name}
                              </div>
                            )
                          })}
                        </div>
                      )
                    })}
                  </div>
                ))}
              </div>
            </div>
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
            maxWidth: '500px',
            maxHeight: '80vh',
            display: 'flex',
            flexDirection: 'column'
          }}>
            {/* Modal Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Job Board Settings
                </h2>
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: '2px 0 0' }}>
                  Configure statuses and calendars
                </p>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div style={{
              display: 'flex',
              borderBottom: `1px solid ${theme.border}`,
              padding: '0 20px'
            }}>
              {[
                { id: 'job_statuses', label: 'Job Statuses' },
                { id: 'section_statuses', label: 'Section Statuses' },
                { id: 'calendars', label: 'Calendars' }
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setSettingsTab(tab.id)}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderBottom: settingsTab === tab.id ? `2px solid ${theme.accent}` : '2px solid transparent',
                    color: settingsTab === tab.id ? theme.accent : theme.textMuted,
                    fontSize: '13px',
                    fontWeight: settingsTab === tab.id ? '600' : '400',
                    cursor: 'pointer',
                    marginBottom: '-1px'
                  }}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Tab Content */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
              {settingsTab === 'job_statuses' && renderStatusList(statusForm, setStatusForm, 'Job Statuses')}
              {settingsTab === 'section_statuses' && renderStatusList(sectionStatusForm, setSectionStatusForm, 'Section Statuses')}
              {settingsTab === 'calendars' && renderCalendarsList()}
            </div>

            {/* Modal Footer */}
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
                  fontSize: '13px',
                  minHeight: '44px'
                }}
              >
                Cancel
              </button>
              <button
                onClick={saveAllSettings}
                disabled={isSaving}
                style={{
                  flex: 1,
                  padding: '10px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: isSaving ? 'not-allowed' : 'pointer',
                  fontWeight: '500',
                  fontSize: '13px',
                  minHeight: '44px',
                  opacity: isSaving ? 0.7 : 1
                }}
              >
                {isSaving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Section Modal */}
      {showSectionModal && (
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
            maxWidth: '400px',
            padding: '20px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '16px'
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
                Add Section to {selectedJob?.title || `Job #${selectedJob?.id}`}
              </h2>
              <button
                onClick={() => {
                  setShowSectionModal(false)
                  setSelectedJob(null)
                }}
                style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAddSection}>
              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Section Name *</label>
                <input
                  type="text"
                  value={sectionForm.name}
                  onChange={(e) => setSectionForm({ ...sectionForm, name: e.target.value })}
                  style={inputStyle}
                  placeholder="e.g., Foundation Work"
                  required
                />
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Description</label>
                <textarea
                  value={sectionForm.description}
                  onChange={(e) => setSectionForm({ ...sectionForm, description: e.target.value })}
                  style={{ ...inputStyle, minHeight: '80px', resize: 'vertical' }}
                  placeholder="What work is included?"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '12px' }}>
                <div>
                  <label style={labelStyle}>% of Job</label>
                  <input
                    type="number"
                    value={sectionForm.percent_of_job}
                    onChange={(e) => setSectionForm({ ...sectionForm, percent_of_job: e.target.value })}
                    style={inputStyle}
                    min="0"
                    max="100"
                  />
                </div>
                <div>
                  <label style={labelStyle}>Est. Hours</label>
                  <input
                    type="number"
                    value={sectionForm.estimated_hours}
                    onChange={(e) => setSectionForm({ ...sectionForm, estimated_hours: e.target.value })}
                    style={inputStyle}
                    min="0"
                    step="0.5"
                  />
                </div>
              </div>

              <div style={{ marginBottom: '12px' }}>
                <label style={labelStyle}>Assigned To</label>
                <select
                  value={sectionForm.assigned_to}
                  onChange={(e) => setSectionForm({ ...sectionForm, assigned_to: e.target.value })}
                  style={inputStyle}
                >
                  <option value="">Select employee</option>
                  {employees.map(emp => (
                    <option key={emp.id} value={emp.id}>{emp.name}</option>
                  ))}
                </select>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Scheduled Date</label>
                <input
                  type="date"
                  value={sectionForm.scheduled_date}
                  onChange={(e) => setSectionForm({ ...sectionForm, scheduled_date: e.target.value })}
                  style={inputStyle}
                />
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowSectionModal(false)
                    setSelectedJob(null)
                  }}
                  style={{
                    flex: 1,
                    padding: '10px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent',
                    color: theme.text,
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    minHeight: '44px'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
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
                    minHeight: '44px'
                  }}
                >
                  Add Section
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

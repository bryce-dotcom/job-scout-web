import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import HelpBadge from '../components/HelpBadge'
import { isManager as checkManager } from '../lib/accessControl'
import {
  ChevronDown, ChevronRight, ChevronLeft, X, Calendar, Clock, User, MapPin, Map,
  RefreshCw, Filter, Search, Settings, Plus, Briefcase, CheckCircle2,
  AlertCircle, PauseCircle, PlayCircle, ClipboardList, CalendarPlus, Trash2,
  LayoutGrid, GanttChart, Download, ZoomIn, ZoomOut, Users, Building2,
  Palette, Edit2, Layers, ChevronUp, MessageSquare, Mail, Phone, ExternalLink
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
  const company = useStore((state) => state.company)
  const user = useStore((state) => state.user)
  const employees = useStore((state) => state.employees)
  const businessUnits = useStore((state) => state.businessUnits)
  const fetchSettings = useStore((state) => state.fetchSettings)
  const createJobSection = useStore((state) => state.createJobSection)
  const updateJobSection = useStore((state) => state.updateJobSection)

  const isAdmin = checkManager(user)

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
  const [appointments, setAppointments] = useState([])
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

  // Persist filters & view preferences in localStorage
  const loadPref = (key, fallback) => {
    try { const v = localStorage.getItem(`jobBoard_${key}`); return v !== null ? JSON.parse(v) : fallback }
    catch { return fallback }
  }
  const savePref = (key, value) => { try { localStorage.setItem(`jobBoard_${key}`, JSON.stringify(value)) } catch {} }

  // Filters
  const [filterPM, _setFilterPM] = useState(() => loadPref('filterPM', ''))
  const [pmFilterLocked, setPmFilterLocked] = useState(false)
  const [filterBusinessUnit, _setFilterBusinessUnit] = useState(() => loadPref('filterBusinessUnit', ''))
  const [searchTerm, setSearchTerm] = useState('')
  const [dateRange, _setDateRange] = useState(() => loadPref('dateRange', 'all'))
  const [customDateFrom, setCustomDateFrom] = useState('')
  const [customDateTo, setCustomDateTo] = useState('')

  // Wrapped setters that also persist
  const setFilterPM = (v) => { _setFilterPM(v); savePref('filterPM', v) }
  const setFilterBusinessUnit = (v) => { _setFilterBusinessUnit(v); savePref('filterBusinessUnit', v) }
  const setDateRange = (v) => { _setDateRange(v); savePref('dateRange', v) }

  // View Mode
  const [viewMode, _setViewMode] = useState(() => loadPref('viewMode', 'kanban'))
  const [calendarViewMode, _setCalendarViewMode] = useState(() => loadPref('calendarViewMode', 'month'))
  const [ganttGroupBy, _setGanttGroupBy] = useState(() => loadPref('ganttGroupBy', 'pm'))
  const [zoomLevel, _setZoomLevel] = useState(() => loadPref('zoomLevel', 'week'))

  const setViewMode = (v) => { _setViewMode(v); savePref('viewMode', v) }
  const setCalendarViewMode = (v) => { _setCalendarViewMode(v); savePref('calendarViewMode', v) }
  const setGanttGroupBy = (v) => { _setGanttGroupBy(v); savePref('ganttGroupBy', v) }
  const setZoomLevel = (v) => { _setZoomLevel(v); savePref('zoomLevel', v) }
  const [ganttStartDate, setGanttStartDate] = useState(new Date())
  const ganttRef = useRef(null)

  // Drag state
  const [draggedSection, setDraggedSection] = useState(null)
  const [dragOverSlot, setDragOverSlot] = useState(null)
  const [dragOverStatus, setDragOverStatus] = useState(null)

  // Job Map state
  const [showJobMap, setShowJobMap] = useState(false)
  const [jobMapLoaded, setJobMapLoaded] = useState(false)
  const [jobMapCoords, setJobMapCoords] = useState({})
  const jobMapRef = useRef(null)
  const jobMapInstanceRef = useRef(null)
  const geocodeCacheRef = useRef({})

  // Schedule modal (opened when dropping a job onto the calendar)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [scheduleJob, setScheduleJob] = useState(null)
  const [scheduleForm, setScheduleForm] = useState({
    start_time: '',
    duration_hours: 4,
    pm_id: '',
    assigned_employee_ids: [],
    assigned_team: '',
    notes: '',
    recurrence: 'None',
    recurrence_end: '',
    createAppointment: true,
    sendText: false,
    sendEmail: false,
    phone: '',
    email: ''
  })
  const [scheduleError, setScheduleError] = useState(null)
  const [scheduleSaving, setScheduleSaving] = useState(false)

  // Job detail panel
  const [detailJob, setDetailJob] = useState(null)

  // Appointment edit modal
  const [editingAppointment, setEditingAppointment] = useState(null)
  const [appointmentForm, setAppointmentForm] = useState({
    title: '', start_time: '', duration_hours: 4, employee_id: '',
    assigned_employee_ids: [], status: '', location: '', notes: '',
    appointment_type: 'Job', recurrence: 'None', recurrence_end: ''
  })
  const [appointmentSaving, setAppointmentSaving] = useState(false)

  // Dragged appointment
  const [draggedAppointment, setDraggedAppointment] = useState(null)

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

  // Non-admins: lock PM filter to their own ID
  useEffect(() => {
    if (!isAdmin && user?.id && !pmFilterLocked) {
      setFilterPM(String(user.id))
      setPmFilterLocked(true)
    }
  }, [isAdmin, user?.id, pmFilterLocked])

  // Fetch data
  const fetchData = async () => {
    if (!companyId) return
    setLoading(true)

    // Only fetch jobs with statuses the board displays (avoids loading all 6000+ jobs)
    const validStatuses = jobStatuses.map(s => s.id)
    let query = supabase
      .from('jobs')
      .select('*, customer:customers(id, name, business_name, address, phone, email), pm:employees!jobs_pm_id_fkey(id, name)')
      .eq('company_id', companyId)
      .order('start_date', { ascending: true })
      .limit(5000)
    if (validStatuses.length > 0) {
      query = query.in('status', validStatuses)
    }
    let { data: jobsData, error } = await query
    if (error) {
      console.warn('[PMJobSetter] Join query failed, falling back:', error.message)
      let fallbackQuery = supabase.from('jobs').select('*')
        .eq('company_id', companyId).order('start_date', { ascending: true }).limit(5000)
      if (validStatuses.length > 0) fallbackQuery = fallbackQuery.in('status', validStatuses)
      const res = await fallbackQuery
      jobsData = res.data
    }

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

    // Fetch appointments (for calendar overlay)
    const { data: appointmentsData } = await supabase
      .from('appointments')
      .select('*, employee:employees!employee_id(id, name), customer:customers!customer_id(id, name)')
      .eq('company_id', companyId)
      .order('start_time', { ascending: true })

    setJobs(jobsData || [])
    setJobSections(sectionsData || [])
    setAppointments(appointmentsData || [])
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

  // Compute date range cutoff
  const getDateCutoff = () => {
    const now = new Date()
    switch (dateRange) {
      case 'mtd': return new Date(now.getFullYear(), now.getMonth(), 1)
      case 'qtd': {
        const qMonth = Math.floor(now.getMonth() / 3) * 3
        return new Date(now.getFullYear(), qMonth, 1)
      }
      case 'ytd': return new Date(now.getFullYear(), 0, 1)
      case 'last30': { const d = new Date(); d.setDate(d.getDate() - 30); return d }
      case 'last90': { const d = new Date(); d.setDate(d.getDate() - 90); return d }
      case 'custom': return customDateFrom ? new Date(customDateFrom) : null
      case 'all': return null
      default: return null
    }
  }

  const getDateCutoffEnd = () => {
    if (dateRange === 'custom' && customDateTo) {
      const d = new Date(customDateTo)
      d.setHours(23, 59, 59, 999)
      return d
    }
    return null
  }

  // Filter jobs for kanban (no date filtering — kanban always shows all jobs)
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

    // Non-admins always filter to their own jobs
    const effectivePM = !isAdmin && user?.id ? String(user.id) : filterPM
    if (effectivePM) {
      filtered = filtered.filter(j => j.pm_id === parseInt(effectivePM))
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

  // Memoized filtered jobs list (for map + route suggestions)
  const filteredJobList = useMemo(() => getFilteredJobs(), [jobs, jobStatuses, selectedCalendar, jobCalendars, filterPM, filterBusinessUnit, searchTerm, user, isAdmin])

  // Load Leaflet CSS & JS when map is toggled on
  useEffect(() => {
    if (!showJobMap) return
    if (document.getElementById('leaflet-css')) { setJobMapLoaded(true); return }
    const link = document.createElement('link')
    link.id = 'leaflet-css'; link.rel = 'stylesheet'
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
    document.head.appendChild(link)
    const script = document.createElement('script')
    script.id = 'leaflet-js'; script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
    script.onload = () => setJobMapLoaded(true)
    document.head.appendChild(script)
  }, [showJobMap])

  // Geocode addresses for map pins
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
    return (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) ? { lat: parts[0], lng: parts[1] } : null
  }, [])

  useEffect(() => {
    if (!showJobMap) return
    let cancelled = false
    const geocodeAll = async () => {
      const newCoords = {}
      for (const job of filteredJobList) {
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
      if (!cancelled) setJobMapCoords(prev => ({ ...prev, ...newCoords }))
    }
    geocodeAll()
    return () => { cancelled = true }
  }, [showJobMap, filteredJobList.length])

  // Initialize / update Leaflet map
  useEffect(() => {
    if (!showJobMap || !jobMapLoaded || !jobMapRef.current || typeof window.L === 'undefined') return
    const coordEntries = Object.entries(jobMapCoords)
    if (coordEntries.length === 0) return

    if (jobMapInstanceRef.current) { jobMapInstanceRef.current.remove(); jobMapInstanceRef.current = null }

    const L = window.L
    const map = L.map(jobMapRef.current, { zoomControl: false, attributionControl: false })
    L.control.zoom({ position: 'bottomright' }).addTo(map)
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(map)
    jobMapInstanceRef.current = map

    const bounds = []
    coordEntries.forEach(([jobId, coords]) => {
      const job = filteredJobList.find(j => j.id === parseInt(jobId))
      if (!job) return
      const status = jobStatuses.find(s => s.id === job.status || s.name === job.status)
      const color = status?.color || '#5a6349'
      const marker = L.circleMarker([coords.lat, coords.lng], { radius: 8, fillColor: color, color: '#fff', weight: 2, fillOpacity: 0.9 }).addTo(map)
      marker.bindTooltip(`<b>${job.job_title || 'Job'}</b><br/>${job.customer?.name || ''}<br/><small>${job.status}</small>`, { direction: 'top', offset: [0, -10] })
      marker.on('click', () => setDetailJob(job))
      bounds.push([coords.lat, coords.lng])
    })

    if (bounds.length > 0) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 13 })

    return () => { if (jobMapInstanceRef.current) { jobMapInstanceRef.current.remove(); jobMapInstanceRef.current = null } }
  }, [showJobMap, jobMapLoaded, jobMapCoords, filteredJobList, jobStatuses])

  // Get jobs by status, sorted by start_date (soonest first, unscheduled last)
  // Jobs with start_date today+ that aren't in a terminal status get placed in "Scheduled"
  const getJobsByStatus = (statusId) => {
    const todayStr = new Date().toISOString().split('T')[0]
    // Find the Scheduled column (case-insensitive)
    const scheduledStatus = jobStatuses.find(s => s.name.toLowerCase() === 'scheduled')
    const scheduledStatusId = scheduledStatus?.id

    return getFilteredJobs()
      .filter(j => {
        // Only reroute jobs if we have a Scheduled column configured
        if (!scheduledStatusId) return j.status === statusId

        const hasScheduledDate = j.start_date && j.start_date.split('T')[0] >= todayStr
        const isTerminal = ['Complete', 'Completed', 'Verified', 'Cancelled'].includes(j.status)

        if (statusId === scheduledStatusId) {
          // Scheduled column: jobs with status=Scheduled + jobs with future dates (not terminal)
          if (j.status === statusId) return true
          return hasScheduledDate && !isTerminal
        } else {
          // Other columns: show jobs with this status, but move future-dated ones to Scheduled
          if (j.status !== statusId) return false
          if (hasScheduledDate && !isTerminal) return false // this job goes to Scheduled instead
          return true
        }
      })
      .sort((a, b) => {
        if (!a.start_date && !b.start_date) return 0
        if (!a.start_date) return 1
        if (!b.start_date) return -1
        return new Date(a.start_date) - new Date(b.start_date)
      })
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
    const slotDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return jobSections.filter(section => {
      if (!section.scheduled_date) return false
      const sectionDateStr = section.scheduled_date.substring(0, 10)
      const sameDay = sectionDateStr === slotDateStr

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

  // Get jobs (not sections) scheduled for a calendar slot
  const getJobsForSlot = (date, hour) => {
    const slotDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return getFilteredJobs().filter(job => {
      if (!job.start_date) return false
      const jobDt = new Date(job.start_date)
      // Compare local date parts
      const jobDateStr = `${jobDt.getFullYear()}-${String(jobDt.getMonth() + 1).padStart(2, '0')}-${String(jobDt.getDate()).padStart(2, '0')}`
      if (jobDateStr !== slotDateStr) return false

      // Match by hour (default to 8 AM if no time component)
      const jobHour = jobDt.getHours()
      return jobHour === hour || (jobHour === 0 && hour === 8)
    })
  }

  // Appointment helpers for calendar
  const getAppointmentsForDate = (date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return appointments.filter(apt => {
      if (!apt.start_time) return false
      const aptDt = new Date(apt.start_time)
      const aptDateStr = `${aptDt.getFullYear()}-${String(aptDt.getMonth() + 1).padStart(2, '0')}-${String(aptDt.getDate()).padStart(2, '0')}`
      return aptDateStr === dateStr
    })
  }

  const getAppointmentsForSlot = (date, hour) => {
    const slotDateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    return appointments.filter(apt => {
      if (!apt.start_time) return false
      const aptDt = new Date(apt.start_time)
      const aptDateStr = `${aptDt.getFullYear()}-${String(aptDt.getMonth() + 1).padStart(2, '0')}-${String(aptDt.getDate()).padStart(2, '0')}`
      if (aptDateStr !== slotDateStr) return false
      const aptHour = aptDt.getHours()
      return aptHour === hour || (aptHour === 0 && hour === 8)
    })
  }

  const appointmentStatusColors = {
    'Scheduled': '#0ea5e9',
    'Confirmed': '#8b5cf6',
    'Completed': '#22c55e',
    'Cancelled': '#ef4444',
    'No Show': '#6b7280'
  }

  const isRecurringAppointment = (apt) => apt.appointment_type === 'Recurring Job'

  // Month calendar helpers
  const getMonthDays = () => {
    const year = currentDate.getFullYear()
    const month = currentDate.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startPad = firstDay.getDay()
    const days = []
    for (let i = 0; i < startPad; i++) days.push(null)
    for (let d = 1; d <= lastDay.getDate(); d++) {
      days.push(new Date(year, month, d))
    }
    return days
  }

  const prevMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))
  }

  const nextMonth = () => {
    setCurrentDate(prev => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))
  }

  // Get jobs for a specific calendar date (applies date range filter for calendar)
  const getJobsForDate = (date) => {
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    // Check if this date falls within the selected date range
    const cutoff = getDateCutoff()
    const cutoffEnd = getDateCutoffEnd()
    if (cutoff && date < cutoff) return []
    if (cutoffEnd && date > cutoffEnd) return []

    return getFilteredJobs().filter(job => {
      if (!job.start_date) return false
      const jobDt = new Date(job.start_date)
      const jobDateStr = `${jobDt.getFullYear()}-${String(jobDt.getMonth() + 1).padStart(2, '0')}-${String(jobDt.getDate()).padStart(2, '0')}`
      return jobDateStr === dateStr
    })
  }

  const handleMonthDayDrop = async (e, date) => {
    e.preventDefault()
    setDragOverSlot(null)

    const startTime = new Date(date)
    startTime.setHours(8, 0, 0, 0)

    if (draggedAppointment) {
      // Move appointment to new date, keep original duration
      const origStart = new Date(draggedAppointment.start_time)
      const origEnd = new Date(draggedAppointment.end_time || origStart)
      const durationMs = origEnd - origStart
      const newStart = new Date(date)
      newStart.setHours(origStart.getHours(), origStart.getMinutes(), 0, 0)
      const newEnd = new Date(newStart.getTime() + durationMs)

      await supabase.from('appointments').update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', draggedAppointment.id)

      setDraggedAppointment(null)
      await fetchData()
      return
    }

    if (draggedJob) {
      setScheduleJob(draggedJob)
      setScheduleForm({
        start_time: formatDateTimeLocal(startTime),
        duration_hours: draggedJob.allotted_time_hours || 4,
        pm_id: draggedJob.pm_id || (!isAdmin && user?.id ? String(user.id) : ''),
        assigned_employee_ids: [],
        assigned_team: draggedJob.assigned_team || '',
        notes: draggedJob.notes || '',
        recurrence: draggedJob.recurrence || 'None',
        recurrence_end: '',
        createAppointment: true,
        sendText: false,
        sendEmail: false,
        phone: draggedJob.customer?.phone || '',
        email: draggedJob.customer?.email || ''
      })
      setScheduleError(null)
      setShowScheduleModal(true)
      setDraggedJob(null)
      return
    }

    if (!draggedSection) return
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    await supabase
      .from('job_sections')
      .update({
        scheduled_date: dateStr,
        start_time: startTime.toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', draggedSection.id)
    await fetchData()
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

  // Drag handlers — supports both sections and whole jobs
  const [draggedJob, setDraggedJob] = useState(null)

  const handleSectionDragStart = (e, section, job) => {
    setDraggedSection({ ...section, job })
    setDraggedJob(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', section.id.toString())
  }

  const handleJobDragStart = (e, job) => {
    setDraggedJob(job)
    setDraggedSection(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `job-${job.id}`)
  }

  const handleAppointmentDragStart = (e, apt) => {
    setDraggedAppointment(apt)
    setDraggedJob(null)
    setDraggedSection(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `apt-${apt.id}`)
  }

  const handleAppointmentClick = (apt) => {
    setEditingAppointment(apt)
    // Calculate duration from start/end
    const start = apt.start_time ? new Date(apt.start_time) : null
    const end = apt.end_time ? new Date(apt.end_time) : null
    const durationMs = start && end ? end - start : 0
    const durationHours = durationMs > 0 ? durationMs / (1000 * 60 * 60) : 4

    // Parse recurrence from notes if present
    let recurrence = 'None'
    if (apt.appointment_type === 'Recurring Job') {
      const match = apt.notes?.match(/Recurring:\s*(\w[\w-]*)/)
      recurrence = match ? match[1] : 'Monthly'
    }

    setAppointmentForm({
      title: apt.title || '',
      start_time: start ? formatDateTimeLocal(start) : '',
      duration_hours: durationHours,
      employee_id: apt.employee_id ? String(apt.employee_id) : '',
      assigned_employee_ids: apt.employee_id ? [String(apt.employee_id)] : [],
      status: apt.status || 'Scheduled',
      location: apt.location || '',
      notes: apt.notes || '',
      appointment_type: apt.appointment_type || 'Job',
      recurrence: recurrence,
      recurrence_end: ''
    })
  }

  const handleAppointmentSave = async (e) => {
    e.preventDefault()
    if (!editingAppointment) return
    setAppointmentSaving(true)

    const startTime = new Date(appointmentForm.start_time)
    const endTime = new Date(startTime)
    endTime.setHours(endTime.getHours() + (appointmentForm.duration_hours || 4))

    const isRecurring = appointmentForm.recurrence && appointmentForm.recurrence !== 'None'
    const appointmentType = isRecurring ? 'Recurring Job' : (appointmentForm.appointment_type === 'Recurring Job' && !isRecurring ? 'Job' : appointmentForm.appointment_type)

    const updateData = {
      title: appointmentForm.title,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      employee_id: appointmentForm.assigned_employee_ids.length > 0
        ? parseInt(appointmentForm.assigned_employee_ids[0])
        : (appointmentForm.employee_id ? parseInt(appointmentForm.employee_id) : null),
      status: appointmentForm.status,
      location: appointmentForm.location || null,
      appointment_type: appointmentType,
      notes: appointmentForm.notes || null,
      updated_at: new Date().toISOString()
    }

    await supabase.from('appointments').update(updateData).eq('id', editingAppointment.id)

    // If recurrence changed to recurring and end date set, create future appointments
    if (isRecurring && appointmentForm.recurrence_end && !isRecurringAppointment(editingAppointment)) {
      const recurEnd = new Date(appointmentForm.recurrence_end)
      const futureAppts = []
      let nextStart = new Date(startTime)

      while (true) {
        if (appointmentForm.recurrence === 'Monthly') nextStart = new Date(new Date(nextStart).setMonth(nextStart.getMonth() + 1))
        else if (appointmentForm.recurrence === 'Quarterly') nextStart = new Date(new Date(nextStart).setMonth(nextStart.getMonth() + 3))
        else if (appointmentForm.recurrence === 'Bi-Weekly') nextStart = new Date(nextStart.getTime() + 14 * 86400000)
        else if (appointmentForm.recurrence === 'Weekly') nextStart = new Date(nextStart.getTime() + 7 * 86400000)
        else nextStart = new Date(nextStart.getTime() + 86400000)
        if (nextStart > recurEnd) break

        const nextEnd = new Date(nextStart)
        nextEnd.setHours(nextEnd.getHours() + (appointmentForm.duration_hours || 4))

        appointmentForm.assigned_employee_ids.forEach(empId => {
          futureAppts.push({
            company_id: companyId,
            title: appointmentForm.title,
            start_time: nextStart.toISOString(),
            end_time: nextEnd.toISOString(),
            location: appointmentForm.location || '',
            status: 'Scheduled',
            employee_id: parseInt(empId),
            customer_id: editingAppointment.customer_id || null,
            appointment_type: 'Recurring Job',
            notes: `Recurring: ${appointmentForm.recurrence}`,
            created_at: new Date().toISOString()
          })
        })
      }

      if (futureAppts.length > 0) {
        await supabase.from('appointments').insert(futureAppts)
      }
    }

    setAppointmentSaving(false)
    setEditingAppointment(null)
    await fetchData()
  }

  const handleAppointmentDelete = async () => {
    if (!editingAppointment || !confirm('Delete this appointment?')) return
    await supabase.from('appointments').delete().eq('id', editingAppointment.id)
    setEditingAppointment(null)
    await fetchData()
  }

  const handleDragEnd = () => {
    setDraggedSection(null)
    setDraggedJob(null)
    setDraggedAppointment(null)
    setDragOverSlot(null)
    setDragOverStatus(null)
  }

  const handleSlotDragOver = (e, date, hour) => {
    e.preventDefault()
    setDragOverSlot({ date, hour })
  }

  const formatDateTimeLocal = (date) => {
    const y = date.getFullYear()
    const m = String(date.getMonth() + 1).padStart(2, '0')
    const d = String(date.getDate()).padStart(2, '0')
    const h = String(date.getHours()).padStart(2, '0')
    const min = String(date.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${d}T${h}:${min}`
  }

  const handleSlotDrop = async (e, date, hour) => {
    e.preventDefault()
    setDragOverSlot(null)

    const startTime = new Date(date)
    startTime.setHours(hour, 0, 0, 0)
    // Use local date parts to avoid UTC shift (toISOString converts to UTC, off by a day in US timezones)
    const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`

    if (draggedAppointment) {
      // Move appointment to new time slot, keep duration
      const origStart = new Date(draggedAppointment.start_time)
      const origEnd = new Date(draggedAppointment.end_time || origStart)
      const durationMs = origEnd - origStart
      const newStart = new Date(date)
      newStart.setHours(hour, 0, 0, 0)
      const newEnd = new Date(newStart.getTime() + durationMs)

      await supabase.from('appointments').update({
        start_time: newStart.toISOString(),
        end_time: newEnd.toISOString(),
        updated_at: new Date().toISOString()
      }).eq('id', draggedAppointment.id)

      setDraggedAppointment(null)
      await fetchData()
      return
    }

    if (draggedJob) {
      // Open schedule modal with pre-filled time
      setScheduleJob(draggedJob)
      setScheduleForm({
        start_time: formatDateTimeLocal(startTime),
        duration_hours: draggedJob.allotted_time_hours || 4,
        pm_id: draggedJob.pm_id || (!isAdmin && user?.id ? String(user.id) : ''),
        assigned_employee_ids: [],
        assigned_team: draggedJob.assigned_team || '',
        notes: draggedJob.notes || '',
        recurrence: draggedJob.recurrence || 'None',
        recurrence_end: '',
        createAppointment: true,
        sendText: false,
        sendEmail: false,
        phone: draggedJob.customer?.phone || '',
        email: draggedJob.customer?.email || ''
      })
      setScheduleError(null)
      setShowScheduleModal(true)
      setDraggedJob(null)
      return
    }

    if (!draggedSection) return

    await supabase
      .from('job_sections')
      .update({
        scheduled_date: dateStr,
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

    if (draggedJob) {
      // Dropping a whole job onto a status column — update job status
      // If not Scheduled, clear start_date so it leaves the calendar
      const updateData = {
        status: statusId,
        updated_at: new Date().toISOString()
      }
      if (statusId !== 'Scheduled') {
        updateData.start_date = null
      }
      await supabase
        .from('jobs')
        .update(updateData)
        .eq('id', draggedJob.id)

      // Auto-create invoice when job is marked Completed
      if (statusId === 'Complete' || statusId === 'Completed') {
        const jobForInvoice = draggedJob
        // Fetch job_lines to calculate total
        const { data: jobLines } = await supabase
          .from('job_lines')
          .select('item_id, quantity, price, total, description')
          .eq('job_id', jobForInvoice.id)

        const jobTotal = jobLines?.reduce((sum, l) => sum + (l.total || l.quantity * l.price || 0), 0) || jobForInvoice.job_total || 0
        const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`

        const { data: newInvoice, error: invError } = await supabase
          .from('invoices')
          .insert([{
            company_id: companyId,
            invoice_id: invoiceNumber,
            customer_id: jobForInvoice.customer?.id || jobForInvoice.customer_id || null,
            job_id: jobForInvoice.id,
            amount: jobTotal,
            payment_status: 'Pending',
            job_description: jobForInvoice.job_title || jobForInvoice.job_id || null,
            updated_at: new Date().toISOString()
          }])
          .select()
          .single()

        if (invError) {
          console.error('[AutoInvoice] Error creating invoice:', invError)
        } else {
          console.log('[AutoInvoice] Created invoice', invoiceNumber, 'for $' + jobTotal)
          // Update job's invoice_status
          await supabase.from('jobs').update({ invoice_status: 'Invoiced' }).eq('id', jobForInvoice.id)
        }
      }

      setDraggedJob(null)
      await fetchData()
      return
    }

    if (!draggedSection) return

    await updateJobSection(draggedSection.id, {
      status: statusId,
      updated_at: new Date().toISOString()
    })

    setDraggedSection(null)
    await fetchData()
  }

  // Schedule job from modal
  const handleScheduleJobSubmit = async (e) => {
    e.preventDefault()
    if (!scheduleJob || !scheduleForm.start_time) return

    setScheduleSaving(true)
    setScheduleError(null)

    const startTime = new Date(scheduleForm.start_time)
    const endTime = new Date(startTime)
    endTime.setHours(endTime.getHours() + (scheduleForm.duration_hours || 4))

    // Use configured "Scheduled" status if it exists, otherwise keep current status
    const scheduledStatus = jobStatuses.find(s => s.name === 'Scheduled' || s.id === 'Scheduled')?.id
    const updateData = {
      start_date: startTime.toISOString(),
      end_date: endTime.toISOString(),
      updated_at: new Date().toISOString()
    }
    // Only change status if we have a valid "Scheduled" status configured
    if (scheduledStatus) updateData.status = scheduledStatus
    // Set PM: use form value, or default to current user for non-admins
    const pmId = scheduleForm.pm_id || (!isAdmin && user?.id ? String(user.id) : '')
    if (pmId) updateData.pm_id = parseInt(pmId)
    if (scheduleForm.notes) updateData.notes = scheduleForm.notes
    // Build assigned_team from selected employees
    if (scheduleForm.assigned_employee_ids.length > 0) {
      const teamNames = scheduleForm.assigned_employee_ids.map(id => {
        const emp = employees.find(e => String(e.id) === String(id))
        return emp?.name || ''
      }).filter(Boolean).join(', ')
      updateData.assigned_team = teamNames
    } else if (scheduleForm.assigned_team) {
      updateData.assigned_team = scheduleForm.assigned_team
    }

    console.log('[Schedule] Job ID:', scheduleJob.id)
    console.log('[Schedule] Update data:', JSON.stringify(updateData))
    console.log('[Schedule] jobStatuses:', JSON.stringify(jobStatuses.map(s => s.id)))

    const { error, data: updatedRows } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', scheduleJob.id)
      .select()

    console.log('[Schedule] Supabase response - error:', error, 'updated:', updatedRows)

    if (error) {
      setScheduleError(error.message)
      setScheduleSaving(false)
      return
    }

    // Also save recurrence on the job record
    if (scheduleForm.recurrence && scheduleForm.recurrence !== 'None') {
      await supabase.from('jobs').update({ recurrence: scheduleForm.recurrence }).eq('id', scheduleJob.id)
    }

    // Create recurring future jobs
    if (scheduleForm.recurrence && scheduleForm.recurrence !== 'None' && scheduleForm.recurrence_end) {
      const recurEnd = new Date(scheduleForm.recurrence_end)
      const intervalMap = {
        'Daily': 1, 'Weekly': 7, 'Bi-Weekly': 14, 'Monthly': null, 'Quarterly': null
      }
      const futureJobs = []
      let nextStart = new Date(startTime)

      while (true) {
        if (scheduleForm.recurrence === 'Monthly') {
          nextStart = new Date(nextStart)
          nextStart.setMonth(nextStart.getMonth() + 1)
        } else if (scheduleForm.recurrence === 'Quarterly') {
          nextStart = new Date(nextStart)
          nextStart.setMonth(nextStart.getMonth() + 3)
        } else {
          const days = intervalMap[scheduleForm.recurrence] || 7
          nextStart = new Date(nextStart)
          nextStart.setDate(nextStart.getDate() + days)
        }

        if (nextStart > recurEnd) break

        const nextEnd = new Date(nextStart)
        nextEnd.setHours(nextEnd.getHours() + (scheduleForm.duration_hours || 4))

        futureJobs.push({
          company_id: companyId,
          job_id: `JOB-${Date.now().toString(36).toUpperCase()}${futureJobs.length}`,
          job_title: scheduleJob.job_title || scheduleJob.job_id,
          job_address: scheduleJob.job_address || null,
          customer_id: scheduleJob.customer?.id || null,
          salesperson_id: scheduleJob.salesperson_id || null,
          status: scheduledStatus || 'Scheduled',
          assigned_team: updateData.assigned_team || scheduleJob.assigned_team || null,
          business_unit: scheduleJob.business_unit || null,
          pm_id: pmId ? parseInt(pmId) : null,
          start_date: nextStart.toISOString(),
          end_date: nextEnd.toISOString(),
          allotted_time_hours: scheduleJob.allotted_time_hours || null,
          recurrence: scheduleForm.recurrence,
          notes: scheduleForm.notes || scheduleJob.notes || null,
          details: scheduleJob.details || null,
          job_total: scheduleJob.job_total || null,
          updated_at: new Date().toISOString()
        })
      }

      if (futureJobs.length > 0) {
        const { data: createdJobs, error: recurError } = await supabase
          .from('jobs')
          .insert(futureJobs)
          .select('id')

        if (recurError) {
          console.error('[Schedule] Recurring job creation error:', recurError)
        } else {
          console.log('[Schedule] Created', futureJobs.length, 'recurring jobs')

          // Copy job_lines from original job to each recurring job
          const { data: origLines } = await supabase
            .from('job_lines')
            .select('item_id, quantity, price, total, description, notes')
            .eq('job_id', scheduleJob.id)

          if (origLines?.length > 0 && createdJobs?.length > 0) {
            const allLines = createdJobs.flatMap(cj =>
              origLines.map(line => ({
                company_id: companyId,
                job_id: cj.id,
                item_id: line.item_id,
                quantity: line.quantity,
                price: line.price,
                total: line.total,
                description: line.description,
                notes: line.notes
              }))
            )
            await supabase.from('job_lines').insert(allLines)
          }

          // Create appointments for each recurring job
          if (scheduleForm.createAppointment) {
            const assignedIds = scheduleForm.assigned_employee_ids.length > 0
              ? scheduleForm.assigned_employee_ids
              : (pmId ? [pmId] : [])

            if (assignedIds.length > 0 && createdJobs?.length > 0) {
              const recurAppts = []
              createdJobs.forEach((cj, idx) => {
                const fjob = futureJobs[idx]
                assignedIds.forEach(empId => {
                  const emp = employees.find(e => String(e.id) === String(empId))
                  recurAppts.push({
                    company_id: companyId,
                    title: fjob.job_title,
                    start_time: fjob.start_date,
                    end_time: fjob.end_date,
                    location: fjob.job_address || '',
                    status: 'Scheduled',
                    employee_id: parseInt(empId),
                    customer_id: fjob.customer_id,
                    appointment_type: 'Recurring Job',
                    notes: `Recurring: ${scheduleForm.recurrence}${emp ? ` | ${emp.name}` : ''}`,
                    created_at: new Date().toISOString()
                  })
                })
              })
              await supabase.from('appointments').insert(recurAppts)
            }
          }
        }
      }
    }

    // Create appointment(s) for each assigned employee — insert directly to ensure they exist before calendar refetch
    if (scheduleForm.createAppointment) {
      const assignedIds = scheduleForm.assigned_employee_ids.length > 0
        ? scheduleForm.assigned_employee_ids
        : (pmId ? [pmId] : [])

      const appointmentRows = assignedIds.map(empId => {
        const emp = employees.find(e => String(e.id) === String(empId))
        return {
          company_id: companyId,
          title: scheduleJob.job_title || `Job #${scheduleJob.job_id || scheduleJob.id}`,
          start_time: startTime.toISOString(),
          end_time: endTime.toISOString(),
          location: scheduleJob.job_address || '',
          status: 'Scheduled',
          employee_id: parseInt(empId),
          customer_id: scheduleJob.customer?.id || null,
          appointment_type: (scheduleForm.recurrence && scheduleForm.recurrence !== 'None') ? 'Recurring Job' : 'Job',
          notes: `${scheduleForm.recurrence && scheduleForm.recurrence !== 'None' ? `Recurring: ${scheduleForm.recurrence}\n` : ''}${scheduleForm.notes || ''}${scheduleForm.notes ? '\n' : ''}Job: ${scheduleJob.job_title || scheduleJob.job_id || scheduleJob.id}${emp ? ` | Assigned: ${emp.name}` : ''}`,
          created_at: new Date().toISOString()
        }
      })

      if (appointmentRows.length > 0) {
        const { error: apptError } = await supabase
          .from('appointments')
          .insert(appointmentRows)

        if (apptError) {
          console.error('[Schedule] Appointment creation error:', apptError)
        } else {
          console.log('[Schedule] Created', appointmentRows.length, 'appointment(s)')
        }
      }
    }

    // Send notifications
    const companyName = company?.name || 'our team'
    const customerName = scheduleJob.customer?.name || 'Customer'
    const jobTitle = scheduleJob.job_title || 'your job'
    const formattedDate = new Date(scheduleForm.start_time).toLocaleString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      hour: 'numeric', minute: '2-digit'
    })
    const confirmMsg = `Hi ${customerName}, your job "${jobTitle}" has been scheduled for ${formattedDate} with ${companyName}. We look forward to working with you!`

    if (scheduleForm.sendText && scheduleForm.phone) {
      const cleanPhone = scheduleForm.phone.replace(/\D/g, '')
      window.open(`sms:${cleanPhone}?body=${encodeURIComponent(confirmMsg)}`, '_blank')
    }

    if (scheduleForm.sendEmail && scheduleForm.email) {
      const subject = `Job Scheduled — ${jobTitle}`
      window.open(`mailto:${scheduleForm.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(confirmMsg)}`, '_blank')
    }

    // Log communication
    if (scheduleForm.sendText || scheduleForm.sendEmail) {
      const methods = []
      if (scheduleForm.sendText) methods.push('text')
      if (scheduleForm.sendEmail) methods.push('email')
      await supabase.from('communications_log').insert({
        company_id: companyId,
        customer_id: scheduleJob.customer?.id || null,
        job_id: scheduleJob.id,
        type: methods.join(', '),
        direction: 'outbound',
        summary: `Scheduling confirmation sent via ${methods.join(' & ')}`,
        content: confirmMsg,
        created_at: new Date().toISOString()
      }).then(() => {}).catch(() => {})
    }

    setScheduleSaving(false)
    setShowScheduleModal(false)
    setScheduleJob(null)
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
            {businessUnits.map(unit => {
              const name = typeof unit === 'object' ? unit.name : unit
              return <option key={name} value={name}>{name}</option>
            })}
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
    <div style={{ padding: isMobile ? '12px' : '12px 16px', minHeight: '100%', display: 'flex', flexDirection: 'column', overflowX: 'hidden', maxWidth: '100%' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: isMobile ? 'flex-start' : 'center',
        justifyContent: 'space-between',
        marginBottom: '10px',
        flexDirection: isMobile ? 'column' : 'row',
        gap: '8px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <h1 style={{ fontSize: isMobile ? '20px' : '20px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Job Board
          </h1>
          <HelpBadge text="Drag job sections to the calendar to schedule work. Track progress across all jobs." />
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

          {/* PM Filter (admin can change, non-admin locked to self) */}
          {isAdmin && (
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
          )}

          {/* Business Unit Filter */}
          <select
            value={filterBusinessUnit}
            onChange={(e) => setFilterBusinessUnit(e.target.value)}
            style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
          >
            <option value="">All Units</option>
            {businessUnits.map(unit => {
              const name = typeof unit === 'object' ? unit.name : unit
              return <option key={name} value={name}>{name}</option>
            })}
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

          {/* Date Range Filter (controls calendar view) */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', backgroundColor: theme.bg, borderRadius: '8px', padding: '3px', border: `1px solid ${theme.border}` }}>
            {[
              { id: 'mtd', label: 'MTD' },
              { id: 'qtd', label: 'QTD' },
              { id: 'ytd', label: 'YTD' },
              { id: 'last90', label: '90d' },
              { id: 'all', label: 'All' },
              { id: 'custom', label: 'Custom' }
            ].map(opt => (
              <button
                key={opt.id}
                onClick={() => setDateRange(opt.id)}
                style={{
                  padding: '5px 8px',
                  fontSize: '11px',
                  fontWeight: dateRange === opt.id ? '600' : '400',
                  backgroundColor: dateRange === opt.id ? theme.bgCard : 'transparent',
                  color: dateRange === opt.id ? theme.accent : theme.textMuted,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  minHeight: '28px',
                  boxShadow: dateRange === opt.id ? '0 1px 2px rgba(0,0,0,0.08)' : 'none'
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {dateRange === 'custom' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <input type="date" value={customDateFrom} onChange={(e) => setCustomDateFrom(e.target.value)}
                style={{ ...inputStyle, width: '130px', padding: '6px 8px', minHeight: '36px', fontSize: '12px' }} />
              <span style={{ fontSize: '11px', color: theme.textMuted }}>to</span>
              <input type="date" value={customDateTo} onChange={(e) => setCustomDateTo(e.target.value)}
                style={{ ...inputStyle, width: '130px', padding: '6px 8px', minHeight: '36px', fontSize: '12px' }} />
            </div>
          )}

          <button
            onClick={() => setShowJobMap(prev => !prev)}
            title="Toggle job map"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              padding: '8px 12px',
              minHeight: '44px',
              backgroundColor: showJobMap ? theme.accent : 'transparent',
              border: `1px solid ${showJobMap ? theme.accent : theme.border}`,
              color: showJobMap ? '#fff' : theme.textSecondary,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            <Map size={16} />
            {!isMobile && 'Map'}
          </button>

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

          {isAdmin && (
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
          )}
        </div>
      </div>

      {/* Main Content */}
      {viewMode === 'kanban' ? (
      /* Kanban — FULL WIDTH, calendar below */
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {/* Kanban Jobs — full width */}
        <div style={{
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Stats Row */}
          {jobStatuses.length > 0 && (
            <div style={{
              display: 'flex',
              gap: '6px',
              marginBottom: '8px',
              overflowX: 'auto'
            }}>
              {jobStatuses.map(status => (
                <div
                  key={status.id}
                  style={{
                    padding: '4px 12px',
                    backgroundColor: theme.bgCard,
                    borderRadius: '6px',
                    border: `1px solid ${theme.border}`,
                    textAlign: 'center',
                    flex: '1 0 auto',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <div style={{ fontSize: '15px', fontWeight: '700', color: status.color }}>
                    {getJobsByStatus(status.id).length}
                  </div>
                  <div style={{ fontSize: '10px', color: theme.textMuted, whiteSpace: 'nowrap' }}>{status.name}</div>
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
              {isAdmin && (
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
              )}
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '8px', overflow: 'hidden', maxHeight: isMobile ? 'none' : '280px', minHeight: '180px' }}>
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
                      padding: '10px',
                      borderRadius: '8px 8px 0 0',
                      fontSize: '12px',
                      fontWeight: '600',
                      textAlign: 'center',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '5px'
                    }}>
                      <StatusIcon size={14} />
                      <span>{status.name}</span>
                      <span style={{
                        marginLeft: '4px',
                        backgroundColor: 'rgba(255,255,255,0.25)',
                        padding: '2px 7px',
                        borderRadius: '8px',
                        fontSize: '11px'
                      }}>
                        {getJobsByStatus(status.id).length}
                      </span>
                    </div>

                    {/* Status Content */}
                    <div style={{
                      flex: 1,
                      backgroundColor: dragOverStatus === status.id ? theme.accentBg : 'rgba(0,0,0,0.02)',
                      borderRadius: '0 0 8px 8px',
                      padding: '8px',
                      overflowY: 'auto',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '8px'
                    }}>
                      {getJobsByStatus(status.id).map(job => {
                        const progress = calculateJobProgress(job.id)
                        const sections = getSectionsForJob(job.id)
                        const isExpanded = expandedJobs[job.id]
                        const calendar = getCalendarForJob(job)

                        return (
                          <div
                            key={job.id}
                            draggable
                            onDragStart={(e) => handleJobDragStart(e, job)}
                            onDragEnd={handleDragEnd}
                          >
                            {/* Job Card */}
                            <EntityCard
                              name={job.customer?.name}
                              businessName={job.customer?.business_name}
                              style={{ padding: '0px', overflow: 'hidden', cursor: 'grab' }}
                            >
                              {/* Job Header */}
                              <div
                                onClick={() => toggleJobExpanded(job.id)}
                                style={{
                                  padding: '10px 12px',
                                  cursor: 'pointer',
                                  display: 'flex',
                                  alignItems: 'flex-start',
                                  gap: '8px'
                                }}
                              >
                                {isExpanded ? (
                                  <ChevronDown size={16} style={{ color: theme.textMuted, flexShrink: 0, marginTop: '2px' }} />
                                ) : (
                                  <ChevronRight size={16} style={{ color: theme.textMuted, flexShrink: 0, marginTop: '2px' }} />
                                )}
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{
                                    fontSize: '14px',
                                    fontWeight: '700',
                                    color: theme.text,
                                    marginBottom: '3px',
                                    lineHeight: '1.3',
                                    display: '-webkit-box',
                                    WebkitLineClamp: 2,
                                    WebkitBoxOrient: 'vertical',
                                    overflow: 'hidden'
                                  }}>
                                    {job.job_title || `Job #${job.id}`}
                                  </div>
                                  <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '6px' }}>
                                    {job.customer?.name}
                                  </div>

                                  {/* Progress Bar */}
                                  <div style={{
                                    height: '5px',
                                    backgroundColor: theme.border,
                                    borderRadius: '3px',
                                    overflow: 'hidden',
                                    marginBottom: '5px'
                                  }}>
                                    <div style={{
                                      height: '100%',
                                      width: `${progress}%`,
                                      backgroundColor: progress === 100 ? '#22c55e' : '#3b82f6',
                                      borderRadius: '3px',
                                      transition: 'width 0.3s'
                                    }} />
                                  </div>

                                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                                    <span style={{ fontSize: '11px', color: theme.textMuted }}>
                                      {Math.round(progress)}% complete
                                    </span>
                                    {job.pm?.name && (
                                      <span style={{ fontSize: '11px', color: theme.textSecondary, display: 'flex', alignItems: 'center' }}>
                                        <User size={11} style={{ marginRight: '3px' }} />
                                        {job.pm.name}
                                      </span>
                                    )}
                                    {job.start_date && (
                                      <span style={{ fontSize: '11px', color: theme.textSecondary, display: 'flex', alignItems: 'center' }}>
                                        <Calendar size={11} style={{ marginRight: '3px' }} />
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
                                            borderRadius: '6px',
                                            padding: '8px 10px',
                                            marginBottom: '4px',
                                            border: `1px solid ${theme.border}`,
                                            cursor: 'grab',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '8px'
                                          }}
                                        >
                                          <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                              fontSize: '12px',
                                              fontWeight: '500',
                                              color: theme.text,
                                              whiteSpace: 'nowrap',
                                              overflow: 'hidden',
                                              textOverflow: 'ellipsis'
                                            }}>
                                              {section.name}
                                            </div>
                                            <div style={{ fontSize: '11px', color: theme.textMuted }}>
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
                                              padding: '3px 6px',
                                              fontSize: '10px',
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

        {/* Calendar — right after kanban for drag-and-drop */}
        <div style={{
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
                onClick={calendarViewMode === 'month' ? prevMonth : prevWeek}
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
                onClick={calendarViewMode === 'month' ? nextMonth : nextWeek}
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
              {calendarViewMode === 'month'
                ? currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
                : weekDays[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </div>
            {/* Week/Month toggle */}
            <div style={{ display: 'flex', backgroundColor: theme.bg, borderRadius: '6px', padding: '2px', border: `1px solid ${theme.border}` }}>
              {[{ id: 'month', label: 'Month' }, { id: 'week', label: 'Week' }].map(v => (
                <button
                  key={v.id}
                  onClick={() => setCalendarViewMode(v.id)}
                  style={{
                    padding: '4px 10px',
                    fontSize: '11px',
                    fontWeight: calendarViewMode === v.id ? '600' : '400',
                    backgroundColor: calendarViewMode === v.id ? theme.bgCard : 'transparent',
                    color: calendarViewMode === v.id ? theme.accent : theme.textMuted,
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    minHeight: '28px'
                  }}
                >
                  {v.label}
                </button>
              ))}
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
            {calendarViewMode === 'month' ? (
              /* ===== MONTH VIEW ===== */
              <div>
                {/* Day-of-week headers */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: `1px solid ${theme.border}` }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} style={{ padding: '8px 4px', textAlign: 'center', fontSize: '11px', fontWeight: '600', color: theme.textMuted }}>
                      {d}
                    </div>
                  ))}
                </div>
                {/* Day grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
                  {getMonthDays().map((day, idx) => {
                    const dayJobs = day ? getJobsForDate(day) : []
                    const dayAppointments = day ? getAppointmentsForDate(day) : []
                    const isDragOver = day && dragOverSlot?.date?.toDateString() === day.toDateString()

                    return (
                      <div
                        key={idx}
                        onDragOver={day ? (e) => { e.preventDefault(); setDragOverSlot({ date: day, hour: 8 }) } : undefined}
                        onDrop={day ? (e) => handleMonthDayDrop(e, day) : undefined}
                        style={{
                          minHeight: '80px',
                          borderBottom: `1px solid ${theme.border}`,
                          borderRight: (idx + 1) % 7 !== 0 ? `1px solid ${theme.border}` : 'none',
                          padding: '4px',
                          backgroundColor: !day ? theme.bg : isDragOver ? theme.accentBg : (day && isToday(day) ? 'rgba(90,99,73,0.06)' : 'transparent'),
                          transition: 'background-color 0.15s'
                        }}
                      >
                        {day && (
                          <>
                            <div style={{
                              fontSize: '12px',
                              fontWeight: isToday(day) ? '700' : '500',
                              color: isToday(day) ? theme.accent : theme.text,
                              marginBottom: '3px'
                            }}>
                              {day.getDate()}
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              {dayJobs.slice(0, 4).map(job => {
                                const statusColor = defaultStatusColors[job.status] || theme.accent
                                return (
                                  <div
                                    key={job.id}
                                    draggable
                                    onDragStart={(e) => handleJobDragStart(e, job)}
                                    onDragEnd={handleDragEnd}
                                    onClick={() => setDetailJob(job)}
                                    style={{
                                      backgroundColor: `${statusColor}18`,
                                      borderLeft: `3px solid ${statusColor}`,
                                      borderRadius: '3px',
                                      padding: '2px 4px',
                                      cursor: 'grab',
                                      fontSize: '10px',
                                      fontWeight: '500',
                                      color: theme.text,
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis'
                                    }}
                                    title={`${job.job_title || 'Untitled'} — ${job.customer?.name || ''}`}
                                  >
                                    {job.job_title || `Job #${job.id}`}
                                  </div>
                                )
                              })}
                              {dayJobs.length > 4 && (
                                <div style={{ fontSize: '10px', color: theme.textMuted, padding: '1px 4px' }}>
                                  +{dayJobs.length - 4} more
                                </div>
                              )}
                              {/* Appointments */}
                              {dayAppointments.slice(0, Math.max(0, 4 - dayJobs.length)).map(apt => {
                                const aptColor = appointmentStatusColors[apt.status] || '#0ea5e9'
                                const isRecurring = isRecurringAppointment(apt)
                                return (
                                  <div
                                    key={`apt-${apt.id}`}
                                    draggable
                                    onDragStart={(e) => handleAppointmentDragStart(e, apt)}
                                    onDragEnd={handleDragEnd}
                                    onClick={(e) => { e.stopPropagation(); handleAppointmentClick(apt) }}
                                    style={{
                                      backgroundColor: isRecurring ? '#dbeafe' : `${aptColor}15`,
                                      borderLeft: `3px solid ${isRecurring ? '#0ea5e9' : aptColor}`,
                                      borderRadius: '3px',
                                      padding: '2px 4px',
                                      fontSize: '10px',
                                      fontWeight: isRecurring ? '600' : '500',
                                      color: isRecurring ? '#0369a1' : aptColor,
                                      cursor: 'grab',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                      display: 'flex',
                                      alignItems: 'center',
                                      gap: '3px',
                                      border: isRecurring ? '1px solid #93c5fd' : 'none',
                                      borderLeftWidth: '3px'
                                    }}
                                    title={`${isRecurring ? '↻ Recurring — ' : ''}${apt.title}${apt.employee?.name ? ` — ${apt.employee.name}` : ''}${apt.location ? ` @ ${apt.location}` : ''}`}
                                  >
                                    {isRecurring && <RefreshCw size={8} style={{ flexShrink: 0 }} />}
                                    {!isRecurring && <Clock size={8} style={{ flexShrink: 0 }} />}
                                    {apt.title || 'Appointment'}
                                  </div>
                                )
                              })}
                              {(dayJobs.length + dayAppointments.length) > 4 && dayJobs.length <= 4 && dayAppointments.length > (4 - dayJobs.length) && (
                                <div style={{ fontSize: '10px', color: theme.textMuted, padding: '1px 4px' }}>
                                  +{(dayJobs.length + dayAppointments.length) - 4} more
                                </div>
                              )}
                            </div>
                          </>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : (
              /* ===== WEEK VIEW (existing) ===== */
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
                      const slotJobs = getJobsForSlot(day, hour)
                      const slotAppointments = getAppointmentsForSlot(day, hour)
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
                          {/* Render jobs */}
                          {slotJobs.map(job => {
                            const calendar = getCalendarForJob(job)
                            const statusColor = defaultStatusColors[job.status] || theme.accent

                            return (
                              <div
                                key={`job-${job.id}`}
                                draggable
                                onDragStart={(e) => handleJobDragStart(e, job)}
                                onDragEnd={handleDragEnd}
                                onClick={() => setDetailJob(job)}
                                style={{
                                  backgroundColor: `${statusColor}18`,
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  marginBottom: '2px',
                                  cursor: 'grab',
                                  fontSize: '10px',
                                  fontWeight: '600',
                                  color: theme.text,
                                  borderLeft: `3px solid ${statusColor}`,
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}
                                title={`${job.job_title || 'Untitled Job'} — ${job.customer?.name || ''}${calendar ? ` (${calendar.name})` : ''}`}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <Briefcase size={9} style={{ flexShrink: 0, opacity: 0.7 }} />
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {job.job_title || `Job #${job.id}`}
                                  </span>
                                </div>
                              </div>
                            )
                          })}
                          {/* Render sections */}
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
                                  textOverflow: 'ellipsis'
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
                          {/* Render appointments */}
                          {slotAppointments.map(apt => {
                            const aptColor = appointmentStatusColors[apt.status] || '#0ea5e9'
                            const isRecurring = isRecurringAppointment(apt)
                            return (
                              <div
                                key={`apt-${apt.id}`}
                                draggable
                                onDragStart={(e) => handleAppointmentDragStart(e, apt)}
                                onDragEnd={handleDragEnd}
                                onClick={(e) => { e.stopPropagation(); handleAppointmentClick(apt) }}
                                style={{
                                  backgroundColor: isRecurring ? '#dbeafe' : `${aptColor}15`,
                                  borderRadius: '4px',
                                  padding: '4px 6px',
                                  marginBottom: '2px',
                                  fontSize: '10px',
                                  fontWeight: isRecurring ? '600' : '500',
                                  color: isRecurring ? '#0369a1' : aptColor,
                                  borderLeft: `3px solid ${isRecurring ? '#0ea5e9' : aptColor}`,
                                  border: isRecurring ? '1px solid #93c5fd' : 'none',
                                  borderLeftWidth: '3px',
                                  cursor: 'grab',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis'
                                }}
                                title={`${isRecurring ? '↻ Recurring — ' : ''}${apt.title}${apt.employee?.name ? ` — ${apt.employee.name}` : ''}${apt.location ? ` @ ${apt.location}` : ''}`}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  {isRecurring && <RefreshCw size={9} style={{ flexShrink: 0 }} />}
                                  {!isRecurring && <Clock size={9} style={{ flexShrink: 0 }} />}
                                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                    {apt.title || 'Appointment'}
                                  </span>
                                  {apt.employee?.name && (
                                    <span style={{ fontSize: '9px', opacity: 0.7, marginLeft: 'auto', flexShrink: 0 }}>
                                      {apt.employee.name}
                                    </span>
                                  )}
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
            )}
          </div>
        </div>

        {/* Job Map — interactive map with all job locations */}
        {showJobMap && (
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`,
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '12px 16px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <MapPin size={16} color={theme.accent} />
                <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Job Map</span>
                <span style={{ fontSize: '12px', color: theme.textMuted }}>
                  {Object.keys(jobMapCoords).length} of {filteredJobList.filter(j => j.job_address || j.customer?.address || j.gps_location).length} located
                </span>
              </div>
              <button onClick={() => setShowJobMap(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}>
                <X size={16} />
              </button>
            </div>
            <div ref={jobMapRef} style={{ height: isMobile ? '300px' : '400px', width: '100%', backgroundColor: theme.bg }}>
              {!jobMapLoaded && (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: theme.textMuted, fontSize: '13px' }}>
                  Loading map...
                </div>
              )}
            </div>
            <div style={{ padding: '8px 16px', borderTop: `1px solid ${theme.border}`, display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
              {jobStatuses.map(status => {
                const count = Object.entries(jobMapCoords).filter(([id]) => {
                  const job = filteredJobList.find(j => j.id === parseInt(id))
                  return job?.status === status.name
                }).length
                if (count === 0) return null
                return (
                  <div key={status.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', backgroundColor: status.color }} />
                    <span style={{ fontSize: '11px', color: theme.textMuted }}>{status.name} ({count})</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Route Suggestions — groups unscheduled jobs by area */}
        {(() => {
          const needsScheduling = filteredJobList.filter(j => {
            const status = (j.status || '').toLowerCase()
            return (status === 'not started' || status === 'scheduled') && (j.job_address || j.customer?.address)
          })
          if (needsScheduling.length < 2) return null

          const getArea = (job) => {
            const addr = job.job_address || job.customer?.address || ''
            const parts = addr.split(',').map(s => s.trim())
            if (parts.length >= 2) {
              const cityPart = parts.length >= 3 ? parts[parts.length - 2] : parts[1]
              return cityPart.replace(/\d{5}(-\d{4})?/, '').replace(/\b[A-Z]{2}\b/, '').trim() || 'Unknown Area'
            }
            return addr.slice(0, 20) || 'No Address'
          }

          const areaGroups = {}
          needsScheduling.forEach(job => {
            const area = getArea(job)
            if (!areaGroups[area]) areaGroups[area] = []
            areaGroups[area].push(job)
          })

          const routeAreas = Object.entries(areaGroups)
            .filter(([, jobs]) => jobs.length >= 2)
            .sort((a, b) => b[1].length - a[1].length)

          if (routeAreas.length === 0) return null

          return (
            <div style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              overflow: 'hidden'
            }}>
              <div style={{
                padding: '12px 16px',
                borderBottom: `1px solid ${theme.border}`,
                display: 'flex', alignItems: 'center', gap: '8px'
              }}>
                <MapPin size={16} color={theme.accent} />
                <span style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>Route Suggestions</span>
                <span style={{ fontSize: '12px', color: theme.textMuted }}>{needsScheduling.length} jobs need scheduling</span>
              </div>
              <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {routeAreas.map(([area, areaJobs]) => (
                  <div key={area} style={{
                    padding: '12px', backgroundColor: theme.bg, borderRadius: '10px',
                    border: `1px solid ${theme.border}`
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <MapPin size={13} color={theme.accent} />
                        <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{area}</span>
                        <span style={{ padding: '1px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '600', backgroundColor: theme.accentBg, color: theme.accent }}>
                          {areaJobs.length} jobs
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          const addresses = areaJobs.map(j => j.job_address || j.customer?.address).filter(Boolean)
                          if (addresses.length > 0) {
                            const origin = encodeURIComponent(addresses[0])
                            const dest = encodeURIComponent(addresses[addresses.length - 1])
                            const waypoints = addresses.slice(1, -1).map(a => encodeURIComponent(a)).join('|')
                            window.open(`https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${dest}${waypoints ? `&waypoints=${waypoints}` : ''}`, '_blank')
                          }
                        }}
                        style={{
                          padding: '5px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: '600',
                          backgroundColor: theme.accent, color: '#fff', border: 'none', cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: '4px', minHeight: '30px'
                        }}
                      >
                        <MapPin size={11} /> View Route
                      </button>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {areaJobs.map((job, idx) => (
                        <div key={job.id} onClick={() => setDetailJob(job)} style={{
                          display: 'flex', alignItems: 'center', gap: '8px',
                          padding: '6px 8px', borderRadius: '6px', cursor: 'pointer',
                          backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`
                        }}>
                          <span style={{
                            width: '20px', height: '20px', borderRadius: '50%',
                            backgroundColor: theme.accentBg, color: theme.accent,
                            fontSize: '11px', fontWeight: '700',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>{idx + 1}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: '12px', fontWeight: '500', color: theme.text, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {job.job_title || 'Untitled'} — {job.customer?.name || 'No customer'}
                            </p>
                            <p style={{ fontSize: '10px', color: theme.textMuted, margin: '1px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {job.job_address || job.customer?.address || 'No address'}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )
        })()}
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

      {/* Job Detail Slide-out Panel */}
      {detailJob && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', justifyContent: 'flex-end' }}>
          {/* Backdrop */}
          <div
            onClick={() => setDetailJob(null)}
            style={{ position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)' }}
          />
          {/* Panel */}
          <div style={{
            position: 'relative',
            width: isMobile ? '100%' : '480px',
            maxWidth: '100%',
            backgroundColor: theme.bgCard,
            boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            {/* Panel Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px'
            }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {detailJob.job_title || `Job #${detailJob.id}`}
              </h2>
              <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                <button
                  onClick={() => { setDetailJob(null); navigate(`/jobs/${detailJob.id}`) }}
                  style={{
                    padding: '6px 12px', fontSize: '12px', fontWeight: '500',
                    backgroundColor: theme.accent, color: '#fff', border: 'none',
                    borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px'
                  }}
                >
                  <ExternalLink size={12} /> Full View
                </button>
                <button
                  onClick={() => setDetailJob(null)}
                  style={{ padding: '6px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Panel Body */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px' }}>
              {/* Status Badge */}
              <div style={{ marginBottom: '16px' }}>
                <span style={{
                  display: 'inline-block',
                  padding: '4px 12px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: '600',
                  backgroundColor: (defaultStatusColors[detailJob.status] || theme.accent) + '20',
                  color: defaultStatusColors[detailJob.status] || theme.accent
                }}>
                  {detailJob.status}
                </span>
              </div>

              {/* Customer */}
              {(detailJob.customer?.name || detailJob.customer_name) && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Customer</div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                    {detailJob.customer?.name || detailJob.customer_name}
                  </div>
                  {detailJob.customer?.business_name && (
                    <div style={{ fontSize: '13px', color: theme.textSecondary }}>{detailJob.customer.business_name}</div>
                  )}
                  {detailJob.customer?.address && (
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <MapPin size={12} /> {detailJob.customer.address}
                    </div>
                  )}
                  {detailJob.customer?.phone && (
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Phone size={12} /> <a href={`tel:${detailJob.customer.phone}`} style={{ color: theme.accent }}>{detailJob.customer.phone}</a>
                    </div>
                  )}
                  {detailJob.customer?.email && (
                    <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Mail size={12} /> <a href={`mailto:${detailJob.customer.email}`} style={{ color: theme.accent }}>{detailJob.customer.email}</a>
                    </div>
                  )}
                </div>
              )}

              {/* Key Details Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
                {detailJob.start_date && (
                  <div style={{ padding: '10px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Start Date</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} /> {new Date(detailJob.start_date).toLocaleDateString()}
                    </div>
                  </div>
                )}
                {detailJob.end_date && (
                  <div style={{ padding: '10px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>End Date</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={12} /> {new Date(detailJob.end_date).toLocaleDateString()}
                    </div>
                  </div>
                )}
                {detailJob.pm?.name && (
                  <div style={{ padding: '10px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Project Manager</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <User size={12} /> {detailJob.pm.name}
                    </div>
                  </div>
                )}
                {detailJob.business_unit && (
                  <div style={{ padding: '10px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Business Unit</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Building2 size={12} /> {detailJob.business_unit}
                    </div>
                  </div>
                )}
                {detailJob.total_amount != null && (
                  <div style={{ padding: '10px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Job Amount</div>
                    <div style={{ fontSize: '13px', fontWeight: '700', color: '#16a34a' }}>
                      ${parseFloat(detailJob.total_amount || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                  </div>
                )}
                {detailJob.allotted_time_hours != null && (
                  <div style={{ padding: '10px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Allotted Hours</div>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={12} /> {detailJob.allotted_time_hours}h
                    </div>
                  </div>
                )}
              </div>

              {/* Description / Notes */}
              {detailJob.notes && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes</div>
                  <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: '1.5', whiteSpace: 'pre-wrap', padding: '10px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    {detailJob.notes}
                  </div>
                </div>
              )}
              {detailJob.job_description && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</div>
                  <div style={{ fontSize: '13px', color: theme.textSecondary, lineHeight: '1.5', whiteSpace: 'pre-wrap', padding: '10px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    {detailJob.job_description}
                  </div>
                </div>
              )}

              {/* Sections */}
              {(() => {
                const sections = getSectionsForJob(detailJob.id)
                if (sections.length === 0) return null
                return (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Sections ({sections.length})
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {sections.map(section => {
                        const sc = getSectionStatusColor(section.status)
                        return (
                          <div key={section.id} style={{ padding: '10px', backgroundColor: theme.bg, borderRadius: '8px', borderLeft: `3px solid ${sc.text}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{section.name}</span>
                              <span style={{ fontSize: '11px', padding: '2px 8px', borderRadius: '10px', backgroundColor: sc.bg, color: sc.text, fontWeight: '500' }}>
                                {section.status}
                              </span>
                            </div>
                            {section.assigned_employee?.name && (
                              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                                Assigned: {section.assigned_employee.name}
                              </div>
                            )}
                            {section.scheduled_date && (
                              <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                                Scheduled: {new Date(section.scheduled_date).toLocaleDateString()}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })()}

              {/* Progress */}
              {(() => {
                const progress = calculateJobProgress(detailJob.id)
                return (
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                      <span style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Progress</span>
                      <span style={{ fontSize: '12px', fontWeight: '600', color: theme.text }}>{Math.round(progress)}%</span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: theme.border, borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${progress}%`, backgroundColor: progress === 100 ? '#22c55e' : '#3b82f6', borderRadius: '4px', transition: 'width 0.3s' }} />
                    </div>
                  </div>
                )
              })()}
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
      {/* Schedule Job Modal */}
      {showScheduleModal && scheduleJob && (
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
                  Schedule Job
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '2px' }}>
                  {scheduleJob.job_title || `Job #${scheduleJob.id}`}
                  {scheduleJob.customer?.name && ` — ${scheduleJob.customer.name}`}
                </p>
              </div>
              <button
                onClick={() => { setShowScheduleModal(false); setScheduleJob(null) }}
                style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleScheduleJobSubmit} style={{ padding: '20px' }}>
              {scheduleError && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontSize: '14px'
                }}>
                  Error: {scheduleError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Start Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={scheduleForm.start_time}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, start_time: e.target.value }))}
                    required
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Duration</label>
                  <select
                    value={scheduleForm.duration_hours}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, duration_hours: parseFloat(e.target.value) }))}
                    style={inputStyle}
                  >
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={4}>4 hours (half day)</option>
                    <option value={8}>8 hours (full day)</option>
                    <option value={16}>2 days</option>
                    <option value={24}>3 days</option>
                    <option value={40}>1 week</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Assign Project Manager</label>
                  <select
                    value={scheduleForm.pm_id}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, pm_id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">-- Select PM --</option>
                    {employees.filter(e => e.role === 'Project Manager' || e.role === 'Manager' || e.role === 'Admin').map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Assign Employees / Crew</label>
                  <div style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    maxHeight: '140px',
                    overflowY: 'auto',
                    backgroundColor: theme.bgCard
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
                          backgroundColor: scheduleForm.assigned_employee_ids.includes(String(emp.id))
                            ? theme.accentBg : 'transparent'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={scheduleForm.assigned_employee_ids.includes(String(emp.id))}
                          onChange={(e) => {
                            setScheduleForm(prev => ({
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
                  {scheduleForm.assigned_employee_ids.length > 0 && (
                    <div style={{ marginTop: '6px', fontSize: '12px', color: theme.textMuted }}>
                      {scheduleForm.assigned_employee_ids.length} employee{scheduleForm.assigned_employee_ids.length !== 1 ? 's' : ''} selected
                    </div>
                  )}
                </div>

                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.text
                  }}>
                    <input
                      type="checkbox"
                      checked={scheduleForm.createAppointment}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, createAppointment: e.target.checked }))}
                      style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                    />
                    <CalendarPlus size={15} style={{ color: theme.accent }} />
                    Create appointment on calendar
                  </label>
                  <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px', marginLeft: '26px' }}>
                    Adds this job to the Appointments calendar for each assigned employee
                  </p>
                </div>

                {/* Recurrence */}
                <div style={{
                  padding: '16px',
                  backgroundColor: theme.accentBg,
                  borderRadius: '10px',
                  border: `1px solid ${theme.border}`
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={14} style={{ color: theme.accent }} />
                    Recurring Job
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ ...labelStyle, marginBottom: '4px' }}>Frequency</label>
                    <select
                      value={scheduleForm.recurrence}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, recurrence: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="None">Does not repeat</option>
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Bi-Weekly">Every 2 weeks</option>
                      <option value="Monthly">Monthly</option>
                      <option value="Quarterly">Every 3 months</option>
                    </select>
                  </div>

                  {scheduleForm.recurrence !== 'None' && (
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px' }}>Repeat until</label>
                      <input
                        type="date"
                        value={scheduleForm.recurrence_end}
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, recurrence_end: e.target.value }))}
                        style={inputStyle}
                      />
                      {scheduleForm.recurrence_end && scheduleForm.start_time && (
                        <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '6px' }}>
                          {(() => {
                            const start = new Date(scheduleForm.start_time)
                            const end = new Date(scheduleForm.recurrence_end)
                            let count = 0
                            let next = new Date(start)
                            while (true) {
                              if (scheduleForm.recurrence === 'Monthly') next.setMonth(next.getMonth() + 1)
                              else if (scheduleForm.recurrence === 'Quarterly') next.setMonth(next.getMonth() + 3)
                              else if (scheduleForm.recurrence === 'Bi-Weekly') next.setDate(next.getDate() + 14)
                              else if (scheduleForm.recurrence === 'Weekly') next.setDate(next.getDate() + 7)
                              else next.setDate(next.getDate() + 1)
                              if (next > end) break
                              count++
                            }
                            return count > 0
                              ? `Will create ${count} additional job${count !== 1 ? 's' : ''} (${count + 1} total including this one)`
                              : 'End date is too soon — no recurring jobs will be created'
                          })()}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    value={scheduleForm.notes}
                    onChange={(e) => setScheduleForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    placeholder="Scheduling notes..."
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                {scheduleJob.job_address && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: theme.accentBg,
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: theme.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <MapPin size={14} style={{ flexShrink: 0 }} />
                    {scheduleJob.job_address}
                  </div>
                )}

                {/* Send Confirmation */}
                <div style={{
                  padding: '16px',
                  backgroundColor: theme.accentBg,
                  borderRadius: '10px',
                  border: `1px solid ${theme.border}`
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
                    Send Confirmation to Customer
                  </div>

                  {/* Text option */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    marginBottom: scheduleForm.sendText ? '8px' : '12px',
                    fontSize: '13px',
                    color: theme.text
                  }}>
                    <input
                      type="checkbox"
                      checked={scheduleForm.sendText}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, sendText: e.target.checked }))}
                      style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                    />
                    <MessageSquare size={15} style={{ color: theme.accent }} />
                    Send Text Message
                  </label>
                  {scheduleForm.sendText && (
                    <div style={{ marginLeft: '26px', marginBottom: '12px' }}>
                      <input
                        type="tel"
                        value={scheduleForm.phone}
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="Phone number"
                        style={{ ...inputStyle, fontSize: '13px' }}
                      />
                    </div>
                  )}

                  {/* Email option */}
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: 'pointer',
                    marginBottom: scheduleForm.sendEmail ? '8px' : '0',
                    fontSize: '13px',
                    color: theme.text
                  }}>
                    <input
                      type="checkbox"
                      checked={scheduleForm.sendEmail}
                      onChange={(e) => setScheduleForm(prev => ({ ...prev, sendEmail: e.target.checked }))}
                      style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                    />
                    <Mail size={15} style={{ color: theme.accent }} />
                    Send Email
                  </label>
                  {scheduleForm.sendEmail && (
                    <div style={{ marginLeft: '26px' }}>
                      <input
                        type="email"
                        value={scheduleForm.email}
                        onChange={(e) => setScheduleForm(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="Email address"
                        style={{ ...inputStyle, fontSize: '13px' }}
                      />
                    </div>
                  )}

                  {(scheduleForm.sendText || scheduleForm.sendEmail) && (
                    <div style={{
                      marginTop: '10px',
                      padding: '10px',
                      backgroundColor: theme.bgCard,
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: theme.textMuted,
                      lineHeight: '1.5'
                    }}>
                      <strong style={{ color: theme.textSecondary }}>Preview:</strong> Hi {scheduleJob.customer?.name || 'Customer'}, your job "{scheduleJob.job_title || 'your job'}" has been scheduled for {scheduleForm.start_time ? new Date(scheduleForm.start_time).toLocaleString('en-US', { weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '...'} with {company?.name || 'our team'}. We look forward to working with you!
                    </div>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => { setShowScheduleModal(false); setScheduleJob(null) }}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent',
                    color: theme.text,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    minHeight: '44px'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={scheduleSaving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: theme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                    minHeight: '44px',
                    opacity: scheduleSaving ? 0.6 : 1
                  }}
                >
                  {scheduleSaving ? 'Scheduling...' : 'Schedule Job'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Appointment Edit Modal */}
      {editingAppointment && (
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
            borderRadius: '16px',
            width: '100%',
            maxWidth: '440px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  Edit Appointment
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '2px' }}>
                  {editingAppointment.title}
                  {editingAppointment.employee?.name && ` — ${editingAppointment.employee.name}`}
                </p>
              </div>
              <button
                onClick={() => setEditingAppointment(null)}
                style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleAppointmentSave} style={{ padding: '20px' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

                {/* Title */}
                <div>
                  <label style={labelStyle}>Title</label>
                  <input
                    type="text"
                    value={appointmentForm.title}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, title: e.target.value }))}
                    style={inputStyle}
                  />
                </div>

                {/* Start Date & Time */}
                <div>
                  <label style={labelStyle}>Start Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={appointmentForm.start_time}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, start_time: e.target.value }))}
                    required
                    style={inputStyle}
                  />
                </div>

                {/* Duration */}
                <div>
                  <label style={labelStyle}>Duration</label>
                  <select
                    value={appointmentForm.duration_hours}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, duration_hours: parseFloat(e.target.value) }))}
                    style={inputStyle}
                  >
                    <option value={1}>1 hour</option>
                    <option value={2}>2 hours</option>
                    <option value={4}>4 hours (half day)</option>
                    <option value={8}>8 hours (full day)</option>
                    <option value={16}>2 days</option>
                    <option value={24}>3 days</option>
                    <option value={40}>1 week</option>
                  </select>
                </div>

                {/* Status */}
                <div>
                  <label style={labelStyle}>Status</label>
                  <select
                    value={appointmentForm.status}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, status: e.target.value }))}
                    style={inputStyle}
                  >
                    {['Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No Show'].map(s => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>

                {/* Assign Employees / Crew */}
                <div>
                  <label style={labelStyle}>Assign Employees / Crew</label>
                  <div style={{
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    maxHeight: '140px',
                    overflowY: 'auto',
                    backgroundColor: theme.bgCard
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
                          backgroundColor: appointmentForm.assigned_employee_ids.includes(String(emp.id))
                            ? theme.accentBg : 'transparent'
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={appointmentForm.assigned_employee_ids.includes(String(emp.id))}
                          onChange={(e) => {
                            setAppointmentForm(prev => ({
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
                  {appointmentForm.assigned_employee_ids.length > 0 && (
                    <div style={{ marginTop: '6px', fontSize: '12px', color: theme.textMuted }}>
                      {appointmentForm.assigned_employee_ids.length} employee{appointmentForm.assigned_employee_ids.length !== 1 ? 's' : ''} selected
                    </div>
                  )}
                </div>

                {/* Recurring Job Section */}
                <div style={{
                  padding: '16px',
                  backgroundColor: isRecurringAppointment(editingAppointment) ? '#eff6ff' : theme.accentBg,
                  borderRadius: '10px',
                  border: `1px solid ${isRecurringAppointment(editingAppointment) ? '#bfdbfe' : theme.border}`
                }}>
                  <div style={{ fontSize: '13px', fontWeight: '600', color: isRecurringAppointment(editingAppointment) ? '#0ea5e9' : theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <RefreshCw size={14} />
                    Recurring Job
                    {isRecurringAppointment(editingAppointment) && (
                      <span style={{
                        fontSize: '10px',
                        fontWeight: '600',
                        backgroundColor: '#0ea5e9',
                        color: '#fff',
                        padding: '2px 8px',
                        borderRadius: '10px',
                        marginLeft: '4px'
                      }}>
                        ACTIVE
                      </span>
                    )}
                  </div>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ ...labelStyle, marginBottom: '4px' }}>Frequency</label>
                    <select
                      value={appointmentForm.recurrence}
                      onChange={(e) => setAppointmentForm(prev => ({ ...prev, recurrence: e.target.value }))}
                      style={inputStyle}
                    >
                      <option value="None">Does not repeat</option>
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Bi-Weekly">Every 2 weeks</option>
                      <option value="Monthly">Monthly</option>
                      <option value="Quarterly">Every 3 months</option>
                    </select>
                  </div>

                  {appointmentForm.recurrence !== 'None' && !isRecurringAppointment(editingAppointment) && (
                    <div>
                      <label style={{ ...labelStyle, marginBottom: '4px' }}>Repeat until</label>
                      <input
                        type="date"
                        value={appointmentForm.recurrence_end}
                        onChange={(e) => setAppointmentForm(prev => ({ ...prev, recurrence_end: e.target.value }))}
                        style={inputStyle}
                      />
                      {appointmentForm.recurrence_end && appointmentForm.start_time && (
                        <p style={{ fontSize: '11px', color: theme.textMuted, marginTop: '6px' }}>
                          {(() => {
                            const start = new Date(appointmentForm.start_time)
                            const end = new Date(appointmentForm.recurrence_end)
                            let count = 0, next = new Date(start)
                            while (true) {
                              if (appointmentForm.recurrence === 'Monthly') next.setMonth(next.getMonth() + 1)
                              else if (appointmentForm.recurrence === 'Quarterly') next.setMonth(next.getMonth() + 3)
                              else if (appointmentForm.recurrence === 'Bi-Weekly') next.setDate(next.getDate() + 14)
                              else if (appointmentForm.recurrence === 'Weekly') next.setDate(next.getDate() + 7)
                              else next.setDate(next.getDate() + 1)
                              if (next > end) break
                              count++
                            }
                            return count > 0
                              ? `Will create ${count} additional appointment${count !== 1 ? 's' : ''}`
                              : 'End date is too soon'
                          })()}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* Location */}
                {(appointmentForm.location || editingAppointment.location) && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: theme.accentBg,
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: theme.textSecondary,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px'
                  }}>
                    <MapPin size={14} style={{ flexShrink: 0 }} />
                    <input
                      type="text"
                      value={appointmentForm.location}
                      onChange={(e) => setAppointmentForm(prev => ({ ...prev, location: e.target.value }))}
                      placeholder="Location"
                      style={{ ...inputStyle, backgroundColor: 'transparent', border: 'none', padding: 0 }}
                    />
                  </div>
                )}

                {/* Notes */}
                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    value={appointmentForm.notes}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={3}
                    placeholder="Appointment notes..."
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              </div>

              {/* Footer Buttons */}
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={handleAppointmentDelete}
                  style={{
                    padding: '12px',
                    border: `1px solid #fecaca`,
                    backgroundColor: '#fef2f2',
                    color: '#dc2626',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    minHeight: '44px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Trash2 size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditingAppointment(null)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent',
                    color: theme.text,
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    minHeight: '44px'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={appointmentSaving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: theme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '14px',
                    minHeight: '44px',
                    opacity: appointmentSaving ? 0.6 : 1
                  }}
                >
                  {appointmentSaving ? 'Saving...' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

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

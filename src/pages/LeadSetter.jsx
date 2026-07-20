import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { fromZonedInput, toZonedInput, zonedDayKey, zonedHour, DEFAULT_TZ } from '../lib/dateTz'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
import {
  Plus, X, Phone, Mail, Calendar, Clock, User, Building2, MapPin,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, XCircle,
  MessageSquare, PhoneCall, PhoneOff, CalendarPlus, DollarSign,
  RefreshCw, Filter, Search, Settings, Trophy, Trash2
} from 'lucide-react'
import EntityCard from '../components/EntityCard'
import { isAdmin as checkAdmin } from '../lib/accessControl'
import ProspectResearchDrawer from '../components/ProspectResearchDrawer'
import SearchableSelect from '../components/SearchableSelect'
import SalespeopleMultiSelect from '../components/SalespeopleMultiSelect'

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

// Setter stages — the active draggable kanban columns. Setters move
// leads through these by dragging cards. Callback and Scheduled used
// to be bundled (Callback → Contacted column; Scheduled was a top
// stat). They're now first-class columns so the setter's workflow
// (and the Video Library walkthrough) actually match.
const setterStages = [
  { id: 'New',             label: 'New Leads',  color: '#3b82f6' },
  { id: 'Contacted',       label: 'Contacted',  color: '#8b5cf6' },
  { id: 'Callback',        label: 'Callback',   color: '#eab308', icon: '📞' },
  { id: 'Appointment Set', label: 'Scheduled',  color: '#10b981', icon: '📅' },
]

// Win stages — read-only stat counters at the top of the board.
const winStages = [
  { id: 'Qualified', label: 'Qualified', color: '#059669', icon: '✅' }
]

export default function LeadSetter() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const employees = useStore((state) => state.employees)
  const company = useStore((state) => state.company)
  const setCompany = useStore((state) => state.setCompany)
  const fetchAppointments = useStore((state) => state.fetchAppointments)
  const deleteLead = useStore((state) => state.deleteLead)

  // Data
  const [leads, setLeads] = useState([])
  const [appointments, setAppointments] = useState([])
  const [commissions, setCommissions] = useState([])
  // Lead IDs that have a linked lighting_audit — those belong in the
  // sales pipeline, not the setter board. Kept in state so getLeadsByStage
  // can exclude them when merging appointment-derived leads.
  const [auditLinkedIds, setAuditLinkedIds] = useState(() => new Set())
  const [loading, setLoading] = useState(true)

  // Prospect research drawer (AI-powered web research → leads)
  const [showResearch, setShowResearch] = useState(false)

  // Settings modal
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    setter_pay_per_appointment: 25,
    commission_requires_quote: true,
    source_pay_per_lead: 0
  })

  // Calendar
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [calendarView, setCalendarView] = useState('week') // week or day
  // Mobile-only tab: the calendar used to sit ~33 screens below the full lead
  // list. Default to Calendar (what setters want first); Leads is one tap away.
  const [mobileTab, setMobileTab] = useState('calendar') // 'calendar' | 'leads'

  // Modals
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)
  const [contactForm, setContactForm] = useState({ notes: '', callback_date: '', callback_time: '' })
  const [showEventModal, setShowEventModal] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState(null)
  const [eventForm, setEventForm] = useState({ start_time: '', duration_minutes: 60, salesperson_id: '', salesperson_ids: [], location: '', notes: '' })
  const [savingEvent, setSavingEvent] = useState(false)

  // Drag state
  const [draggedLead, setDraggedLead] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)

  // Reactivate-customer-as-lead modal
  const [showReactivateModal, setShowReactivateModal] = useState(false)
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [blockForm, setBlockForm] = useState({ start_time: '', duration_minutes: 60, salesperson_id: '', salesperson_ids: [], notes: '' })
  const [blockSaving, setBlockSaving] = useState(false)
  const [reactivateSearch, setReactivateSearch] = useState('')
  const [reactivating, setReactivating] = useState(false)
  const customers = useStore((state) => state.customers) || []
  const [dragOverSlot, setDragOverSlot] = useState(null)
  const [draggedAppointment, setDraggedAppointment] = useState(null) // for rescheduling existing appointments

  // Appointment form
  const [appointmentForm, setAppointmentForm] = useState({
    start_time: '',
    duration_minutes: 60,
    salesperson_id: '',           // primary rep (kept for backward compat)
    salesperson_ids: [],          // full list of assigned reps
    location: '',
    notes: ''
  })

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSetter, setFilterSetter] = useState('')
  const [calendarEmployees, setCalendarEmployees] = useState(() => { try { return JSON.parse(localStorage.getItem("leadsetter_calendar_employees") || "[]") } catch { return [] } }) // selected employee IDs to overlay
  // "Only mine" toggle — Noah complained "I used to be able to see my
  // scheduled Apointments in lead setter and now I can't see them".
  // The calendar shows ALL company appointments, so reps with many
  // colleagues' meetings lose track of their own. Toggle filters the
  // grid to the current user's appointments only.
  const [onlyMine, setOnlyMine] = useState(() => { try { return localStorage.getItem("leadsetter_only_mine") === 'true' } catch { return false } })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  // Persist calendar employee overlay selections
  useEffect(() => {
    localStorage.setItem('leadsetter_calendar_employees', JSON.stringify(calendarEmployees))
  }, [calendarEmployees])
  useEffect(() => {
    localStorage.setItem('leadsetter_only_mine', onlyMine ? 'true' : 'false')
  }, [onlyMine])

  // Check if user is admin
  const isAdmin = checkAdmin(user)

  // Fetch data
  const fetchData = async () => {
    if (!companyId) return
    setLoading(true)

    // Build query - setter board shows all leads in early stages
    let leadsQuery = supabase
      .from('leads')
      .select('*, lead_owner:employees!leads_lead_owner_id_fkey(id, name), setter_owner:employees!leads_setter_owner_id_fkey(id, name)')
      .eq('company_id', companyId)
      // Include 'Appointment Set' so the new Scheduled column renders.
      .in('status', ['New', 'Assigned', 'Contacted', 'Callback', 'Appointment Set'])
      .order('created_at', { ascending: false })

    // Non-admins only see leads assigned to them (as setter or lead owner)
    if (!isAdmin && user?.id) {
      leadsQuery = leadsQuery.or(
        `setter_owner_id.eq.${user.id},lead_owner_id.eq.${user.id},setter_owner_id.is.null`
      )
    }

    // Fetch appointments for calendar
    const weekStart = getWeekStart(currentDate)
    weekStart.setHours(0, 0, 0, 0)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    weekEnd.setHours(23, 59, 59, 999)

    const [{ data: leadsData }, { data: appointmentsData }, { data: commissionsData }, { data: auditLeadIds }] = await Promise.all([
      leadsQuery,

      // Pull the joined lead data alongside appointments so the
      // Scheduled column can render a lead card directly from an
      // appointment row (no extra fetch). 'status' and a few other
      // fields are needed so the card has callback/contact info.
      supabase
        .from('appointments')
        .select('*, lead:leads!lead_id(id, customer_name, business_name, phone, address, service_type, status, setter_owner_id, lead_owner_id, callback_date, created_at, contact_attempts, last_contact_at, notes), salesperson:employees!salesperson_id(id, name)')
        .eq('company_id', companyId)
        .gte('start_time', weekStart.toISOString())
        .lte('start_time', weekEnd.toISOString())
        .or('lead_id.not.is.null,appointment_type.eq.Block,appointment_type.is.null')
        .order('start_time'),

      supabase
        .from('setter_commissions')
        .select('*')
        .eq('company_id', companyId)
        .eq('setter_id', user?.id)
        .order('created_at', { ascending: false }),

      // Get lead IDs that have lighting audits — these belong in the sales pipeline, not setter board
      supabase
        .from('lighting_audits')
        .select('lead_id')
        .eq('company_id', companyId)
        .not('lead_id', 'is', null)
    ])

    // Filter out leads that have linked audits
    const auditLinkedIdsSet = new Set((auditLeadIds || []).map(a => a.lead_id))
    const filteredLeads = (leadsData || []).filter(l => !auditLinkedIdsSet.has(l.id))

    setAuditLinkedIds(auditLinkedIdsSet)
    setLeads(filteredLeads)
    setAppointments(appointmentsData || [])
    setCommissions(commissionsData || [])

    // Load company settings
    if (company) {
      setSettingsForm({
        setter_pay_per_appointment: company.setter_pay_per_appointment || 25,
        commission_requires_quote: company.commission_requires_quote !== false,
        source_pay_per_lead: company.source_pay_per_lead || 0
      })
    }

    setLoading(false)
  }

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchData()
  }, [companyId, currentDate])

  // Legacy status mapping for display
  // Statuses we re-bucket for display. 'Assigned' is treated the same
  // as 'New' (legacy data). Callback is NO LONGER bundled — it has its
  // own column now.
  const setterStatusMap = { 'Assigned': 'New' }

  // Get leads by stage
  const getLeadsByStage = (stageId) => {
    let filtered = leads.filter(l => (setterStatusMap[l.status] || l.status) === stageId)

    // Scheduled column mirrors the visible calendar week. The
    // appointments state is already the week's appointments — derive
    // the column directly from it so navigating the calendar (week +/-)
    // shifts the column in lockstep. Lead status is irrelevant here:
    // if it's on the calendar this week, it's "scheduled" this week.
    if (stageId === 'Appointment Set') {
      const seen = new Set()
      const merged = []

      appointments.forEach(apt => {
        if (!apt.lead_id || !apt.lead) return          // skip Blocks / unlinked
        if (seen.has(apt.lead.id)) return              // dedup: take earliest apt
        if (auditLinkedIds.has(apt.lead.id)) return    // belongs in sales pipeline
        seen.add(apt.lead.id)

        // Prefer the full lead row from `leads` (richer) when present;
        // fall back to the joined lead from the appointment.
        const full = leads.find(l => l.id === apt.lead.id)
        merged.push({
          ...(full || apt.lead),
          status: 'Appointment Set',
          appointment_time: apt.start_time,
          appointment_id: apt.id,
          salesperson_id: apt.salesperson_id,
          salesperson_ids: apt.salesperson_ids,
        })
      })

      filtered = merged

      // "Only mine" — setter wants to see appointments THEY booked
      // (setter_owner_id), reps want their assigned leads
      // (lead_owner_id, salesperson_id, salesperson_ids).
      if (onlyMine && user?.id) {
        filtered = filtered.filter(l => {
          const ids = Array.isArray(l.salesperson_ids) ? l.salesperson_ids : []
          return l.setter_owner_id === user.id
            || l.lead_owner_id === user.id
            || l.salesperson_id === user.id
            || ids.includes(user.id)
        })
      }

      // Sort by appointment_time ascending — earliest day-of-week first.
      filtered.sort((a, b) => {
        const at = a.appointment_time ? new Date(a.appointment_time).getTime() : Infinity
        const bt = b.appointment_time ? new Date(b.appointment_time).getTime() : Infinity
        return at - bt
      })
    }

    if (searchTerm) {
      filtered = filtered.filter(l =>
        l.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.phone?.includes(searchTerm)
      )
    }
    if (filterSetter) {
      if (filterSetter === 'unassigned') {
        filtered = filtered.filter(l => !l.setter_owner_id && !l.lead_owner_id)
      } else {
        const fId = parseInt(filterSetter)
        filtered = filtered.filter(l => l.setter_owner_id === fId || l.lead_owner_id === fId)
      }
    }
    return filtered
  }

  // Calendar helpers — anchored to the company region tz (Mountain), NOT the
  // viewer's device, so leads never jump a day on a non-Utah device or across a
  // DST change (Tracy e8cccc81). Each grid day is the NOON-UTC instant of a
  // Mountain calendar day, so the display getters (getDate/getDay/toDateString)
  // still read the right day in any US timezone, while bucketing compares
  // Mountain day-keys.
  const MT = DEFAULT_TZ
  const mtKey = (d) => zonedDayKey((d instanceof Date ? d : new Date(d)).toISOString(), MT)

  const getWeekStart = (date) => {
    const [y, m, d] = mtKey(date).split('-').map(Number)
    const noon = Date.UTC(y, m - 1, d, 12)
    const dow = new Date(noon).getUTCDay() // 0=Sun for that Mountain day
    return new Date(noon - dow * 86400000)
  }

  const getWeekDays = () => {
    const start = getWeekStart(currentDate)
    return Array.from({ length: 7 }, (_, i) => new Date(start.getTime() + i * 86400000))
  }

  const getHourSlots = () => {
    const slots = []
    for (let h = 7; h <= 19; h++) {
      slots.push(h)
    }
    return slots
  }

  const getAppointmentsForSlot = (date, hour) => {
    return appointments.filter(apt => {
      // "Only mine" filter — match by salesperson_id OR membership in
      // salesperson_ids array (multi-rep meetings still show on mine).
      if (onlyMine && user?.id) {
        const ids = Array.isArray(apt.salesperson_ids) ? apt.salesperson_ids : []
        const isMine = apt.salesperson_id === user.id || ids.includes(user.id)
        if (!isMine) return false
      }
      const sameDay = mtKey(apt.start_time) === mtKey(date)
      const aptHour = zonedHour(apt.start_time, MT)
      const sameHour = aptHour === hour
      const isOutsideRange = aptHour < 7 || aptHour > 19
      const showInFirstSlot = isOutsideRange && hour === 7 && aptHour < 7
      const showInLastSlot = isOutsideRange && hour === 19 && aptHour > 19
      return sameDay && (sameHour || showInFirstSlot || showInLastSlot)
    })
  }

  // Get color for a salesperson chip
  const getSalespersonColor = (empId) => {
    const chipColors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#6366f1', '#f97316']
    const salespeople = employees.filter(e =>
      e.role === 'Sales' || e.role === 'Salesman' || e.role === 'Manager' || e.role === 'Admin'
    )
    const idx = salespeople.findIndex(sp => sp.id === empId)
    return idx >= 0 ? chipColors[idx % chipColors.length] : theme.accent
  }


  const isToday = (date) => mtKey(date) === mtKey(new Date())

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

  const prevMonth = () => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() - 1)
      return d
    })
  }

  const nextMonth = () => {
    setCurrentDate(prev => {
      const d = new Date(prev)
      d.setMonth(d.getMonth() + 1)
      return d
    })
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Reactivate an existing customer as a fresh lead in the New stage
  const handleReactivateCustomer = async (customer) => {
    if (!customer || reactivating) return
    setReactivating(true)
    const senderName = user?.name || 'Someone'
    const noteText = `Reactivated from existing customer by ${senderName} on ${new Date().toLocaleDateString()}`
    const { data, error } = await supabase
      .from('leads')
      .insert({
        company_id: companyId,
        customer_name: customer.name,
        email: customer.email || null,
        phone: customer.phone || null,
        address: customer.address || null,
        business_name: customer.business_name || null,
        status: 'New',
        lead_source: 'Existing Customer',
        customer_id: customer.id,
        notes: noteText
      })
      .select()
      .single()
    setReactivating(false)
    if (error) {
      const { toast } = await import('../lib/toast')
      toast.error('Error reactivating: ' + error.message)
      return
    }
    const { toast } = await import('../lib/toast')
    toast.success(`${customer.name} added as a new lead`)
    setShowReactivateModal(false)
    setReactivateSearch('')
    await fetchData()
  }

  // Drag handlers for Kanban
  const handleDragStart = (e, lead) => {
    setDraggedLead(lead)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', lead.id.toString()) // Required for drop to work
  }

  const handleDragEnd = () => {
    setDraggedLead(null)
    setDraggedAppointment(null)
    setDragOverStage(null)
    setDragOverSlot(null)
  }

  const handleStageDragOver = (e, stageId) => {
    e.preventDefault()
    setDragOverStage(stageId)
    setDragOverSlot(null)
  }

  const handleStageDrop = async (e, stageId) => {
    e.preventDefault()
    setDragOverStage(null)

    if (!draggedLead || draggedLead.status === stageId) return

    // Dragging into the Scheduled column has to actually SCHEDULE the
    // lead — not just flip a status flag. Without this, the rep's
    // calendar/My Projects stay empty because there's no appointments
    // row, no salesperson_id, no start_time. Open the appointment modal
    // pre-filled with tomorrow 10am; the user picks the rep + time and
    // handleCreateAppointment writes the full row + updates the lead.
    if (stageId === 'Appointment Set') {
      const lead = draggedLead
      setDraggedLead(null)
      const tomorrow = new Date()
      tomorrow.setDate(tomorrow.getDate() + 1)
      tomorrow.setHours(10, 0, 0, 0)
      setSelectedLead(lead)
      setAppointmentForm({
        start_time: formatDateTimeLocal(tomorrow),
        duration_minutes: 60,
        salesperson_id: '',
        salesperson_ids: [],
        location: lead.address || '',
        notes: ''
      })
      setAppointmentError(null)
      setShowAppointmentModal(true)
      return
    }

    // Dragging into Callback has to capture the callback date — without
    // a date, the column is just a graveyard and the overdue/scheduled
    // badges + sort on the column don't work. Open the lead contact
    // modal so the user fills callback_date/time; logContact() then
    // sets status='Callback' + callback_date together (one atomic write).
    if (stageId === 'Callback') {
      const lead = draggedLead
      setDraggedLead(null)
      setSelectedLead(lead)
      setContactForm({ notes: '', callback_date: '', callback_time: '' })
      setShowLeadModal(true)
      return
    }

    // New / Contacted — plain status flip is fine. Stamp last_contact_at
    // + bump contact_attempts only when moving INTO Contacted, matching
    // the existing logContact() behavior.
    await supabase
      .from('leads')
      .update({
        status: stageId,
        last_contact_at: stageId === 'Contacted' ? new Date().toISOString() : draggedLead.last_contact_at,
        contact_attempts: stageId === 'Contacted' ? (draggedLead.contact_attempts || 0) + 1 : draggedLead.contact_attempts
      })
      .eq('id', draggedLead.id)

    await fetchData()
  }

  // Drag to calendar slot (works for both leads and existing appointments)
  const handleSlotDragOver = (e, date, hour) => {
    e.preventDefault()
    setDragOverSlot({ date, hour })
    setDragOverStage(null)
  }

  // Drag start for existing appointment chip
  const handleAppointmentDragStart = (e, apt) => {
    setDraggedAppointment(apt)
    setDraggedLead(null)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `apt:${apt.id}`)
  }

  // Format an instant as the Mountain wall-clock "YYYY-MM-DDTHH:MM" the
  // datetime-local input shows — matches how appointments are saved (below), so
  // a time entered as 2pm always means 2pm Mountain, not the device's tz.
  const formatDateTimeLocal = (date) => toZonedInput((date instanceof Date ? date : new Date(date)).toISOString(), MT)

  const handleSlotDrop = async (e, date, hour) => {
    e.preventDefault()
    setDragOverSlot(null)

    // Reschedule existing appointment via drag
    if (draggedAppointment) {
      const apt = draggedAppointment
      const oldStart = new Date(apt.start_time)
      // Build the new start from the dropped slot's Mountain wall-clock time.
      const newStartIso = fromZonedInput(`${mtKey(date)}T${String(hour).padStart(2, '0')}:00`, MT)
      const newStart = new Date(newStartIso)

      // Same slot — no-op
      if (mtKey(oldStart) === mtKey(date) && zonedHour(apt.start_time, MT) === hour) {
        setDraggedAppointment(null)
        return
      }

      // Preserve duration
      let newEnd = null
      if (apt.end_time) {
        const duration = new Date(apt.end_time).getTime() - oldStart.getTime()
        newEnd = new Date(newStart.getTime() + duration).toISOString()
      }

      await supabase
        .from('appointments')
        .update({ start_time: newStartIso, end_time: newEnd, updated_at: new Date().toISOString() })
        .eq('id', apt.id)

      setDraggedAppointment(null)
      await fetchData()
      return
    }

    if (!draggedLead) return

    // Open appointment modal pre-filled with the dropped slot's Mountain time.
    setSelectedLead(draggedLead)
    setAppointmentForm({
      start_time: `${mtKey(date)}T${String(hour).padStart(2, '0')}:00`,
      duration_minutes: 60,
      salesperson_id: '',
      salesperson_ids: [],
      location: draggedLead.address || '',
      notes: ''
    })
    setAppointmentError(null)
    setShowAppointmentModal(true)
  }

  // Appointment error state
  const [appointmentError, setAppointmentError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Create appointment
  const handleCreateAppointment = async (e) => {
    e.preventDefault()
    if (!selectedLead || !appointmentForm.start_time) return

    setSaving(true)
    setAppointmentError(null)

    // The form holds a Mountain wall-clock string; convert to the real UTC
    // instant so the appointment lands on the same day/time for everyone.
    const startTime = new Date(fromZonedInput(appointmentForm.start_time, MT))
    const endTime = new Date(startTime.getTime() + appointmentForm.duration_minutes * 60000)

    // Resolve salesperson list. Primary id (salesperson_id) is the first in
    // the array — kept for backward compat with everything that reads only
    // that column. Full list goes into salesperson_ids.
    const ids = (appointmentForm.salesperson_ids || []).filter(Boolean)
    if (appointmentForm.salesperson_id && !ids.includes(appointmentForm.salesperson_id)) {
      ids.unshift(appointmentForm.salesperson_id)
    }
    const primaryId = ids[0] || appointmentForm.salesperson_id || null

    // Create appointment with all required fields
    const appointmentPayload = {
      company_id: companyId,
      lead_id: selectedLead.id,
      title: `${selectedLead.customer_name} - ${selectedLead.service_type || 'Consultation'}`,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_minutes: appointmentForm.duration_minutes,
      location: appointmentForm.location || selectedLead.address || null,
      salesperson_id: primaryId,
      salesperson_ids: ids,
      setter_id: user?.id || null,
      lead_owner_id: selectedLead.lead_owner_id || null,
      status: 'Scheduled',
      notes: appointmentForm.notes || null
    }

    console.log('Creating appointment:', appointmentPayload)

    const { data: apt, error } = await supabase
      .from('appointments')
      .insert(appointmentPayload)
      .select()
      .single()

    if (error) {
      console.error('Error creating appointment:', error)
      setAppointmentError(error.message)
      setSaving(false)
      return
    }

    console.log('Appointment created:', apt)

    // Update lead status and link appointment
    const { error: leadError } = await supabase
      .from('leads')
      .update({
        status: 'Appointment Set',
        appointment_time: startTime.toISOString(),
        appointment_id: apt.id,
        salesperson_id: primaryId,
        salesperson_ids: ids,
        // Transfer ownership to the rep so this lead appears in their
        // "My Projects" list in Lenard. Without this, Cole opens Lenard
        // and can't see the leads Tracy scheduled for him, so he ends
        // up creating a duplicate lead which orphans Tracy's setter
        // commission.
        lead_owner_id: primaryId,
      })
      .eq('id', selectedLead.id)

    if (leadError) {
      console.error('Error updating lead:', leadError)
    }

    // Create SETTER commission in lead_commissions table
    try {
      // Get setter's commission rate from employee profile
      const { data: setterEmployee } = await supabase
        .from('employees')
        .select('commission_setter_rate, commission_setter_type')
        .eq('id', user?.id)
        .single()

      const setterRate = setterEmployee?.commission_setter_rate || company?.setter_pay_per_appointment || 25

      if (setterRate > 0) {
        await supabase
          .from('lead_commissions')
          .insert({
            company_id: companyId,
            lead_id: selectedLead.id,
            appointment_id: apt.id,
            commission_type: 'appointment_set',
            employee_id: user?.id,
            amount: setterRate,
            rate_type: setterEmployee?.commission_setter_type || 'flat',
            payment_status: 'pending'
          })
        console.log('Setter commission created:', setterRate)
      }
    } catch (err) {
      console.log('Setter commission not created:', err)
    }

    // Create LEAD SOURCE commission (when a source employee is set)
    try {
      if (selectedLead.lead_source_employee_id) {
        const { data: sourceEmployee } = await supabase
          .from('employees')
          .select('commission_leads_rate, commission_leads_type')
          .eq('id', selectedLead.lead_source_employee_id)
          .single()

        const sourceRate = sourceEmployee?.commission_leads_rate || company?.source_pay_per_lead || 0
        if (sourceRate > 0) {
          await supabase
            .from('lead_commissions')
            .insert({
              company_id: companyId,
              lead_id: selectedLead.id,
              appointment_id: apt.id,
              commission_type: 'lead_source',
              employee_id: selectedLead.lead_source_employee_id,
              amount: sourceRate,
              rate_type: sourceEmployee?.commission_leads_type || 'flat',
              payment_status: 'pending'
            })
          console.log('Lead source commission created:', sourceRate)
        }
      }
    } catch (err) {
      console.log('Lead source commission not created:', err)
    }

    // Also try legacy setter_commissions table for backwards compatibility
    try {
      if (company?.setter_pay_per_appointment > 0) {
        await supabase
          .from('setter_commissions')
          .insert({
            company_id: companyId,
            lead_id: selectedLead.id,
            appointment_id: apt.id,
            setter_id: user?.id,
            setter_amount: company?.setter_pay_per_appointment || 25,
            payment_status: 'pending'
          })
      }
    } catch (err) {
      // Legacy table may not exist
    }

    console.log('Appointment saved successfully, refreshing...')

    setSaving(false)
    setShowAppointmentModal(false)
    setSelectedLead(null)
    setDraggedLead(null)

    // Refresh local data
    await fetchData()
    console.log('Local fetchData completed, appointments count:', appointments.length)

    // Also refresh global store appointments
    if (fetchAppointments) {
      await fetchAppointments()
    }

    // Refresh shared calendar component if available
    if (window.refreshAppointmentsCalendar) {
      window.refreshAppointmentsCalendar()
      console.log('Shared calendar refreshed')
    }
  }

  // Open lead detail
  const openLeadDetail = (lead) => {
    setSelectedLead(lead)
    setShowLeadModal(true)
  }

  // Log contact attempt
  const logContact = async (lead, outcome, contactNotes, callbackDateTime) => {
    const updates = {
      last_contact_at: new Date().toISOString(),
      contact_attempts: (lead.contact_attempts || 0) + 1
    }

    if (contactNotes) {
      const existingNotes = lead.notes || ''
      const timestamp = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
      updates.notes = `[${timestamp}] ${contactNotes}${existingNotes ? '\n' + existingNotes : ''}`
    }

    if (outcome === 'contacted') {
      updates.status = 'Contacted'
    } else if (outcome === 'callback') {
      // Move to the Callback column (was bundled into Contacted before
      // Callback became a real kanban column).
      updates.status = 'Callback'
      updates.callback_date = callbackDateTime || null
      if (contactNotes) updates.callback_notes = contactNotes
    } else if (outcome === 'not_qualified') {
      updates.status = 'Lost'
    } else if (outcome === 'no_answer') {
      updates.status = lead.status === 'New' ? 'New' : 'Contacted'
    }

    await supabase
      .from('leads')
      .update(updates)
      .eq('id', lead.id)

    setShowLeadModal(false)
    setSelectedLead(null)
    setContactForm({ notes: '', callback_date: '', callback_time: '' })
    await fetchData()
  }

  // Save commission settings
  const saveSettings = async () => {
    // Bridge the old boolean (commission_requires_quote) to the canonical
    // rule field (setter_qualification_rule). Payroll + the DB trigger that
    // promotes pending→earned both key off the rule field. Keeping the
    // boolean in sync so legacy code/queries that still read it stay correct.
    const ruleFromBool = settingsForm.commission_requires_quote
      ? 'quote_created'
      : 'appointment_set'
    const { error } = await supabase
      .from('companies')
      .update({
        setter_pay_per_appointment: parseFloat(settingsForm.setter_pay_per_appointment) || 0,
        commission_requires_quote: settingsForm.commission_requires_quote,
        setter_qualification_rule: ruleFromBool,
        source_pay_per_lead: parseFloat(settingsForm.source_pay_per_lead) || 0
      })
      .eq('id', companyId)

    if (!error) {
      // Update company in store so UI reflects new values immediately
      setCompany({
        ...company,
        setter_pay_per_appointment: parseFloat(settingsForm.setter_pay_per_appointment) || 0,
        commission_requires_quote: settingsForm.commission_requires_quote,
        setter_qualification_rule: ruleFromBool,
        source_pay_per_lead: parseFloat(settingsForm.source_pay_per_lead) || 0
      })
      setShowSettingsModal(false)
    }
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

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

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
    <div style={{ padding: '16px', height: isMobile ? 'auto' : '100%', minHeight: isMobile ? '100%' : undefined, display: 'flex', flexDirection: 'column', overflow: isMobile ? 'auto' : 'hidden', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text }}>
            Lead Setter
          </h1>
          <p style={{ fontSize: '13px', color: theme.textMuted }}>
            Drag leads to calendar to schedule appointments
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Commission Summary */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: isMobile ? '8px' : '12px',
            padding: isMobile ? '6px 10px' : '8px 14px',
            backgroundColor: '#dcfce7',
            borderRadius: '8px',
            fontSize: isMobile ? '12px' : '13px',
            color: '#166534',
            flexWrap: 'wrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <DollarSign size={14} />
              <span style={{ fontWeight: '600' }}>
                ${company?.setter_pay_per_appointment || 25}
              </span>
              <span style={{ color: '#15803d' }}>/appt</span>
            </div>
            {(company?.source_pay_per_lead > 0) && (
              <>
                <div style={{ width: '1px', height: '16px', backgroundColor: '#86efac' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <span style={{ fontWeight: '600' }}>
                    ${company.source_pay_per_lead}
                  </span>
                  <span style={{ color: '#15803d' }}>/source</span>
                </div>
              </>
            )}
            <div style={{ width: '1px', height: '16px', backgroundColor: '#86efac' }} />
            <div>
              <span style={{ fontWeight: '600' }}>{commissions.filter(c => c.payment_status === 'pending').length}</span>
              <span style={{ color: '#15803d' }}> pending</span>
            </div>
            <div style={{ width: '1px', height: '16px', backgroundColor: '#86efac' }} />
            <div>
              <span style={{ fontWeight: '600' }}>
                ${commissions.filter(c => c.payment_status === 'paid').reduce((sum, c) => sum + (c.setter_amount || 0), 0)}
              </span>
              <span style={{ color: '#15803d' }}> earned</span>
            </div>
          </div>

          {/* Setter Filter (Admin only) */}
          {isAdmin && (
            <SearchableSelect
              options={[
                { value: '', label: 'All Setters' },
                { value: 'unassigned', label: 'Unassigned' },
                ...employees.filter(e => e.role === 'Setter' || e.role === 'Sales' || e.role === 'Admin' || e.role === 'Manager').map(emp => ({ value: emp.id, label: emp.name }))
              ]}
              value={filterSetter}
              onChange={(val) => setFilterSetter(val)}
              placeholder="All Setters"
              theme={theme}
              style={{ minWidth: '180px' }}
            />
          )}

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ ...inputStyle, paddingLeft: '34px', width: isMobile ? '140px' : '180px' }}
            />
          </div>
          <button
            onClick={() => setShowReactivateModal(true)}
            title="Reactivate an existing customer as a new lead"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              backgroundColor: theme.accentBg,
              border: `1px solid ${theme.accent}`,
              color: theme.accent,
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500'
            }}
          >
            <Plus size={14} />
            {!isMobile && 'Reactivate Customer'}
          </button>
          {/* AI prospect research — Claude does live web research,
              returns ranked candidates the setter can import as leads.
              Mobile-first drawer; works on phone or desktop. */}
          <button
            onClick={() => setShowResearch(true)}
            title="Find new prospects via AI web research"
            style={{
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '10px 14px',
              backgroundColor: '#7c3aed',
              border: 'none',
              color: '#fff',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '13px', fontWeight: 600,
            }}
          >
            <Search size={14} />
            {!isMobile && 'Find Prospects'}
          </button>
          <button
            onClick={fetchData}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
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
              onClick={() => setShowSettingsModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 14px',
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

      {/* Mobile tab bar: Calendar | Leads. Desktop shows both side-by-side. */}
      {isMobile && (
        <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
          {['calendar', 'leads'].map(tab => (
            <button key={tab} onClick={() => setMobileTab(tab)} style={{
              flex: 1, minHeight: '44px', padding: '10px', borderRadius: '10px', fontSize: '14px', fontWeight: '700',
              textTransform: 'capitalize', cursor: 'pointer',
              border: `1px solid ${mobileTab === tab ? theme.accent : theme.border}`,
              backgroundColor: mobileTab === tab ? theme.accent : theme.bgCard,
              color: mobileTab === tab ? '#fff' : theme.textSecondary
            }}>{tab}</button>
          ))}
        </div>
      )}

      {/* Main Content - Split View */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', flex: 1, gap: '16px', overflow: isMobile ? 'auto' : 'hidden' }}>
        {/* Left: Kanban Leads — hidden on mobile unless the Leads tab is active */}
        <div style={{ width: isMobile ? '100%' : '450px', flexShrink: 0, display: (isMobile && mobileTab !== 'leads') ? 'none' : 'flex', flexDirection: 'column', overflow: 'hidden', minHeight: isMobile ? '300px' : undefined }}>
          {/* Stats Row */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '12px',
            overflowX: isMobile ? 'auto' : undefined,
            flexWrap: isMobile ? 'nowrap' : undefined
          }}>
            {setterStages.map(stage => (
              <div
                key={stage.id}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: theme.bgCard,
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  textAlign: 'center',
                  minWidth: isMobile ? '70px' : undefined
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: '700', color: stage.color }}>
                  {getLeadsByStage(stage.id).length}
                </div>
                <div style={{ fontSize: '11px', color: theme.textMuted }}>{stage.label}</div>
              </div>
            ))}
            {/* Wins */}
            {winStages.map(stage => (
              <div
                key={stage.id}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: '#dcfce7',
                  borderRadius: '8px',
                  border: `1px solid #86efac`,
                  textAlign: 'center',
                  minWidth: isMobile ? '70px' : undefined
                }}
              >
                <div style={{ fontSize: '18px', fontWeight: '700', color: stage.color }}>
                  {getLeadsByStage(stage.id).length}
                </div>
                <div style={{ fontSize: '11px', color: '#166534' }}>{stage.icon} {stage.label}</div>
              </div>
            ))}
          </div>

          {/* Kanban Columns */}
          <div style={{ display: 'flex', gap: '8px', flex: 1, overflow: isMobile ? 'auto' : 'hidden', overflowX: isMobile ? 'auto' : undefined }}>
            {setterStages.map(stage => (
              <div
                key={stage.id}
                style={{
                  flex: 1,
                  minWidth: isMobile ? '200px' : 0,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'hidden'
                }}
                onDragOver={(e) => handleStageDragOver(e, stage.id)}
                onDragLeave={() => setDragOverStage(null)}
                onDrop={(e) => handleStageDrop(e, stage.id)}
              >
                {/* Stage Header */}
                <div style={{
                  backgroundColor: stage.color,
                  color: '#fff',
                  padding: '8px',
                  borderRadius: '8px 8px 0 0',
                  fontSize: '12px',
                  fontWeight: '600',
                  textAlign: 'center'
                }}>
                  {stage.label.split(' ')[0]}
                  <span style={{
                    marginLeft: '6px',
                    backgroundColor: 'rgba(255,255,255,0.25)',
                    padding: '1px 6px',
                    borderRadius: '8px',
                    fontSize: '11px'
                  }}>
                    {getLeadsByStage(stage.id).length}
                  </span>
                </div>

                {/* Stage Content */}
                <div style={{
                  flex: 1,
                  backgroundColor: dragOverStage === stage.id ? theme.accentBg : 'rgba(0,0,0,0.02)',
                  border: dragOverStage === stage.id ? `2px dashed ${theme.accent}` : '2px solid transparent',
                  borderRadius: '0 0 8px 8px',
                  padding: '6px',
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {(() => {
                    const all = getLeadsByStage(stage.id)
                    let rows, overflow
                    if (stage.id === 'Appointment Set') {
                      // Already sorted by appointment_time (nearest-up first)
                      // inside getLeadsByStage. Cap visible cards so the column
                      // stays scannable — overflow link sends them to the calendar.
                      const CAP = 50
                      rows = all.slice(0, CAP)
                      overflow = all.length - rows.length
                    } else {
                      const sorted = all.slice().sort((a, b) => {
                        // Overdue callbacks first, then upcoming callbacks, then by created
                        const now = new Date()
                        const aCb = a.callback_date ? new Date(a.callback_date) : null
                        const bCb = b.callback_date ? new Date(b.callback_date) : null
                        const aOverdue = aCb && aCb <= now
                        const bOverdue = bCb && bCb <= now
                        if (aOverdue && !bOverdue) return -1
                        if (!aOverdue && bOverdue) return 1
                        if (aCb && bCb) return aCb - bCb
                        if (aCb) return -1
                        if (bCb) return 1
                        return new Date(b.created_at) - new Date(a.created_at)
                      })
                      // Cap so a column with hundreds of leads doesn't render a
                      // 30-screen page (the New column was the height driver).
                      const CAP = 25
                      rows = sorted.slice(0, CAP)
                      overflow = sorted.length - rows.length
                    }
                    return (<>
                    {rows.map(lead => {
                    const isOverdue = lead.callback_date && new Date(lead.callback_date) <= new Date()
                    const hasCallback = !!lead.callback_date
                    const lastNote = lead.notes ? lead.notes.split('\n')[0] : null
                    const timeSinceContact = lead.last_contact_at
                      ? Math.floor((Date.now() - new Date(lead.last_contact_at)) / 36e5)
                      : null
                    return (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
                      onDragEnd={handleDragEnd}
                      onClick={() => openLeadDetail(lead)}
                      style={{
                        cursor: 'grab',
                        padding: '8px 10px',
                        backgroundColor: isOverdue ? 'rgba(239,68,68,0.06)' : theme.bgCard,
                        borderRadius: '8px',
                        border: `1px solid ${isOverdue ? 'rgba(239,68,68,0.3)' : theme.border}`,
                        transition: 'box-shadow 0.15s',
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                        <div style={{
                          fontWeight: '600', fontSize: '13px',
                          color: theme.text,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1
                        }}>
                          {/* Tracy: show the COMPANY along with the contact
                              on the Lead Setter, like the Leads tab. */}
                          {lead.business_name ? `${lead.business_name} — ${lead.customer_name}` : lead.customer_name}
                        </div>
                        {lead.contact_attempts > 0 && (
                          <span style={{
                            fontSize: '10px', color: theme.textMuted, flexShrink: 0,
                            backgroundColor: theme.bg, padding: '1px 5px', borderRadius: '4px'
                          }}>
                            {lead.contact_attempts}x
                          </span>
                        )}
                      </div>
                      {lead.phone && (
                        <div style={{ color: theme.textMuted, fontSize: '11px', marginTop: '2px' }}>
                          {lead.phone}
                        </div>
                      )}
                      {lead.service_type && (
                        <div style={{ fontSize: '10px', color: theme.accent, marginTop: '2px' }}>
                          {lead.service_type}
                        </div>
                      )}
                      {hasCallback && (
                        <div style={{
                          marginTop: '4px', fontSize: '10px', fontWeight: '600',
                          color: isOverdue ? '#ef4444' : '#f59e0b',
                          display: 'flex', alignItems: 'center', gap: '3px'
                        }}>
                          <Clock size={10} />
                          {isOverdue ? 'Overdue: ' : 'Callback: '}
                          {new Date(lead.callback_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          {lead.callback_date.includes('T') && !lead.callback_date.endsWith('T00:00:00') &&
                            ' ' + new Date(lead.callback_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                          }
                        </div>
                      )}
                      {lastNote && (
                        <div style={{
                          marginTop: '3px', fontSize: '10px', color: theme.textMuted,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          fontStyle: 'italic'
                        }}>
                          {lastNote.replace(/^\[.*?\]\s*/, '')}
                        </div>
                      )}
                      {timeSinceContact !== null && !hasCallback && (
                        <div style={{
                          marginTop: '3px', fontSize: '10px',
                          color: timeSinceContact > 48 ? '#ef4444' : timeSinceContact > 24 ? '#f59e0b' : theme.textMuted
                        }}>
                          {timeSinceContact < 1 ? 'Just contacted' :
                           timeSinceContact < 24 ? `${timeSinceContact}h ago` :
                           `${Math.floor(timeSinceContact / 24)}d ago`}
                        </div>
                      )}
                    </div>
                    )
                  })}
                  {overflow > 0 && (
                    <div style={{
                      textAlign: 'center', padding: '8px',
                      fontSize: '11px', color: theme.textMuted, fontStyle: 'italic',
                      borderTop: `1px dashed ${theme.border}`, marginTop: '4px'
                    }}>
                      +{overflow} more{stage.id === 'Appointment Set' ? ' on the calendar →' : ' — search or filter to narrow'}
                    </div>
                  )}
                  {all.length === 0 && (
                    <div style={{
                      textAlign: 'center',
                      padding: '16px 8px',
                      color: theme.textMuted,
                      fontSize: '11px'
                    }}>
                      {stage.id === 'Appointment Set' ? 'Nothing booked' : 'No leads'}
                    </div>
                  )}
                    </>)
                  })()}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right: Calendar — hidden on mobile unless the Calendar tab is active */}
        <div style={{
          flex: 1,
          display: (isMobile && mobileTab !== 'calendar') ? 'none' : 'flex',
          flexDirection: 'column',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'hidden',
          minHeight: isMobile ? '400px' : undefined
        }}>
          {/* Calendar Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: isMobile ? '10px 12px' : '12px 16px',
            borderBottom: `1px solid ${theme.border}`,
            flexWrap: 'wrap',
            gap: isMobile ? '8px' : '0'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <button
                onClick={prevMonth}
                title="Previous Month"
                style={{
                  padding: '6px 8px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.textSecondary,
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                ««
              </button>
              <button
                onClick={prevWeek}
                title="Previous Week"
                style={{
                  padding: '6px 10px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.textSecondary,
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                ‹
              </button>
              <button
                onClick={goToToday}
                style={{
                  padding: '8px 16px',
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
                title="Next Week"
                style={{
                  padding: '6px 10px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.textSecondary,
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                ›
              </button>
              <button
                onClick={nextMonth}
                title="Next Month"
                style={{
                  padding: '6px 8px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.textSecondary,
                  fontSize: '14px',
                  fontWeight: '600'
                }}
              >
                »»
              </button>
            </div>
            <h3 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
              {weekDays[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <div style={{ fontSize: '13px', color: theme.textMuted }}>
              {weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            {/* Block Out Time — Doug's request: sales team needs to mark
                themselves unavailable (auctions, dr appts) so the setter
                doesn't schedule meetings on top of them. Creates an
                appointment row with appointment_type='Block' and no
                lead_id, which the existing calendar grid already renders
                as a Block (see line ~1374). */}
            <button
              onClick={() => setShowBlockModal(true)}
              style={{
                padding: '6px 12px',
                backgroundColor: '#fef3c7',
                border: '1px solid #f59e0b',
                color: '#92400e',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: '12px',
                fontWeight: '600',
                display: 'flex',
                alignItems: 'center',
                gap: '4px'
              }}
              title="Block out time so reps can't be scheduled then"
            >
              <Clock size={12} /> Block Time
            </button>
            {/* Only Mine toggle — Noah wanted to see HIS appointments
                without other reps' clutter. Sales-role users get a
                quick toggle that filters the grid to just their own. */}
            {user?.id && (
              <button
                onClick={() => setOnlyMine(v => !v)}
                style={{
                  padding: '6px 12px',
                  backgroundColor: onlyMine ? theme.accent : 'transparent',
                  border: `1px solid ${onlyMine ? theme.accent : theme.border}`,
                  color: onlyMine ? '#ffffff' : theme.textSecondary,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
                title={onlyMine ? 'Showing only your appointments. Click to show everyone.' : 'Show only your appointments'}
              >
                <User size={12} /> {onlyMine ? 'Only mine' : 'Only mine?'}
              </button>
            )}
          </div>

          {/* Salesperson Calendar Overlay Toggles */}
          {(() => {
            const salespeople = employees.filter(e =>
              e.role === 'Sales' || e.role === 'Salesman' || e.role === 'Manager' || e.role === 'Admin'
            )
            if (salespeople.length === 0) return null
            const chipColors = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#14b8a6', '#ec4899', '#6366f1', '#f97316']
            return (
              <div style={{
                padding: '6px 12px', display: 'flex', alignItems: 'center', gap: '6px',
                flexWrap: 'wrap', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.bg
              }}>
                <span style={{ fontSize: '10px', color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '2px' }}>
                  Show:
                </span>
                {salespeople.map((sp, idx) => {
                  const isOn = calendarEmployees.includes(sp.id)
                  const color = chipColors[idx % chipColors.length]
                  return (
                    <button
                      key={sp.id}
                      onClick={() => setCalendarEmployees(prev =>
                        prev.includes(sp.id) ? prev.filter(id => id !== sp.id) : [...prev, sp.id]
                      )}
                      style={{
                        display: 'flex', alignItems: 'center', gap: '4px',
                        padding: '3px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600',
                        border: `1.5px solid ${color}`,
                        backgroundColor: isOn ? color : 'transparent',
                        color: isOn ? '#fff' : color,
                        cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap'
                      }}
                    >
                      <span style={{
                        width: '6px', height: '6px', borderRadius: '50%',
                        backgroundColor: isOn ? '#fff' : color, flexShrink: 0
                      }} />
                      {sp.name?.split(' ')[0]}
                    </button>
                  )
                })}
              </div>
            )
          })()}

          {/* Calendar Grid */}
          <div style={{ flex: 1, overflow: 'auto', overflowX: 'auto' }}>
            <table style={{ width: isMobile ? '700px' : '100%', minWidth: isMobile ? '700px' : undefined, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
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
                        fontSize: '11px',
                        color: theme.textMuted,
                        textTransform: 'uppercase'
                      }}>
                        {day.toLocaleDateString('en-US', { weekday: 'short' })}
                      </div>
                      <div style={{
                        fontSize: '18px',
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
                      fontSize: '11px',
                      color: theme.textMuted,
                      textAlign: 'right',
                      verticalAlign: 'top',
                      borderBottom: `1px solid ${theme.border}`
                    }}>
                      {formatTime(hour)}
                    </td>
                    {weekDays.map((day, i) => {
                      const slotAppointments = getAppointmentsForSlot(day, hour)
                      const isSlotDragOver = dragOverSlot?.date?.toDateString() === day.toDateString() && dragOverSlot?.hour === hour
                      const hasBlock = slotAppointments.some(a => a.appointment_type === 'Block')

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
                            backgroundColor: isSlotDragOver
                              ? (draggedAppointment ? 'rgba(59,130,246,0.12)' : theme.accentBg)
                              : hasBlock ? `${theme.textMuted}08`
                              : (isToday(day) ? 'rgba(90,99,73,0.04)' : 'transparent'),
                            transition: 'background-color 0.15s'
                          }}
                        >
                          {slotAppointments.map(apt => {
                            const spId = apt.salesperson_id || apt.employee_id
                            // Color every appointment that has a salesperson —
                            // was previously gated behind isOverlay (only non-
                            // self-set meetings showed rep color). Tracy /
                            // Doug reported they couldn't tell whose meeting
                            // was whose on the calendar because self-set
                            // appointments all showed the same generic accent.
                            const spColor = spId ? getSalespersonColor(spId) : null
                            const hasRepColor = !!spColor
                            const isDragging = draggedAppointment?.id === apt.id
                            const isBlock = apt.appointment_type === 'Block'
                            return (
                            <div
                              key={apt.id}
                              draggable
                              onDragStart={(e) => handleAppointmentDragStart(e, apt)}
                              onDragEnd={handleDragEnd}
                              style={{
                                // Cancelled/Completed overrides everything so
                                // status is still readable. Otherwise fall
                                // back to the rep's chip color, then the
                                // today / default accent.
                                backgroundColor: isBlock ? `${theme.textMuted}15` :
                                  apt.status === 'Cancelled' ? '#fee2e2' :
                                  apt.status === 'Completed' ? '#dcfce7' :
                                  hasRepColor ? spColor + '20' :
                                  isToday(new Date(apt.start_time)) ? '#d1fae5' : theme.accentBg,
                                borderLeft: `3px solid ${isBlock ? theme.textMuted :
                                  apt.status === 'Cancelled' ? '#dc2626' :
                                  apt.status === 'Completed' ? '#16a34a' :
                                  hasRepColor ? spColor :
                                  isToday(new Date(apt.start_time)) ? '#059669' : theme.accent}`,
                                borderRadius: '4px',
                                padding: '4px 6px',
                                fontSize: '10px',
                                overflow: 'hidden',
                                cursor: 'grab',
                                opacity: isDragging ? 0.4 : 1,
                                fontStyle: isBlock ? 'italic' : 'normal'
                              }}
                              onClick={() => {
                                setSelectedEvent(apt)
                                setEventForm({
                                  start_time: formatDateTimeLocal(new Date(apt.start_time)),
                                  duration_minutes: apt.duration_minutes || 60,
                                  salesperson_id: apt.salesperson_id || '',
                                  salesperson_ids: Array.isArray(apt.salesperson_ids) && apt.salesperson_ids.length
                                    ? apt.salesperson_ids
                                    : (apt.salesperson_id ? [apt.salesperson_id] : []),
                                  location: apt.location || '',
                                  notes: apt.notes || ''
                                })
                                setShowEventModal(true)
                              }}
                            >
                              <div style={{
                                fontWeight: '600',
                                color: hasRepColor ? spColor : theme.text,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {apt.lead?.business_name ? `${apt.lead.business_name} — ${apt.lead.customer_name}` : (apt.lead?.customer_name || apt.title)}
                              </div>
                              {(() => {
                                // Show all assigned reps. Falls back to the
                                // joined salesperson when the array column
                                // isn't populated yet.
                                const ids = Array.isArray(apt.salesperson_ids) && apt.salesperson_ids.length
                                  ? apt.salesperson_ids
                                  : (apt.salesperson_id ? [apt.salesperson_id] : [])
                                if (ids.length === 0 && apt.salesperson) {
                                  return (
                                    <div style={{ color: hasRepColor ? spColor : theme.textMuted, fontSize: '9px', opacity: 0.8 }}>
                                      {apt.salesperson.name}
                                    </div>
                                  )
                                }
                                if (ids.length === 0) return null
                                const names = ids.map(id => employees.find(e => e.id === id)?.name).filter(Boolean)
                                if (names.length === 0) return null
                                return (
                                  <div style={{ color: hasRepColor ? spColor : theme.textMuted, fontSize: '9px', opacity: 0.85, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {names.join(', ')}
                                  </div>
                                )
                              })()}
                            </div>
                            )
                          })}

                          {isSlotDragOver && (draggedLead || draggedAppointment) && slotAppointments.length === 0 && (
                            <div style={{
                              height: '100%',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              border: `2px dashed ${draggedAppointment ? '#3b82f6' : theme.accent}`,
                              borderRadius: '4px',
                              color: draggedAppointment ? '#3b82f6' : theme.accent,
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

      {/* Appointment Modal */}
      {showAppointmentModal && selectedLead && (
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
            maxWidth: isMobile ? 'calc(100vw - 32px)' : '440px',
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
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                  Schedule Appointment
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '2px' }}>
                  {selectedLead.customer_name}
                </p>
              </div>
              <button
                onClick={() => {
                  setShowAppointmentModal(false)
                  setSelectedLead(null)
                }}
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

            <form onSubmit={handleCreateAppointment} style={{ padding: isMobile ? '16px' : '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              {appointmentError && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontSize: '14px'
                }}>
                  Error: {appointmentError}
                </div>
              )}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={appointmentForm.start_time}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, start_time: e.target.value }))}
                    required
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Duration</label>
                  <select
                    value={appointmentForm.duration_minutes}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, duration_minutes: parseInt(e.target.value) }))}
                    style={inputStyle}
                  >
                    <option value={30}>30 minutes</option>
                    <option value={60}>1 hour</option>
                    <option value={90}>1.5 hours</option>
                    <option value={120}>2 hours</option>
                    <option value={180}>3 hours</option>
                    <option value={240}>4 hours</option>
                    <option value={480}>All day (8 hours)</option>
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Assign Sales Reps</label>
                  <SalespeopleMultiSelect
                    employees={employees}
                    selectedIds={appointmentForm.salesperson_ids?.length
                      ? appointmentForm.salesperson_ids
                      : (appointmentForm.salesperson_id ? [appointmentForm.salesperson_id] : [])}
                    onChange={(ids) => setAppointmentForm(prev => ({
                      ...prev,
                      salesperson_ids: ids,
                      salesperson_id: ids[0] || '',
                    }))}
                    theme={theme}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Location</label>
                  <input
                    value={appointmentForm.location}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, location: e.target.value }))}
                    placeholder="Address or 'Virtual'"
                    style={inputStyle}
                  />
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    value={appointmentForm.notes}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, notes: e.target.value }))}
                    rows={2}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>

                {(company?.setter_pay_per_appointment > 0 || company?.source_pay_per_lead > 0) && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#dcfce7',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#166534'
                  }}>
                    {company?.setter_pay_per_appointment > 0 && (
                      <div style={{ marginBottom: company?.source_pay_per_lead > 0 ? '6px' : 0 }}>
                        <DollarSign size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        <span> Setter Commission: ${company.setter_pay_per_appointment} </span>
                        <span style={{ fontSize: '11px', color: '#15803d' }}>
                          (paid when quote generated)
                        </span>
                      </div>
                    )}
                    {company?.source_pay_per_lead > 0 && selectedLead?.lead_source_employee_id && (
                      <div>
                        <DollarSign size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                        <span> Source Commission: ${company.source_pay_per_lead} </span>
                        <span style={{ fontSize: '11px', color: '#15803d' }}>
                          (paid to lead source)
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button
                  type="button"
                  onClick={() => {
                    setShowAppointmentModal(false)
                    setSelectedLead(null)
                  }}
                  style={{
                    flex: 1,
                    padding: '12px',
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
                  disabled={saving}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: theme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.7 : 1
                  }}
                >
                  {saving ? 'Scheduling...' : 'Schedule'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lead Detail Modal */}
      {showLeadModal && selectedLead && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px', zIndex: 50
        }} onClick={(e) => { if (e.target === e.currentTarget) { setShowLeadModal(false); setSelectedLead(null); setContactForm({ notes: '', callback_date: '', callback_time: '' }) } }}>
          <div style={{
            backgroundColor: theme.bgCard, borderRadius: '16px',
            width: '100%', maxWidth: isMobile ? 'calc(100vw - 32px)' : '440px', maxHeight: '90vh', overflowY: 'auto'
          }}>
            {/* Header */}
            <div style={{
              padding: '16px 20px', borderBottom: `1px solid ${theme.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>
                  {selectedLead.customer_name}
                </h2>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {selectedLead.service_type && <span>{selectedLead.service_type}</span>}
                  {selectedLead.lead_source && <span>via {selectedLead.lead_source}</span>}
                  <span>{selectedLead.contact_attempts || 0} attempts</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => navigate(`/leads/${selectedLead.id}`)}
                  style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
                  title="View full lead detail"
                >
                  <ChevronRight size={18} />
                </button>
                <button
                  onClick={() => { setShowLeadModal(false); setSelectedLead(null); setContactForm({ notes: '', callback_date: '', callback_time: '' }) }}
                  style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div style={{ padding: '16px 20px', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Quick Contact Buttons */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                {selectedLead.phone && (
                  <a href={`tel:${selectedLead.phone}`} style={{
                    flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    padding: '12px', backgroundColor: '#dcfce7', borderRadius: '8px',
                    color: '#166534', textDecoration: 'none', fontWeight: '600', fontSize: '14px',
                    minHeight: '44px'
                  }}>
                    <Phone size={18} />
                    {selectedLead.phone}
                  </a>
                )}
                {selectedLead.email && (
                  <a href={`mailto:${selectedLead.email}`} style={{
                    flex: selectedLead.phone ? 0 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    gap: '6px', padding: '12px', backgroundColor: theme.accentBg, borderRadius: '8px',
                    color: theme.accent, textDecoration: 'none', fontSize: '13px', minHeight: '44px',
                    minWidth: '44px'
                  }}>
                    <Mail size={16} />
                    {!selectedLead.phone && selectedLead.email}
                  </a>
                )}
              </div>

              {/* Address */}
              {selectedLead.address && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '16px',
                  padding: '8px 10px', backgroundColor: theme.bg, borderRadius: '6px',
                  fontSize: '13px', color: theme.textSecondary
                }}>
                  <MapPin size={14} style={{ flexShrink: 0 }} />
                  {selectedLead.address}
                </div>
              )}

              {/* Previous Notes */}
              {selectedLead.notes && (
                <div style={{ marginBottom: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Notes History
                  </div>
                  <div style={{
                    padding: '10px', backgroundColor: theme.bg, borderRadius: '8px',
                    fontSize: '12px', color: theme.textSecondary, maxHeight: '100px', overflowY: 'auto',
                    whiteSpace: 'pre-wrap', lineHeight: '1.5'
                  }}>
                    {selectedLead.notes}
                  </div>
                </div>
              )}

              {/* Existing callback indicator */}
              {selectedLead.callback_date && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px',
                  padding: '10px 12px', borderRadius: '8px',
                  backgroundColor: new Date(selectedLead.callback_date) <= new Date() ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
                  border: `1px solid ${new Date(selectedLead.callback_date) <= new Date() ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)'}`
                }}>
                  <Clock size={14} color={new Date(selectedLead.callback_date) <= new Date() ? '#ef4444' : '#f59e0b'} />
                  <div>
                    <div style={{ fontSize: '12px', fontWeight: '600', color: new Date(selectedLead.callback_date) <= new Date() ? '#ef4444' : '#f59e0b' }}>
                      {new Date(selectedLead.callback_date) <= new Date() ? 'Overdue Callback' : 'Callback Scheduled'}
                    </div>
                    <div style={{ fontSize: '12px', color: theme.textSecondary }}>
                      {new Date(selectedLead.callback_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      {selectedLead.callback_date.includes('T') && !selectedLead.callback_date.endsWith('T00:00:00') &&
                        ' at ' + new Date(selectedLead.callback_date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      }
                    </div>
                    {selectedLead.callback_notes && (
                      <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px', fontStyle: 'italic' }}>
                        {selectedLead.callback_notes}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Appointment confirmed */}
              {selectedLead.status === 'Appointment Set' && selectedLead.appointment_time && (
                <div style={{
                  padding: '16px', backgroundColor: '#dcfce7', borderRadius: '8px',
                  textAlign: 'center', marginBottom: '16px'
                }}>
                  <Calendar size={24} color="#166534" style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: '600', color: '#166534' }}>Appointment Scheduled</div>
                  <div style={{ fontSize: '14px', color: '#15803d' }}>
                    {new Date(selectedLead.appointment_time).toLocaleString()}
                  </div>
                </div>
              )}

              {/* Log Contact Section */}
              {selectedLead.status !== 'Appointment Set' && (
                <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '16px' }}>
                  <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                    Log This Contact
                  </div>

                  {/* Notes */}
                  <textarea
                    value={contactForm.notes}
                    onChange={(e) => setContactForm(prev => ({ ...prev, notes: e.target.value }))}
                    placeholder="What happened? Left voicemail, spoke with decision maker, got info..."
                    style={{
                      ...inputStyle, minHeight: '70px', resize: 'vertical',
                      marginBottom: '10px', fontSize: '13px'
                    }}
                  />

                  {/* Callback Date/Time */}
                  <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px', marginBottom: '14px' }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Callback Date</label>
                      <input
                        type="date"
                        value={contactForm.callback_date}
                        onChange={(e) => setContactForm(prev => ({ ...prev, callback_date: e.target.value }))}
                        min={new Date().toISOString().split('T')[0]}
                        style={{ ...inputStyle, fontSize: '13px' }}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ fontSize: '11px', color: theme.textMuted, display: 'block', marginBottom: '4px' }}>Time</label>
                      <input
                        type="time"
                        value={contactForm.callback_time}
                        onChange={(e) => setContactForm(prev => ({ ...prev, callback_time: e.target.value }))}
                        style={{ ...inputStyle, fontSize: '13px' }}
                      />
                    </div>
                  </div>

                  {/* Outcome Buttons */}
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                    <button
                      onClick={() => {
                        const cbDT = contactForm.callback_date
                          ? `${contactForm.callback_date}${contactForm.callback_time ? 'T' + contactForm.callback_time + ':00' : 'T00:00:00'}`
                          : null
                        logContact(selectedLead, cbDT ? 'callback' : 'contacted', contactForm.notes, cbDT)
                      }}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '6px', padding: '10px 12px', minHeight: '44px',
                        backgroundColor: '#dbeafe', color: '#1d4ed8',
                        border: 'none', borderRadius: '8px', fontSize: '13px',
                        fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      <PhoneCall size={15} />
                      {contactForm.callback_date ? 'Set Callback' : 'Contacted'}
                    </button>
                    <button
                      onClick={() => logContact(selectedLead, 'no_answer', contactForm.notes)}
                      style={{
                        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '6px', padding: '10px 12px', minHeight: '44px',
                        backgroundColor: '#fef3c7', color: '#b45309',
                        border: 'none', borderRadius: '8px', fontSize: '13px',
                        fontWeight: '600', cursor: 'pointer'
                      }}
                    >
                      <PhoneOff size={15} />
                      No Answer
                    </button>
                    <button
                      onClick={() => logContact(selectedLead, 'not_qualified', contactForm.notes)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        gap: '6px', padding: '10px 12px', minHeight: '44px',
                        backgroundColor: '#fef2f2', color: '#dc2626',
                        border: 'none', borderRadius: '8px', fontSize: '13px',
                        fontWeight: '500', cursor: 'pointer'
                      }}
                    >
                      <XCircle size={15} />
                      Lost
                    </button>
                  </div>

                  {/* Schedule Appointment */}
                  <button
                    onClick={() => {
                      setShowLeadModal(false)
                      setAppointmentForm({
                        start_time: '', duration_minutes: 60, salesperson_id: '',
                        location: selectedLead.address || '', notes: ''
                      })
                      setShowAppointmentModal(true)
                    }}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      gap: '8px', padding: '12px', minHeight: '44px',
                      backgroundColor: theme.accent, color: '#fff',
                      border: 'none', borderRadius: '8px',
                      fontSize: '14px', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    <CalendarPlus size={18} />
                    Schedule Appointment
                  </button>
                </div>
              )}

              {/* Delete */}
              <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '12px', marginTop: '16px', display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={async () => {
                    if (!window.confirm(`Delete "${selectedLead.customer_name}"? This cannot be undone.`)) return
                    try {
                      await deleteLead(selectedLead.id)
                      setLeads(prev => prev.filter(l => l.id !== selectedLead.id))
                      setShowLeadModal(false)
                      setSelectedLead(null)
                    } catch (err) {
                      alert('Error deleting lead: ' + err.message)
                    }
                  }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                    backgroundColor: 'transparent', color: theme.textMuted,
                    border: 'none', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                  }}
                >
                  <Trash2 size={13} />
                  Delete Lead
                </button>
                {selectedLead.appointment_id && (
                  <button
                    onClick={async () => {
                      if (!window.confirm('Remove this appointment? The lead will remain.')) return
                      try {
                        await supabase.from('appointments').delete().eq('id', selectedLead.appointment_id)
                        await supabase.from('leads').update({ status: 'Contacted', appointment_time: null, appointment_id: null, updated_at: new Date().toISOString() }).eq('id', selectedLead.id)
                        setShowLeadModal(false)
                        setSelectedLead(null)
                        await fetchData()
                      } catch (err) {
                        alert('Error: ' + err.message)
                      }
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px',
                      backgroundColor: 'transparent', color: '#dc2626',
                      border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={13} />
                    Delete Event
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Event Detail Modal */}
      {showEventModal && selectedEvent && (
        <div style={{
          position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          padding: '16px', zIndex: 50
        }} onClick={(e) => { if (e.target === e.currentTarget) { setShowEventModal(false); setSelectedEvent(null) } }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', width: '100%', maxWidth: isMobile ? 'calc(100vw - 32px)' : '440px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ padding: '16px 20px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{selectedEvent.lead?.business_name ? `${selectedEvent.lead.business_name} — ${selectedEvent.lead.customer_name}` : (selectedEvent.lead?.customer_name || selectedEvent.title)}</h2>
                <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                  {selectedEvent.lead?.service_type || 'Appointment'}{(() => {
                    const ids = Array.isArray(selectedEvent.salesperson_ids) && selectedEvent.salesperson_ids.length
                      ? selectedEvent.salesperson_ids
                      : (selectedEvent.salesperson_id ? [selectedEvent.salesperson_id] : [])
                    const names = ids.map(id => employees.find(e => e.id === id)?.name).filter(Boolean)
                    if (names.length > 0) return ' \xb7 ' + names.join(', ')
                    if (selectedEvent.salesperson) return ' \xb7 ' + selectedEvent.salesperson.name
                    return ''
                  })()}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '4px' }}>
                {selectedEvent.lead_id && (
                  <button onClick={() => navigate(`/leads/${selectedEvent.lead_id}`)} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }} title="View full lead"><ChevronRight size={18} /></button>
                )}
                <button onClick={() => { setShowEventModal(false); setSelectedEvent(null) }} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}><X size={18} /></button>
              </div>
            </div>

            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px', maxHeight: '70vh', overflowY: 'auto' }}>
              {/* Quick Contact */}
              {(selectedEvent.lead?.phone || selectedEvent.lead?.address) && (
                <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', gap: '8px' }}>
                  {selectedEvent.lead?.phone && (
                    <a href={`tel:${selectedEvent.lead.phone}`} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '10px', backgroundColor: '#dcfce7', borderRadius: '8px', color: '#166534', textDecoration: 'none', fontWeight: '600', fontSize: '13px', minHeight: '44px' }}>
                      <Phone size={16} />{selectedEvent.lead.phone}
                    </a>
                  )}
                  {selectedEvent.lead?.address && (
                    <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '6px', padding: '10px', backgroundColor: theme.bg, borderRadius: '8px', fontSize: '12px', color: theme.textSecondary }}>
                      <MapPin size={14} style={{ flexShrink: 0 }} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{selectedEvent.lead.address}</span>
                    </div>
                  )}
                </div>
              )}

              {/* Date & Time */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date & Time</label>
                <input type="datetime-local" value={eventForm.start_time} onChange={(e) => setEventForm(f => ({ ...f, start_time: e.target.value }))} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', color: theme.text, backgroundColor: theme.bgCard, outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {/* Duration & Assigned To */}
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Duration</label>
                  <select value={eventForm.duration_minutes} onChange={(e) => setEventForm(f => ({ ...f, duration_minutes: parseInt(e.target.value) }))} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', color: theme.text, backgroundColor: theme.bgCard, outline: 'none', boxSizing: 'border-box' }}>
                    <option value={30}>30 min</option><option value={60}>1 hour</option><option value={90}>1.5 hours</option><option value={120}>2 hours</option><option value={180}>3 hours</option><option value={240}>4 hours</option><option value={480}>All day (8 hours)</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Assigned Reps</label>
                  <SalespeopleMultiSelect
                    employees={employees}
                    selectedIds={eventForm.salesperson_ids?.length
                      ? eventForm.salesperson_ids
                      : (eventForm.salesperson_id ? [eventForm.salesperson_id] : [])}
                    onChange={(ids) => setEventForm(f => ({
                      ...f,
                      salesperson_ids: ids,
                      salesperson_id: ids[0] || '',
                    }))}
                    theme={theme}
                  />
                </div>
              </div>

              {/* Location */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Location</label>
                <input type="text" value={eventForm.location} onChange={(e) => setEventForm(f => ({ ...f, location: e.target.value }))} placeholder="Address or 'Virtual'" style={{ width: '100%', padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', color: theme.text, backgroundColor: theme.bgCard, outline: 'none', boxSizing: 'border-box' }} />
              </div>

              {/* Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: theme.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Notes</label>
                <textarea value={eventForm.notes} onChange={(e) => setEventForm(f => ({ ...f, notes: e.target.value }))} placeholder="Meeting notes, agenda, follow-up items..." rows={3} style={{ width: '100%', padding: '10px 12px', border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', color: theme.text, backgroundColor: theme.bgCard, outline: 'none', boxSizing: 'border-box', resize: 'vertical' }} />
              </div>

              {/* Save */}
              <button
                onClick={async () => {
                  setSavingEvent(true)
                  try {
                    const startDT = new Date(eventForm.start_time)
                    const endDT = new Date(startDT.getTime() + eventForm.duration_minutes * 60000)
                    const _ids = (eventForm.salesperson_ids || []).filter(Boolean)
                    if (eventForm.salesperson_id && !_ids.includes(eventForm.salesperson_id)) {
                      _ids.unshift(eventForm.salesperson_id)
                    }
                    const _primary = _ids[0] || eventForm.salesperson_id || null
                    await supabase.from('appointments').update({
                      start_time: startDT.toISOString(), end_time: endDT.toISOString(),
                      duration_minutes: eventForm.duration_minutes,
                      salesperson_id: _primary,
                      salesperson_ids: _ids,
                      location: eventForm.location || null, notes: eventForm.notes || null,
                      updated_at: new Date().toISOString()
                    }).eq('id', selectedEvent.id)
                    if (selectedEvent.lead_id) {
                      await supabase.from('leads').update({
                        appointment_time: startDT.toISOString(),
                        salesperson_id: _primary,
                        salesperson_ids: _ids,
                        updated_at: new Date().toISOString()
                      }).eq('id', selectedEvent.lead_id)
                    }
                    setShowEventModal(false); setSelectedEvent(null)
                    await fetchData()
                  } catch (err) { alert('Error: ' + err.message) }
                  setSavingEvent(false)
                }}
                disabled={savingEvent}
                style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', padding: '12px', minHeight: '44px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: savingEvent ? 'not-allowed' : 'pointer', opacity: savingEvent ? 0.6 : 1 }}
              >
                <CheckCircle2 size={16} />{savingEvent ? 'Saving...' : 'Save Changes'}
              </button>

              {/* Delete Event */}
              <div style={{ borderTop: `1px solid ${theme.border}`, paddingTop: '12px', display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={async () => {
                    if (!window.confirm('Delete this appointment? The lead will remain.')) return
                    try {
                      // Tracy reported "I created a meeting for Cole and it is not
                      // deleting even after refreshing." Hardened the cleanup:
                      //  - delete the appointment row
                      //  - clear EVERY back-pointer on the lead (appointment_id,
                      //    appointment_time, edit_link, event_id) so the calendar
                      //    can't reconstruct it from leftover lead fields
                      //  - bust the store/IndexedDB cache so the next fetch is
                      //    fresh and the deleted event doesn't ghost back
                      const { error: delErr } = await supabase.from('appointments').delete().eq('id', selectedEvent.id)
                      if (delErr) throw delErr
                      if (selectedEvent.lead_id) {
                        await supabase.from('leads').update({
                          status: 'Contacted',
                          appointment_time: null,
                          appointment_id: null,
                          edit_link: null,
                          event_id: null,
                          updated_at: new Date().toISOString(),
                        }).eq('id', selectedEvent.lead_id)
                      }
                      // Refresh global store appointments so other views (Job Board, etc.)
                      // also drop the event immediately
                      if (fetchAppointments) await fetchAppointments()
                      setShowEventModal(false); setSelectedEvent(null)
                      await fetchData()
                    } catch (err) { alert('Error: ' + err.message) }
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 16px', backgroundColor: 'transparent', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
                >
                  <Trash2 size={13} />Delete Event
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Block Out Time Modal — appointments with appointment_type='Block'
          and no lead_id. The salesperson is marked busy and the existing
          calendar grid renders them as gray "Blocked" slots. */}
      {showBlockModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: '16px' }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', maxWidth: '480px', width: '100%', padding: '24px', boxShadow: theme.shadow }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: theme.text }}>Block Out Time</h2>
              <button onClick={() => setShowBlockModal(false)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.textMuted }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: 0, marginBottom: '16px' }}>
              Mark a time slot as unavailable for one or more reps. Setters will see this on the calendar and won't book meetings on top of it.
            </p>
            <form onSubmit={async (e) => {
              e.preventDefault()
              if (!blockForm.start_time) return
              setBlockSaving(true)
              const ids = (blockForm.salesperson_ids?.length ? blockForm.salesperson_ids : (blockForm.salesperson_id ? [blockForm.salesperson_id] : [])).filter(Boolean)
              if (ids.length === 0) { setBlockSaving(false); alert('Pick at least one rep to block.'); return }
              const startTime = new Date(blockForm.start_time)
              const endTime = new Date(startTime.getTime() + blockForm.duration_minutes * 60000)
              const rows = ids.map(empId => ({
                company_id: companyId,
                lead_id: null,
                appointment_type: 'Block',
                title: blockForm.notes ? `Blocked — ${blockForm.notes}` : 'Blocked',
                start_time: startTime.toISOString(),
                end_time: endTime.toISOString(),
                duration_minutes: blockForm.duration_minutes,
                salesperson_id: empId,
                salesperson_ids: [empId],
                status: 'Scheduled',
                notes: blockForm.notes || null,
              }))
              const { error } = await supabase.from('appointments').insert(rows)
              setBlockSaving(false)
              if (error) { alert('Failed to block time: ' + error.message); return }
              setShowBlockModal(false)
              setBlockForm({ start_time: '', duration_minutes: 60, salesperson_id: '', salesperson_ids: [], notes: '' })
              if (window.refreshAppointmentsCalendar) window.refreshAppointmentsCalendar()
            }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Start *</label>
              <input
                type="datetime-local"
                required
                value={blockForm.start_time}
                onChange={(e) => setBlockForm(p => ({ ...p, start_time: e.target.value }))}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '14px', marginBottom: '12px', backgroundColor: theme.bgCard, color: theme.text }}
              />

              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Duration</label>
              <select
                value={blockForm.duration_minutes}
                onChange={(e) => setBlockForm(p => ({ ...p, duration_minutes: parseInt(e.target.value) }))}
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '14px', marginBottom: '12px', backgroundColor: theme.bgCard, color: theme.text }}
              >
                <option value="30">30 minutes</option>
                <option value="60">1 hour</option>
                <option value="90">1.5 hours</option>
                <option value="120">2 hours</option>
                <option value="180">3 hours</option>
                <option value="240">4 hours</option>
                <option value="480">All day (8 hours)</option>
              </select>

              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Rep(s) to block *</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginBottom: '12px', maxHeight: '180px', overflowY: 'auto', border: `1px solid ${theme.border}`, borderRadius: '6px', padding: '8px' }}>
                {employees.filter(e => ['Sales', 'Salesman', 'Manager', 'Admin'].includes(e.role)).map(emp => (
                  <label key={emp.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: theme.text }}>
                    <input
                      type="checkbox"
                      checked={blockForm.salesperson_ids?.includes(emp.id) || false}
                      onChange={(e) => {
                        const cur = blockForm.salesperson_ids || []
                        setBlockForm(p => ({ ...p, salesperson_ids: e.target.checked ? [...cur, emp.id] : cur.filter(id => id !== emp.id) }))
                      }}
                    />
                    {emp.name}
                  </label>
                ))}
              </div>

              <label style={{ display: 'block', fontSize: '12px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Reason (optional)</label>
              <input
                type="text"
                value={blockForm.notes}
                onChange={(e) => setBlockForm(p => ({ ...p, notes: e.target.value }))}
                placeholder="e.g. Auction, dr appt, training..."
                style={{ width: '100%', padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '14px', marginBottom: '16px', backgroundColor: theme.bgCard, color: theme.text }}
              />

              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => setShowBlockModal(false)} style={{ padding: '8px 16px', border: `1px solid ${theme.border}`, backgroundColor: 'transparent', color: theme.text, borderRadius: '6px', cursor: 'pointer', fontSize: '14px' }}>Cancel</button>
                <button type="submit" disabled={blockSaving} style={{ padding: '8px 16px', backgroundColor: '#f59e0b', color: '#fff', border: 'none', borderRadius: '6px', cursor: blockSaving ? 'not-allowed' : 'pointer', fontSize: '14px', fontWeight: '600' }}>
                  {blockSaving ? 'Blocking...' : 'Block Time'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* AI prospect research drawer */}
      {showResearch && (
        <ProspectResearchDrawer
          companyId={companyId}
          employees={(employees || []).filter(e => e.active !== false)}
          onClose={() => setShowResearch(false)}
          onImported={async () => { await fetchData() }}
          theme={theme}
          isMobile={isMobile}
        />
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
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                  Commission Settings
                </h2>
                <p style={{ fontSize: '13px', color: theme.textMuted, marginTop: '2px' }}>
                  Configure setter pay and commission rules
                </p>
              </div>
              <button
                onClick={() => setShowSettingsModal(false)}
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

            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Pay Per Appointment ($)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={settingsForm.setter_pay_per_appointment}
                  onChange={(e) => setSettingsForm(prev => ({
                    ...prev,
                    setter_pay_per_appointment: e.target.value
                  }))}
                  style={inputStyle}
                />
                <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                  Amount paid to setter for each appointment they schedule
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Pay Per Lead Sourced ($)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={settingsForm.source_pay_per_lead}
                  onChange={(e) => setSettingsForm(prev => ({
                    ...prev,
                    source_pay_per_lead: e.target.value
                  }))}
                  style={inputStyle}
                />
                <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                  Default amount paid to employees who source leads. Can be overridden per employee in the Employees page.
                </p>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={settingsForm.commission_requires_quote}
                    onChange={(e) => setSettingsForm(prev => ({
                      ...prev,
                      commission_requires_quote: e.target.checked
                    }))}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontSize: '14px', color: theme.text }}>
                    Require quote for commission
                  </span>
                </label>
                <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '8px', marginLeft: '28px' }}>
                  When enabled, commission is only paid when a quote is generated from the appointment.
                  This ensures setters are paid for qualified meetings.
                </p>
              </div>

              <div style={{
                padding: '16px',
                backgroundColor: theme.accentBg,
                borderRadius: '8px',
                marginBottom: '20px'
              }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
                  How it works:
                </div>
                <ul style={{ fontSize: '13px', color: theme.textSecondary, margin: 0, paddingLeft: '20px' }}>
                  <li style={{ marginBottom: '4px' }}>Setter schedules appointment → Lead moves to "Scheduled"</li>
                  <li style={{ marginBottom: '4px' }}>Lead sourced by employee → Setter schedules appointment → Source commission created</li>
                  <li style={{ marginBottom: '4px' }}>Salesperson meets with lead → Creates estimate</li>
                  <li style={{ marginBottom: '4px' }}>Estimate generated → Lead moves to "Qualified"</li>
                  <li>Commission approved and paid to setter</li>
                </ul>
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setShowSettingsModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
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
                  onClick={saveSettings}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: theme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontWeight: '500',
                    cursor: 'pointer'
                  }}
                >
                  Save Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reactivate-Customer Modal */}
      {showReactivateModal && (
        <div
          style={{
            position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 1000
          }}
          onClick={(e) => { if (e.target === e.currentTarget) { setShowReactivateModal(false); setReactivateSearch('') } }}
        >
          <div style={{
            backgroundColor: theme.bgCard || '#fff', borderRadius: '12px',
            padding: '24px', width: '100%', maxWidth: '560px',
            maxHeight: '85vh', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: theme.text }}>
                Reactivate Customer as New Lead
              </h3>
              <button
                onClick={() => { setShowReactivateModal(false); setReactivateSearch('') }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>
            <p style={{ fontSize: '13px', color: theme.textSecondary, margin: '0 0 12px' }}>
              Pick an existing customer to add back to the New Leads stage. Their lead will link
              to the original customer record so history is preserved.
            </p>
            <div style={{ position: 'relative', marginBottom: '12px' }}>
              <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
              <input
                type="text"
                placeholder="Search by name, business, email, or phone..."
                value={reactivateSearch}
                onChange={(e) => setReactivateSearch(e.target.value)}
                autoFocus
                style={{
                  width: '100%', padding: '10px 10px 10px 34px',
                  border: `1px solid ${theme.border}`, borderRadius: '8px',
                  fontSize: '14px', backgroundColor: theme.bg, color: theme.text,
                  boxSizing: 'border-box'
                }}
              />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', border: `1px solid ${theme.border}`, borderRadius: '8px' }}>
              {(() => {
                const q = reactivateSearch.trim().toLowerCase()
                const filtered = customers.filter(c => {
                  if (!q) return true
                  return (
                    (c.name || '').toLowerCase().includes(q) ||
                    (c.business_name || '').toLowerCase().includes(q) ||
                    (c.email || '').toLowerCase().includes(q) ||
                    (c.phone || '').toLowerCase().includes(q)
                  )
                }).slice(0, 50)
                if (filtered.length === 0) {
                  return (
                    <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
                      {q ? 'No matching customers' : 'No customers loaded'}
                    </div>
                  )
                }
                return filtered.map(cust => (
                  <button
                    key={cust.id}
                    onClick={() => handleReactivateCustomer(cust)}
                    disabled={reactivating}
                    style={{
                      display: 'block', width: '100%', textAlign: 'left',
                      padding: '10px 12px', border: 'none',
                      borderBottom: `1px solid ${theme.border}`,
                      backgroundColor: 'transparent', cursor: reactivating ? 'not-allowed' : 'pointer',
                      opacity: reactivating ? 0.6 : 1
                    }}
                    onMouseOver={(e) => { e.currentTarget.style.backgroundColor = theme.accentBg }}
                    onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                  >
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                      {cust.name}
                      {cust.business_name && (
                        <span style={{ marginLeft: '8px', fontSize: '12px', color: theme.textMuted, fontWeight: '400' }}>
                          ({cust.business_name})
                        </span>
                      )}
                      {cust.status === 'Inactive' && (
                        <span style={{ marginLeft: '8px', fontSize: '11px', color: '#6b7280', fontWeight: '500' }}>
                          INACTIVE
                        </span>
                      )}
                    </div>
                    {(cust.email || cust.phone) && (
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                        {cust.email}{cust.email && cust.phone ? ' · ' : ''}{cust.phone}
                      </div>
                    )}
                  </button>
                ))
              })()}
            </div>
            {reactivating && (
              <div style={{ marginTop: '8px', fontSize: '12px', color: theme.textMuted, textAlign: 'center' }}>
                Creating new lead...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

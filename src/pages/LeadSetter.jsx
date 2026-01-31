import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Plus, X, Phone, Mail, Calendar, Clock, User, Building2, MapPin,
  ChevronLeft, ChevronRight, AlertCircle, CheckCircle2, XCircle,
  MessageSquare, PhoneCall, PhoneOff, CalendarPlus, DollarSign,
  RefreshCw, Filter, Search, Settings, Trophy
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

// Setter stages (what setter works with)
const setterStages = [
  { id: 'Assigned', label: 'Assigned to Me', color: '#7c3aed' },
  { id: 'New', label: 'New Leads', color: '#3b82f6' },
  { id: 'Contacted', label: 'Contacted', color: '#8b5cf6' },
  { id: 'Callback', label: 'Callback', color: '#f59e0b' },
  { id: 'Not Qualified', label: 'Not Qualified', color: '#6b7280' }
]

// Win stages (read-only, shows setter's wins)
const winStages = [
  { id: 'Appointment Set', label: 'Scheduled', color: '#10b981', icon: '📅' },
  { id: 'Qualified', label: 'Qualified', color: '#059669', icon: '✅' }
]

export default function LeadSetter() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const employees = useStore((state) => state.employees)
  const company = useStore((state) => state.company)
  const fetchAppointments = useStore((state) => state.fetchAppointments)

  // Data
  const [leads, setLeads] = useState([])
  const [appointments, setAppointments] = useState([])
  const [commissions, setCommissions] = useState([])
  const [loading, setLoading] = useState(true)

  // Settings modal
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [settingsForm, setSettingsForm] = useState({
    setter_pay_per_appointment: 25,
    commission_requires_quote: true
  })

  // Calendar
  const [currentDate, setCurrentDate] = useState(new Date())
  const [selectedDate, setSelectedDate] = useState(null)
  const [calendarView, setCalendarView] = useState('week') // week or day

  // Modals
  const [showAppointmentModal, setShowAppointmentModal] = useState(false)
  const [showLeadModal, setShowLeadModal] = useState(false)
  const [selectedLead, setSelectedLead] = useState(null)

  // Drag state
  const [draggedLead, setDraggedLead] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)
  const [dragOverSlot, setDragOverSlot] = useState(null)

  // Appointment form
  const [appointmentForm, setAppointmentForm] = useState({
    start_time: '',
    duration_minutes: 60,
    salesperson_id: '',
    location: '',
    notes: ''
  })

  // Filters
  const [searchTerm, setSearchTerm] = useState('')
  const [filterSetter, setFilterSetter] = useState('')

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Check if user is admin
  const isAdmin = user?.user_role === 'Admin' || user?.user_role === 'Owner' || user?.role === 'Admin' || user?.role === 'Owner'

  // Fetch data
  const fetchData = async () => {
    if (!companyId) return
    setLoading(true)

    // Build query - filter by setter_owner_id for non-admins
    let leadsQuery = supabase
      .from('leads')
      .select('*, lead_owner:employees!leads_lead_owner_id_fkey(id, name), setter_owner:employees!leads_setter_owner_id_fkey(id, name)')
      .eq('company_id', companyId)
      .in('status', ['New', 'Assigned', 'Contacted', 'Callback', 'Not Qualified'])
      .order('created_at', { ascending: false })

    // Non-admins only see leads assigned to them as setter
    if (!isAdmin && user?.id) {
      leadsQuery = leadsQuery.eq('setter_owner_id', user.id)
    }

    const { data: leadsData } = await leadsQuery

    // Fetch appointments for calendar
    const weekStart = getWeekStart(currentDate)
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 7)

    const { data: appointmentsData } = await supabase
      .from('appointments')
      .select('*, lead:leads(*)')
      .eq('company_id', companyId)
      .gte('start_time', weekStart.toISOString())
      .lte('start_time', weekEnd.toISOString())
      .order('start_time')

    // Fetch commissions for current setter
    const { data: commissionsData } = await supabase
      .from('setter_commissions')
      .select('*')
      .eq('company_id', companyId)
      .eq('setter_id', user?.id)
      .order('created_at', { ascending: false })

    setLeads(leadsData || [])
    setAppointments(appointmentsData || [])
    setCommissions(commissionsData || [])

    // Load company settings
    if (company) {
      setSettingsForm({
        setter_pay_per_appointment: company.setter_pay_per_appointment || 25,
        commission_requires_quote: company.commission_requires_quote !== false
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

  // Get leads by stage
  const getLeadsByStage = (stageId) => {
    let filtered = leads.filter(l => l.status === stageId)
    if (searchTerm) {
      filtered = filtered.filter(l =>
        l.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        l.phone?.includes(searchTerm)
      )
    }
    if (filterSetter) {
      filtered = filtered.filter(l => l.setter_id === parseInt(filterSetter))
    }
    return filtered
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
    for (let h = 7; h <= 19; h++) {
      slots.push(h)
    }
    return slots
  }

  const getAppointmentsForSlot = (date, hour) => {
    return appointments.filter(apt => {
      const aptDate = new Date(apt.start_time)
      return aptDate.toDateString() === date.toDateString() &&
        aptDate.getHours() === hour
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
    const d = new Date(currentDate)
    d.setDate(d.getDate() - 7)
    setCurrentDate(d)
  }

  const nextWeek = () => {
    const d = new Date(currentDate)
    d.setDate(d.getDate() + 7)
    setCurrentDate(d)
  }

  const goToToday = () => {
    setCurrentDate(new Date())
  }

  // Drag handlers for Kanban
  const handleDragStart = (e, lead) => {
    setDraggedLead(lead)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', lead.id.toString()) // Required for drop to work
  }

  const handleDragEnd = () => {
    setDraggedLead(null)
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

    // Update lead status
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

  // Drag to calendar slot
  const handleSlotDragOver = (e, date, hour) => {
    e.preventDefault()
    setDragOverSlot({ date, hour })
    setDragOverStage(null)
  }

  const handleSlotDrop = async (e, date, hour) => {
    e.preventDefault()
    setDragOverSlot(null)

    if (!draggedLead) return

    // Open appointment modal with pre-filled time
    const startTime = new Date(date)
    startTime.setHours(hour, 0, 0, 0)

    setSelectedLead(draggedLead)
    setAppointmentForm({
      start_time: startTime.toISOString().slice(0, 16),
      duration_minutes: 60,
      salesperson_id: '',
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

    const startTime = new Date(appointmentForm.start_time)
    const endTime = new Date(startTime)
    endTime.setMinutes(endTime.getMinutes() + appointmentForm.duration_minutes)

    // Create appointment with all required fields
    const appointmentPayload = {
      company_id: companyId,
      lead_id: selectedLead.id,
      title: `${selectedLead.customer_name} - ${selectedLead.service_type || 'Consultation'}`,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      duration_minutes: appointmentForm.duration_minutes,
      location: appointmentForm.location || selectedLead.address || null,
      salesperson_id: appointmentForm.salesperson_id || null,
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
        salesperson_id: appointmentForm.salesperson_id || null
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

    // Create LEAD OWNER commission (only if source = 'user')
    try {
      if (selectedLead.lead_source === 'user' && selectedLead.lead_owner_id) {
        const { data: ownerEmployee } = await supabase
          .from('employees')
          .select('commission_leads_rate, commission_leads_type')
          .eq('id', selectedLead.lead_owner_id)
          .single()

        if (ownerEmployee?.commission_leads_rate > 0) {
          await supabase
            .from('lead_commissions')
            .insert({
              company_id: companyId,
              lead_id: selectedLead.id,
              appointment_id: apt.id,
              commission_type: 'lead_generation',
              employee_id: selectedLead.lead_owner_id,
              amount: ownerEmployee.commission_leads_rate,
              rate_type: ownerEmployee.commission_leads_type || 'flat',
              payment_status: 'pending'
            })
          console.log('Lead owner commission created:', ownerEmployee.commission_leads_rate)
        }
      }
    } catch (err) {
      console.log('Lead owner commission not created:', err)
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
  const logContact = async (lead, outcome) => {
    const updates = {
      last_contact_at: new Date().toISOString(),
      contact_attempts: (lead.contact_attempts || 0) + 1
    }

    if (outcome === 'contacted') {
      updates.status = 'Contacted'
    } else if (outcome === 'callback') {
      updates.status = 'Callback'
    } else if (outcome === 'not_qualified') {
      updates.status = 'Not Qualified'
    }

    await supabase
      .from('leads')
      .update(updates)
      .eq('id', lead.id)

    setShowLeadModal(false)
    await fetchData()
  }

  // Save commission settings
  const saveSettings = async () => {
    const { error } = await supabase
      .from('companies')
      .update({
        setter_pay_per_appointment: settingsForm.setter_pay_per_appointment,
        commission_requires_quote: settingsForm.commission_requires_quote
      })
      .eq('id', companyId)

    if (!error) {
      setShowSettingsModal(false)
      // Refresh company data
      await fetchData()
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
    <div style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
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
          <h1 style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>
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
            gap: '12px',
            padding: '8px 14px',
            backgroundColor: '#dcfce7',
            borderRadius: '8px',
            fontSize: '13px',
            color: '#166534'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <DollarSign size={14} />
              <span style={{ fontWeight: '600' }}>
                ${user?.commission_setter_rate || company?.setter_pay_per_appointment || 25}
              </span>
              <span style={{ color: '#15803d' }}>/appt</span>
            </div>
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
            <select
              value={filterSetter}
              onChange={(e) => setFilterSetter(e.target.value)}
              style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}
            >
              <option value="">All Setters</option>
              {employees.filter(e => e.role === 'Setter' || e.role === 'Sales').map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
            </select>
          )}

          {/* Search */}
          <div style={{ position: 'relative' }}>
            <Search size={16} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
            <input
              type="text"
              placeholder="Search leads..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ ...inputStyle, paddingLeft: '34px', width: '180px' }}
            />
          </div>
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

      {/* Main Content - Split View */}
      <div style={{ display: 'flex', flex: 1, gap: '16px', overflow: 'hidden' }}>
        {/* Left: Kanban Leads */}
        <div style={{ width: '450px', flexShrink: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Stats Row */}
          <div style={{
            display: 'flex',
            gap: '8px',
            marginBottom: '12px'
          }}>
            {setterStages.slice(0, 3).map(stage => (
              <div
                key={stage.id}
                style={{
                  flex: 1,
                  padding: '8px',
                  backgroundColor: theme.bgCard,
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  textAlign: 'center'
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
                  textAlign: 'center'
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
          <div style={{ display: 'flex', gap: '8px', flex: 1, overflow: 'hidden' }}>
            {setterStages.map(stage => (
              <div
                key={stage.id}
                style={{
                  flex: 1,
                  minWidth: 0,
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
                  {getLeadsByStage(stage.id).map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={(e) => handleDragStart(e, lead)}
                      onDragEnd={handleDragEnd}
                      onClick={() => openLeadDetail(lead)}
                      style={{
                        backgroundColor: theme.bgCard,
                        borderRadius: '6px',
                        padding: '8px',
                        border: `1px solid ${theme.border}`,
                        cursor: 'grab',
                        fontSize: '12px'
                      }}
                    >
                      <div style={{
                        fontWeight: '600',
                        color: theme.text,
                        marginBottom: '4px',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap'
                      }}>
                        {lead.customer_name}
                      </div>
                      {lead.phone && (
                        <div style={{ color: theme.textMuted, fontSize: '11px' }}>
                          {lead.phone}
                        </div>
                      )}
                      {lead.callback_date && stage.id === 'Callback' && (
                        <div style={{
                          marginTop: '4px',
                          fontSize: '10px',
                          color: new Date(lead.callback_date) <= new Date() ? '#ef4444' : '#f59e0b'
                        }}>
                          📅 {new Date(lead.callback_date).toLocaleDateString()}
                        </div>
                      )}
                    </div>
                  ))}

                  {getLeadsByStage(stage.id).length === 0 && (
                    <div style={{
                      textAlign: 'center',
                      padding: '16px 8px',
                      color: theme.textMuted,
                      fontSize: '11px'
                    }}>
                      No leads
                    </div>
                  )}
                </div>
              </div>
            ))}
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
          overflow: 'hidden'
        }}>
          {/* Calendar Header */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: `1px solid ${theme.border}`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <button
                onClick={prevWeek}
                style={{
                  padding: '6px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.textSecondary
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                onClick={nextWeek}
                style={{
                  padding: '6px',
                  backgroundColor: 'transparent',
                  border: `1px solid ${theme.border}`,
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.textSecondary
                }}
              >
                <ChevronRight size={18} />
              </button>
              <button
                onClick={goToToday}
                style={{
                  padding: '6px 12px',
                  backgroundColor: theme.accentBg,
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  color: theme.accent,
                  fontSize: '13px',
                  fontWeight: '500'
                }}
              >
                Today
              </button>
            </div>
            <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
              {weekDays[0].toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h3>
            <div style={{ width: '120px' }}></div>
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
                          {slotAppointments.map(apt => (
                            <div
                              key={apt.id}
                              style={{
                                backgroundColor: apt.status === 'Completed' ? '#dcfce7' :
                                  apt.status === 'Cancelled' ? '#fee2e2' :
                                    isToday(new Date(apt.start_time)) ? '#d1fae5' : theme.accentBg,
                                borderLeft: `3px solid ${apt.status === 'Completed' ? '#16a34a' :
                                  apt.status === 'Cancelled' ? '#dc2626' :
                                    isToday(new Date(apt.start_time)) ? '#059669' : theme.accent}`,
                                borderRadius: '4px',
                                padding: '4px 6px',
                                fontSize: '10px',
                                overflow: 'hidden',
                                cursor: 'pointer'
                              }}
                              onClick={() => {
                                setSelectedLead(apt.lead)
                                setShowLeadModal(true)
                              }}
                            >
                              <div style={{
                                fontWeight: '600',
                                color: theme.text,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap'
                              }}>
                                {apt.lead?.customer_name || apt.title}
                              </div>
                              {apt.salesperson && (
                                <div style={{ color: theme.textMuted, fontSize: '9px' }}>
                                  {apt.salesperson.name}
                                </div>
                              )}
                            </div>
                          ))}

                          {isSlotDragOver && slotAppointments.length === 0 && (
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

            <form onSubmit={handleCreateAppointment} style={{ padding: '20px' }}>
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
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Assign Salesperson</label>
                  <select
                    value={appointmentForm.salesperson_id}
                    onChange={(e) => setAppointmentForm(prev => ({ ...prev, salesperson_id: e.target.value }))}
                    style={inputStyle}
                  >
                    <option value="">-- Select Salesperson --</option>
                    {employees.filter(e => e.role === 'Sales' || e.role === 'Manager' || e.role === 'Admin').map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
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

                {company?.setter_pay_per_appointment > 0 && (
                  <div style={{
                    padding: '12px',
                    backgroundColor: '#dcfce7',
                    borderRadius: '8px',
                    fontSize: '13px',
                    color: '#166534'
                  }}>
                    <DollarSign size={14} style={{ display: 'inline', verticalAlign: 'middle' }} />
                    <span> Commission: ${company.setter_pay_per_appointment} </span>
                    <span style={{ fontSize: '11px', color: '#15803d' }}>
                      (paid when quote generated)
                    </span>
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
            maxWidth: '400px',
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
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                {selectedLead.customer_name}
              </h2>
              <button
                onClick={() => {
                  setShowLeadModal(false)
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

            <div style={{ padding: '20px' }}>
              {/* Contact Info */}
              <div style={{ marginBottom: '20px' }}>
                {selectedLead.phone && (
                  <a
                    href={`tel:${selectedLead.phone}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px',
                      backgroundColor: '#dcfce7',
                      borderRadius: '8px',
                      color: '#166534',
                      textDecoration: 'none',
                      marginBottom: '8px',
                      fontWeight: '500'
                    }}
                  >
                    <Phone size={18} />
                    {selectedLead.phone}
                  </a>
                )}
                {selectedLead.email && (
                  <a
                    href={`mailto:${selectedLead.email}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '12px',
                      backgroundColor: theme.accentBg,
                      borderRadius: '8px',
                      color: theme.accent,
                      textDecoration: 'none',
                      fontSize: '14px'
                    }}
                  >
                    <Mail size={18} />
                    {selectedLead.email}
                  </a>
                )}
              </div>

              {/* Lead Info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '20px'
              }}>
                {selectedLead.service_type && (
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Service</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{selectedLead.service_type}</div>
                  </div>
                )}
                {selectedLead.lead_source && (
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Source</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{selectedLead.lead_source}</div>
                  </div>
                )}
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Status</div>
                  <div style={{ fontSize: '14px', color: theme.text }}>{selectedLead.status}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Contact Attempts</div>
                  <div style={{ fontSize: '14px', color: theme.text }}>{selectedLead.contact_attempts || 0}</div>
                </div>
              </div>

              {selectedLead.address && (
                <div style={{ marginBottom: '20px' }}>
                  <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>Address</div>
                  <div style={{ fontSize: '14px', color: theme.text }}>{selectedLead.address}</div>
                </div>
              )}

              {/* Quick Actions */}
              {selectedLead.status !== 'Appointment Set' && (
                <div style={{
                  borderTop: `1px solid ${theme.border}`,
                  paddingTop: '16px'
                }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                    Log Outcome
                  </div>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => logContact(selectedLead, 'contacted')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        backgroundColor: '#dbeafe',
                        color: '#1d4ed8',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <PhoneCall size={14} />
                      Contacted
                    </button>
                    <button
                      onClick={() => logContact(selectedLead, 'callback')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        backgroundColor: '#fef3c7',
                        color: '#b45309',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <Clock size={14} />
                      Callback
                    </button>
                    <button
                      onClick={() => logContact(selectedLead, 'not_qualified')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '8px 12px',
                        backgroundColor: '#f3f4f6',
                        color: '#4b5563',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <XCircle size={14} />
                      Not Qualified
                    </button>
                  </div>

                  <button
                    onClick={() => {
                      setShowLeadModal(false)
                      setAppointmentForm({
                        start_time: '',
                        duration_minutes: 60,
                        salesperson_id: '',
                        location: selectedLead.address || '',
                        notes: ''
                      })
                      setShowAppointmentModal(true)
                    }}
                    style={{
                      width: '100%',
                      marginTop: '12px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '8px',
                      padding: '12px',
                      backgroundColor: theme.accent,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    <CalendarPlus size={18} />
                    Schedule Appointment
                  </button>
                </div>
              )}

              {selectedLead.status === 'Appointment Set' && selectedLead.appointment_time && (
                <div style={{
                  padding: '16px',
                  backgroundColor: '#dcfce7',
                  borderRadius: '8px',
                  textAlign: 'center'
                }}>
                  <Calendar size={24} color="#166534" style={{ marginBottom: '8px' }} />
                  <div style={{ fontWeight: '600', color: '#166534' }}>
                    Appointment Scheduled
                  </div>
                  <div style={{ fontSize: '14px', color: '#15803d' }}>
                    {new Date(selectedLead.appointment_time).toLocaleString()}
                  </div>
                </div>
              )}
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

            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '20px' }}>
                <label style={labelStyle}>Pay Per Appointment ($)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={settingsForm.setter_pay_per_appointment}
                  onChange={(e) => setSettingsForm(prev => ({
                    ...prev,
                    setter_pay_per_appointment: parseFloat(e.target.value) || 0
                  }))}
                  style={inputStyle}
                />
                <p style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                  Amount paid to setter for each appointment they schedule
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
                  <li style={{ marginBottom: '4px' }}>Salesperson meets with lead → Creates quote</li>
                  <li style={{ marginBottom: '4px' }}>Quote generated → Lead moves to "Qualified"</li>
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
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Plus, X, DollarSign, User, Calendar, Phone, Mail, Building2,
  Trophy, XCircle, ChevronRight, RefreshCw, MapPin, Settings, Trash2,
  ChevronUp, ChevronDown, Briefcase
} from 'lucide-react'
import EntityCard from '../components/EntityCard'

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
const LEGACY_STATUSES = ['Assigned', 'Callback', 'Converted', 'Not Qualified']

// Default pipeline stages based on lead status
const defaultStages = [
  // Sales funnel
  { id: 'New', name: 'New', color: '#3b82f6' },
  { id: 'Contacted', name: 'Contacted', color: '#8b5cf6' },
  { id: 'Appointment Set', name: 'Scheduled', color: '#22c55e' },
  { id: 'Qualified', name: 'Qualified', color: '#3b82f6' },
  { id: 'Quote Sent', name: 'Quote Sent', color: '#8b5cf6' },
  { id: 'Negotiation', name: 'Negotiation', color: '#f59e0b' },
  { id: 'Won', name: 'Won', color: '#10b981', isWon: true },
  // Delivery funnel
  { id: 'Job Scheduled', name: 'Job Scheduled', color: '#0ea5e9', isDelivery: true },
  { id: 'In Progress', name: 'In Progress', color: '#f97316', isDelivery: true },
  { id: 'Job Complete', name: 'Job Complete', color: '#22c55e', isDelivery: true },
  { id: 'Invoiced', name: 'Invoiced', color: '#8b5cf6', isDelivery: true },
  { id: 'Closed', name: 'Closed', color: '#6b7280', isClosed: true },
  // Lost (always last)
  { id: 'Lost', name: 'Lost', color: '#64748b', isLost: true }
]

const PIPELINE_VERSION = 2

// Available stats to show in header
const availableStats = [
  { id: 'active', label: 'Active Leads', color: null },
  { id: 'won', label: 'Won', color: '#22c55e' },
  { id: 'lost', label: 'Lost', color: '#64748b' },
  { id: 'totalValue', label: 'Total Value', color: null },
  { id: 'wonValue', label: 'Won Value', color: '#22c55e' },
  { id: 'appointments', label: 'Appointments', color: '#3b82f6' },
  { id: 'todayAppointments', label: 'Today\'s Appts', color: '#16a34a' },
  { id: 'quoteSent', label: 'Quotes Sent', color: '#8b5cf6' },
  { id: 'jobScheduled', label: 'Job Scheduled', color: '#0ea5e9' },
  { id: 'inProgress', label: 'In Progress', color: '#f97316' },
  { id: 'completed', label: 'Completed', color: '#22c55e' },
  { id: 'invoiced', label: 'Invoiced', color: '#8b5cf6' },
  { id: 'deliveryValue', label: 'Delivery Value', color: '#0ea5e9' }
]

const defaultVisibleStats = ['active', 'won', 'totalValue']

export default function SalesPipeline() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const employees = useStore((state) => state.employees)
  const updateLead = useStore((state) => state.updateLead)

  // Pipeline state
  const [pipelineLeads, setPipelineLeads] = useState([])
  const [stages, setStages] = useState(defaultStages)
  const [visibleStats, setVisibleStats] = useState(defaultVisibleStats)
  const [loading, setLoading] = useState(true)

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

  // Owner filter
  const [ownerFilter, setOwnerFilter] = useState('all')

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Get active employees for filter
  const activeEmployees = employees.filter(e => e.active !== false)

  // Check if user can edit pipeline settings (Super Admin or Owner)
  const isSuperAdmin = user?.user_role === 'Super Admin' || user?.user_role === 'Owner' || user?.role === 'Super Admin' || user?.role === 'Owner'

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
          setVisibleStats(parsed)
        }
      } catch (e) {
        console.error('Error loading saved stats:', e)
      }
    }
  }, [companyId])

  // Fetch pipeline leads
  const fetchPipelineLeads = async () => {
    if (!companyId) return
    setLoading(true)

    const stageIds = stages.map(s => s.id)
    // Include legacy statuses in the query so old data still shows up
    const allStatuses = [...new Set([...stageIds, ...LEGACY_STATUSES])]

    // Fetch leads first (core query that must succeed)
    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        lead_owner:employees!leads_lead_owner_id_fkey(id, name),
        setter_owner:employees!leads_setter_owner_id_fkey(id, name)
      `)
      .eq('company_id', companyId)
      .in('status', allStatuses)
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[Pipeline] Error fetching leads:', error)
    } else {
      console.log('[Pipeline] Leads fetched:', data?.length || 0)
    }

    // Normalize legacy statuses for display (DB values unchanged)
    const normalized = (data || []).map(lead => ({
      ...lead,
      status: STATUS_MAP[lead.status] || lead.status
    }))

    // Fetch job data separately for delivery-stage leads (won't break pipeline if this fails)
    try {
      const deliveryLeadIds = normalized.filter(l => {
        const s = stages.find(st => st.id === l.status)
        return s?.isDelivery || s?.isClosed || s?.isWon
      }).map(l => l.id)

      if (deliveryLeadIds.length > 0) {
        const { data: jobsData } = await supabase
          .from('jobs')
          .select('id, lead_id, job_id, status, contract_amount, assigned_team, invoice_status')
          .in('lead_id', deliveryLeadIds)

        if (jobsData) {
          const jobsByLeadId = {}
          jobsData.forEach(j => {
            if (!jobsByLeadId[j.lead_id]) jobsByLeadId[j.lead_id] = []
            jobsByLeadId[j.lead_id].push(j)
          })
          normalized.forEach(lead => {
            lead.jobs = jobsByLeadId[lead.id] || []
          })
        }
      }
    } catch (e) {
      console.log('[Pipeline] Job data fetch failed (non-critical):', e)
    }

    setPipelineLeads(normalized)
    setLoading(false)
  }

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchPipelineLeads()
  }, [companyId, navigate, stages])

  // Filter leads by owner
  const filteredPipelineLeads = pipelineLeads.filter(lead => {
    if (ownerFilter === 'all') return true
    if (ownerFilter === 'unassigned') return !lead.lead_owner_id && !lead.salesperson_id
    return lead.lead_owner_id === parseInt(ownerFilter) || lead.salesperson_id === parseInt(ownerFilter)
  })

  // Get leads for a stage
  const getLeadsForStage = (stageId) => {
    return filteredPipelineLeads.filter(l => l.status === stageId)
  }

  // Get stage value
  const getStageValue = (stageId) => {
    return getLeadsForStage(stageId).reduce((sum, l) => sum + (parseFloat(l.quote_amount) || 0), 0)
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

    if (!draggedLead || draggedLead.status === targetStageId) return

    const stage = stages.find(s => s.id === targetStageId)

    // Block drag-drop into delivery stages (they auto-advance via job sync)
    if (stage?.isDelivery || stage?.isClosed) return

    // Handle Won/Lost stages
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

    await updateLead(selectedLead.id, {
      status: 'Won',
      converted_at: new Date().toISOString(),
      notes: selectedLead.notes
        ? `${selectedLead.notes}\n\nWON: ${wonNotes}`
        : `WON: ${wonNotes}`
    })

    setShowWonModal(false)
    setWonNotes('')
    setSelectedLead(null)
    setDraggedLead(null)
    await fetchPipelineLeads()
  }

  // Mark as Lost
  const handleMarkAsLost = async () => {
    if (!selectedLead || !lostReason) return

    await updateLead(selectedLead.id, {
      status: 'Lost',
      notes: selectedLead.notes
        ? `${selectedLead.notes}\n\nLOST: ${lostReason}`
        : `LOST: ${lostReason}`
    })

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

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
        Loading pipeline...
      </div>
    )
  }

  // Calculate all stats
  const activeLeads = pipelineLeads.filter(l => !stages.find(s => s.id === l.status)?.isWon && !stages.find(s => s.id === l.status)?.isLost && !stages.find(s => s.id === l.status)?.isDelivery && !stages.find(s => s.id === l.status)?.isClosed)
  const wonLeadsList = getLeadsForStage('Won')
  const lostLeadsList = getLeadsForStage('Lost')
  const quoteSentLeads = getLeadsForStage('Quote Sent')
  const jobScheduledLeads = getLeadsForStage('Job Scheduled')
  const inProgressLeads = getLeadsForStage('In Progress')
  const completedLeads = getLeadsForStage('Job Complete')
  const invoicedLeads = getLeadsForStage('Invoiced')
  const deliveryLeads = pipelineLeads.filter(l => stages.find(s => s.id === l.status)?.isDelivery)
  const today = new Date().toDateString()
  const leadsWithAppointments = pipelineLeads.filter(l => l.appointment_time)
  const todayAppointments = leadsWithAppointments.filter(l => new Date(l.appointment_time).toDateString() === today)

  const statsData = {
    active: { value: activeLeads.length, label: 'Active', color: null },
    won: { value: wonLeadsList.length, label: 'Won', color: '#22c55e' },
    lost: { value: lostLeadsList.length, label: 'Lost', color: '#64748b' },
    totalValue: { value: formatCurrency(pipelineLeads.reduce((sum, l) => sum + (parseFloat(l.quote_amount) || 0), 0)), label: 'Value', color: null, isFormatted: true },
    wonValue: { value: formatCurrency(wonLeadsList.reduce((sum, l) => sum + (parseFloat(l.quote_amount) || 0), 0)), label: 'Won Value', color: '#22c55e', isFormatted: true },
    appointments: { value: leadsWithAppointments.length, label: 'Appts', color: '#3b82f6' },
    todayAppointments: { value: todayAppointments.length, label: 'Today', color: '#16a34a' },
    quoteSent: { value: quoteSentLeads.length, label: 'Quotes', color: '#8b5cf6' },
    jobScheduled: { value: jobScheduledLeads.length, label: 'Scheduled', color: '#0ea5e9' },
    inProgress: { value: inProgressLeads.length, label: 'In Progress', color: '#f97316' },
    completed: { value: completedLeads.length, label: 'Complete', color: '#22c55e' },
    invoiced: { value: invoicedLeads.length, label: 'Invoiced', color: '#8b5cf6' },
    deliveryValue: { value: formatCurrency(deliveryLeads.reduce((sum, l) => sum + (parseFloat(l.quote_amount) || 0), 0)), label: 'Delivery $', color: '#0ea5e9', isFormatted: true }
  }

  // Identify delivery-phase boundaries for visual separator
  const firstDeliveryIndex = stages.findIndex(s => s.isDelivery)

  return (
    <div style={{ padding: '16px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: isMobile ? '12px' : '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: isMobile ? '18px' : '22px', fontWeight: '700', color: theme.text, margin: 0 }}>
            Sales Pipeline
          </h1>
          {!isMobile && (
            <p style={{ fontSize: '13px', color: theme.textMuted, margin: '4px 0 0' }}>
              Track leads through the sales process. Drag to move between stages.
            </p>
          )}
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {/* Stats - Hidden on mobile */}
          {!isMobile && visibleStats.length > 0 && (
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
                        {stat.isFormatted ? stat.value : stat.value}
                      </div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>{stat.label}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Owner Filter */}
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            style={{
              padding: isMobile ? '10px 8px' : '8px 12px',
              minHeight: isMobile ? '44px' : 'auto',
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              color: theme.text,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            <option value="all">All Owners</option>
            <option value="unassigned">Unassigned</option>
            {activeEmployees.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>

          <button
            onClick={fetchPipelineLeads}
            style={{
              padding: '10px',
              backgroundColor: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              color: theme.textSecondary
            }}
            title="Refresh"
          >
            <RefreshCw size={18} />
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
              padding: isMobile ? '10px' : '10px 16px',
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
            {!isMobile ? 'List View' : '☰'}
          </button>

          <button
            onClick={() => navigate('/leads')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: isMobile ? '10px' : '10px 16px',
              backgroundColor: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            <Plus size={18} />
            {!isMobile && 'Add Lead'}
          </button>
        </div>
      </div>

      {/* Mobile View - Tabbed stages with list */}
      {isMobile ? (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Stage Tabs */}
          <div style={{
            display: 'flex',
            overflowX: 'auto',
            gap: '4px',
            padding: '4px',
            backgroundColor: theme.bg,
            borderRadius: '8px',
            marginBottom: '12px'
          }}>
            {stages.map(stage => {
              const count = getLeadsForStage(stage.id).length
              const isActive = (selectedMobileStage || stages[0].id) === stage.id
              return (
                <button
                  key={stage.id}
                  onClick={() => setSelectedMobileStage(stage.id)}
                  style={{
                    padding: '10px 12px',
                    backgroundColor: isActive ? theme.bgCard : 'transparent',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    whiteSpace: 'nowrap',
                    boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.1)' : 'none'
                  }}
                >
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: stage.color
                  }} />
                  <span style={{
                    fontSize: '13px',
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? theme.text : theme.textSecondary
                  }}>
                    {stage.name}
                  </span>
                  <span style={{
                    fontSize: '11px',
                    padding: '2px 6px',
                    backgroundColor: stage.color + '20',
                    color: stage.color,
                    borderRadius: '10px',
                    fontWeight: '600'
                  }}>
                    {count}
                  </span>
                </button>
              )
            })}
          </div>

          {/* Mobile Lead List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {(() => {
              const currentStage = selectedMobileStage || stages[0].id
              const stageLeads = getLeadsForStage(currentStage)
              const stage = stages.find(s => s.id === currentStage)

              if (stageLeads.length === 0) {
                return (
                  <div style={{
                    padding: '40px 20px',
                    textAlign: 'center',
                    color: theme.textMuted
                  }}>
                    <div style={{ fontSize: '14px' }}>No leads in {stage?.name}</div>
                    <div style={{ fontSize: '12px', marginTop: '4px' }}>
                      {stage?.isDelivery ? 'Deals appear here automatically as jobs progress' : stage?.isClosed ? 'Deals move here when invoice is paid' : 'Leads will appear here when moved to this stage'}
                    </div>
                  </div>
                )
              }

              return stageLeads.map(lead => (
                <EntityCard
                  key={lead.id}
                  name={lead.customer_name}
                  businessName={lead.business_name}
                  onClick={() => navigate(`/leads/${lead.id}`)}
                  style={{ marginBottom: '8px' }}
                >
                  {/* TOP ROW: Name + Value */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: '600', color: theme.text, fontSize: '15px' }}>
                        {lead.customer_name}
                      </div>
                      {lead.business_name && (
                        <div style={{ color: theme.textMuted, fontSize: '13px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {lead.business_name}
                        </div>
                      )}
                    </div>
                    {parseFloat(lead.quote_amount) > 0 && (
                      <div style={{ color: '#16a34a', fontWeight: '600', fontSize: '15px', flexShrink: 0 }}>
                        {formatCurrency(lead.quote_amount)}
                      </div>
                    )}
                  </div>

                  {/* Contact Info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px', fontSize: '13px', color: theme.textMuted }}>
                    {lead.phone && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Phone size={12} />
                        <span>{lead.phone}</span>
                      </div>
                    )}
                    {lead.phone && lead.email && <span style={{ color: theme.border }}>|</span>}
                    {lead.email && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                        <Mail size={12} style={{ flexShrink: 0 }} />
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lead.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Indicators Row */}
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                    {lead.appointment_time && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 8px',
                        backgroundColor: isToday(lead.appointment_time) ? '#dcfce7' : '#f0fdf4',
                        borderRadius: '4px',
                        fontSize: '12px',
                        color: isToday(lead.appointment_time) ? '#166534' : '#15803d',
                        fontWeight: '500'
                      }}>
                        <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: isToday(lead.appointment_time) ? '#166534' : '#15803d' }} />
                        <Calendar size={12} />
                        {isToday(lead.appointment_time)
                          ? `Today ${new Date(lead.appointment_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                          : new Date(lead.appointment_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
                        }
                      </div>
                    )}
                    {lead.lead_owner && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        fontSize: '12px',
                        color: theme.textMuted
                      }}>
                        <User size={12} />
                        {lead.lead_owner.name}
                      </div>
                    )}
                    {lead.lead_source && (
                      <div style={{ fontSize: '11px', color: lead.lead_source === 'Existing Customer' ? '#0ea5e9' : lead.lead_source === 'Direct Job' ? '#f97316' : theme.textMuted, fontStyle: 'italic' }}>
                        via {lead.lead_source}
                      </div>
                    )}
                  </div>

                  {/* Quick Actions for Mobile */}
                  {!stage?.isWon && !stage?.isLost && !stage?.isDelivery && !stage?.isClosed && (
                    <div style={{
                      display: 'flex',
                      gap: '8px',
                      marginTop: '12px',
                      paddingTop: '12px',
                      borderTop: `1px solid ${theme.border}`
                    }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <a
                        href={lead.phone ? `tel:${lead.phone}` : undefined}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          padding: '10px 14px',
                          minHeight: '44px',
                          backgroundColor: '#dcfce7',
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: '#166534',
                          textDecoration: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: '500',
                          opacity: lead.phone ? 1 : 0.5,
                          pointerEvents: lead.phone ? 'auto' : 'none'
                        }}
                      >
                        <Phone size={14} />
                        Call
                      </a>
                      <select
                        value=""
                        onChange={async (e) => {
                          const newStatus = e.target.value
                          if (!newStatus) return
                          const targetStage = stages.find(s => s.id === newStatus)
                          if (targetStage?.isWon) {
                            setSelectedLead(lead)
                            setShowWonModal(true)
                          } else if (targetStage?.isLost) {
                            setSelectedLead(lead)
                            setShowLostModal(true)
                          } else {
                            await updateLead(lead.id, { status: newStatus, updated_at: new Date().toISOString() })
                            await fetchPipelineLeads()
                          }
                        }}
                        onClick={(e) => e.stopPropagation()}
                        style={{
                          flex: 1,
                          padding: '10px 12px',
                          minHeight: '44px',
                          border: `1px solid ${theme.border}`,
                          borderRadius: '6px',
                          fontSize: '13px',
                          backgroundColor: theme.bgCard,
                          color: theme.text,
                          cursor: 'pointer'
                        }}
                      >
                        <option value="">Move to...</option>
                        {stages.filter(s => s.id !== currentStage && !s.isDelivery && !s.isClosed).map(s => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </EntityCard>
              ))
            })()}
          </div>
        </div>
      ) : (
        /* Desktop Pipeline Board - Two collapsible sections */
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', minHeight: 0 }}>

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
              <div style={{ flex: 1, height: '1px', backgroundColor: theme.border }} />
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{pipelineLeads.filter(l => { const s = stages.find(st => st.id === l.status); return s && !s.isDelivery && !s.isClosed }).length} leads</span>
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
                        {stageLeads.length}
                      </span>
                    </div>
                    {stageValue > 0 && (
                      <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '1px' }}>{formatCurrency(stageValue)}</div>
                    )}
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
                              onClick={() => navigate(`/leads/${lead.id}`)}
                              style={{ cursor: 'grab', padding: '8px' }}
                            >
                              <div style={{ fontWeight: '600', color: theme.text, fontSize: '12px', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {lead.customer_name}
                              </div>
                              {lead.business_name && (
                                <div style={{ color: theme.textMuted, fontSize: '10px', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {lead.business_name}
                                </div>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                                {lead.phone && <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: theme.textMuted }}><Phone size={10} /><span>{lead.phone}</span></div>}
                                {lead.email && <div style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', color: theme.textMuted, overflow: 'hidden' }}><Mail size={10} /></div>}
                              </div>
                              {parseFloat(lead.quote_amount) > 0 && (
                                <div style={{ color: '#16a34a', fontSize: '12px', fontWeight: '600' }}>{formatCurrency(lead.quote_amount)}</div>
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
                              {lead.lead_source && (
                                <div style={{ marginTop: '3px', fontSize: '9px', color: lead.lead_source === 'Existing Customer' ? '#0ea5e9' : lead.lead_source === 'Direct Job' ? '#f97316' : theme.textMuted, fontStyle: 'italic' }}>
                                  via {lead.lead_source}
                                </div>
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
                            {stage.id === 'Quote Sent' && 'Leads with quotes sent to them'}
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
              <span style={{ fontSize: '11px', color: theme.textMuted }}>{pipelineLeads.filter(l => { const s = stages.find(st => st.id === l.status); return s && (s.isDelivery || s.isClosed) }).length} deals</span>
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
                        {stageLeads.length}
                      </span>
                    </div>
                    {stageValue > 0 && (
                      <div style={{ fontSize: '10px', color: theme.textMuted, marginTop: '1px' }}>{formatCurrency(stageValue)}</div>
                    )}
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
                              onClick={() => navigate(`/leads/${lead.id}`)}
                              style={{ cursor: 'pointer', padding: '8px' }}
                            >
                              <div style={{ fontWeight: '600', color: theme.text, fontSize: '12px', marginBottom: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {lead.customer_name}
                              </div>
                              {job ? (
                                <div style={{ fontSize: '10px', color: theme.textSecondary, display: 'flex', flexDirection: 'column', gap: '2px', marginTop: '3px' }}>
                                  {parseFloat(job.contract_amount) > 0 && (
                                    <div style={{ color: '#16a34a', fontWeight: '600', fontSize: '12px' }}>{formatCurrency(job.contract_amount)}</div>
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
                                parseFloat(lead.quote_amount) > 0 && (
                                  <div style={{ color: '#16a34a', fontSize: '12px', fontWeight: '600', marginTop: '3px' }}>{formatCurrency(lead.quote_amount)}</div>
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
                              {lead.lead_source && (
                                <div style={{ marginTop: '3px', fontSize: '9px', color: lead.lead_source === 'Existing Customer' ? '#0ea5e9' : lead.lead_source === 'Direct Job' ? '#f97316' : theme.textMuted, fontStyle: 'italic' }}>
                                  via {lead.lead_source}
                                </div>
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
              {parseFloat(selectedLead.quote_amount) > 0 && (
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Value</div>
                  <div style={{ fontSize: '13px', color: '#16a34a', fontWeight: '600' }}>
                    {formatCurrency(selectedLead.quote_amount)}
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
              onClick={() => navigate(`/leads/${selectedLead.id}`)}
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
            maxWidth: '500px',
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

              {/* Stats Configuration */}
              <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: `1px solid ${theme.border}` }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: '0 0 12px' }}>
                  Header Stats
                </h3>
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: '0 0 12px' }}>
                  Choose which stats to display at the top of the pipeline
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
            maxWidth: '380px',
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
            maxWidth: '380px',
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
    </div>
  )
}

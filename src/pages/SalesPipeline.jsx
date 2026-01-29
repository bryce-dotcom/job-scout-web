import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Plus, X, DollarSign, User, Calendar, Target, Settings, Clock,
  AlertTriangle, Trophy, XCircle, Phone, Mail, Building2, FileText,
  MessageSquare, ChevronRight, ChevronDown, GripVertical, MoreHorizontal, Trash2,
  Edit3, Activity, CheckCircle2, ArrowRight, LayoutGrid, List
} from 'lucide-react'

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

// Activity type icons and colors
const activityConfig = {
  note: { icon: FileText, color: '#6b7280', label: 'Note' },
  call: { icon: Phone, color: '#3b82f6', label: 'Call' },
  email: { icon: Mail, color: '#8b5cf6', label: 'Email' },
  meeting: { icon: Calendar, color: '#f59e0b', label: 'Meeting' },
  task: { icon: CheckCircle2, color: '#22c55e', label: 'Task' },
  stage_change: { icon: ArrowRight, color: '#6366f1', label: 'Stage Change' },
  created: { icon: Plus, color: '#10b981', label: 'Created' },
  won: { icon: Trophy, color: '#22c55e', label: 'Won' },
  lost: { icon: XCircle, color: '#ef4444', label: 'Lost' }
}

export default function SalesPipeline() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const leads = useStore((state) => state.leads)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const lightingAudits = useStore((state) => state.lightingAudits)
  const quotes = useStore((state) => state.quotes)

  // Pipeline state
  const [stages, setStages] = useState([])
  const [deals, setDeals] = useState([])
  const [activities, setActivities] = useState([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [showSettingsModal, setShowSettingsModal] = useState(false)
  const [showWonModal, setShowWonModal] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)

  // Selected deal
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [editingDeal, setEditingDeal] = useState(null)

  // Won/Lost handling
  const [wonNotes, setWonNotes] = useState('')
  const [lostReason, setLostReason] = useState('')

  // Drag state
  const [draggedDeal, setDraggedDeal] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)

  // Form state
  const [formData, setFormData] = useState({
    title: '',
    value: '',
    lead_id: '',
    customer_id: '',
    audit_id: '',
    quote_id: '',
    owner_id: '',
    expected_close_date: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    organization: '',
    notes: ''
  })
  const [formError, setFormError] = useState(null)
  const [saving, setSaving] = useState(false)

  // Activity form
  const [activityType, setActivityType] = useState('note')
  const [activitySubject, setActivitySubject] = useState('')
  const [activityDescription, setActivityDescription] = useState('')

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Stage settings form
  const [stageForm, setStageForm] = useState([])

  // View mode: 'kanban' or 'list'
  const [viewMode, setViewMode] = useState('kanban')
  const [expandedStages, setExpandedStages] = useState({})
  const [isMobile, setIsMobile] = useState(false)

  // Check if mobile on mount and resize
  useEffect(() => {
    const checkMobile = () => {
      const mobile = window.innerWidth < 768
      setIsMobile(mobile)
      if (mobile && viewMode === 'kanban') {
        setViewMode('list')
      }
    }
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Initialize expanded stages
  useEffect(() => {
    if (stages.length > 0 && Object.keys(expandedStages).length === 0) {
      const expanded = {}
      stages.forEach(s => { expanded[s.id] = true })
      setExpandedStages(expanded)
    }
  }, [stages])

  // Fetch pipeline data
  const fetchPipelineData = async () => {
    if (!companyId) return

    setLoading(true)

    // Fetch stages
    const { data: stagesData } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('company_id', companyId)
      .order('position')

    // Fetch deals with relations
    const { data: dealsData } = await supabase
      .from('deals')
      .select(`
        *,
        lead:leads(*),
        customer:customers(*),
        audit:lighting_audits(*),
        quote:quotes(*),
        owner:employees(*)
      `)
      .eq('company_id', companyId)
      .eq('status', 'open')
      .order('position')

    setStages(stagesData || [])
    setDeals(dealsData || [])
    setLoading(false)
  }

  // Fetch activities for a deal
  const fetchActivities = async (dealId) => {
    const { data } = await supabase
      .from('deal_activities')
      .select(`
        *,
        created_by_user:employees(name)
      `)
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })

    setActivities(data || [])
  }

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchPipelineData()
  }, [companyId, navigate])

  // Get deals for a stage
  const getDealsByStage = (stageId) => {
    return deals.filter(d => d.stage_id === stageId)
  }

  // Calculate stage totals
  const getStageTotal = (stageId) => {
    return getDealsByStage(stageId).reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0)
  }

  // Check if deal is rotting
  const isRotting = (deal, stage) => {
    if (!deal.last_activity_at || !stage?.rotting_days) return false
    const lastActivity = new Date(deal.last_activity_at)
    const daysSinceActivity = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
    return daysSinceActivity >= stage.rotting_days
  }

  // Get rotting level (for visual indicator)
  const getRottingLevel = (deal, stage) => {
    if (!deal.last_activity_at || !stage?.rotting_days) return 0
    const lastActivity = new Date(deal.last_activity_at)
    const daysSinceActivity = Math.floor((Date.now() - lastActivity.getTime()) / (1000 * 60 * 60 * 24))
    if (daysSinceActivity < stage.rotting_days * 0.5) return 0
    if (daysSinceActivity < stage.rotting_days) return 1 // Warning
    if (daysSinceActivity < stage.rotting_days * 1.5) return 2 // Rotting
    return 3 // Critical
  }

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount) return '$0'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(amount)
  }

  // Format relative time
  const formatRelativeTime = (date) => {
    if (!date) return ''
    const now = new Date()
    const d = new Date(date)
    const diffMs = now - d
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMins = Math.floor(diffMs / (1000 * 60))

    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return d.toLocaleDateString()
  }

  // Drag handlers
  const handleDragStart = (e, deal) => {
    setDraggedDeal(deal)
    e.dataTransfer.effectAllowed = 'move'
    e.target.style.opacity = '0.5'
  }

  const handleDragEnd = (e) => {
    e.target.style.opacity = '1'
    setDraggedDeal(null)
    setDragOverStage(null)
  }

  const handleDragOver = (e, stageId) => {
    e.preventDefault()
    setDragOverStage(stageId)
  }

  const handleDragLeave = () => {
    setDragOverStage(null)
  }

  const handleDrop = async (e, targetStage) => {
    e.preventDefault()
    setDragOverStage(null)

    if (!draggedDeal || draggedDeal.stage_id === targetStage.id) return

    // Check if dropping on Won/Lost stage
    if (targetStage.is_won) {
      setSelectedDeal(draggedDeal)
      setShowWonModal(true)
      return
    }

    if (targetStage.is_lost) {
      setSelectedDeal(draggedDeal)
      setShowLostModal(true)
      return
    }

    // Regular stage move
    await moveDealToStage(draggedDeal, targetStage)
  }

  const moveDealToStage = async (deal, targetStage) => {
    const fromStage = stages.find(s => s.id === deal.stage_id)

    // Update deal
    await supabase
      .from('deals')
      .update({
        stage_id: targetStage.id,
        win_probability: targetStage.win_probability,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', deal.id)

    // Log stage change activity
    await supabase
      .from('deal_activities')
      .insert({
        company_id: companyId,
        deal_id: deal.id,
        activity_type: 'stage_change',
        subject: `Moved from ${fromStage?.name || 'Unknown'} to ${targetStage.name}`,
        from_stage_id: deal.stage_id,
        to_stage_id: targetStage.id,
        created_by: user?.id
      })

    await fetchPipelineData()
    setDraggedDeal(null)
  }

  // Open deal detail
  const openDealDetail = async (deal) => {
    setSelectedDeal(deal)
    setShowDetailPanel(true)
    await fetchActivities(deal.id)
  }

  // Close deal detail
  const closeDealDetail = () => {
    setShowDetailPanel(false)
    setSelectedDeal(null)
    setActivities([])
  }

  // Open add modal
  const openAddModal = () => {
    setEditingDeal(null)
    setFormData({
      title: '',
      value: '',
      lead_id: '',
      customer_id: '',
      audit_id: '',
      quote_id: '',
      owner_id: user?.id || '',
      expected_close_date: '',
      contact_name: '',
      contact_email: '',
      contact_phone: '',
      organization: '',
      notes: ''
    })
    setFormError(null)
    setShowAddModal(true)
  }

  // Handle form change
  const handleFormChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))

    // Auto-fill contact info from lead/customer
    if (name === 'lead_id' && value) {
      const lead = leads.find(l => l.id === value)
      if (lead) {
        setFormData(prev => ({
          ...prev,
          contact_name: lead.customer_name || prev.contact_name,
          contact_email: lead.email || prev.contact_email,
          contact_phone: lead.phone || prev.contact_phone,
          organization: lead.company_name || prev.organization,
          title: prev.title || lead.customer_name
        }))
      }
    }

    if (name === 'customer_id' && value) {
      const customer = customers.find(c => c.id === value)
      if (customer) {
        setFormData(prev => ({
          ...prev,
          contact_name: customer.contact_name || prev.contact_name,
          contact_email: customer.email || prev.contact_email,
          contact_phone: customer.phone || prev.contact_phone,
          organization: customer.name || prev.organization,
          title: prev.title || customer.name
        }))
      }
    }
  }

  // Submit deal form
  const handleSubmitDeal = async (e) => {
    e.preventDefault()
    if (!formData.title) {
      setFormError('Deal title is required')
      return
    }

    setSaving(true)
    setFormError(null)

    // Get first active stage
    const firstStage = stages.find(s => !s.is_won && !s.is_lost) || stages[0]

    const payload = {
      company_id: companyId,
      stage_id: firstStage?.id,
      title: formData.title,
      value: parseFloat(formData.value) || 0,
      lead_id: formData.lead_id || null,
      customer_id: formData.customer_id || null,
      audit_id: formData.audit_id || null,
      quote_id: formData.quote_id || null,
      owner_id: formData.owner_id || null,
      expected_close_date: formData.expected_close_date || null,
      contact_name: formData.contact_name,
      contact_email: formData.contact_email,
      contact_phone: formData.contact_phone,
      organization: formData.organization,
      notes: formData.notes,
      win_probability: firstStage?.win_probability || 0,
      last_activity_at: new Date().toISOString()
    }

    const { data: newDeal, error } = await supabase
      .from('deals')
      .insert(payload)
      .select()
      .single()

    if (error) {
      setFormError(error.message)
      setSaving(false)
      return
    }

    // Log created activity
    await supabase
      .from('deal_activities')
      .insert({
        company_id: companyId,
        deal_id: newDeal.id,
        activity_type: 'created',
        subject: 'Deal created',
        created_by: user?.id
      })

    await fetchPipelineData()
    setShowAddModal(false)
    setSaving(false)
  }

  // Handle Won
  const handleWon = async () => {
    if (!selectedDeal) return

    const wonStage = stages.find(s => s.is_won)

    await supabase
      .from('deals')
      .update({
        stage_id: wonStage?.id,
        status: 'won',
        won_at: new Date().toISOString(),
        won_notes: wonNotes,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedDeal.id)

    await supabase
      .from('deal_activities')
      .insert({
        company_id: companyId,
        deal_id: selectedDeal.id,
        activity_type: 'won',
        subject: 'Deal Won!',
        description: wonNotes,
        created_by: user?.id
      })

    setShowWonModal(false)
    setWonNotes('')
    setSelectedDeal(null)
    await fetchPipelineData()
  }

  // Handle Lost
  const handleLost = async () => {
    if (!selectedDeal || !lostReason) return

    const lostStage = stages.find(s => s.is_lost)

    await supabase
      .from('deals')
      .update({
        stage_id: lostStage?.id,
        status: 'lost',
        lost_at: new Date().toISOString(),
        lost_reason: lostReason,
        last_activity_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq('id', selectedDeal.id)

    await supabase
      .from('deal_activities')
      .insert({
        company_id: companyId,
        deal_id: selectedDeal.id,
        activity_type: 'lost',
        subject: 'Deal Lost',
        description: lostReason,
        created_by: user?.id
      })

    setShowLostModal(false)
    setLostReason('')
    setSelectedDeal(null)
    await fetchPipelineData()
  }

  // Add activity
  const handleAddActivity = async () => {
    if (!selectedDeal || !activitySubject) return

    await supabase
      .from('deal_activities')
      .insert({
        company_id: companyId,
        deal_id: selectedDeal.id,
        activity_type: activityType,
        subject: activitySubject,
        description: activityDescription,
        created_by: user?.id
      })

    // Update deal last_activity_at
    await supabase
      .from('deals')
      .update({ last_activity_at: new Date().toISOString() })
      .eq('id', selectedDeal.id)

    setActivityType('note')
    setActivitySubject('')
    setActivityDescription('')
    await fetchActivities(selectedDeal.id)
    await fetchPipelineData()
  }

  // Delete deal
  const handleDeleteDeal = async () => {
    if (!selectedDeal || !confirm('Delete this deal? This cannot be undone.')) return

    await supabase.from('deal_activities').delete().eq('deal_id', selectedDeal.id)
    await supabase.from('deals').delete().eq('id', selectedDeal.id)

    closeDealDetail()
    await fetchPipelineData()
  }

  // Open settings
  const openSettings = () => {
    setStageForm(stages.filter(s => !s.is_won && !s.is_lost).map(s => ({ ...s })))
    setShowSettingsModal(true)
  }

  // Save stage settings
  const handleSaveStages = async () => {
    for (let i = 0; i < stageForm.length; i++) {
      const stage = stageForm[i]
      await supabase
        .from('pipeline_stages')
        .update({
          name: stage.name,
          color: stage.color,
          win_probability: stage.win_probability,
          rotting_days: stage.rotting_days,
          position: i
        })
        .eq('id', stage.id)
    }

    setShowSettingsModal(false)
    await fetchPipelineData()
  }

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

  // Calculate total pipeline value
  const totalPipelineValue = deals.reduce((sum, d) => sum + (parseFloat(d.value) || 0), 0)
  const weightedValue = deals.reduce((sum, d) => sum + ((parseFloat(d.value) || 0) * (d.win_probability || 0) / 100), 0)

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
        Loading pipeline...
      </div>
    )
  }

  const toggleStageExpand = (stageId) => {
    setExpandedStages(prev => ({ ...prev, [stageId]: !prev[stageId] }))
  }

  return (
    <div style={{
      padding: isMobile ? '16px' : '24px',
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '16px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{
            fontSize: isMobile ? '20px' : '24px',
            fontWeight: '700',
            color: theme.text,
            marginBottom: '4px'
          }}>
            Sales Pipeline
          </h1>
          <div style={{
            display: 'flex',
            gap: isMobile ? '8px' : '16px',
            fontSize: isMobile ? '12px' : '14px',
            color: theme.textMuted,
            flexWrap: 'wrap'
          }}>
            <span>{deals.length} deals</span>
            <span>•</span>
            <span>{formatCurrency(totalPipelineValue)}</span>
            {!isMobile && (
              <>
                <span>•</span>
                <span>Weighted: {formatCurrency(weightedValue)}</span>
              </>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {/* View Toggle */}
          {!isMobile && (
            <div style={{
              display: 'flex',
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              overflow: 'hidden'
            }}>
              <button
                onClick={() => setViewMode('kanban')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '8px 12px',
                  backgroundColor: viewMode === 'kanban' ? theme.accentBg : 'transparent',
                  color: viewMode === 'kanban' ? theme.accent : theme.textMuted,
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                <LayoutGrid size={16} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '8px 12px',
                  backgroundColor: viewMode === 'list' ? theme.accentBg : 'transparent',
                  color: viewMode === 'list' ? theme.accent : theme.textMuted,
                  border: 'none',
                  borderLeft: `1px solid ${theme.border}`,
                  cursor: 'pointer',
                  fontSize: '13px'
                }}
              >
                <List size={16} />
              </button>
            </div>
          )}
          <button
            onClick={openSettings}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: isMobile ? '8px 10px' : '10px 14px',
              backgroundColor: 'transparent',
              border: `1px solid ${theme.border}`,
              color: theme.textSecondary,
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <Settings size={16} />
            {!isMobile && 'Settings'}
          </button>
          <button
            onClick={openAddModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: isMobile ? '8px 12px' : '10px 16px',
              backgroundColor: theme.accent,
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <Plus size={18} />
            {isMobile ? 'Add' : 'Add Deal'}
          </button>
        </div>
      </div>

      {/* List View (Mobile-friendly) */}
      {viewMode === 'list' && (
        <div style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          {stages.map((stage) => {
            const stageDeals = getDealsByStage(stage.id)
            const isExpanded = expandedStages[stage.id]

            return (
              <div key={stage.id} style={{
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                overflow: 'hidden'
              }}>
                {/* Stage Header */}
                <button
                  onClick={() => toggleStageExpand(stage.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '14px 16px',
                    backgroundColor: stage.color || theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    {isExpanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
                    <span style={{ fontWeight: '600', fontSize: '15px' }}>{stage.name}</span>
                    <span style={{
                      backgroundColor: 'rgba(255,255,255,0.25)',
                      padding: '2px 10px',
                      borderRadius: '12px',
                      fontSize: '13px'
                    }}>
                      {stageDeals.length}
                    </span>
                  </div>
                  <span style={{ fontSize: '14px', opacity: 0.9 }}>
                    {formatCurrency(getStageTotal(stage.id))}
                  </span>
                </button>

                {/* Stage Deals */}
                {isExpanded && (
                  <div style={{ padding: '8px' }}>
                    {stageDeals.length === 0 ? (
                      <div style={{
                        textAlign: 'center',
                        padding: '20px',
                        color: theme.textMuted,
                        fontSize: '13px'
                      }}>
                        No deals in this stage
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {stageDeals.map((deal) => {
                          const rottingLevel = getRottingLevel(deal, stage)
                          const rottingColors = ['transparent', '#fbbf24', '#f97316', '#ef4444']

                          return (
                            <div
                              key={deal.id}
                              onClick={() => openDealDetail(deal)}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                padding: '14px 16px',
                                backgroundColor: theme.bg,
                                borderRadius: '10px',
                                borderLeft: rottingLevel > 0 ? `4px solid ${rottingColors[rottingLevel]}` : 'none',
                                cursor: 'pointer'
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: '8px',
                                  marginBottom: '4px'
                                }}>
                                  <span style={{
                                    fontWeight: '600',
                                    fontSize: '14px',
                                    color: theme.text,
                                    overflow: 'hidden',
                                    textOverflow: 'ellipsis',
                                    whiteSpace: 'nowrap'
                                  }}>
                                    {deal.title}
                                  </span>
                                  {rottingLevel >= 2 && (
                                    <AlertTriangle size={14} color={rottingColors[rottingLevel]} />
                                  )}
                                </div>
                                {deal.organization && (
                                  <span style={{
                                    fontSize: '12px',
                                    color: theme.textMuted
                                  }}>
                                    {deal.organization}
                                  </span>
                                )}
                              </div>
                              <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '12px',
                                flexShrink: 0
                              }}>
                                <span style={{
                                  fontWeight: '600',
                                  fontSize: '15px',
                                  color: '#16a34a'
                                }}>
                                  {formatCurrency(deal.value)}
                                </span>
                                <ChevronRight size={18} color={theme.textMuted} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Kanban Board */}
      {viewMode === 'kanban' && (
        <div style={{
          flex: 1,
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{
            display: 'flex',
            gap: '12px',
            overflowX: 'auto',
            overflowY: 'hidden',
            height: '100%',
            paddingBottom: '16px',
            WebkitOverflowScrolling: 'touch'
          }}>
        {stages.map((stage) => (
          <div
            key={stage.id}
            style={{ flexShrink: 0, width: '300px', display: 'flex', flexDirection: 'column' }}
            onDragOver={(e) => handleDragOver(e, stage.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, stage)}
          >
            {/* Column Header */}
            <div style={{
              backgroundColor: stage.color || theme.accent,
              color: '#ffffff',
              padding: '14px 16px',
              borderRadius: '12px 12px 0 0'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '4px'
              }}>
                <span style={{ fontWeight: '600', fontSize: '14px' }}>{stage.name}</span>
                <span style={{
                  backgroundColor: 'rgba(255,255,255,0.25)',
                  padding: '2px 10px',
                  borderRadius: '12px',
                  fontSize: '13px',
                  fontWeight: '500'
                }}>
                  {getDealsByStage(stage.id).length}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', opacity: 0.9 }}>
                <span>{formatCurrency(getStageTotal(stage.id))}</span>
                {!stage.is_won && !stage.is_lost && (
                  <span>{stage.win_probability}% prob</span>
                )}
              </div>
            </div>

            {/* Column Content */}
            <div style={{
              backgroundColor: dragOverStage === stage.id ? theme.accentBg : 'rgba(0,0,0,0.02)',
              border: dragOverStage === stage.id ? `2px dashed ${theme.accent}` : '2px solid transparent',
              padding: '10px',
              borderRadius: '0 0 12px 12px',
              minHeight: '400px',
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              transition: 'all 0.2s ease'
            }}>
              {getDealsByStage(stage.id).map((deal) => {
                const rottingLevel = getRottingLevel(deal, stage)
                const rottingColors = ['transparent', '#fbbf24', '#f97316', '#ef4444']

                return (
                  <div
                    key={deal.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, deal)}
                    onDragEnd={handleDragEnd}
                    onClick={() => openDealDetail(deal)}
                    style={{
                      backgroundColor: theme.bgCard,
                      borderRadius: '10px',
                      padding: '14px',
                      border: `1px solid ${theme.border}`,
                      borderLeft: rottingLevel > 0 ? `4px solid ${rottingColors[rottingLevel]}` : `1px solid ${theme.border}`,
                      cursor: 'grab',
                      transition: 'all 0.15s ease',
                      position: 'relative'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                      e.currentTarget.style.transform = 'translateY(-1px)'
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.boxShadow = 'none'
                      e.currentTarget.style.transform = 'none'
                    }}
                  >
                    {/* Rotting indicator */}
                    {rottingLevel >= 2 && (
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px'
                      }}>
                        <AlertTriangle
                          size={16}
                          color={rottingColors[rottingLevel]}
                          title={`No activity for ${Math.floor((Date.now() - new Date(deal.last_activity_at).getTime()) / (1000 * 60 * 60 * 24))} days`}
                        />
                      </div>
                    )}

                    {/* Deal Title */}
                    <h4 style={{
                      fontWeight: '600',
                      color: theme.text,
                      fontSize: '14px',
                      marginBottom: '6px',
                      paddingRight: rottingLevel >= 2 ? '20px' : '0'
                    }}>
                      {deal.title}
                    </h4>

                    {/* Organization */}
                    {deal.organization && (
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        color: theme.textSecondary,
                        fontSize: '13px',
                        marginBottom: '8px'
                      }}>
                        <Building2 size={12} />
                        <span>{deal.organization}</span>
                      </div>
                    )}

                    {/* Value */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#16a34a',
                      fontSize: '15px',
                      fontWeight: '600',
                      marginBottom: '10px'
                    }}>
                      <DollarSign size={16} />
                      <span>{formatCurrency(deal.value)}</span>
                    </div>

                    {/* Footer */}
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingTop: '10px',
                      borderTop: `1px solid ${theme.border}`
                    }}>
                      {/* Owner Avatar */}
                      {deal.owner && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}>
                          <div style={{
                            width: '24px',
                            height: '24px',
                            borderRadius: '50%',
                            backgroundColor: theme.accentBg,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '11px',
                            fontWeight: '600',
                            color: theme.accent
                          }}>
                            {deal.owner.name?.split(' ').map(n => n[0]).join('').slice(0, 2)}
                          </div>
                        </div>
                      )}

                      {/* Expected Close Date */}
                      {deal.expected_close_date && (
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          color: theme.textMuted,
                          fontSize: '12px'
                        }}>
                          <Calendar size={12} />
                          <span>{new Date(deal.expected_close_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                      )}

                      {/* Win Probability */}
                      {!stage.is_won && !stage.is_lost && (
                        <div style={{
                          fontSize: '12px',
                          color: theme.textMuted,
                          backgroundColor: theme.accentBg,
                          padding: '2px 8px',
                          borderRadius: '4px'
                        }}>
                          {deal.win_probability || stage.win_probability}%
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}

              {getDealsByStage(stage.id).length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '40px 16px',
                  color: theme.textMuted,
                  fontSize: '13px'
                }}>
                  <Target size={28} style={{ opacity: 0.3, marginBottom: '8px' }} />
                  <p>No deals</p>
                  <p style={{ fontSize: '12px', marginTop: '4px' }}>Drag deals here</p>
                </div>
              )}
            </div>
          </div>
        ))}
          </div>
        </div>
      )}

      {/* Add Deal Modal */}
      {showAddModal && (
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
            maxWidth: '520px',
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
                Add New Deal
              </h2>
              <button
                onClick={() => setShowAddModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  borderRadius: '8px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmitDeal} style={{ padding: '20px' }}>
              {formError && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontSize: '14px'
                }}>
                  {formError}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Deal Title *</label>
                    <input
                      name="title"
                      value={formData.title}
                      onChange={handleFormChange}
                      placeholder="e.g., Office LED Retrofit"
                      required
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Value</label>
                    <input
                      type="number"
                      name="value"
                      value={formData.value}
                      onChange={handleFormChange}
                      placeholder="0"
                      style={inputStyle}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Link to Lead</label>
                    <select
                      name="lead_id"
                      value={formData.lead_id}
                      onChange={handleFormChange}
                      style={inputStyle}
                    >
                      <option value="">-- Select Lead --</option>
                      {leads.filter(l => l.status !== 'Not Qualified').map(lead => (
                        <option key={lead.id} value={lead.id}>{lead.customer_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Link to Customer</label>
                    <select
                      name="customer_id"
                      value={formData.customer_id}
                      onChange={handleFormChange}
                      style={inputStyle}
                    >
                      <option value="">-- Select Customer --</option>
                      {customers.map(cust => (
                        <option key={cust.id} value={cust.id}>{cust.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={labelStyle}>Link to Audit</label>
                    <select
                      name="audit_id"
                      value={formData.audit_id}
                      onChange={handleFormChange}
                      style={inputStyle}
                    >
                      <option value="">-- Select Audit --</option>
                      {lightingAudits.map(audit => (
                        <option key={audit.id} value={audit.id}>{audit.name || audit.location_name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Deal Owner</label>
                    <select
                      name="owner_id"
                      value={formData.owner_id}
                      onChange={handleFormChange}
                      style={inputStyle}
                    >
                      <option value="">-- Select --</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Expected Close Date</label>
                  <input
                    type="date"
                    name="expected_close_date"
                    value={formData.expected_close_date}
                    onChange={handleFormChange}
                    style={inputStyle}
                  />
                </div>

                <div style={{
                  borderTop: `1px solid ${theme.border}`,
                  paddingTop: '16px',
                  marginTop: '4px'
                }}>
                  <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
                    Contact Information
                  </h4>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={labelStyle}>Contact Name</label>
                      <input
                        name="contact_name"
                        value={formData.contact_name}
                        onChange={handleFormChange}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Organization</label>
                      <input
                        name="organization"
                        value={formData.organization}
                        onChange={handleFormChange}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input
                        type="email"
                        name="contact_email"
                        value={formData.contact_email}
                        onChange={handleFormChange}
                        style={inputStyle}
                      />
                    </div>
                    <div>
                      <label style={labelStyle}>Phone</label>
                      <input
                        name="contact_phone"
                        value={formData.contact_phone}
                        onChange={handleFormChange}
                        style={inputStyle}
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleFormChange}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px'
              }}>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  style={{
                    flex: 1,
                    padding: '12px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent',
                    color: theme.text,
                    borderRadius: '8px',
                    fontSize: '14px',
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
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: saving ? 'not-allowed' : 'pointer',
                    opacity: saving ? 0.6 : 1
                  }}
                >
                  {saving ? 'Creating...' : 'Create Deal'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Deal Detail Panel */}
      {showDetailPanel && selectedDeal && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: isMobile ? '100%' : '480px',
          maxWidth: '100%',
          backgroundColor: theme.bgCard,
          boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          {/* Panel Header */}
          <div style={{
            padding: isMobile ? '16px' : '20px',
            borderBottom: `1px solid ${theme.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <h2 style={{
              fontSize: isMobile ? '16px' : '18px',
              fontWeight: '600',
              color: theme.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              flex: 1,
              marginRight: '12px'
            }}>
              {selectedDeal.title}
            </h2>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleDeleteDeal}
                style={{
                  padding: '8px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: '#dc2626',
                  borderRadius: '8px'
                }}
                title="Delete Deal"
              >
                <Trash2 size={18} />
              </button>
              <button
                onClick={closeDealDetail}
                style={{
                  padding: '8px',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  borderRadius: '8px'
                }}
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Panel Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {/* Deal Value & Stage */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '16px',
              marginBottom: '20px'
            }}>
              <div style={{
                fontSize: '28px',
                fontWeight: '700',
                color: '#16a34a'
              }}>
                {formatCurrency(selectedDeal.value)}
              </div>
              <div style={{
                padding: '6px 12px',
                backgroundColor: stages.find(s => s.id === selectedDeal.stage_id)?.color || theme.accent,
                color: '#ffffff',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: '500'
              }}>
                {stages.find(s => s.id === selectedDeal.stage_id)?.name || 'Unknown'}
              </div>
            </div>

            {/* Quick Actions */}
            <div style={{
              display: 'flex',
              gap: '8px',
              marginBottom: '24px'
            }}>
              <button
                onClick={() => {
                  setShowDetailPanel(false)
                  setShowWonModal(true)
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px',
                  backgroundColor: '#dcfce7',
                  color: '#16a34a',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                <Trophy size={16} />
                Won
              </button>
              <button
                onClick={() => {
                  setShowDetailPanel(false)
                  setShowLostModal(true)
                }}
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  padding: '10px',
                  backgroundColor: '#fee2e2',
                  color: '#dc2626',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                <XCircle size={16} />
                Lost
              </button>
            </div>

            {/* Details Grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '16px',
              marginBottom: '24px'
            }}>
              {selectedDeal.organization && (
                <div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Organization</div>
                  <div style={{ fontSize: '14px', color: theme.text, fontWeight: '500' }}>{selectedDeal.organization}</div>
                </div>
              )}
              {selectedDeal.contact_name && (
                <div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Contact</div>
                  <div style={{ fontSize: '14px', color: theme.text, fontWeight: '500' }}>{selectedDeal.contact_name}</div>
                </div>
              )}
              {selectedDeal.contact_email && (
                <div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Email</div>
                  <a href={`mailto:${selectedDeal.contact_email}`} style={{ fontSize: '14px', color: theme.accent }}>{selectedDeal.contact_email}</a>
                </div>
              )}
              {selectedDeal.contact_phone && (
                <div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Phone</div>
                  <a href={`tel:${selectedDeal.contact_phone}`} style={{ fontSize: '14px', color: theme.accent }}>{selectedDeal.contact_phone}</a>
                </div>
              )}
              {selectedDeal.expected_close_date && (
                <div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Expected Close</div>
                  <div style={{ fontSize: '14px', color: theme.text }}>{new Date(selectedDeal.expected_close_date).toLocaleDateString()}</div>
                </div>
              )}
              {selectedDeal.owner && (
                <div>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Owner</div>
                  <div style={{ fontSize: '14px', color: theme.text }}>{selectedDeal.owner.name}</div>
                </div>
              )}
            </div>

            {/* Linked Records */}
            {(selectedDeal.lead || selectedDeal.customer || selectedDeal.audit) && (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                  Linked Records
                </h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedDeal.lead && (
                    <div style={{
                      padding: '10px 12px',
                      backgroundColor: theme.accentBg,
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: theme.text
                    }}>
                      <span style={{ color: theme.textMuted }}>Lead:</span> {selectedDeal.lead.customer_name}
                    </div>
                  )}
                  {selectedDeal.customer && (
                    <div style={{
                      padding: '10px 12px',
                      backgroundColor: theme.accentBg,
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: theme.text
                    }}>
                      <span style={{ color: theme.textMuted }}>Customer:</span> {selectedDeal.customer.name}
                    </div>
                  )}
                  {selectedDeal.audit && (
                    <div style={{
                      padding: '10px 12px',
                      backgroundColor: theme.accentBg,
                      borderRadius: '8px',
                      fontSize: '13px',
                      color: theme.text
                    }}>
                      <span style={{ color: theme.textMuted }}>Audit:</span> {selectedDeal.audit.name || selectedDeal.audit.location_name}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedDeal.notes && (
              <div style={{ marginBottom: '24px' }}>
                <h4 style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '8px' }}>
                  Notes
                </h4>
                <p style={{ fontSize: '14px', color: theme.text, whiteSpace: 'pre-wrap' }}>{selectedDeal.notes}</p>
              </div>
            )}

            {/* Add Activity */}
            <div style={{
              borderTop: `1px solid ${theme.border}`,
              paddingTop: '20px',
              marginBottom: '20px'
            }}>
              <h4 style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                Add Activity
              </h4>
              <div style={{ display: 'flex', gap: '8px', marginBottom: '12px', flexWrap: 'wrap' }}>
                {['note', 'call', 'email', 'meeting', 'task'].map((type) => {
                  const config = activityConfig[type]
                  const Icon = config.icon
                  return (
                    <button
                      key={type}
                      onClick={() => setActivityType(type)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '6px 10px',
                        backgroundColor: activityType === type ? config.color : 'transparent',
                        color: activityType === type ? '#ffffff' : config.color,
                        border: `1px solid ${config.color}`,
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      <Icon size={14} />
                      {config.label}
                    </button>
                  )
                })}
              </div>
              <input
                value={activitySubject}
                onChange={(e) => setActivitySubject(e.target.value)}
                placeholder="Subject..."
                style={{ ...inputStyle, marginBottom: '8px' }}
              />
              <textarea
                value={activityDescription}
                onChange={(e) => setActivityDescription(e.target.value)}
                placeholder="Description (optional)..."
                rows={2}
                style={{ ...inputStyle, marginBottom: '8px', resize: 'vertical' }}
              />
              <button
                onClick={handleAddActivity}
                disabled={!activitySubject}
                style={{
                  width: '100%',
                  padding: '10px',
                  backgroundColor: activitySubject ? theme.accent : theme.border,
                  color: activitySubject ? '#ffffff' : theme.textMuted,
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: activitySubject ? 'pointer' : 'not-allowed'
                }}
              >
                Add Activity
              </button>
            </div>

            {/* Activity Timeline */}
            <div>
              <h4 style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                Activity Timeline
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {activities.map((activity) => {
                  const config = activityConfig[activity.activity_type] || activityConfig.note
                  const Icon = config.icon
                  return (
                    <div
                      key={activity.id}
                      style={{
                        display: 'flex',
                        gap: '12px',
                        padding: '12px',
                        backgroundColor: 'rgba(0,0,0,0.02)',
                        borderRadius: '8px'
                      }}
                    >
                      <div style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        backgroundColor: `${config.color}20`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                      }}>
                        <Icon size={16} color={config.color} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                          <span style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                            {activity.subject}
                          </span>
                          <span style={{ fontSize: '12px', color: theme.textMuted }}>
                            {formatRelativeTime(activity.created_at)}
                          </span>
                        </div>
                        {activity.description && (
                          <p style={{ fontSize: '13px', color: theme.textSecondary, marginBottom: '4px' }}>
                            {activity.description}
                          </p>
                        )}
                        {activity.created_by_user && (
                          <span style={{ fontSize: '12px', color: theme.textMuted }}>
                            by {activity.created_by_user.name}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
                {activities.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px', color: theme.textMuted, fontSize: '13px' }}>
                    No activities yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Backdrop for panel */}
      {showDetailPanel && (
        <div
          onClick={closeDealDetail}
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.3)',
            zIndex: 40
          }}
        />
      )}

      {/* Won Modal */}
      {showWonModal && selectedDeal && (
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
            padding: '24px',
            width: '100%',
            maxWidth: '400px',
            textAlign: 'center'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#dcfce7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <Trophy size={32} color="#16a34a" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>
              Deal Won!
            </h2>
            <p style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '20px' }}>
              Congratulations! You're about to mark "{selectedDeal.title}" as won.
            </p>
            <div style={{ marginBottom: '20px' }}>
              <label style={labelStyle}>Add a note (optional)</label>
              <textarea
                value={wonNotes}
                onChange={(e) => setWonNotes(e.target.value)}
                placeholder="e.g., Customer signed contract after follow-up call..."
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowWonModal(false)
                  setWonNotes('')
                  setSelectedDeal(null)
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleWon}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Mark as Won
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lost Modal */}
      {showLostModal && selectedDeal && (
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
            padding: '24px',
            width: '100%',
            maxWidth: '400px'
          }}>
            <div style={{
              width: '64px',
              height: '64px',
              borderRadius: '50%',
              backgroundColor: '#fee2e2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 16px'
            }}>
              <XCircle size={32} color="#dc2626" />
            </div>
            <h2 style={{ fontSize: '20px', fontWeight: '600', color: theme.text, marginBottom: '8px', textAlign: 'center' }}>
              Mark as Lost
            </h2>
            <p style={{ fontSize: '14px', color: theme.textSecondary, marginBottom: '20px', textAlign: 'center' }}>
              Why was "{selectedDeal.title}" lost?
            </p>
            <div style={{ marginBottom: '16px' }}>
              <label style={labelStyle}>Reason *</label>
              <select
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                style={inputStyle}
              >
                <option value="">-- Select a reason --</option>
                <option value="Price too high">Price too high</option>
                <option value="Went with competitor">Went with competitor</option>
                <option value="No budget">No budget</option>
                <option value="Project postponed">Project postponed</option>
                <option value="No response">No response</option>
                <option value="Not a good fit">Not a good fit</option>
                <option value="Other">Other</option>
              </select>
            </div>
            {lostReason === 'Other' && (
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Please specify</label>
                <textarea
                  value={lostReason === 'Other' ? '' : lostReason}
                  onChange={(e) => setLostReason(e.target.value)}
                  placeholder="Enter reason..."
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
            )}
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowLostModal(false)
                  setLostReason('')
                  setSelectedDeal(null)
                }}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleLost}
                disabled={!lostReason}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: lostReason ? '#dc2626' : theme.border,
                  color: lostReason ? '#ffffff' : theme.textMuted,
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: lostReason ? 'pointer' : 'not-allowed'
                }}
              >
                Mark as Lost
              </button>
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
                Pipeline Settings
              </h2>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px',
                  cursor: 'pointer',
                  color: theme.textMuted
                }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '20px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
                Active Stages
              </h4>
              <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '16px' }}>
                Customize your pipeline stages. The "Won" and "Lost" stages cannot be modified.
              </p>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {stageForm.map((stage, idx) => (
                  <div
                    key={stage.id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 80px 80px 80px',
                      gap: '12px',
                      padding: '12px',
                      backgroundColor: 'rgba(0,0,0,0.02)',
                      borderRadius: '8px',
                      alignItems: 'center'
                    }}
                  >
                    <input
                      value={stage.name}
                      onChange={(e) => {
                        const updated = [...stageForm]
                        updated[idx].name = e.target.value
                        setStageForm(updated)
                      }}
                      style={{ ...inputStyle, backgroundColor: theme.bgCard }}
                      placeholder="Stage name"
                    />
                    <input
                      type="color"
                      value={stage.color}
                      onChange={(e) => {
                        const updated = [...stageForm]
                        updated[idx].color = e.target.value
                        setStageForm(updated)
                      }}
                      style={{
                        width: '100%',
                        height: '40px',
                        padding: '4px',
                        border: `1px solid ${theme.border}`,
                        borderRadius: '8px',
                        cursor: 'pointer'
                      }}
                    />
                    <input
                      type="number"
                      value={stage.win_probability}
                      onChange={(e) => {
                        const updated = [...stageForm]
                        updated[idx].win_probability = parseInt(e.target.value) || 0
                        setStageForm(updated)
                      }}
                      min={0}
                      max={100}
                      style={{ ...inputStyle, backgroundColor: theme.bgCard }}
                      placeholder="%"
                    />
                    <input
                      type="number"
                      value={stage.rotting_days}
                      onChange={(e) => {
                        const updated = [...stageForm]
                        updated[idx].rotting_days = parseInt(e.target.value) || 14
                        setStageForm(updated)
                      }}
                      min={1}
                      style={{ ...inputStyle, backgroundColor: theme.bgCard }}
                      placeholder="Days"
                    />
                  </div>
                ))}
              </div>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 80px 80px 80px',
                gap: '12px',
                fontSize: '11px',
                color: theme.textMuted,
                marginTop: '8px',
                paddingLeft: '12px'
              }}>
                <span>Stage Name</span>
                <span>Color</span>
                <span>Win %</span>
                <span>Rot Days</span>
              </div>
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              padding: '20px',
              borderTop: `1px solid ${theme.border}`
            }}>
              <button
                onClick={() => setShowSettingsModal(false)}
                style={{
                  flex: 1,
                  padding: '12px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent',
                  color: theme.text,
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleSaveStages}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  Plus, X, DollarSign, User, Calendar, Target, Phone, Mail, Building2,
  Trophy, XCircle, ChevronRight, GripVertical, RefreshCw, MapPin
} from 'lucide-react'

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

// Pipeline stages based on lead status
const pipelineStages = [
  { id: 'Appointment Set', name: 'Appointment Set', color: '#22c55e', icon: '📅' },
  { id: 'Qualified', name: 'Qualified', color: '#3b82f6', icon: '✓' },
  { id: 'Quote Sent', name: 'Quote Sent', color: '#8b5cf6', icon: '📋' },
  { id: 'Negotiation', name: 'Negotiation', color: '#f59e0b', icon: '💬' },
  { id: 'Won', name: 'Won', color: '#10b981', icon: '🏆', isWon: true },
  { id: 'Lost', name: 'Lost', color: '#64748b', icon: '❌', isLost: true }
]

export default function SalesPipeline() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const employees = useStore((state) => state.employees)

  // Pipeline state
  const [pipelineLeads, setPipelineLeads] = useState([])
  const [loading, setLoading] = useState(true)

  // Modals
  const [showDetailPanel, setShowDetailPanel] = useState(false)
  const [showWonModal, setShowWonModal] = useState(false)
  const [showLostModal, setShowLostModal] = useState(false)

  // Selected lead
  const [selectedLead, setSelectedLead] = useState(null)

  // Won/Lost handling
  const [wonNotes, setWonNotes] = useState('')
  const [lostReason, setLostReason] = useState('')

  // Drag state
  const [draggedLead, setDraggedLead] = useState(null)
  const [dragOverStage, setDragOverStage] = useState(null)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Fetch pipeline leads
  const fetchPipelineLeads = async () => {
    if (!companyId) return
    setLoading(true)

    const { data, error } = await supabase
      .from('leads')
      .select(`
        *,
        lead_owner:employees!leads_lead_owner_id_fkey(id, name),
        setter_owner:employees!leads_setter_owner_id_fkey(id, name)
      `)
      .eq('company_id', companyId)
      .in('status', ['Appointment Set', 'Qualified', 'Quote Sent', 'Negotiation', 'Won', 'Lost'])
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('[Pipeline] Error fetching leads:', error)
    } else {
      console.log('[Pipeline] Leads fetched:', data?.length || 0)
    }

    setPipelineLeads(data || [])
    setLoading(false)
  }

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchPipelineLeads()
  }, [companyId, navigate])

  // Get leads for a stage
  const getLeadsForStage = (stageId) => {
    return pipelineLeads.filter(l => l.status === stageId)
  }

  // Get stage value
  const getStageValue = (stageId) => {
    return getLeadsForStage(stageId).reduce((sum, l) => sum + (parseFloat(l.estimated_value) || 0), 0)
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

    const stage = pipelineStages.find(s => s.id === targetStageId)

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
    await supabase
      .from('leads')
      .update({
        status: targetStageId,
        updated_at: new Date().toISOString()
      })
      .eq('id', draggedLead.id)

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

    await supabase
      .from('leads')
      .update({
        status: 'Won',
        won_at: new Date().toISOString(),
        notes: selectedLead.notes
          ? `${selectedLead.notes}\n\nWON: ${wonNotes}`
          : `WON: ${wonNotes}`
      })
      .eq('id', selectedLead.id)

    setShowWonModal(false)
    setWonNotes('')
    setSelectedLead(null)
    setDraggedLead(null)
    await fetchPipelineLeads()
  }

  // Mark as Lost
  const handleMarkAsLost = async () => {
    if (!selectedLead || !lostReason) return

    await supabase
      .from('leads')
      .update({
        status: 'Lost',
        lost_at: new Date().toISOString(),
        lost_reason: lostReason,
        notes: selectedLead.notes
          ? `${selectedLead.notes}\n\nLOST: ${lostReason}`
          : `LOST: ${lostReason}`
      })
      .eq('id', selectedLead.id)

    setShowLostModal(false)
    setLostReason('')
    setSelectedLead(null)
    setDraggedLead(null)
    await fetchPipelineLeads()
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

  // Calculate totals
  const totalLeads = pipelineLeads.length
  const wonLeads = getLeadsForStage('Won').length
  const totalValue = pipelineLeads.reduce((sum, l) => sum + (parseFloat(l.estimated_value) || 0), 0)

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
            Sales Pipeline
          </h1>
          <p style={{ fontSize: '13px', color: theme.textMuted }}>
            Track leads through the sales process
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          {/* Stats */}
          <div style={{
            display: 'flex',
            gap: '16px',
            padding: '8px 16px',
            backgroundColor: theme.bgCard,
            borderRadius: '8px',
            border: `1px solid ${theme.border}`
          }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{totalLeads}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>In Pipeline</div>
            </div>
            <div style={{ width: '1px', backgroundColor: theme.border }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>{wonLeads}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>Won</div>
            </div>
            <div style={{ width: '1px', backgroundColor: theme.border }} />
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '18px', fontWeight: '700', color: theme.accent }}>{formatCurrency(totalValue)}</div>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>Total Value</div>
            </div>
          </div>

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
          >
            <RefreshCw size={18} />
          </button>

          <button
            onClick={() => navigate('/leads')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              backgroundColor: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontWeight: '500'
            }}
          >
            <Plus size={18} />
            Add Lead
          </button>
        </div>
      </div>

      {/* Pipeline Board */}
      <div style={{
        flex: 1,
        display: 'flex',
        gap: '12px',
        overflow: 'auto',
        paddingBottom: '16px'
      }}>
        {pipelineStages.map(stage => {
          const stageLeads = getLeadsForStage(stage.id)
          const stageValue = getStageValue(stage.id)
          const isDragOver = dragOverStage === stage.id

          return (
            <div
              key={stage.id}
              style={{
                minWidth: '280px',
                maxWidth: '320px',
                flex: '1 0 280px',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: isDragOver ? theme.accentBg : 'rgba(0,0,0,0.02)',
                borderRadius: '12px',
                border: isDragOver ? `2px dashed ${theme.accent}` : '2px solid transparent',
                transition: 'all 0.2s'
              }}
              onDragOver={(e) => handleDragOver(e, stage.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, stage.id)}
            >
              {/* Stage Header */}
              <div style={{
                padding: '12px 16px',
                borderBottom: `3px solid ${stage.color}`,
                backgroundColor: theme.bgCard,
                borderRadius: '12px 12px 0 0'
              }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '16px' }}>{stage.icon}</span>
                    <span style={{ fontWeight: '600', color: theme.text, fontSize: '14px' }}>
                      {stage.name}
                    </span>
                    <span style={{
                      backgroundColor: stage.color + '20',
                      color: stage.color,
                      padding: '2px 8px',
                      borderRadius: '10px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {stageLeads.length}
                    </span>
                  </div>
                </div>
                {stageValue > 0 && (
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '4px' }}>
                    {formatCurrency(stageValue)}
                  </div>
                )}
              </div>

              {/* Stage Cards */}
              <div style={{
                flex: 1,
                padding: '8px',
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px'
              }}>
                {stageLeads.map(lead => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, lead)}
                    onDragEnd={handleDragEnd}
                    onClick={() => openLeadDetail(lead)}
                    style={{
                      backgroundColor: theme.bgCard,
                      borderRadius: '8px',
                      padding: '12px',
                      border: `1px solid ${theme.border}`,
                      cursor: 'grab',
                      transition: 'all 0.15s',
                      boxShadow: draggedLead?.id === lead.id ? '0 4px 12px rgba(0,0,0,0.15)' : 'none',
                      opacity: draggedLead?.id === lead.id ? 0.8 : 1
                    }}
                  >
                    {/* Lead Name */}
                    <div style={{
                      fontWeight: '600',
                      color: theme.text,
                      fontSize: '14px',
                      marginBottom: '4px'
                    }}>
                      {lead.customer_name}
                    </div>

                    {/* Business */}
                    {lead.business_name && (
                      <div style={{
                        color: theme.textMuted,
                        fontSize: '12px',
                        marginBottom: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Building2 size={12} />
                        {lead.business_name}
                      </div>
                    )}

                    {/* Value */}
                    {lead.estimated_value > 0 && (
                      <div style={{
                        color: '#16a34a',
                        fontSize: '14px',
                        fontWeight: '600',
                        marginBottom: '6px'
                      }}>
                        {formatCurrency(lead.estimated_value)}
                      </div>
                    )}

                    {/* Appointment */}
                    {lead.appointment_time && (
                      <div style={{
                        marginTop: '6px',
                        padding: '4px 6px',
                        backgroundColor: isToday(lead.appointment_time) ? '#dcfce7' : '#f0fdf4',
                        borderRadius: '4px',
                        fontSize: '11px',
                        color: isToday(lead.appointment_time) ? '#166534' : '#15803d',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px'
                      }}>
                        <Calendar size={10} />
                        <span style={{ fontWeight: isToday(lead.appointment_time) ? '600' : '400' }}>
                          {isToday(lead.appointment_time)
                            ? `TODAY ${new Date(lead.appointment_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
                            : new Date(lead.appointment_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                          }
                        </span>
                      </div>
                    )}

                    {/* Service Type */}
                    {lead.service_type && (
                      <div style={{
                        marginTop: '6px',
                        fontSize: '11px',
                        color: theme.textMuted
                      }}>
                        {lead.service_type}
                      </div>
                    )}

                    {/* Owner */}
                    {lead.lead_owner && (
                      <div style={{
                        marginTop: '8px',
                        paddingTop: '8px',
                        borderTop: `1px solid ${theme.border}`,
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px'
                      }}>
                        <div style={{
                          width: '20px',
                          height: '20px',
                          borderRadius: '50%',
                          backgroundColor: theme.accentBg,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '10px',
                          fontWeight: '600',
                          color: theme.accent
                        }}>
                          {lead.lead_owner.name?.charAt(0)}
                        </div>
                        <span style={{ fontSize: '11px', color: theme.textMuted }}>
                          {lead.lead_owner.name}
                        </span>
                      </div>
                    )}
                  </div>
                ))}

                {stageLeads.length === 0 && (
                  <div style={{
                    padding: '24px 16px',
                    textAlign: 'center',
                    color: theme.textMuted,
                    fontSize: '13px'
                  }}>
                    No leads in this stage
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Lead Detail Panel */}
      {showDetailPanel && selectedLead && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          width: '400px',
          backgroundColor: theme.bgCard,
          boxShadow: '-4px 0 24px rgba(0,0,0,0.15)',
          zIndex: 50,
          display: 'flex',
          flexDirection: 'column'
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
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                {selectedLead.customer_name}
              </h2>
              <div style={{
                display: 'inline-block',
                marginTop: '4px',
                padding: '2px 8px',
                backgroundColor: pipelineStages.find(s => s.id === selectedLead.status)?.color + '20',
                color: pipelineStages.find(s => s.id === selectedLead.status)?.color,
                borderRadius: '4px',
                fontSize: '12px',
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
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {/* Contact Info */}
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                Contact Information
              </h3>

              {selectedLead.phone && (
                <a
                  href={`tel:${selectedLead.phone}`}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '10px 12px',
                    backgroundColor: '#dcfce7',
                    borderRadius: '8px',
                    color: '#166534',
                    textDecoration: 'none',
                    marginBottom: '8px',
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
                    gap: '10px',
                    padding: '10px 12px',
                    backgroundColor: theme.accentBg,
                    borderRadius: '8px',
                    color: theme.accent,
                    textDecoration: 'none',
                    marginBottom: '8px',
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
                  gap: '10px',
                  padding: '10px 12px',
                  backgroundColor: theme.bg,
                  borderRadius: '8px',
                  color: theme.text,
                  fontSize: '14px'
                }}>
                  <MapPin size={16} style={{ marginTop: '2px', flexShrink: 0 }} />
                  {selectedLead.address}
                </div>
              )}
            </div>

            {/* Lead Details */}
            <div style={{ marginBottom: '20px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                Lead Details
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px'
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
                {selectedLead.estimated_value > 0 && (
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Value</div>
                    <div style={{ fontSize: '14px', color: '#16a34a', fontWeight: '600' }}>
                      {formatCurrency(selectedLead.estimated_value)}
                    </div>
                  </div>
                )}
                {selectedLead.lead_owner && (
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Owner</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{selectedLead.lead_owner.name}</div>
                  </div>
                )}
              </div>
            </div>

            {/* Appointment Info */}
            {selectedLead.appointment_time && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                  Appointment
                </h3>
                <div style={{
                  padding: '12px',
                  backgroundColor: isToday(selectedLead.appointment_time) ? '#dcfce7' : '#f0fdf4',
                  borderRadius: '8px',
                  border: `1px solid ${isToday(selectedLead.appointment_time) ? '#86efac' : '#bbf7d0'}`
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    color: '#166534',
                    fontWeight: '600'
                  }}>
                    <Calendar size={16} />
                    {isToday(selectedLead.appointment_time) ? 'TODAY' : new Date(selectedLead.appointment_time).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  </div>
                  <div style={{ color: '#15803d', marginTop: '4px' }}>
                    {new Date(selectedLead.appointment_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            )}

            {/* Notes */}
            {selectedLead.notes && (
              <div style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '13px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                  Notes
                </h3>
                <div style={{
                  padding: '12px',
                  backgroundColor: theme.bg,
                  borderRadius: '8px',
                  fontSize: '14px',
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
            padding: '16px 20px',
            borderTop: `1px solid ${theme.border}`,
            display: 'flex',
            gap: '12px'
          }}>
            <button
              onClick={() => navigate(`/leads/${selectedLead.id}`)}
              style={{
                flex: 1,
                padding: '12px',
                backgroundColor: theme.accent,
                color: '#fff',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
                fontWeight: '500',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}
            >
              View Full Details
              <ChevronRight size={16} />
            </button>
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
            borderRadius: '16px',
            width: '100%',
            maxWidth: '400px',
            padding: '24px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#dcfce7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Trophy size={24} color="#16a34a" />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                  Mark as Won!
                </h2>
                <p style={{ fontSize: '14px', color: theme.textMuted }}>
                  {selectedLead.customer_name}
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
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

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowWonModal(false)
                  setSelectedLead(null)
                  setDraggedLead(null)
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
                onClick={handleMarkAsWon}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: '#16a34a',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: '500'
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
            borderRadius: '16px',
            width: '100%',
            maxWidth: '400px',
            padding: '24px'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <div style={{
                width: '48px',
                height: '48px',
                borderRadius: '50%',
                backgroundColor: '#fee2e2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <XCircle size={24} color="#dc2626" />
              </div>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                  Mark as Lost
                </h2>
                <p style={{ fontSize: '14px', color: theme.textMuted }}>
                  {selectedLead.customer_name}
                </p>
              </div>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                Reason for losing *
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

            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => {
                  setShowLostModal(false)
                  setSelectedLead(null)
                  setDraggedLead(null)
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
                onClick={handleMarkAsLost}
                disabled={!lostReason}
                style={{
                  flex: 1,
                  padding: '12px',
                  backgroundColor: lostReason ? '#dc2626' : '#ccc',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: lostReason ? 'pointer' : 'not-allowed',
                  fontWeight: '500'
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

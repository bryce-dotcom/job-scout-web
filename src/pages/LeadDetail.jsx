import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  ArrowLeft, Calendar, FileText, Clipboard, Plus, Send, Phone, Mail,
  MapPin, Building2, User, Clock, Edit3, ExternalLink, CheckCircle2, Lightbulb
} from 'lucide-react'
import Tooltip from '../components/Tooltip'
import HelpBadge from '../components/HelpBadge'

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

// Flow indicator showing lead's journey
const LeadFlowIndicator = ({ currentStatus, theme }) => {
  const steps = [
    { status: 'New', label: 'New', color: '#6b7280' },
    { status: 'Contacted', label: 'Contacted', color: '#8b5cf6' },
    { status: 'Callback', label: 'Callback', color: '#f59e0b' },
    { status: 'Appointment Set', label: 'Appointment', color: '#22c55e' },
    { status: 'Qualified', label: 'Qualified', color: '#3b82f6' },
    { status: 'Quote Sent', label: 'Quote Sent', color: '#6366f1' },
    { status: 'Converted', label: 'Won!', color: '#10b981' }
  ]

  // Find current step index
  const statusMap = {
    'New': 0, 'Assigned': 0,
    'Contacted': 1,
    'Callback': 2,
    'Appointment Set': 3,
    'Qualified': 4,
    'Quote Sent': 5,
    'Converted': 6, 'Won': 6
  }
  const currentIndex = statusMap[currentStatus] ?? 0

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '12px 16px',
      backgroundColor: theme.bg,
      borderRadius: '10px',
      marginBottom: '24px',
      overflowX: 'auto'
    }}>
      <span style={{ fontSize: '12px', color: theme.textMuted, marginRight: '8px', whiteSpace: 'nowrap' }}>
        Journey:
      </span>
      {steps.map((step, i) => (
        <div key={step.status} style={{ display: 'flex', alignItems: 'center' }}>
          <div style={{
            padding: '5px 10px',
            borderRadius: '14px',
            backgroundColor: i <= currentIndex ? step.color : '#e5e7eb',
            color: i <= currentIndex ? '#fff' : '#9ca3af',
            fontSize: '11px',
            fontWeight: '600',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            {i < currentIndex && <CheckCircle2 size={12} />}
            {step.label}
          </div>
          {i < steps.length - 1 && (
            <div style={{
              width: '16px',
              height: '2px',
              backgroundColor: i < currentIndex ? step.color : '#e5e7eb',
              margin: '0 2px'
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function LeadDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const employees = useStore((state) => state.employees)

  const [lead, setLead] = useState(null)
  const [audits, setAudits] = useState([])
  const [quotes, setQuotes] = useState([])
  const [appointment, setAppointment] = useState(null)
  const [activeTab, setActiveTab] = useState('info')
  const [loading, setLoading] = useState(true)

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (id && companyId) {
      fetchLeadData()
    }
  }, [id, companyId])

  const fetchLeadData = async () => {
    setLoading(true)

    // Fetch lead with relations
    const { data: leadData, error: leadError } = await supabase
      .from('leads')
      .select(`
        *,
        lead_owner:employees!leads_lead_owner_id_fkey(id, name),
        setter_owner:employees!leads_setter_owner_id_fkey(id, name)
      `)
      .eq('id', id)
      .single()

    if (leadError) {
      console.error('Error fetching lead:', leadError)
      setLoading(false)
      return
    }

    setLead(leadData)

    // Fetch appointment if exists
    if (leadData?.appointment_id) {
      const { data: aptData } = await supabase
        .from('appointments')
        .select('*, salesperson:employees!salesperson_id(id, name)')
        .eq('id', leadData.appointment_id)
        .single()
      setAppointment(aptData)
    } else {
      // Try to find appointment by lead_id
      const { data: aptData } = await supabase
        .from('appointments')
        .select('*, salesperson:employees!salesperson_id(id, name)')
        .eq('lead_id', id)
        .order('start_time', { ascending: false })
        .limit(1)
        .single()
      setAppointment(aptData || null)
    }

    // Fetch audits linked to this lead
    const { data: auditData } = await supabase
      .from('lighting_audits')
      .select('*')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
    setAudits(auditData || [])

    // Fetch quotes linked to this lead
    const { data: quoteData } = await supabase
      .from('quotes')
      .select('*, quote_lines(*)')
      .eq('lead_id', id)
      .order('created_at', { ascending: false })
    setQuotes(quoteData || [])

    setLoading(false)
  }

  // Create quote from audit
  const handleCreateQuoteFromAudit = async (audit) => {
    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        company_id: companyId,
        lead_id: lead.id,
        audit_id: audit.id,
        audit_type: 'lighting',
        quote_amount: audit.est_project_cost || 0,
        status: 'Draft'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating quote:', error)
      alert('Error creating quote: ' + error.message)
      return
    }

    // Update lead with quote
    await supabase
      .from('leads')
      .update({ quote_id: quote.id })
      .eq('id', lead.id)

    // Copy audit areas to quote lines
    const { data: areas } = await supabase
      .from('audit_areas')
      .select('*')
      .eq('audit_id', audit.id)

    if (areas?.length) {
      const lines = areas.map(area => ({
        quote_id: quote.id,
        description: `${area.area_name} - LED Retrofit`,
        quantity: area.fixture_count || 1,
        unit_price: area.area_cost || 0,
        line_total: (area.fixture_count || 1) * (area.area_cost || 0)
      }))
      await supabase.from('quote_lines').insert(lines)
    }

    await fetchLeadData()
    alert('Quote created from audit!')
  }

  // Create manual quote
  const handleCreateManualQuote = async () => {
    const { data: quote, error } = await supabase
      .from('quotes')
      .insert({
        company_id: companyId,
        lead_id: lead.id,
        quote_amount: 0,
        status: 'Draft'
      })
      .select()
      .single()

    if (error) {
      console.error('Error creating quote:', error)
      alert('Error creating quote: ' + error.message)
      return
    }

    await supabase
      .from('leads')
      .update({ quote_id: quote.id })
      .eq('id', lead.id)

    navigate(`/quotes/${quote.id}`)
  }

  // Mark quote as sent
  const handleSendQuote = async (quoteId) => {
    await supabase
      .from('quotes')
      .update({ status: 'Sent', sent_at: new Date().toISOString() })
      .eq('id', quoteId)

    await supabase
      .from('leads')
      .update({ status: 'Quote Sent' })
      .eq('id', lead.id)

    await fetchLeadData()
    alert('Quote marked as sent!')
  }

  // Start new audit
  const handleNewAudit = () => {
    navigate(`/audits/new?lead_id=${lead.id}`)
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
      <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>
        Loading...
      </div>
    )
  }

  if (!lead) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>
        Lead not found
      </div>
    )
  }

  const tabs = [
    { id: 'info', label: 'Info', icon: FileText, hint: 'Basic contact information' },
    { id: 'appointment', label: 'Appointment', icon: Calendar, hint: 'Scheduled meetings with this lead' },
    { id: 'audits', label: `Audits (${audits.length})`, icon: Clipboard, hint: 'Site surveys - Lenard can help with lighting' },
    { id: 'quotes', label: `Quotes (${quotes.length})`, icon: FileText, hint: 'Price proposals from audits' }
  ]

  const getStatusColor = (status) => {
    const colors = {
      'New': '#3b82f6',
      'Contacted': '#8b5cf6',
      'Callback': '#f59e0b',
      'Appointment Set': '#10b981',
      'Qualified': '#059669',
      'Quote Sent': '#6366f1',
      'Not Qualified': '#6b7280'
    }
    return colors[status] || theme.accent
  }

  return (
    <div style={{ padding: '24px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <button
          onClick={() => navigate(-1)}
          style={{
            padding: '8px',
            background: 'none',
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            cursor: 'pointer',
            color: theme.textSecondary
          }}
        >
          <ArrowLeft size={20} />
        </button>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>
              {lead.customer_name}
            </h1>
            <span style={{
              padding: '4px 10px',
              backgroundColor: getStatusColor(lead.status) + '20',
              color: getStatusColor(lead.status),
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: '600'
            }}>
              {lead.status}
            </span>
          </div>
          <div style={{ fontSize: '14px', color: theme.textMuted, display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
            {lead.service_type && <span>{lead.service_type}</span>}
            {lead.lead_source && <span>Source: {lead.lead_source}</span>}
          </div>
        </div>

        {/* Quick Actions */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {lead.phone && (
            <a
              href={`tel:${lead.phone}`}
              style={{
                padding: '10px 14px',
                backgroundColor: '#dcfce7',
                color: '#166534',
                border: 'none',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              <Phone size={16} />
              Call
            </a>
          )}
          {lead.email && (
            <a
              href={`mailto:${lead.email}`}
              style={{
                padding: '10px 14px',
                backgroundColor: theme.accentBg,
                color: theme.accent,
                border: 'none',
                borderRadius: '8px',
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '14px',
                fontWeight: '500'
              }}
            >
              <Mail size={16} />
              Email
            </a>
          )}
        </div>
      </div>

      {/* Lead Journey Flow Indicator */}
      <LeadFlowIndicator currentStatus={lead.status} theme={theme} />

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: '12px'
      }}>
        {tabs.map(tab => {
          const Icon = tab.icon
          return (
            <Tooltip key={tab.id} text={tab.hint} position="bottom">
              <button
                onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: '10px 16px',
                  backgroundColor: activeTab === tab.id ? theme.accent : 'transparent',
                  color: activeTab === tab.id ? '#fff' : theme.textSecondary,
                  border: activeTab === tab.id ? 'none' : `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <Icon size={16} />
                {tab.label}
              </button>
            </Tooltip>
          )
        })}
      </div>

      {/* Tab Content */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '24px'
      }}>

        {/* INFO TAB */}
        {activeTab === 'info' && (
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
              gap: '24px'
            }}>
              {/* Contact Info */}
              <div style={{
                padding: '20px',
                backgroundColor: theme.bg,
                borderRadius: '10px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: '16px' }}>
                  Contact Information
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <User size={16} color={theme.textMuted} />
                    <span style={{ color: theme.text }}>{lead.customer_name}</span>
                  </div>
                  {lead.business_name && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Building2 size={16} color={theme.textMuted} />
                      <span style={{ color: theme.text }}>{lead.business_name}</span>
                    </div>
                  )}
                  {lead.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Phone size={16} color={theme.textMuted} />
                      <a href={`tel:${lead.phone}`} style={{ color: theme.accent }}>{lead.phone}</a>
                    </div>
                  )}
                  {lead.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <Mail size={16} color={theme.textMuted} />
                      <a href={`mailto:${lead.email}`} style={{ color: theme.accent }}>{lead.email}</a>
                    </div>
                  )}
                  {lead.address && (
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                      <MapPin size={16} color={theme.textMuted} style={{ marginTop: '2px' }} />
                      <span style={{ color: theme.text }}>{lead.address}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Lead Details */}
              <div style={{
                padding: '20px',
                backgroundColor: theme.bg,
                borderRadius: '10px'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: '16px' }}>
                  Lead Details
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Source</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{lead.lead_source || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Service Type</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{lead.service_type || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Lead Owner</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{lead.lead_owner?.name || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Setter</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{lead.setter_owner?.name || '-'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Contact Attempts</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>{lead.contact_attempts || 0}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '2px' }}>Last Contact</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>
                      {lead.last_contact_at ? new Date(lead.last_contact_at).toLocaleDateString() : '-'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {lead.notes && (
                <div style={{
                  padding: '20px',
                  backgroundColor: theme.bg,
                  borderRadius: '10px',
                  gridColumn: 'span 2'
                }}>
                  <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.textSecondary, marginBottom: '12px' }}>
                    Notes
                  </h3>
                  <p style={{ fontSize: '14px', color: theme.text, whiteSpace: 'pre-wrap', margin: 0 }}>
                    {lead.notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* APPOINTMENT TAB */}
        {activeTab === 'appointment' && (
          <div>
            {appointment ? (
              <div style={{
                padding: '24px',
                backgroundColor: '#dcfce7',
                borderRadius: '12px',
                border: '1px solid #86efac'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                  <Calendar size={24} color="#166534" />
                  <div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: '#166534' }}>
                      {new Date(appointment.start_time).toLocaleDateString('en-US', {
                        weekday: 'long',
                        month: 'long',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </div>
                    <div style={{ fontSize: '16px', color: '#15803d' }}>
                      {new Date(appointment.start_time).toLocaleTimeString('en-US', {
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                      {appointment.end_time && (
                        <>
                          {' - '}
                          {new Date(appointment.end_time).toLocaleTimeString('en-US', {
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#15803d', marginBottom: '4px' }}>Status</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534' }}>
                      {appointment.status}
                    </div>
                  </div>
                  {appointment.salesperson && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#15803d', marginBottom: '4px' }}>Salesperson</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#166534' }}>
                        {appointment.salesperson.name}
                      </div>
                    </div>
                  )}
                  {appointment.location && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: '12px', color: '#15803d', marginBottom: '4px' }}>Location</div>
                      <div style={{ fontSize: '14px', color: '#166534' }}>
                        {appointment.location}
                      </div>
                    </div>
                  )}
                  {appointment.notes && (
                    <div style={{ gridColumn: 'span 2' }}>
                      <div style={{ fontSize: '12px', color: '#15803d', marginBottom: '4px' }}>Notes</div>
                      <div style={{ fontSize: '14px', color: '#166534' }}>
                        {appointment.notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                backgroundColor: 'rgba(34,197,94,0.05)',
                borderRadius: '12px',
                border: '2px dashed rgba(34,197,94,0.3)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📅</div>
                <div style={{ fontWeight: '600', color: theme.text, marginBottom: '8px', fontSize: '18px' }}>
                  No appointment scheduled
                </div>
                <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '20px', maxWidth: '350px', margin: '0 auto 20px', lineHeight: '1.5' }}>
                  Schedule a meeting with this lead to move them forward in the sales process.
                </div>
                <Tooltip text="Go to Lead Setter and drag this lead to a time slot">
                  <button
                    onClick={() => navigate('/lead-setter')}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#22c55e',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Calendar size={18} />
                    Go to Lead Setter
                  </button>
                </Tooltip>
              </div>
            )}
          </div>
        )}

        {/* AUDITS TAB */}
        {activeTab === 'audits' && (
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div>
                <h3 style={{ margin: 0, color: theme.text, fontSize: '18px' }}>Audits & Takeoffs</h3>
                <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                  Create lighting audits to generate accurate quotes
                </p>
              </div>
              <button
                onClick={handleNewAudit}
                style={{
                  padding: '10px 16px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <Plus size={16} />
                New Lighting Audit
              </button>
            </div>

            {audits.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                backgroundColor: 'rgba(139,92,246,0.05)',
                borderRadius: '12px',
                border: '2px dashed rgba(139,92,246,0.3)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>💡</div>
                <div style={{ fontWeight: '600', color: theme.text, marginBottom: '8px', fontSize: '18px' }}>
                  No audits yet
                </div>
                <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '20px', maxWidth: '350px', margin: '0 auto 20px', lineHeight: '1.5' }}>
                  Create a lighting audit to calculate energy savings, find rebates, and generate a professional quote automatically.
                </div>
                <Tooltip text="Lenard will guide you through the audit process">
                  <button
                    onClick={handleNewAudit}
                    style={{
                      padding: '12px 24px',
                      backgroundColor: '#8b5cf6',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontWeight: '600',
                      fontSize: '14px',
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}
                  >
                    <Lightbulb size={18} />
                    Start Lighting Audit
                  </button>
                </Tooltip>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {audits.map(audit => (
                  <div key={audit.id} style={{
                    padding: '16px 20px',
                    backgroundColor: theme.bg,
                    borderRadius: '10px',
                    border: `1px solid ${theme.border}`,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}>
                    <div>
                      <div style={{ fontWeight: '600', color: theme.text, fontSize: '16px' }}>
                        {audit.audit_name || audit.location_name || 'Lighting Audit'}
                      </div>
                      <div style={{ fontSize: '14px', color: theme.textMuted, marginTop: '4px' }}>
                        {audit.total_fixtures || 0} fixtures
                        {audit.est_project_cost > 0 && (
                          <> • ${(audit.est_project_cost || 0).toLocaleString()} estimated</>
                        )}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                        Created {new Date(audit.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => navigate(`/audits/${audit.id}`)}
                        style={{
                          padding: '8px 14px',
                          backgroundColor: 'transparent',
                          color: theme.accent,
                          border: `1px solid ${theme.accent}`,
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500'
                        }}
                      >
                        View
                      </button>
                      <Tooltip text="Generate a quote with line items from this audit">
                        <button
                          onClick={() => handleCreateQuoteFromAudit(audit)}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: '#16a34a',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          Create Quote
                        </button>
                      </Tooltip>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* QUOTES TAB */}
        {activeTab === 'quotes' && (
          <div>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '20px'
            }}>
              <div>
                <h3 style={{ margin: 0, color: theme.text, fontSize: '18px' }}>Quotes</h3>
                <p style={{ margin: '4px 0 0', color: theme.textMuted, fontSize: '13px' }}>
                  Create and send quotes to convert this lead
                </p>
              </div>
              <button
                onClick={handleCreateManualQuote}
                style={{
                  padding: '10px 16px',
                  backgroundColor: theme.accent,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '14px',
                  fontWeight: '500'
                }}
              >
                <Plus size={16} />
                New Quote
              </button>
            </div>

            {quotes.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '60px 20px',
                backgroundColor: 'rgba(59,130,246,0.05)',
                borderRadius: '12px',
                border: '2px dashed rgba(59,130,246,0.3)'
              }}>
                <div style={{ fontSize: '48px', marginBottom: '12px' }}>📋</div>
                <div style={{ fontWeight: '600', color: theme.text, marginBottom: '8px', fontSize: '18px' }}>
                  No quotes yet
                </div>
                <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '20px', maxWidth: '350px', margin: '0 auto 20px', lineHeight: '1.5' }}>
                  {audits.length > 0
                    ? "You have audits available! Create a quote from an audit to auto-fill line items and pricing."
                    : "Create a quote manually, or go to the Audits tab first to generate one automatically."}
                </div>
                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                  <Tooltip text="Start with a blank quote">
                    <button
                      onClick={handleCreateManualQuote}
                      style={{
                        padding: '12px 24px',
                        backgroundColor: '#3b82f6',
                        color: '#fff',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontWeight: '600',
                        fontSize: '14px',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '8px'
                      }}
                    >
                      <Plus size={18} />
                      Create Manual Quote
                    </button>
                  </Tooltip>
                  {audits.length === 0 && (
                    <Tooltip text="Audits auto-generate accurate quotes">
                      <button
                        onClick={() => setActiveTab('audits')}
                        style={{
                          padding: '12px 24px',
                          backgroundColor: 'transparent',
                          color: '#8b5cf6',
                          border: '1px solid #8b5cf6',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '500',
                          fontSize: '14px'
                        }}
                      >
                        Create Audit First
                      </button>
                    </Tooltip>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {quotes.map(quote => {
                  const statusColors = {
                    'Draft': { bg: '#fef3c7', text: '#b45309' },
                    'Sent': { bg: '#dbeafe', text: '#1d4ed8' },
                    'Approved': { bg: '#dcfce7', text: '#166534' },
                    'Rejected': { bg: '#fee2e2', text: '#dc2626' }
                  }
                  const statusStyle = statusColors[quote.status] || statusColors['Draft']

                  return (
                    <div key={quote.id} style={{
                      padding: '16px 20px',
                      backgroundColor: theme.bg,
                      borderRadius: '10px',
                      border: `1px solid ${theme.border}`,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: theme.text }}>
                            ${(quote.quote_amount || 0).toLocaleString()}
                          </div>
                          <span style={{
                            padding: '4px 10px',
                            backgroundColor: statusStyle.bg,
                            color: statusStyle.text,
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {quote.status}
                          </span>
                        </div>
                        <div style={{ fontSize: '13px', color: theme.textMuted, marginTop: '4px' }}>
                          {quote.audit_id ? 'Generated from audit' : 'Manual quote'}
                          {quote.quote_lines?.length > 0 && ` • ${quote.quote_lines.length} line items`}
                        </div>
                        <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                          Created {new Date(quote.created_at).toLocaleDateString()}
                          {quote.sent_at && ` • Sent ${new Date(quote.sent_at).toLocaleDateString()}`}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                          onClick={() => navigate(`/quotes/${quote.id}`)}
                          style={{
                            padding: '8px 14px',
                            backgroundColor: 'transparent',
                            color: theme.accent,
                            border: `1px solid ${theme.accent}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500'
                          }}
                        >
                          View/Edit
                        </button>
                        {quote.status === 'Draft' && (
                          <Tooltip text="Mark this quote as sent to the customer">
                            <button
                              onClick={() => handleSendQuote(quote.id)}
                              style={{
                                padding: '8px 14px',
                                backgroundColor: '#16a34a',
                                color: '#fff',
                                border: 'none',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: '500',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '4px'
                              }}
                            >
                              <Send size={14} />
                              Mark Sent
                            </button>
                          </Tooltip>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

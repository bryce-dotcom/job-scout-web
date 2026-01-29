import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Plus, Edit, Trash2, Check, Send, Zap, DollarSign, Clock, TrendingDown, Camera } from 'lucide-react'
import FixtureCamera from '../components/FixtureCamera'
import FixtureConfirmModal from '../components/FixtureConfirmModal'

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

const statusColors = {
  'Draft': { bg: 'rgba(125,138,127,0.15)', text: '#7d8a7f' },
  'In Progress': { bg: 'rgba(90,99,73,0.15)', text: '#5a6349' },
  'Completed': { bg: 'rgba(74,124,89,0.15)', text: '#4a7c59' },
  'Submitted': { bg: 'rgba(106,90,205,0.15)', text: '#6a5acd' },
  'Approved': { bg: 'rgba(74,124,89,0.15)', text: '#4a7c59' },
  'Rejected': { bg: 'rgba(194,90,90,0.15)', text: '#c25a5a' }
}

const fixtureCategories = [
  'Linear', 'High Bay', 'Low Bay', 'Outdoor', 'Recessed',
  'Track', 'Wall Pack', 'Flood', 'Area Light', 'Canopy', 'Other'
]

export default function LightingAuditDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const lightingAudits = useStore((state) => state.lightingAudits)
  const auditAreas = useStore((state) => state.auditAreas)
  const products = useStore((state) => state.products)
  const fixtureTypes = useStore((state) => state.fixtureTypes)
  const fetchLightingAudits = useStore((state) => state.fetchLightingAudits)
  const fetchAuditAreas = useStore((state) => state.fetchAuditAreas)

  const [showAreaModal, setShowAreaModal] = useState(false)
  const [editingArea, setEditingArea] = useState(null)
  const [showAIModal, setShowAIModal] = useState(false)
  const [aiDetection, setAIDetection] = useState(null)
  const [areaForm, setAreaForm] = useState({
    area_name: '',
    ceiling_height: '',
    fixture_category: 'Linear',
    fixture_count: 1,
    existing_wattage: 0,
    led_replacement_id: '',
    led_wattage: 0,
    confirmed: false,
    override_notes: ''
  })

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchLightingAudits()
    fetchAuditAreas()
  }, [companyId, navigate, fetchLightingAudits, fetchAuditAreas])

  const audit = lightingAudits.find(a => a.id === id)
  const areas = auditAreas.filter(a => a.lighting_audit_id === id)

  if (!audit) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: defaultTheme.textMuted }}>
        Audit not found
      </div>
    )
  }

  const statusStyle = statusColors[audit.status] || statusColors['Draft']

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return '$' + parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const updateStatus = async (newStatus) => {
    const { error } = await supabase
      .from('lighting_audits')
      .update({ status: newStatus })
      .eq('id', id)

    if (error) {
      alert('Error updating status: ' + error.message)
    } else {
      fetchLightingAudits()
    }
  }

  const recalculateAudit = async () => {
    // Recalculate totals based on areas
    const total_fixtures = areas.reduce((sum, a) => sum + (a.fixture_count || 0), 0)
    const total_existing_watts = areas.reduce((sum, a) => sum + (a.total_existing_watts || 0), 0)
    const total_proposed_watts = areas.reduce((sum, a) => sum + (a.total_led_watts || 0), 0)
    const watts_reduced = total_existing_watts - total_proposed_watts

    const annual_hours = (audit.operating_hours || 10) * (audit.operating_days || 260)
    const annual_savings_kwh = (watts_reduced * annual_hours) / 1000
    const annual_savings_dollars = annual_savings_kwh * (audit.electric_rate || 0.12)

    const { error } = await supabase
      .from('lighting_audits')
      .update({
        total_fixtures,
        total_existing_watts,
        total_proposed_watts,
        watts_reduced,
        annual_savings_kwh,
        annual_savings_dollars
      })
      .eq('id', id)

    if (!error) fetchLightingAudits()
  }

  const handleAddArea = async () => {
    if (!areaForm.area_name) {
      alert('Please enter an area name')
      return
    }

    const total_existing_watts = areaForm.fixture_count * areaForm.existing_wattage
    const total_led_watts = areaForm.fixture_count * areaForm.led_wattage
    const area_watts_reduced = total_existing_watts - total_led_watts

    const areaData = {
      company_id: companyId,
      lighting_audit_id: id,
      area_name: areaForm.area_name,
      ceiling_height: areaForm.ceiling_height || null,
      fixture_category: areaForm.fixture_category,
      fixture_count: areaForm.fixture_count,
      existing_wattage: areaForm.existing_wattage,
      led_replacement_id: areaForm.led_replacement_id || null,
      led_wattage: areaForm.led_wattage,
      total_existing_watts,
      total_led_watts,
      area_watts_reduced,
      confirmed: areaForm.confirmed,
      override_notes: areaForm.override_notes || null
    }

    let error
    if (editingArea) {
      const result = await supabase
        .from('audit_areas')
        .update(areaData)
        .eq('id', editingArea.id)
      error = result.error
    } else {
      const result = await supabase
        .from('audit_areas')
        .insert(areaData)
      error = result.error
    }

    if (error) {
      alert('Error saving area: ' + error.message)
    } else {
      setShowAreaModal(false)
      setEditingArea(null)
      setAreaForm({
        area_name: '',
        ceiling_height: '',
        fixture_category: 'Linear',
        fixture_count: 1,
        existing_wattage: 0,
        led_replacement_id: '',
        led_wattage: 0,
        confirmed: false,
        override_notes: ''
      })
      fetchAuditAreas()
      setTimeout(recalculateAudit, 500) // Recalculate after fetch
    }
  }

  const handleEditArea = (area) => {
    setEditingArea(area)
    setAreaForm({
      area_name: area.area_name || '',
      ceiling_height: area.ceiling_height || '',
      fixture_category: area.fixture_category || 'Linear',
      fixture_count: area.fixture_count || 1,
      existing_wattage: area.existing_wattage || 0,
      led_replacement_id: area.led_replacement_id || '',
      led_wattage: area.led_wattage || 0,
      confirmed: area.confirmed || false,
      override_notes: area.override_notes || ''
    })
    setShowAreaModal(true)
  }

  const handleDeleteArea = async (areaId) => {
    if (!confirm('Delete this area?')) return

    const { error } = await supabase
      .from('audit_areas')
      .delete()
      .eq('id', areaId)

    if (error) {
      alert('Error deleting area: ' + error.message)
    } else {
      fetchAuditAreas()
      setTimeout(recalculateAudit, 500)
    }
  }

  const ledProducts = products.filter(p => p.type === 'Product')

  // Handle AI photo analysis completion
  const handleAIAnalysisComplete = ({ analysis, imagePreview }) => {
    setAIDetection({ analysis, imagePreview })
    setShowAIModal(true)
  }

  // Handle confirming AI detected fixture
  const handleConfirmAIDetection = async (data) => {
    const total_existing_watts = data.fixture_count * data.existing_wattage
    const led_wattage = data.recommended_led_id
      ? products.find(p => p.id === data.recommended_led_id)?.wattage || Math.round(data.existing_wattage * 0.5)
      : Math.round(data.existing_wattage * 0.5)
    const total_led_watts = data.fixture_count * led_wattage
    const area_watts_reduced = total_existing_watts - total_led_watts

    const areaData = {
      company_id: companyId,
      lighting_audit_id: id,
      area_name: data.fixture_type || 'AI Detected Area',
      ceiling_height: data.ceiling_height || null,
      fixture_category: data.fixture_category || 'Linear',
      fixture_count: data.fixture_count,
      existing_wattage: data.existing_wattage,
      led_replacement_id: data.recommended_led_id || null,
      led_wattage: led_wattage,
      total_existing_watts,
      total_led_watts,
      area_watts_reduced,
      confirmed: true,
      override_notes: `AI Detected: ${data.fixture_type}. Notes: ${data.notes || 'None'}`
    }

    const { error } = await supabase
      .from('audit_areas')
      .insert(areaData)

    if (error) {
      alert('Error saving area: ' + error.message)
    } else {
      setShowAIModal(false)
      setAIDetection(null)
      fetchAuditAreas()
      setTimeout(recalculateAudit, 500)
    }
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/lighting-audits')}
            style={{
              padding: '10px',
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              color: theme.textSecondary
            }}
          >
            <ArrowLeft size={20} />
          </button>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '4px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {audit.customer?.name || 'Lighting Audit'}
              </h1>
              <span style={{
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '600',
                backgroundColor: statusStyle.bg,
                color: statusStyle.text
              }}>
                {audit.status || 'Draft'}
              </span>
            </div>
            <div style={{ fontSize: '14px', color: theme.textMuted }}>
              {audit.audit_id} · {audit.city}, {audit.state}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          {audit.status === 'Draft' && (
            <button
              onClick={() => updateStatus('In Progress')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                backgroundColor: theme.accent,
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Start Audit
            </button>
          )}
          {audit.status === 'In Progress' && (
            <button
              onClick={() => updateStatus('Completed')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                backgroundColor: '#4a7c59',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              <Check size={16} />
              Complete
            </button>
          )}
          {audit.status === 'Completed' && (
            <button
              onClick={() => updateStatus('Submitted')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                backgroundColor: '#6a5acd',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              <Send size={16} />
              Submit for Rebate
            </button>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '16px'
        }}>
          <div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>Address</div>
            <div style={{ fontSize: '14px', color: theme.text }}>
              {audit.address}<br />
              {audit.city}, {audit.state} {audit.zip}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>Utility Provider</div>
            <div style={{ fontSize: '14px', color: theme.text }}>
              {audit.utility_provider?.provider_name || '-'}
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>Electric Rate</div>
            <div style={{ fontSize: '14px', color: theme.text }}>
              ${audit.electric_rate}/kWh
            </div>
          </div>
          <div>
            <div style={{ fontSize: '12px', color: theme.textMuted }}>Operating Schedule</div>
            <div style={{ fontSize: '14px', color: theme.text }}>
              {audit.operating_hours}h/day · {audit.operating_days} days/yr
            </div>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          textAlign: 'center'
        }}>
          <Zap size={20} style={{ color: theme.accent, marginBottom: '8px' }} />
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Total Fixtures</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            {audit.total_fixtures || 0}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          textAlign: 'center'
        }}>
          <TrendingDown size={20} style={{ color: '#4a7c59', marginBottom: '8px' }} />
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Watts Reduced</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            {(audit.watts_reduced || 0).toLocaleString()}
          </div>
        </div>

        <div style={{
          backgroundColor: 'rgba(74,124,89,0.1)',
          padding: '20px',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Annual kWh Saved</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#4a7c59' }}>
            {Math.round(audit.annual_savings_kwh || 0).toLocaleString()}
          </div>
        </div>

        <div style={{
          backgroundColor: 'rgba(194,139,56,0.1)',
          padding: '20px',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <DollarSign size={20} style={{ color: '#c28b38', marginBottom: '8px' }} />
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Annual Savings</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#c28b38' }}>
            {formatCurrency(audit.annual_savings_dollars)}
          </div>
        </div>

        <div style={{
          backgroundColor: 'rgba(74,124,89,0.15)',
          padding: '20px',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Est. Rebate</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: '#4a7c59' }}>
            {formatCurrency(audit.estimated_rebate)}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          textAlign: 'center'
        }}>
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Net Cost</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            {formatCurrency(audit.net_cost)}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.accentBg,
          padding: '20px',
          borderRadius: '12px',
          textAlign: 'center'
        }}>
          <Clock size={20} style={{ color: theme.accent, marginBottom: '8px' }} />
          <div style={{ fontSize: '12px', color: theme.textMuted }}>Payback</div>
          <div style={{ fontSize: '24px', fontWeight: '700', color: theme.accent }}>
            {Math.round(audit.payback_months || 0)} mo
          </div>
        </div>
      </div>

      {/* Audit Areas */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden'
      }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: `1px solid ${theme.border}`
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
            Audit Areas ({areas.length})
          </h2>
          <button
            onClick={() => setShowAreaModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 16px',
              backgroundColor: theme.accent,
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <Plus size={16} />
            Add Area
          </button>
        </div>

        {/* AI Photo Capture */}
        <div style={{ padding: '16px', borderBottom: `1px solid ${theme.border}` }}>
          <FixtureCamera
            theme={theme}
            auditContext={{
              areaName: 'New Area',
              buildingType: audit.building_type || 'Commercial'
            }}
            onAnalysisComplete={handleAIAnalysisComplete}
          />
        </div>

        {areas.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: theme.textMuted
          }}>
            No areas added yet. Use Lenard AI above to snap a photo!
          </div>
        ) : (
          <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {areas.map(area => (
              <div
                key={area.id}
                style={{
                  padding: '16px',
                  backgroundColor: theme.bg,
                  borderRadius: '8px',
                  border: `1px solid ${area.confirmed ? '#4a7c59' : theme.border}`
                }}
              >
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px'
                }}>
                  <div>
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                        {area.area_name}
                      </span>
                      {area.confirmed && (
                        <span style={{
                          padding: '2px 8px',
                          borderRadius: '10px',
                          fontSize: '10px',
                          fontWeight: '600',
                          backgroundColor: 'rgba(74,124,89,0.15)',
                          color: '#4a7c59'
                        }}>
                          CONFIRMED
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '13px', color: theme.textMuted }}>
                      {area.fixture_category} · {area.fixture_count} fixtures
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => handleEditArea(area)}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: theme.bgCard,
                        color: theme.textSecondary,
                        border: `1px solid ${theme.border}`,
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Edit size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteArea(area.id)}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: 'rgba(194,90,90,0.1)',
                        color: '#c25a5a',
                        border: 'none',
                        borderRadius: '6px',
                        cursor: 'pointer'
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(100px, 1fr))',
                  gap: '12px'
                }}>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Existing</div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                      {area.existing_wattage}W × {area.fixture_count}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>LED</div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                      {area.led_wattage}W × {area.fixture_count}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Total Existing</div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                      {(area.total_existing_watts || 0).toLocaleString()}W
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Total LED</div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                      {(area.total_led_watts || 0).toLocaleString()}W
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Watts Reduced</div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: '#4a7c59' }}>
                      {(area.area_watts_reduced || 0).toLocaleString()}W
                    </div>
                  </div>
                </div>

                {area.override_notes && (
                  <div style={{
                    marginTop: '12px',
                    padding: '8px 12px',
                    backgroundColor: theme.bgCard,
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: theme.textSecondary
                  }}>
                    {area.override_notes}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit Area Modal */}
      {showAreaModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: theme.text,
              marginBottom: '20px'
            }}>
              {editingArea ? 'Edit Area' : 'Add Audit Area'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Area Name *
                </label>
                <input
                  type="text"
                  value={areaForm.area_name}
                  onChange={(e) => setAreaForm({ ...areaForm, area_name: e.target.value })}
                  placeholder="e.g., Warehouse Bay 1"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Fixture Category
                  </label>
                  <select
                    value={areaForm.fixture_category}
                    onChange={(e) => setAreaForm({ ...areaForm, fixture_category: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  >
                    {fixtureCategories.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Ceiling Height (ft)
                  </label>
                  <input
                    type="number"
                    value={areaForm.ceiling_height}
                    onChange={(e) => setAreaForm({ ...areaForm, ceiling_height: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Fixture Count
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={areaForm.fixture_count}
                    onChange={(e) => setAreaForm({ ...areaForm, fixture_count: parseInt(e.target.value) || 1 })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Existing Watts
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={areaForm.existing_wattage}
                    onChange={(e) => setAreaForm({ ...areaForm, existing_wattage: parseInt(e.target.value) || 0 })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    LED Watts
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={areaForm.led_wattage}
                    onChange={(e) => setAreaForm({ ...areaForm, led_wattage: parseInt(e.target.value) || 0 })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  LED Replacement Product
                </label>
                <select
                  value={areaForm.led_replacement_id}
                  onChange={(e) => setAreaForm({ ...areaForm, led_replacement_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                >
                  <option value="">Select Product (Optional)</option>
                  {ledProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Notes
                </label>
                <textarea
                  value={areaForm.override_notes}
                  onChange={(e) => setAreaForm({ ...areaForm, override_notes: e.target.value })}
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={areaForm.confirmed}
                  onChange={(e) => setAreaForm({ ...areaForm, confirmed: e.target.checked })}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '14px', color: theme.text }}>
                  Confirmed
                </span>
              </label>
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              marginTop: '24px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setShowAreaModal(false)
                  setEditingArea(null)
                  setAreaForm({
                    area_name: '',
                    ceiling_height: '',
                    fixture_category: 'Linear',
                    fixture_count: 1,
                    existing_wattage: 0,
                    led_replacement_id: '',
                    led_wattage: 0,
                    confirmed: false,
                    override_notes: ''
                  })
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: theme.bg,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddArea}
                style={{
                  padding: '10px 20px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                {editingArea ? 'Update' : 'Add'} Area
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Detection Confirmation Modal */}
      {showAIModal && aiDetection && (
        <FixtureConfirmModal
          detected={aiDetection.analysis}
          imagePreview={aiDetection.imagePreview}
          fixtureTypes={fixtureTypes}
          products={products}
          theme={theme}
          onConfirm={handleConfirmAIDetection}
          onCancel={() => {
            setShowAIModal(false)
            setAIDetection(null)
          }}
        />
      )}
    </div>
  )
}

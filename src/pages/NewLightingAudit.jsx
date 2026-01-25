import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Zap } from 'lucide-react'

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

const fixtureCategories = [
  'Linear',
  'High Bay',
  'Low Bay',
  'Outdoor',
  'Recessed',
  'Track',
  'Wall Pack',
  'Flood',
  'Area Light',
  'Canopy',
  'Other'
]

export default function NewLightingAudit() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const customers = useStore((state) => state.customers)
  const jobs = useStore((state) => state.jobs)
  const products = useStore((state) => state.products)
  const utilityProviders = useStore((state) => state.utilityProviders)
  const rebateRates = useStore((state) => state.rebateRates)
  const fetchLightingAudits = useStore((state) => state.fetchLightingAudits)
  const fetchAuditAreas = useStore((state) => state.fetchAuditAreas)

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1 - Basic Info
  const [basicInfo, setBasicInfo] = useState({
    customer_id: '',
    job_id: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    utility_provider_id: '',
    electric_rate: 0.12,
    operating_hours: 10,
    operating_days: 260
  })

  // Step 2 - Areas
  const [areas, setAreas] = useState([])
  const [showAreaModal, setShowAreaModal] = useState(false)
  const [editingAreaIndex, setEditingAreaIndex] = useState(null)
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
  }, [companyId, navigate])

  // Auto-fill address from customer
  useEffect(() => {
    if (basicInfo.customer_id) {
      const customer = customers.find(c => c.id === basicInfo.customer_id)
      if (customer) {
        setBasicInfo(prev => ({
          ...prev,
          address: customer.address || prev.address,
          city: customer.city || prev.city,
          state: customer.state || prev.state,
          zip: customer.zip || prev.zip
        }))
      }
    }
  }, [basicInfo.customer_id, customers])

  // Calculate totals
  const calculations = (() => {
    const total_fixtures = areas.reduce((sum, a) => sum + (a.fixture_count || 0), 0)
    const total_existing_watts = areas.reduce((sum, a) => sum + ((a.fixture_count || 0) * (a.existing_wattage || 0)), 0)
    const total_proposed_watts = areas.reduce((sum, a) => sum + ((a.fixture_count || 0) * (a.led_wattage || 0)), 0)
    const watts_reduced = total_existing_watts - total_proposed_watts

    const annual_hours = basicInfo.operating_hours * basicInfo.operating_days
    const annual_savings_kwh = (watts_reduced * annual_hours) / 1000
    const annual_savings_dollars = annual_savings_kwh * basicInfo.electric_rate

    // Calculate rebate (simplified - sum of area rebates)
    let estimated_rebate = 0
    areas.forEach(area => {
      const areaWattsReduced = (area.fixture_count || 0) * ((area.existing_wattage || 0) - (area.led_wattage || 0))
      // Find applicable rebate rate
      const rate = rebateRates.find(r =>
        r.fixture_category === area.fixture_category
      )
      if (rate) {
        if (rate.calc_method === 'per_watt') {
          estimated_rebate += areaWattsReduced * (rate.rate || 0)
        } else if (rate.calc_method === 'per_fixture') {
          estimated_rebate += (area.fixture_count || 0) * (rate.rate || 0)
        }
      }
    })

    // Estimate project cost ($5 per watt reduced as baseline)
    const est_project_cost = watts_reduced * 5
    const net_cost = est_project_cost - estimated_rebate
    const payback_months = annual_savings_dollars > 0 ? (net_cost / (annual_savings_dollars / 12)) : 0

    return {
      total_fixtures,
      total_existing_watts,
      total_proposed_watts,
      watts_reduced,
      annual_savings_kwh,
      annual_savings_dollars,
      estimated_rebate,
      est_project_cost,
      net_cost,
      payback_months
    }
  })()

  const generateAuditId = () => {
    const timestamp = Date.now().toString(36).toUpperCase()
    return `AUD-${timestamp}`
  }

  const handleAddArea = () => {
    if (!areaForm.area_name) {
      alert('Please enter an area name')
      return
    }

    const newArea = {
      ...areaForm,
      total_existing_watts: areaForm.fixture_count * areaForm.existing_wattage,
      total_led_watts: areaForm.fixture_count * areaForm.led_wattage,
      area_watts_reduced: areaForm.fixture_count * (areaForm.existing_wattage - areaForm.led_wattage)
    }

    if (editingAreaIndex !== null) {
      const updatedAreas = [...areas]
      updatedAreas[editingAreaIndex] = newArea
      setAreas(updatedAreas)
      setEditingAreaIndex(null)
    } else {
      setAreas([...areas, newArea])
    }

    setShowAreaModal(false)
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
  }

  const handleEditArea = (index) => {
    setAreaForm(areas[index])
    setEditingAreaIndex(index)
    setShowAreaModal(true)
  }

  const handleDeleteArea = (index) => {
    setAreas(areas.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      // Create audit record
      const auditData = {
        company_id: companyId,
        audit_id: generateAuditId(),
        customer_id: basicInfo.customer_id || null,
        job_id: basicInfo.job_id || null,
        address: basicInfo.address,
        city: basicInfo.city,
        state: basicInfo.state,
        zip: basicInfo.zip,
        utility_provider_id: basicInfo.utility_provider_id || null,
        electric_rate: basicInfo.electric_rate,
        operating_hours: basicInfo.operating_hours,
        operating_days: basicInfo.operating_days,
        status: 'Draft',
        total_fixtures: calculations.total_fixtures,
        total_existing_watts: calculations.total_existing_watts,
        total_proposed_watts: calculations.total_proposed_watts,
        watts_reduced: calculations.watts_reduced,
        annual_savings_kwh: calculations.annual_savings_kwh,
        annual_savings_dollars: calculations.annual_savings_dollars,
        estimated_rebate: calculations.estimated_rebate,
        est_project_cost: calculations.est_project_cost,
        net_cost: calculations.net_cost,
        payback_months: calculations.payback_months
      }

      const { data: audit, error: auditError } = await supabase
        .from('lighting_audits')
        .insert(auditData)
        .select()
        .single()

      if (auditError) throw auditError

      // Create area records
      if (areas.length > 0) {
        const areaRecords = areas.map(area => ({
          company_id: companyId,
          lighting_audit_id: audit.id,
          area_name: area.area_name,
          ceiling_height: area.ceiling_height || null,
          fixture_category: area.fixture_category,
          fixture_count: area.fixture_count,
          existing_wattage: area.existing_wattage,
          led_replacement_id: area.led_replacement_id || null,
          led_wattage: area.led_wattage,
          total_existing_watts: area.total_existing_watts,
          total_led_watts: area.total_led_watts,
          area_watts_reduced: area.area_watts_reduced,
          confirmed: area.confirmed,
          override_notes: area.override_notes || null
        }))

        const { error: areasError } = await supabase
          .from('audit_areas')
          .insert(areaRecords)

        if (areasError) throw areasError
      }

      // Refresh data
      fetchLightingAudits()
      fetchAuditAreas()

      // Navigate to detail
      navigate(`/lighting-audits/${audit.id}`)
    } catch (error) {
      alert('Error saving audit: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount) => {
    return '$' + parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
  }

  const ledProducts = products.filter(p => p.type === 'Product')

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px'
      }}>
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
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
          New Lighting Audit
        </h1>
      </div>

      {/* Steps Indicator */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px'
      }}>
        {[1, 2, 3].map(s => (
          <div
            key={s}
            onClick={() => s < step && setStep(s)}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: step >= s ? theme.accent : theme.bgCard,
              color: step >= s ? '#ffffff' : theme.textMuted,
              borderRadius: '8px',
              textAlign: 'center',
              fontSize: '14px',
              fontWeight: '500',
              cursor: s < step ? 'pointer' : 'default',
              border: `1px solid ${step >= s ? theme.accent : theme.border}`
            }}
          >
            Step {s}: {s === 1 ? 'Basic Info' : s === 2 ? 'Audit Areas' : 'Review'}
          </div>
        ))}
      </div>

      {/* Step 1 - Basic Info */}
      {step === 1 && (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '24px'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: theme.text,
            marginBottom: '20px'
          }}>
            Basic Information
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Customer
                </label>
                <select
                  value={basicInfo.customer_id}
                  onChange={(e) => setBasicInfo({ ...basicInfo, customer_id: e.target.value })}
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
                  <option value="">Select Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
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
                  Job (Optional)
                </label>
                <select
                  value={basicInfo.job_id}
                  onChange={(e) => setBasicInfo({ ...basicInfo, job_id: e.target.value })}
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
                  <option value="">No Job</option>
                  {jobs.map(j => (
                    <option key={j.id} value={j.id}>{j.job_title || j.job_id}</option>
                  ))}
                </select>
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
                Address
              </label>
              <input
                type="text"
                value={basicInfo.address}
                onChange={(e) => setBasicInfo({ ...basicInfo, address: e.target.value })}
                placeholder="Street address"
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

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  City
                </label>
                <input
                  type="text"
                  value={basicInfo.city}
                  onChange={(e) => setBasicInfo({ ...basicInfo, city: e.target.value })}
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
                  State
                </label>
                <input
                  type="text"
                  value={basicInfo.state}
                  onChange={(e) => setBasicInfo({ ...basicInfo, state: e.target.value })}
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
                  ZIP
                </label>
                <input
                  type="text"
                  value={basicInfo.zip}
                  onChange={(e) => setBasicInfo({ ...basicInfo, zip: e.target.value })}
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
                Utility Provider
              </label>
              <select
                value={basicInfo.utility_provider_id}
                onChange={(e) => setBasicInfo({ ...basicInfo, utility_provider_id: e.target.value })}
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
                <option value="">Select Utility Provider</option>
                {utilityProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.provider_name}</option>
                ))}
              </select>
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
                  Electric Rate ($/kWh)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={basicInfo.electric_rate}
                  onChange={(e) => setBasicInfo({ ...basicInfo, electric_rate: parseFloat(e.target.value) || 0 })}
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
                  Operating Hours/Day
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={basicInfo.operating_hours}
                  onChange={(e) => setBasicInfo({ ...basicInfo, operating_hours: parseInt(e.target.value) || 0 })}
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
                  Operating Days/Year
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={basicInfo.operating_days}
                  onChange={(e) => setBasicInfo({ ...basicInfo, operating_days: parseInt(e.target.value) || 0 })}
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
          </div>

          <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setStep(2)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                backgroundColor: theme.accent,
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Next
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2 - Audit Areas */}
      {step === 2 && (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '24px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
              Audit Areas
            </h2>
            <button
              onClick={() => setShowAreaModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
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
              <Plus size={18} />
              Add Area
            </button>
          </div>

          {areas.length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: theme.textMuted,
              backgroundColor: theme.accentBg,
              borderRadius: '8px'
            }}>
              No areas added yet. Click "Add Area" to start.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {areas.map((area, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    backgroundColor: theme.bg,
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '12px'
                  }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                        {area.area_name}
                      </div>
                      <div style={{ fontSize: '13px', color: theme.textMuted }}>
                        {area.fixture_category} · {area.fixture_count} fixtures
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleEditArea(index)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: theme.bgCard,
                          color: theme.textSecondary,
                          border: `1px solid ${theme.border}`,
                          borderRadius: '6px',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteArea(index)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'rgba(194,90,90,0.1)',
                          color: '#c25a5a',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>Existing Watts</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                        {area.existing_wattage}W × {area.fixture_count}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>LED Watts</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                        {area.led_wattage}W × {area.fixture_count}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>Total Existing</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                        {(area.fixture_count * area.existing_wattage).toLocaleString()}W
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>Watts Reduced</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#4a7c59' }}>
                        {(area.fixture_count * (area.existing_wattage - area.led_wattage)).toLocaleString()}W
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{
            marginTop: '24px',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <button
              onClick={() => setStep(1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                backgroundColor: theme.bg,
                color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={18} />
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                backgroundColor: theme.accent,
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Next
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 - Review */}
      {step === 3 && (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '24px'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: theme.text,
            marginBottom: '20px'
          }}>
            Review & Calculate
          </h2>

          {/* Summary Stats */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              padding: '16px',
              backgroundColor: theme.accentBg,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Total Fixtures</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {calculations.total_fixtures}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: theme.accentBg,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Watts Reduced</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {calculations.watts_reduced.toLocaleString()}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(74,124,89,0.1)',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Annual Savings (kWh)</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#4a7c59' }}>
                {Math.round(calculations.annual_savings_kwh).toLocaleString()}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(194,139,56,0.1)',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Annual Savings ($)</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#c28b38' }}>
                {formatCurrency(calculations.annual_savings_dollars)}
              </div>
            </div>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(74,124,89,0.15)',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Est. Rebate</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#4a7c59' }}>
                {formatCurrency(calculations.estimated_rebate)}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: theme.bg,
              borderRadius: '8px',
              textAlign: 'center',
              border: `1px solid ${theme.border}`
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Est. Project Cost</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {formatCurrency(calculations.est_project_cost)}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: theme.bg,
              borderRadius: '8px',
              textAlign: 'center',
              border: `1px solid ${theme.border}`
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Net Cost</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {formatCurrency(calculations.net_cost)}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: theme.accentBg,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Payback</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.accent }}>
                {Math.round(calculations.payback_months)} mo
              </div>
            </div>
          </div>

          {/* Basic Info Summary */}
          <div style={{
            padding: '16px',
            backgroundColor: theme.bg,
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
              Audit Details
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
              <div><span style={{ color: theme.textMuted }}>Customer:</span> {customers.find(c => c.id === basicInfo.customer_id)?.name || 'None'}</div>
              <div><span style={{ color: theme.textMuted }}>Location:</span> {basicInfo.city}, {basicInfo.state}</div>
              <div><span style={{ color: theme.textMuted }}>Electric Rate:</span> ${basicInfo.electric_rate}/kWh</div>
              <div><span style={{ color: theme.textMuted }}>Operating:</span> {basicInfo.operating_hours}h/day, {basicInfo.operating_days} days/yr</div>
            </div>
          </div>

          {/* Areas Summary */}
          <div style={{
            padding: '16px',
            backgroundColor: theme.bg,
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
              Areas ({areas.length})
            </h3>
            {areas.map((area, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: i < areas.length - 1 ? `1px solid ${theme.border}` : 'none',
                fontSize: '13px'
              }}>
                <span>{area.area_name} ({area.fixture_count} {area.fixture_category})</span>
                <span style={{ color: '#4a7c59', fontWeight: '500' }}>
                  -{(area.fixture_count * (area.existing_wattage - area.led_wattage)).toLocaleString()}W
                </span>
              </div>
            ))}
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <button
              onClick={() => setStep(2)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                backgroundColor: theme.bg,
                color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={18} />
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                backgroundColor: saving ? theme.border : '#4a7c59',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              <Check size={18} />
              {saving ? 'Saving...' : 'Save Audit'}
            </button>
          </div>
        </div>
      )}

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
              {editingAreaIndex !== null ? 'Edit Area' : 'Add Audit Area'}
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
                  placeholder="e.g., Warehouse Bay 1, Office, Parking Lot"
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
                    placeholder="Optional"
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
                    Fixture Count *
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
                  placeholder="Optional notes..."
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
                  setEditingAreaIndex(null)
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
                {editingAreaIndex !== null ? 'Update' : 'Add'} Area
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

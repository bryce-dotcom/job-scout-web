import { useState, useEffect, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { LAMP_TYPES, FIXTURE_CATEGORIES, COMMON_WATTAGES, LED_REPLACEMENT_MAP, AI_CATEGORY_MAP, AI_LAMP_TYPE_MAP, PRODUCT_CATEGORY_KEYWORDS } from '../lib/lightingConstants'
import { ArrowLeft, Plus, Minus, Edit, Trash2, Check, Send, Zap, DollarSign, Clock, TrendingDown, Sparkles, FileText } from 'lucide-react'

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

// fixtureCategories and lampTypes now imported from lightingConstants.js

export default function LightingAuditDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const lightingAudits = useStore((state) => state.lightingAudits)
  const auditAreas = useStore((state) => state.auditAreas)
  const products = useStore((state) => state.products)
  const fixtureTypes = useStore((state) => state.fixtureTypes)
  const customers = useStore((state) => state.customers)
  const utilityProviders = useStore((state) => state.utilityProviders)
  const utilityPrograms = useStore((state) => state.utilityPrograms)
  const prescriptiveMeasures = useStore((state) => state.prescriptiveMeasures)
  const fetchLightingAudits = useStore((state) => state.fetchLightingAudits)
  const fetchAuditAreas = useStore((state) => state.fetchAuditAreas)
  const createQuote = useStore((state) => state.createQuote)
  const createQuoteLine = useStore((state) => state.createQuoteLine)
  const updateLightingAudit = useStore((state) => state.updateLightingAudit)
  const createAuditArea = useStore((state) => state.createAuditArea)
  const updateAuditArea = useStore((state) => state.updateAuditArea)
  const deleteAuditArea = useStore((state) => state.deleteAuditArea)
  const deleteLightingAudit = useStore((state) => state.deleteLightingAudit)

  const [showAreaModal, setShowAreaModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingArea, setEditingArea] = useState(null)

  // Lenard AI Photo Analysis state
  const [photoPreview, setPhotoPreview] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState(null)
  const [areaForm, setAreaForm] = useState({
    area_name: '',
    ceiling_height: '',
    fixture_category: 'Linear',
    lighting_type: '',
    fixture_count: 1,
    existing_wattage: '',
    led_replacement_id: '',
    led_wattage: '',
    confirmed: false,
    override_notes: ''
  })

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  // Audible click + haptic vibration for counter buttons
  const playClick = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)()
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.frequency.value = 1200
      gain.gain.value = 0.08
      osc.start()
      osc.stop(ctx.currentTime + 0.04)
    } catch (e) { /* silent fallback */ }
    try { navigator.vibrate?.(15) } catch (e) { /* no vibration support */ }
  }

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchLightingAudits()
    fetchAuditAreas()
  }, [companyId, navigate, fetchLightingAudits, fetchAuditAreas])

  // Filter products by fixture category keywords — must be before early return to keep hooks order stable
  const ledProducts = useMemo(() => {
    const allProducts = products.filter(p => p.type === 'Product')
    if (!areaForm.fixture_category || areaForm.fixture_category === 'Other') return allProducts
    const keywords = PRODUCT_CATEGORY_KEYWORDS[areaForm.fixture_category] || []
    if (keywords.length === 0) return allProducts
    const filtered = allProducts.filter(p => {
      const searchText = `${p.name} ${p.description || ''}`.toLowerCase()
      return keywords.some(kw => searchText.includes(kw))
    })
    return filtered.length > 0 ? filtered : allProducts
  }, [products, areaForm.fixture_category])

  const audit = lightingAudits.find(a => String(a.id) === String(id))
  const areas = auditAreas.filter(a => String(a.audit_id) === String(id))

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
    try {
      await updateLightingAudit(id, { status: newStatus })
    } catch (error) {
      alert('Error updating status: ' + error.message)
    }
  }

  const handleCreateQuote = async () => {
    if (!audit) return

    const quoteData = {
      company_id: companyId,
      lead_id: audit.lead_id || null,
      audit_id: audit.id,
      audit_type: 'lighting',
      quote_amount: audit.est_project_cost || 0,
      utility_incentive: audit.estimated_rebate || 0,
      status: 'Draft'
    }
    const quoteTempId = await createQuote(quoteData)

    // Use areas from store instead of fetching from supabase
    if (areas.length > 0) {
      for (const area of areas) {
        const qty = area.fixture_count || 1
        const unitPrice = area.led_product?.price || (((area.existing_wattage || 0) - (area.led_wattage || 0)) * 5)
        await createQuoteLine({
          quote_id: quoteTempId,
          item_name: `${area.area_name} - LED Retrofit`,
          item_id: area.led_replacement_id || null,
          quantity: qty,
          price: Math.round(unitPrice * 100) / 100,
          line_total: Math.round(qty * unitPrice * 100) / 100
        })
      }
    }

    navigate(`/quotes/${quoteTempId}`)
  }

  const recalculateAudit = async () => {
    const total_fixtures = areas.reduce((sum, a) => sum + (a.fixture_count || 0), 0)
    const total_existing_watts = areas.reduce((sum, a) => sum + (a.total_existing_watts || 0), 0)
    const total_proposed_watts = areas.reduce((sum, a) => sum + (a.total_led_watts || 0), 0)
    const watts_reduced = total_existing_watts - total_proposed_watts
    const annual_hours = (audit.operating_hours || 10) * (audit.operating_days || 260)
    const annual_savings_kwh = (watts_reduced * annual_hours) / 1000
    const annual_savings_dollars = annual_savings_kwh * (audit.electric_rate || 0.12)

    await updateLightingAudit(id, {
      total_fixtures: Math.round(total_fixtures) || 0,
      total_existing_watts: Math.round(total_existing_watts) || 0,
      total_proposed_watts: Math.round(total_proposed_watts) || 0,
      watts_reduced: Math.round(watts_reduced) || 0,
      annual_savings_kwh: Math.round(annual_savings_kwh) || 0,
      annual_savings_dollars: Math.round(annual_savings_dollars * 100) / 100 || 0
    })
  }

  const openEditModal = () => {
    setShowEditModal(true)
  }

  const handleSaveAudit = async (editData) => {
    await updateLightingAudit(id, {
      customer_id: editData.customer_id ? parseInt(editData.customer_id) : null,
      address: editData.address,
      city: editData.city,
      state: editData.state,
      zip: editData.zip,
      utility_provider_id: editData.utility_provider_id ? parseInt(editData.utility_provider_id) : null,
      electric_rate: parseFloat(editData.electric_rate) || 0.12,
      operating_hours: parseInt(editData.operating_hours) || 10,
      operating_days: parseInt(editData.operating_days) || 260
    })
    setShowEditModal(false)
    recalculateAudit()
  }

  const handleDeleteAudit = async () => {
    if (!confirm('Delete this audit and all its areas? This cannot be undone.')) return

    // Delete areas first
    for (const area of areas) {
      await deleteAuditArea(area.id)
    }
    await deleteLightingAudit(id)
    navigate('/lighting-audits')
  }

  const handleAddArea = async () => {
    if (!areaForm.area_name) {
      alert('Please enter an area name')
      return
    }

    const qty = parseInt(areaForm.fixture_count) || 1
    const existW = parseInt(areaForm.existing_wattage) || 0
    const newW = parseInt(areaForm.led_wattage) || 0
    const total_existing_watts = qty * existW
    const total_led_watts = qty * newW
    const area_watts_reduced = total_existing_watts - total_led_watts

    const areaData = {
      company_id: companyId,
      audit_id: String(id).startsWith('temp_') ? id : parseInt(id),
      area_name: areaForm.area_name,
      ceiling_height: areaForm.ceiling_height || null,
      fixture_category: areaForm.fixture_category,
      lighting_type: areaForm.lighting_type || null,
      fixture_count: qty,
      existing_wattage: existW,
      led_replacement_id: areaForm.led_replacement_id || null,
      led_wattage: newW,
      total_existing_watts,
      total_led_watts,
      area_watts_reduced,
      confirmed: areaForm.confirmed,
      override_notes: areaForm.override_notes || null
    }

    let error
    if (editingArea) {
      try {
        await updateAuditArea(editingArea.id, areaData)
      } catch (e) { error = e }
    } else {
      try {
        await createAuditArea(areaData)
      } catch (e) { error = e }
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
        lighting_type: '',
        fixture_count: 1,
        existing_wattage: '',
        led_replacement_id: '',
        led_wattage: '',
        confirmed: false,
        override_notes: ''
      })
      clearPhotoState()
      // No need to fetchAuditAreas() - optimistic updates handle it
      setTimeout(recalculateAudit, 500)
    }
  }

  const handleEditArea = (area) => {
    setEditingArea(area)
    setAreaForm({
      area_name: area.area_name || '',
      ceiling_height: area.ceiling_height || '',
      fixture_category: area.fixture_category || 'Linear',
      lighting_type: area.lighting_type || '',
      fixture_count: area.fixture_count || 1,
      existing_wattage: area.existing_wattage || '',
      led_replacement_id: area.led_replacement_id || '',
      led_wattage: area.led_wattage || '',
      confirmed: area.confirmed || false,
      override_notes: area.override_notes || ''
    })
    setShowAreaModal(true)
  }

  const handleDeleteArea = async (areaId) => {
    if (!confirm('Delete this area?')) return
    await deleteAuditArea(areaId)
    setTimeout(recalculateAudit, 500)
  }

  // Map AI category to our categories
  const mapCategory = (aiCategory) => AI_CATEGORY_MAP[aiCategory] || 'Linear'

  // Handle photo capture for Lenard AI analysis
  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Create preview
    const reader = new FileReader()
    reader.onload = (e) => setPhotoPreview(e.target.result)
    reader.readAsDataURL(file)

    // Convert to base64 for API
    setAnalyzing(true)
    setAiResult(null)

    const base64Reader = new FileReader()
    base64Reader.onload = async (e) => {
      const base64 = e.target.result.split(',')[1]

      try {
        // Build product list for AI matching
        const productList = ledProducts.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          wattage: undefined
        }))

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-fixture`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
              imageBase64: base64,
              auditContext: {
                areaName: areaForm.area_name || 'Unknown Area',
                buildingType: audit?.building_type || 'Commercial',
                utilityProvider: utilityProviders.find(p => p.id === audit?.utility_provider_id)?.provider_name || null,
                operatingHours: (audit?.operating_hours && audit?.operating_days) ? audit.operating_hours * audit.operating_days : null
              },
              availableProducts: productList,
              fixtureTypes: (fixtureTypes || []).map(ft => ({
                fixture_name: ft.fixture_name,
                category: ft.category,
                lamp_type: ft.lamp_type,
                system_wattage: ft.system_wattage,
                led_replacement_watts: ft.led_replacement_watts
              })),
              prescriptiveMeasures: (prescriptiveMeasures || [])
                .filter(pm => pm.measure_category === 'Lighting' && pm.is_active)
                .slice(0, 30)
                .map(pm => ({
                  measure_name: pm.measure_name,
                  baseline_equipment: pm.baseline_equipment,
                  baseline_wattage: pm.baseline_wattage,
                  replacement_equipment: pm.replacement_equipment,
                  replacement_wattage: pm.replacement_wattage,
                  incentive_amount: pm.incentive_amount,
                  incentive_unit: pm.incentive_unit
                }))
            })
          }
        )

        const data = await response.json()

        if (data?.success && data?.analysis) {
          setAiResult(data.analysis)

          // Auto-fill ALL form fields
          const a = data.analysis
          setAreaForm(prev => ({
            ...prev,
            area_name: a.area_name || prev.area_name || a.fixture_type || '',
            fixture_category: mapCategory(a.fixture_category),
            lighting_type: AI_LAMP_TYPE_MAP[a.lamp_type] || a.lamp_type || prev.lighting_type,
            fixture_count: a.fixture_count || prev.fixture_count,
            existing_wattage: a.existing_wattage_per_fixture || prev.existing_wattage,
            ceiling_height: a.ceiling_height_estimate || prev.ceiling_height,
            led_wattage: a.led_replacement_wattage || prev.led_wattage,
            led_replacement_id: a.recommended_product_id || prev.led_replacement_id,
            override_notes: [
              a.notes ? `AI: ${a.notes}` : '',
              a.rebate_eligible ? `Rebate eligible (~$${a.estimated_rebate_per_fixture}/fixture)` : ''
            ].filter(Boolean).join('. ') || prev.override_notes
          }))
        } else {
          alert('Lenard had trouble analyzing this photo. Please try again or fill in manually.')
        }
      } catch (err) {
        console.error('Error calling analyze-fixture:', err)
        alert('Could not connect to Lenard. Please try again.')
      }

      setAnalyzing(false)
    }
    base64Reader.readAsDataURL(file)
  }

  // Clear photo state when modal closes
  const clearPhotoState = () => {
    setPhotoPreview(null)
    setAiResult(null)
    setAnalyzing(false)
  }

  return (
    <div className="audit-detail-root page-padding" style={{ padding: '24px' }}>
      <style>{`
        @media (max-width: 768px) {
          .audit-detail-root input, .audit-detail-root select, .audit-detail-root textarea { font-size: 16px !important; }
          .audit-area-modal input, .audit-area-modal select, .audit-area-modal textarea { font-size: 16px !important; }
          .audit-detail-root .stat-grid > div { padding: 14px 10px !important; }
          .audit-detail-root .stat-grid > div > div:last-of-type { font-size: 20px !important; }
          .audit-area-actions button { min-width: 44px !important; min-height: 44px !important; padding: 10px 14px !important; }
        }
        @media (max-width: 480px) {
          .audit-detail-root { padding: 12px !important; }
          .audit-detail-header { flex-direction: column !important; align-items: stretch !important; gap: 12px !important; }
          .audit-detail-header h1 { font-size: 20px !important; }
          .audit-detail-actions { width: 100% !important; flex-direction: column !important; }
          .audit-detail-actions button { width: 100% !important; justify-content: center !important; min-height: 48px !important; font-size: 16px !important; border-radius: 10px !important; }
          .audit-detail-info { padding: 12px !important; }
          .audit-detail-root .stat-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
          .audit-detail-root .stat-grid > div { padding: 10px !important; }
          .audit-detail-root .stat-grid > div > svg { display: none !important; }
          .audit-detail-root .stat-grid > div > div:first-of-type { font-size: 11px !important; margin-bottom: 2px !important; }
          .audit-detail-root .stat-grid > div > div:last-of-type { font-size: 18px !important; }
          .audit-area-modal { max-width: 100% !important; max-height: 100% !important; width: 100% !important; height: 100% !important; border-radius: 0 !important; padding: 16px !important; }
          .audit-modal-grid-2, .audit-modal-grid-3 { grid-template-columns: 1fr !important; }
          .audit-modal-footer { flex-direction: column !important; }
          .audit-modal-footer button { width: 100% !important; min-height: 48px !important; font-size: 16px !important; border-radius: 10px !important; }

          /* Lenard photo section compact */
          .lenard-photo { padding: 16px !important; border-width: 1px !important; }
          .lenard-photo-emoji { font-size: 24px !important; margin-bottom: 4px !important; }
          .lenard-photo-buttons { flex-direction: column !important; gap: 10px !important; }
          .lenard-photo-buttons > label { width: 100% !important; text-align: center !important; padding: 14px 20px !important; font-size: 16px !important; border-radius: 10px !important; box-sizing: border-box !important; }
        }
      `}</style>
      {/* Header */}
      <div className="audit-detail-header page-header" style={{
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
                {audit.customer?.name || customers.find(c => c.id === audit.customer_id)?.name || 'Lighting Audit'}
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

        <div className="audit-detail-actions button-group" style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={openEditModal}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              backgroundColor: theme.bgCard,
              color: theme.textSecondary,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <Edit size={16} />
            Edit
          </button>
          <button
            onClick={handleDeleteAudit}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              backgroundColor: 'rgba(194,90,90,0.1)',
              color: '#c25a5a',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer'
            }}
          >
            <Trash2 size={16} />
            Delete
          </button>
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
          {(audit.status === 'Completed' || audit.status === 'Submitted') && (
            <button
              onClick={handleCreateQuote}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '10px 16px',
                backgroundColor: '#4a6b7c',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              <FileText size={16} />
              Create Quote
            </button>
          )}
        </div>
      </div>

      {/* Info Section */}
      <div className="audit-detail-info" style={{
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
      <div className="stat-grid" style={{
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

        {areas.length === 0 ? (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            color: theme.textMuted
          }}>
            No areas added yet. Click "Add Area" and let Lenard identify your fixtures!
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
                      {area.fixture_category}{area.lighting_type ? ` (${area.lighting_type})` : ''} · {area.fixture_count} fixtures
                    </div>
                  </div>

                  <div className="audit-area-actions" style={{ display: 'flex', gap: '6px' }}>
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
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>New</div>
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
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Total New</div>
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
          <div className="audit-area-modal modal-content" style={{
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
              {/* Lenard AI Photo Analysis */}
              {!editingArea && (
                <div className="lenard-photo" style={{
                  backgroundColor: 'rgba(90, 99, 73, 0.1)',
                  border: '2px dashed #5a6349',
                  borderRadius: '12px',
                  padding: '20px',
                  textAlign: 'center'
                }}>
                  {!photoPreview ? (
                    <>
                      <div className="lenard-photo-emoji" style={{ fontSize: '32px', marginBottom: '8px' }}>📸</div>
                      <p style={{ color: '#5a6349', fontWeight: '600', marginBottom: '8px', margin: '0 0 8px' }}>
                        Let Lenard identify your fixtures
                      </p>
                      <p style={{ color: '#7d8a7f', fontSize: '14px', marginBottom: '16px', margin: '0 0 16px' }}>
                        Take a photo or upload an image and AI will auto-fill the form
                      </p>
                      <div className="lenard-photo-buttons" style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                        <label style={{
                          padding: '10px 20px',
                          backgroundColor: '#5a6349',
                          color: '#fff',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '600',
                          display: 'inline-block'
                        }}>
                          📷 Take Photo
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handlePhotoCapture}
                            style={{ display: 'none' }}
                          />
                        </label>
                        <label style={{
                          padding: '10px 20px',
                          backgroundColor: 'transparent',
                          color: '#5a6349',
                          border: '1px solid #5a6349',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: '600',
                          display: 'inline-block'
                        }}>
                          📁 Upload
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoCapture}
                            style={{ display: 'none' }}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      <img
                        src={photoPreview}
                        alt="Fixture"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '200px',
                          borderRadius: '8px',
                          marginBottom: '12px'
                        }}
                      />
                      {analyzing ? (
                        <div style={{ color: '#5a6349' }}>
                          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔦</div>
                          <p style={{ fontWeight: '600', margin: '0 0 4px' }}>Lenard is analyzing...</p>
                          <p style={{ fontSize: '14px', color: '#7d8a7f', margin: 0 }}>Identifying fixtures, counting, estimating wattage</p>
                        </div>
                      ) : aiResult ? (
                        <div style={{
                          backgroundColor: '#fff',
                          padding: '12px',
                          borderRadius: '8px',
                          textAlign: 'left',
                          fontSize: '14px'
                        }}>
                          <div style={{ color: '#5a6349', fontWeight: '600', marginBottom: '8px' }}>
                            ✅ Lenard detected:
                          </div>
                          <div style={{ color: '#2c3530' }}>
                            {aiResult.fixture_type} • {aiResult.fixture_count} fixtures • ~{aiResult.existing_wattage_per_fixture}W each
                          </div>
                          <div style={{ color: '#7d8a7f', fontSize: '12px', marginTop: '4px' }}>
                            Confidence: {aiResult.confidence} • {aiResult.lamp_type} lamps
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => {
                          setPhotoPreview(null)
                          setAiResult(null)
                        }}
                        style={{
                          marginTop: '12px',
                          padding: '8px 16px',
                          backgroundColor: 'transparent',
                          color: '#7d8a7f',
                          border: '1px solid #d6cdb8',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px'
                        }}
                      >
                        Clear & Try Again
                      </button>
                    </>
                  )}
                </div>
              )}

              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Area Name *
                  {aiResult?.area_name && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
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

              <div className="audit-modal-grid-3 form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Fixture Category
                    {aiResult?.fixture_category && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
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
                    {FIXTURE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Lighting Type
                    {aiResult?.lamp_type && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                  </label>
                  <select
                    value={areaForm.lighting_type}
                    onChange={(e) => setAreaForm({ ...areaForm, lighting_type: e.target.value })}
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
                    <option value="">Select Type</option>
                    {LAMP_TYPES.map(lt => (
                      <option key={lt} value={lt}>{lt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Ceiling Height (ft)
                    {aiResult?.ceiling_height_estimate && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
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

              {/* Fixture counter — full width with big +/- buttons */}
              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Fixture Count
                  {aiResult?.fixture_count && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0', maxWidth: '280px' }}>
                  <button
                    type="button"
                    onClick={() => { playClick(); setAreaForm(prev => ({ ...prev, fixture_count: Math.max(1, (parseInt(prev.fixture_count) || 1) - 1) })) }}
                    style={{
                      width: '64px', height: '56px',
                      borderRadius: '12px 0 0 12px',
                      border: `2px solid ${theme.accent}`,
                      borderRight: 'none',
                      backgroundColor: theme.accentBg,
                      color: theme.accent,
                      fontSize: '28px', fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      WebkitTapHighlightColor: 'transparent',
                      userSelect: 'none'
                    }}
                  ><Minus size={26} /></button>
                  <input
                    type="number"
                    min="1"
                    value={areaForm.fixture_count || ''}
                    onChange={(e) => setAreaForm({ ...areaForm, fixture_count: e.target.value === '' ? '' : (parseInt(e.target.value) || 1) })}
                    style={{
                      flex: 1, minWidth: 0,
                      height: '56px',
                      border: `2px solid ${theme.border}`,
                      borderLeft: 'none', borderRight: 'none',
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '24px', fontWeight: '700',
                      textAlign: 'center',
                      MozAppearance: 'textfield',
                      WebkitAppearance: 'none'
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => { playClick(); setAreaForm(prev => ({ ...prev, fixture_count: (parseInt(prev.fixture_count) || 0) + 1 })) }}
                    style={{
                      width: '64px', height: '56px',
                      borderRadius: '0 12px 12px 0',
                      border: `2px solid ${theme.accent}`,
                      borderLeft: 'none',
                      backgroundColor: theme.accent,
                      color: '#fff',
                      fontSize: '28px', fontWeight: '700',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      WebkitTapHighlightColor: 'transparent',
                      userSelect: 'none'
                    }}
                  ><Plus size={26} /></button>
                </div>
              </div>

              {/* Existing Watts / New Watts — side by side */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Existing Watts
                    {aiResult?.existing_wattage_per_fixture && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={areaForm.existing_wattage || ''}
                    onChange={(e) => setAreaForm({ ...areaForm, existing_wattage: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
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
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    New Watts
                    {aiResult?.led_replacement_wattage && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={areaForm.led_wattage || ''}
                    onChange={(e) => setAreaForm({ ...areaForm, led_wattage: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
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

              {/* Quick-select wattage buttons */}
              {areaForm.lighting_type && COMMON_WATTAGES[areaForm.lighting_type]?.length > 0 && (
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '6px', display: 'block' }}>
                    Common {areaForm.lighting_type} system wattages (tap to fill existing + LED):
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {COMMON_WATTAGES[areaForm.lighting_type].map(w => {
                      const ledW = LED_REPLACEMENT_MAP[areaForm.lighting_type]?.[w]
                      const isSelected = parseInt(areaForm.existing_wattage) === w
                      return (
                        <button
                          key={w}
                          type="button"
                          onClick={() => setAreaForm(prev => ({
                            ...prev,
                            existing_wattage: w,
                            ...(ledW ? { led_wattage: ledW } : {})
                          }))}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '6px',
                            border: `1px solid ${isSelected ? theme.accent : theme.border}`,
                            backgroundColor: isSelected ? theme.accentBg : theme.bg,
                            color: isSelected ? theme.accent : theme.textSecondary,
                            fontSize: '13px',
                            fontWeight: isSelected ? '600' : '400',
                            cursor: 'pointer'
                          }}
                        >
                          {w}W{ledW ? ` → ${ledW}W` : ''}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}

              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Replacement Product
                  {aiResult?.recommended_product_id && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
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

            <div className="audit-modal-footer button-group" style={{
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
                    lighting_type: '',
                    fixture_count: 1,
                    existing_wattage: '',
                    led_replacement_id: '',
                    led_wattage: '',
                    confirmed: false,
                    override_notes: ''
                  })
                  clearPhotoState()
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

      {/* Edit Audit Modal */}
      {showEditModal && (
        <EditAuditModal
          audit={audit}
          customers={customers}
          utilityProviders={utilityProviders}
          theme={theme}
          onSave={handleSaveAudit}
          onClose={() => setShowEditModal(false)}
        />
      )}
    </div>
  )
}

function EditAuditModal({ audit, customers, utilityProviders, theme, onSave, onClose }) {
  const [form, setForm] = useState({
    customer_id: audit.customer_id || '',
    address: audit.address || '',
    city: audit.city || '',
    state: audit.state || '',
    zip: audit.zip || '',
    utility_provider_id: audit.utility_provider_id || '',
    electric_rate: audit.electric_rate || 0.12,
    operating_hours: audit.operating_hours || 10,
    operating_days: audit.operating_days || 260
  })
  const [saving, setSaving] = useState(false)

  const filteredProviders = form.state
    ? utilityProviders.filter(p => p.state === form.state)
    : utilityProviders

  const handleSubmit = async () => {
    setSaving(true)
    await onSave(form)
    setSaving(false)
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    borderRadius: '8px',
    border: `1px solid ${theme.border}`,
    backgroundColor: theme.bg,
    color: theme.text,
    fontSize: '14px'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '500',
    color: theme.textSecondary,
    marginBottom: '6px'
  }

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000
    }}>
      <div className="audit-area-modal modal-content" style={{
        backgroundColor: theme.bgCard,
        borderRadius: '16px',
        padding: '24px',
        width: '100%',
        maxWidth: '560px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '20px' }}>
          Edit Audit
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={labelStyle}>Customer</label>
            <select value={form.customer_id} onChange={(e) => setForm({ ...form, customer_id: e.target.value })} style={inputStyle}>
              <option value="">Select Customer</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div>
            <label style={labelStyle}>Address</label>
            <input type="text" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} style={inputStyle} />
          </div>

          <div className="audit-modal-grid-3 form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>City</label>
              <input type="text" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>State</label>
              <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>ZIP</label>
              <input type="text" value={form.zip} onChange={(e) => setForm({ ...form, zip: e.target.value })} style={inputStyle} />
            </div>
          </div>

          <div>
            <label style={labelStyle}>
              Utility Provider {form.state && <span style={{ color: theme.textMuted, fontWeight: '400' }}>({form.state})</span>}
            </label>
            <select value={form.utility_provider_id} onChange={(e) => setForm({ ...form, utility_provider_id: e.target.value })} style={inputStyle}>
              <option value="">{form.state ? `Select Provider in ${form.state}` : 'Select Utility Provider'}</option>
              {filteredProviders.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
            </select>
          </div>

          <div className="audit-modal-grid-3 form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Electric Rate ($/kWh)</label>
              <input type="number" step="0.01" min="0" value={form.electric_rate} onChange={(e) => setForm({ ...form, electric_rate: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Hours/Day</label>
              <input type="number" min="1" max="24" value={form.operating_hours} onChange={(e) => setForm({ ...form, operating_hours: e.target.value })} style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Days/Year</label>
              <input type="number" min="1" max="365" value={form.operating_days} onChange={(e) => setForm({ ...form, operating_days: e.target.value })} style={inputStyle} />
            </div>
          </div>
        </div>

        <div className="audit-modal-footer button-group" style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
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
            onClick={handleSubmit}
            disabled={saving}
            style={{
              padding: '10px 20px',
              backgroundColor: theme.accent,
              color: '#ffffff',
              border: 'none',
              borderRadius: '8px',
              fontSize: '14px',
              fontWeight: '500',
              cursor: 'pointer',
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  )
}

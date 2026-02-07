import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { ArrowLeft, DollarSign, Plus, Edit, Trash2 } from 'lucide-react'

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

const fixtureCategories = ['Linear', 'High Bay', 'Low Bay', 'Outdoor', 'Recessed', 'Track', 'Wall Pack', 'Flood', 'Area Light', 'Canopy', 'Other']
const locationTypes = ['Indoor', 'Outdoor', 'Parking', 'Warehouse', 'Office', 'Retail', 'Industrial', 'Other']
const calcMethods = ['per_watt', 'per_fixture', 'custom']

export default function RebateRates() {
  const { id: programId } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const utilityPrograms = useStore((state) => state.utilityPrograms)
  const rebateRates = useStore((state) => state.rebateRates)
  const fetchRebateRates = useStore((state) => state.fetchRebateRates)

  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState({
    location_type: 'Indoor',
    fixture_category: 'Linear',
    calc_method: 'per_watt',
    rate: 0,
    rate_unit: '$/watt',
    min_watts: '',
    max_watts: ''
  })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchRebateRates()
  }, [companyId, navigate, fetchRebateRates])

  const program = utilityPrograms.find(p => p.id === programId)
  const programRates = rebateRates.filter(r => r.program_id === programId)

  const handleSubmit = async (e) => {
    e.preventDefault()

    const data = {
      company_id: companyId,
      program_id: programId,
      location_type: formData.location_type,
      fixture_category: formData.fixture_category,
      calc_method: formData.calc_method,
      rate: parseFloat(formData.rate) || 0,
      rate_unit: formData.rate_unit,
      min_watts: parseInt(formData.min_watts) || null,
      max_watts: parseInt(formData.max_watts) || null
    }

    let error
    if (editing) {
      const result = await supabase.from('rebate_rates').update(data).eq('id', editing.id)
      error = result.error
    } else {
      const result = await supabase.from('rebate_rates').insert(data)
      error = result.error
    }

    if (error) {
      alert('Error saving: ' + error.message)
    } else {
      setShowModal(false)
      setEditing(null)
      setFormData({ location_type: 'Indoor', fixture_category: 'Linear', calc_method: 'per_watt', rate: 0, rate_unit: '$/watt', min_watts: '', max_watts: '' })
      fetchRebateRates()
    }
  }

  const handleEdit = (rate) => {
    setEditing(rate)
    setFormData({
      location_type: rate.location_type || 'Indoor',
      fixture_category: rate.fixture_category || 'Linear',
      calc_method: rate.calc_method || 'per_watt',
      rate: rate.rate || 0,
      rate_unit: rate.rate_unit || '$/watt',
      min_watts: rate.min_watts || '',
      max_watts: rate.max_watts || ''
    })
    setShowModal(true)
  }

  const handleDelete = async (rateId) => {
    if (!confirm('Delete this rebate rate?')) return
    const { error } = await supabase.from('rebate_rates').delete().eq('id', rateId)
    if (error) {
      alert('Error deleting: ' + error.message)
    } else {
      fetchRebateRates()
    }
  }

  const formatRate = (rate) => {
    const method = rate.calc_method
    const value = rate.rate || 0
    if (method === 'per_watt') return `$${value.toFixed(2)}/watt`
    if (method === 'per_fixture') return `$${value.toFixed(2)}/fixture`
    return `$${value.toFixed(2)} (custom)`
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
        <button onClick={() => navigate('/utility-programs')} style={{ padding: '10px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px', cursor: 'pointer', color: theme.textSecondary }}>
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Rebate Rates</h1>
          {program && <div style={{ fontSize: '14px', color: theme.textMuted }}>{program.program_name}</div>}
        </div>
        <button onClick={() => setShowModal(true)} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={18} /> Add Rate
        </button>
      </div>

      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.accentBg }}>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Location Type</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Fixture Category</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Calc Method</th>
              <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Rate</th>
              <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Watt Range</th>
              <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {programRates.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No rebate rates found for this program</td></tr>
            ) : (
              programRates.map(rate => (
                <tr key={rate.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text }}>{rate.location_type}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary }}>{rate.fixture_category}</td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '500', backgroundColor: theme.accentBg, color: theme.accent }}>{rate.calc_method}</span>
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '600', color: '#4a7c59', textAlign: 'right' }}>{formatRate(rate)}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary, textAlign: 'center' }}>
                    {rate.min_watts || rate.max_watts ? `${rate.min_watts || 0}W - ${rate.max_watts || '∞'}W` : '-'}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      <button onClick={() => handleEdit(rate)} style={{ padding: '6px 10px', backgroundColor: theme.accentBg, color: theme.accent, border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                        <Edit size={14} />
                      </button>
                      <button onClick={() => handleDelete(rate.id)} style={{ padding: '6px 10px', backgroundColor: 'rgba(194,90,90,0.1)', color: '#c25a5a', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '20px' }}>{editing ? 'Edit' : 'Add'} Rebate Rate</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Location Type</label>
                    <select value={formData.location_type} onChange={(e) => setFormData({ ...formData, location_type: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }}>
                      {locationTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Fixture Category</label>
                    <select value={formData.fixture_category} onChange={(e) => setFormData({ ...formData, fixture_category: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }}>
                      {fixtureCategories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Calc Method</label>
                    <select value={formData.calc_method} onChange={(e) => setFormData({ ...formData, calc_method: e.target.value, rate_unit: e.target.value === 'per_watt' ? '$/watt' : e.target.value === 'per_fixture' ? '$/fixture' : '$/custom' })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }}>
                      {calcMethods.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Rate *</label>
                    <input type="number" step="0.01" min="0" value={formData.rate} onChange={(e) => setFormData({ ...formData, rate: e.target.value })} required
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Rate Unit</label>
                    <input type="text" value={formData.rate_unit} onChange={(e) => setFormData({ ...formData, rate_unit: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Min Watts</label>
                    <input type="number" min="0" value={formData.min_watts} onChange={(e) => setFormData({ ...formData, min_watts: e.target.value })}
                      placeholder="Optional"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Max Watts</label>
                    <input type="number" min="0" value={formData.max_watts} onChange={(e) => setFormData({ ...formData, max_watts: e.target.value })}
                      placeholder="Optional"
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowModal(false); setEditing(null) }} style={{ padding: '10px 20px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>{editing ? 'Update' : 'Add'} Rate</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

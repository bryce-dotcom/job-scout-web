import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { FIXTURE_CATEGORIES, LAMP_TYPES } from '../lib/lightingConstants'
import { Lightbulb, Plus, Edit, Search } from 'lucide-react'

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

const categories = FIXTURE_CATEGORIES
const lampTypes = LAMP_TYPES

export default function FixtureTypes() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const fixtureTypes = useStore((state) => state.fixtureTypes)
  const fetchFixtureTypes = useStore((state) => state.fetchFixtureTypes)

  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState({
    fixture_name: '',
    category: 'Linear',
    lamp_type: 'T8',
    lamp_count: 1,
    system_wattage: 0,
    led_replacement_watts: 0,
    visual_characteristics: ''
  })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchFixtureTypes()
  }, [companyId, navigate, fetchFixtureTypes])

  const filteredTypes = fixtureTypes.filter(f => {
    const name = f.fixture_name?.toLowerCase() || ''
    return name.includes(searchTerm.toLowerCase())
  })

  const handleSubmit = async (e) => {
    e.preventDefault()

    const data = {
      company_id: companyId,
      fixture_name: formData.fixture_name,
      category: formData.category,
      lamp_type: formData.lamp_type,
      lamp_count: parseInt(formData.lamp_count) || 1,
      system_wattage: parseInt(formData.system_wattage) || 0,
      led_replacement_watts: parseInt(formData.led_replacement_watts) || 0,
      visual_characteristics: formData.visual_characteristics || null
    }

    let error
    if (editing) {
      const result = await supabase.from('fixture_types').update(data).eq('id', editing.id)
      error = result.error
    } else {
      const result = await supabase.from('fixture_types').insert(data)
      error = result.error
    }

    if (error) {
      alert('Error saving: ' + error.message)
    } else {
      setShowModal(false)
      setEditing(null)
      setFormData({
        fixture_name: '',
        category: 'Linear',
        lamp_type: 'T8',
        lamp_count: 1,
        system_wattage: 0,
        led_replacement_watts: 0,
        visual_characteristics: ''
      })
      fetchFixtureTypes()
    }
  }

  const handleEdit = (fixture) => {
    setEditing(fixture)
    setFormData({
      fixture_name: fixture.fixture_name || '',
      category: fixture.category || 'Linear',
      lamp_type: fixture.lamp_type || 'T8',
      lamp_count: fixture.lamp_count || 1,
      system_wattage: fixture.system_wattage || 0,
      led_replacement_watts: fixture.led_replacement_watts || 0,
      visual_characteristics: fixture.visual_characteristics || ''
    })
    setShowModal(true)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Lightbulb size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Fixture Types</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px',
            backgroundColor: theme.accent, color: '#ffffff', border: 'none',
            borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer'
          }}
        >
          <Plus size={18} /> Add Fixture Type
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: '20px', maxWidth: '400px' }}>
        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
        <input
          type="text"
          placeholder="Search fixture types..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{
            width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px',
            border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard,
            color: theme.text, fontSize: '14px'
          }}
        />
      </div>

      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.accentBg }}>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Fixture Name</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Category</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Lamp Type</th>
              <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>System Watts</th>
              <th style={{ padding: '14px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>LED Watts</th>
              <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredTypes.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No fixture types found</td></tr>
            ) : (
              filteredTypes.map(fixture => (
                <tr key={fixture.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '500', color: theme.text }}>{fixture.fixture_name}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary }}>{fixture.category}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary }}>{fixture.lamp_type} × {fixture.lamp_count}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text, textAlign: 'right' }}>{fixture.system_wattage}W</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: '#4a7c59', fontWeight: '500', textAlign: 'right' }}>{fixture.led_replacement_watts}W</td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <button onClick={() => handleEdit(fixture)} style={{ padding: '6px 10px', backgroundColor: theme.accentBg, color: theme.accent, border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                      <Edit size={14} />
                    </button>
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
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '20px' }}>{editing ? 'Edit' : 'Add'} Fixture Type</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Fixture Name *</label>
                  <input type="text" value={formData.fixture_name} onChange={(e) => setFormData({ ...formData, fixture_name: e.target.value })} required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Category</label>
                    <select value={formData.category} onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }}>
                      {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Lamp Type</label>
                    <select value={formData.lamp_type} onChange={(e) => setFormData({ ...formData, lamp_type: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }}>
                      {lampTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Lamp Count</label>
                    <input type="number" min="1" value={formData.lamp_count} onChange={(e) => setFormData({ ...formData, lamp_count: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>System Watts</label>
                    <input type="number" min="0" value={formData.system_wattage} onChange={(e) => setFormData({ ...formData, system_wattage: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>LED Watts</label>
                    <input type="number" min="0" value={formData.led_replacement_watts} onChange={(e) => setFormData({ ...formData, led_replacement_watts: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Visual Characteristics</label>
                  <input type="text" value={formData.visual_characteristics} onChange={(e) => setFormData({ ...formData, visual_characteristics: e.target.value })}
                    placeholder="e.g., 4ft tube, wraparound lens"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowModal(false); setEditing(null) }}
                  style={{ padding: '10px 20px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
                  {editing ? 'Update' : 'Add'} Fixture Type
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

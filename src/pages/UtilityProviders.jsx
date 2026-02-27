import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Building, Plus, Edit, Search, ExternalLink, Check, X } from 'lucide-react'

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

export default function UtilityProviders() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const utilityProviders = useStore((state) => state.utilityProviders)
  const fetchUtilityProviders = useStore((state) => state.fetchUtilityProviders)

  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState({
    provider_name: '',
    state: '',
    service_territory: '',
    has_rebate_program: true,
    rebate_program_url: '',
    contact_phone: ''
  })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchUtilityProviders()
  }, [companyId, navigate, fetchUtilityProviders])

  const filteredProviders = utilityProviders.filter(p => {
    const name = p.provider_name?.toLowerCase() || ''
    const state = p.state?.toLowerCase() || ''
    const search = searchTerm.toLowerCase()
    return name.includes(search) || state.includes(search)
  })

  const handleSubmit = async (e) => {
    e.preventDefault()

    const data = {
      company_id: companyId,
      provider_name: formData.provider_name,
      state: formData.state,
      service_territory: formData.service_territory || null,
      has_rebate_program: formData.has_rebate_program,
      rebate_program_url: formData.rebate_program_url || null,
      contact_phone: formData.contact_phone || null
    }

    let error
    if (editing) {
      const result = await supabase.from('utility_providers').update(data).eq('id', editing.id)
      error = result.error
    } else {
      const result = await supabase.from('utility_providers').insert(data)
      error = result.error
    }

    if (error) {
      alert('Error saving: ' + error.message)
    } else {
      setShowModal(false)
      setEditing(null)
      setFormData({ provider_name: '', state: '', service_territory: '', has_rebate_program: true, rebate_program_url: '', contact_phone: '' })
      fetchUtilityProviders()
    }
  }

  const handleEdit = (provider) => {
    setEditing(provider)
    setFormData({
      provider_name: provider.provider_name || '',
      state: provider.state || '',
      service_territory: provider.service_territory || '',
      has_rebate_program: provider.has_rebate_program !== false,
      rebate_program_url: provider.rebate_program_url || '',
      contact_phone: provider.contact_phone || ''
    })
    setShowModal(true)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Building size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Utility Providers</h1>
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={18} /> Add Provider
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: '20px', maxWidth: '400px' }}>
        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
        <input type="text" placeholder="Search providers..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '14px' }} />
      </div>

      <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.accentBg }}>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Provider Name</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>State</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Service Territory</th>
              <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Rebate Program</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Contact</th>
              <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredProviders.length === 0 ? (
              <tr><td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>No utility providers found</td></tr>
            ) : (
              filteredProviders.map(provider => (
                <tr key={provider.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                  <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '500', color: theme.text }}>{provider.provider_name}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary }}>{provider.state}</td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary }}>{provider.service_territory || '-'}</td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    {provider.has_rebate_program ? (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '500', backgroundColor: 'rgba(74,124,89,0.15)', color: '#4a7c59' }}>
                        <Check size={12} /> Yes
                      </span>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '4px 10px', borderRadius: '12px', fontSize: '12px', fontWeight: '500', backgroundColor: 'rgba(125,138,127,0.15)', color: '#7d8a7f' }}>
                        <X size={12} /> No
                      </span>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary }}>
                    {provider.contact_phone || '-'}
                    {provider.rebate_program_url && (
                      <a href={provider.rebate_program_url} target="_blank" rel="noopener noreferrer" style={{ marginLeft: '8px', color: theme.accent }}>
                        <ExternalLink size={14} />
                      </a>
                    )}
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                    <button onClick={() => handleEdit(provider)} style={{ padding: '6px 10px', backgroundColor: theme.accentBg, color: theme.accent, border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
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
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '20px' }}>{editing ? 'Edit' : 'Add'} Utility Provider</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Provider Name *</label>
                  <input type="text" value={formData.provider_name} onChange={(e) => setFormData({ ...formData, provider_name: e.target.value })} required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>State</label>
                    <input type="text" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Contact Phone</label>
                    <input type="text" value={formData.contact_phone} onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Service Territory</label>
                  <input type="text" value={formData.service_territory} onChange={(e) => setFormData({ ...formData, service_territory: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Rebate Program URL</label>
                  <input type="url" value={formData.rebate_program_url} onChange={(e) => setFormData({ ...formData, rebate_program_url: e.target.value })}
                    placeholder="https://..."
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={formData.has_rebate_program} onChange={(e) => setFormData({ ...formData, has_rebate_program: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                  <span style={{ fontSize: '14px', color: theme.text }}>Has Rebate Program</span>
                </label>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowModal(false); setEditing(null) }} style={{ padding: '10px 20px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>{editing ? 'Update' : 'Add'} Provider</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

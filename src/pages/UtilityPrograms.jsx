import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { FileStack, Plus, Edit, Search, DollarSign, Check, X } from 'lucide-react'

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

const programTypes = ['Prescriptive', 'Custom', 'Midstream', 'Direct Install', 'Financing']

export default function UtilityPrograms() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const utilityPrograms = useStore((state) => state.utilityPrograms)
  const utilityProviders = useStore((state) => state.utilityProviders)
  const fetchUtilityPrograms = useStore((state) => state.fetchUtilityPrograms)

  const [searchTerm, setSearchTerm] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing, setEditing] = useState(null)
  const [formData, setFormData] = useState({
    program_name: '',
    utility_provider_id: '',
    state: '',
    program_type: 'Prescriptive',
    effective_date: '',
    expiration_date: '',
    max_cap_percent: '',
    dlc_required: false,
    pre_approval_required: false
  })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchUtilityPrograms()
  }, [companyId, navigate, fetchUtilityPrograms])

  const filteredPrograms = utilityPrograms.filter(p => {
    const name = p.program_name?.toLowerCase() || ''
    const provider = p.utility_provider?.provider_name?.toLowerCase() || ''
    const search = searchTerm.toLowerCase()
    return name.includes(search) || provider.includes(search)
  })

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const data = {
      company_id: companyId,
      program_name: formData.program_name,
      utility_provider_id: formData.utility_provider_id || null,
      state: formData.state || null,
      program_type: formData.program_type,
      effective_date: formData.effective_date || null,
      expiration_date: formData.expiration_date || null,
      max_cap_percent: parseFloat(formData.max_cap_percent) || null,
      dlc_required: formData.dlc_required,
      pre_approval_required: formData.pre_approval_required
    }

    let error
    if (editing) {
      const result = await supabase.from('utility_programs').update(data).eq('id', editing.id)
      error = result.error
    } else {
      const result = await supabase.from('utility_programs').insert(data)
      error = result.error
    }

    if (error) {
      alert('Error saving: ' + error.message)
    } else {
      setShowModal(false)
      setEditing(null)
      setFormData({ program_name: '', utility_provider_id: '', state: '', program_type: 'Prescriptive', effective_date: '', expiration_date: '', max_cap_percent: '', dlc_required: false, pre_approval_required: false })
      fetchUtilityPrograms()
    }
  }

  const handleEdit = (program) => {
    setEditing(program)
    setFormData({
      program_name: program.program_name || '',
      utility_provider_id: program.utility_provider_id || '',
      state: program.state || '',
      program_type: program.program_type || 'Prescriptive',
      effective_date: program.effective_date || '',
      expiration_date: program.expiration_date || '',
      max_cap_percent: program.max_cap_percent || '',
      dlc_required: program.dlc_required || false,
      pre_approval_required: program.pre_approval_required || false
    })
    setShowModal(true)
  }

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <FileStack size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Utility Programs</h1>
        </div>
        <button onClick={() => setShowModal(true)} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 20px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>
          <Plus size={18} /> Add Program
        </button>
      </div>

      <div style={{ position: 'relative', marginBottom: '20px', maxWidth: '400px' }}>
        <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
        <input type="text" placeholder="Search programs..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: '100%', padding: '10px 12px 10px 40px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bgCard, color: theme.text, fontSize: '14px' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredPrograms.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>No utility programs found</div>
        ) : (
          filteredPrograms.map(program => (
            <div key={program.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>{program.program_name}</div>
                  <div style={{ fontSize: '13px', color: theme.textMuted }}>
                    {program.utility_provider?.provider_name || 'No Provider'} · {program.state || 'N/A'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <span style={{ padding: '4px 10px', borderRadius: '12px', fontSize: '11px', fontWeight: '600', backgroundColor: theme.accentBg, color: theme.accent }}>{program.program_type}</span>
                  <button onClick={() => handleEdit(program)} style={{ padding: '6px 10px', backgroundColor: theme.accentBg, color: theme.accent, border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
                    <Edit size={14} />
                  </button>
                  <button onClick={() => navigate(`/utility-programs/${program.id}/rates`)} style={{ padding: '6px 12px', backgroundColor: 'rgba(74,124,89,0.1)', color: '#4a7c59', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}>
                    <DollarSign size={14} style={{ marginRight: '4px' }} /> Rates
                  </button>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '12px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Effective Date</div>
                  <div style={{ fontSize: '13px', color: theme.text }}>{formatDate(program.effective_date)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Expiration Date</div>
                  <div style={{ fontSize: '13px', color: theme.text }}>{formatDate(program.expiration_date)}</div>
                </div>
                <div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>Max Cap</div>
                  <div style={{ fontSize: '13px', color: theme.text }}>{program.max_cap_percent ? `${program.max_cap_percent}%` : '-'}</div>
                </div>
                <div style={{ display: 'flex', gap: '12px' }}>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>DLC Req.</div>
                    <div>{program.dlc_required ? <Check size={16} style={{ color: '#4a7c59' }} /> : <X size={16} style={{ color: theme.textMuted }} />}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '11px', color: theme.textMuted }}>Pre-Approval</div>
                    <div>{program.pre_approval_required ? <Check size={16} style={{ color: '#4a7c59' }} /> : <X size={16} style={{ color: theme.textMuted }} />}</div>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ backgroundColor: theme.bgCard, borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px', maxHeight: '90vh', overflow: 'auto' }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '20px' }}>{editing ? 'Edit' : 'Add'} Utility Program</h2>
            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Program Name *</label>
                  <input type="text" value={formData.program_name} onChange={(e) => setFormData({ ...formData, program_name: e.target.value })} required
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Utility Provider</label>
                    <select value={formData.utility_provider_id} onChange={(e) => setFormData({ ...formData, utility_provider_id: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }}>
                      <option value="">Select Provider</option>
                      {utilityProviders.map(p => <option key={p.id} value={p.id}>{p.provider_name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>State</label>
                    <input type="text" value={formData.state} onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Program Type</label>
                  <select value={formData.program_type} onChange={(e) => setFormData({ ...formData, program_type: e.target.value })}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }}>
                    {programTypes.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Effective Date</label>
                    <input type="date" value={formData.effective_date} onChange={(e) => setFormData({ ...formData, effective_date: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Expiration Date</label>
                    <input type="date" value={formData.expiration_date} onChange={(e) => setFormData({ ...formData, expiration_date: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>Max Cap %</label>
                    <input type="number" min="0" max="100" value={formData.max_cap_percent} onChange={(e) => setFormData({ ...formData, max_cap_percent: e.target.value })}
                      style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.bg, color: theme.text, fontSize: '14px' }} />
                  </div>
                </div>
                <div style={{ display: 'flex', gap: '24px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.dlc_required} onChange={(e) => setFormData({ ...formData, dlc_required: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                    <span style={{ fontSize: '14px', color: theme.text }}>DLC Required</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
                    <input type="checkbox" checked={formData.pre_approval_required} onChange={(e) => setFormData({ ...formData, pre_approval_required: e.target.checked })} style={{ width: '18px', height: '18px' }} />
                    <span style={{ fontSize: '14px', color: theme.text }}>Pre-Approval Required</span>
                  </label>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button type="button" onClick={() => { setShowModal(false); setEditing(null) }} style={{ padding: '10px 20px', backgroundColor: theme.bg, color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#ffffff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>{editing ? 'Update' : 'Add'} Program</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

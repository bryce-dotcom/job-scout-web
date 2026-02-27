import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Pencil, Trash2, X, Gift, Search, DollarSign, CheckCircle, Clock } from 'lucide-react'

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
  'Pending': { bg: 'rgba(212,148,10,0.12)', color: '#d4940a' },
  'Submitted': { bg: 'rgba(90,155,213,0.12)', color: '#5a9bd5' },
  'Approved': { bg: 'rgba(74,124,89,0.12)', color: '#4a7c59' },
  'Paid': { bg: 'rgba(90,99,73,0.12)', color: '#5a6349' },
  'Rejected': { bg: 'rgba(194,90,90,0.12)', color: '#c25a5a' }
}

const INCENTIVE_STATUS = ['Pending', 'Submitted', 'Approved', 'Paid', 'Rejected']

const emptyIncentive = {
  job_id: '',
  utility_name: '',
  incentive_type: '',
  incentive_amount: '',
  status: 'Pending',
  submission_date: '',
  approval_date: '',
  payment_date: '',
  reference_number: '',
  notes: ''
}

export default function Incentives() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const incentives = useStore((state) => state.incentives)
  const jobs = useStore((state) => state.jobs)
  const utilityPrograms = useStore((state) => state.utilityPrograms)
  const fetchIncentives = useStore((state) => state.fetchIncentives)

  const [showModal, setShowModal] = useState(false)
  const [editingIncentive, setEditingIncentive] = useState(null)
  const [formData, setFormData] = useState(emptyIncentive)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchIncentives()
  }, [companyId, navigate, fetchIncentives])

  const filteredIncentives = incentives.filter(inc => {
    const matchesSearch = searchTerm === '' ||
      String(inc.job_id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.utility_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      inc.reference_number?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || inc.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const totalPending = filteredIncentives.filter(i => i.status === 'Pending' || i.status === 'Submitted').reduce((sum, i) => sum + (parseFloat(i.incentive_amount) || 0), 0)
  const totalPaid = filteredIncentives.filter(i => i.status === 'Paid').reduce((sum, i) => sum + (parseFloat(i.incentive_amount) || 0), 0)

  const openAddModal = () => {
    setEditingIncentive(null)
    setFormData(emptyIncentive)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (incentive) => {
    setEditingIncentive(incentive)
    setFormData({
      job_id: incentive.job_id || '',
      utility_name: incentive.utility_name || '',
      incentive_type: incentive.incentive_type || '',
      incentive_amount: incentive.incentive_amount || '',
      status: incentive.status || 'Pending',
      submission_date: incentive.submission_date || '',
      approval_date: incentive.approval_date || '',
      payment_date: incentive.payment_date || '',
      reference_number: incentive.reference_number || '',
      notes: incentive.notes || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingIncentive(null)
    setFormData(emptyIncentive)
    setError(null)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      company_id: companyId,
      job_id: formData.job_id || null,
      incentive_amount: parseFloat(formData.incentive_amount) || 0,
      utility_name: formData.utility_name || null,
      status: formData.status,
      notes: formData.notes || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingIncentive) {
      result = await supabase.from('incentives').update(payload).eq('id', editingIncentive.id)
    } else {
      result = await supabase.from('incentives').insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchIncentives()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (incentive) => {
    if (!confirm(`Delete this incentive record?`)) return
    await supabase.from('incentives').delete().eq('id', incentive.id)
    await fetchIncentives()
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString()
  }

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

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
          Incentives & Rebates
        </h1>
        <button
          onClick={openAddModal}
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
          Add Incentive
        </button>
      </div>

      {/* Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'rgba(212,148,10,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Clock size={24} style={{ color: '#d4940a' }} />
            </div>
            <div>
              <p style={{ fontSize: '13px', color: theme.textMuted }}>Pending</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: '#d4940a' }}>
                {formatCurrency(totalPending)}
              </p>
            </div>
          </div>
        </div>
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '20px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{
              width: '48px',
              height: '48px',
              borderRadius: '12px',
              backgroundColor: 'rgba(74,124,89,0.12)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <CheckCircle size={24} style={{ color: '#4a7c59' }} />
            </div>
            <div>
              <p style={{ fontSize: '13px', color: theme.textMuted }}>Paid</p>
              <p style={{ fontSize: '24px', fontWeight: '700', color: '#4a7c59' }}>
                {formatCurrency(totalPaid)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap',
        alignItems: 'center'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.textMuted
          }} />
          <input
            type="text"
            placeholder="Search incentives..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ ...inputStyle, paddingLeft: '40px' }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{ ...inputStyle, width: 'auto', minWidth: '150px' }}
        >
          <option value="all">All Statuses</option>
          {INCENTIVE_STATUS.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      {filteredIncentives.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <Gift size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
            No incentives found. Add your first rebate or incentive.
          </p>
        </div>
      ) : (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'hidden'
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr 100px 100px 80px',
            gap: '16px',
            padding: '14px 20px',
            backgroundColor: theme.accentBg,
            borderBottom: `1px solid ${theme.border}`,
            fontSize: '12px',
            fontWeight: '600',
            color: theme.textMuted,
            textTransform: 'uppercase'
          }}>
            <div>Job / Program</div>
            <div>Type</div>
            <div style={{ textAlign: 'right' }}>Amount</div>
            <div>Status</div>
            <div style={{ textAlign: 'right' }}>Actions</div>
          </div>

          {filteredIncentives.map((incentive) => {
            const statusStyle = statusColors[incentive.status] || statusColors['Pending']
            return (
              <div
                key={incentive.id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 100px 100px 80px',
                  gap: '16px',
                  padding: '16px 20px',
                  borderBottom: `1px solid ${theme.border}`,
                  alignItems: 'center'
                }}
              >
                <div>
                  <p style={{ fontWeight: '500', color: theme.text, fontSize: '14px' }}>
                    {incentive.job_id || 'No Job'}
                  </p>
                  <p style={{ fontSize: '12px', color: theme.textMuted }}>
                    {incentive.utility_name || '-'}
                  </p>
                </div>
                <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                  {incentive.incentive_type || '-'}
                </div>
                <div style={{ textAlign: 'right', fontWeight: '600', color: theme.text }}>
                  {formatCurrency(incentive.incentive_amount)}
                </div>
                <div>
                  <span style={{
                    padding: '4px 10px',
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.color,
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {incentive.status}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '4px' }}>
                  <button
                    onClick={() => openEditModal(incentive)}
                    style={{
                      padding: '8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: theme.textMuted
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(incentive)}
                    style={{
                      padding: '8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      color: theme.textMuted
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Modal */}
      {showModal && (
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
            maxWidth: '550px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`
            }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
                {editingIncentive ? 'Edit Incentive' : 'New Incentive'}
              </h2>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', padding: '8px', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              {error && (
                <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#dc2626', fontSize: '14px' }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Job</label>
                    <select name="job_id" value={formData.job_id} onChange={handleChange} style={inputStyle}>
                      <option value="">Select job</option>
                      {jobs.map(job => (
                        <option key={job.id} value={job.id}>{job.job_id} - {job.job_title}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Utility Name</label>
                    <input type="text" name="utility_name" value={formData.utility_name} onChange={handleChange} style={inputStyle} placeholder="Utility name" />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Incentive Type</label>
                    <select name="incentive_type" value={formData.incentive_type} onChange={handleChange} style={inputStyle}>
                      <option value="">Select type</option>
                      <option value="Rebate">Rebate</option>
                      <option value="Tax Credit">Tax Credit</option>
                      <option value="Grant">Grant</option>
                      <option value="Discount">Discount</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Amount *</label>
                    <input type="number" name="incentive_amount" value={formData.incentive_amount} onChange={handleChange} step="0.01" required style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select name="status" value={formData.status} onChange={handleChange} style={inputStyle}>
                      {INCENTIVE_STATUS.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Reference #</label>
                    <input type="text" name="reference_number" value={formData.reference_number} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Submitted</label>
                    <input type="date" name="submission_date" value={formData.submission_date} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Approved</label>
                    <input type="date" name="approval_date" value={formData.approval_date} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Paid</label>
                    <input type="date" name="payment_date" value={formData.payment_date} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="button" onClick={closeModal} style={{
                  flex: 1, padding: '10px 16px', border: `1px solid ${theme.border}`,
                  backgroundColor: 'transparent', color: theme.text, borderRadius: '8px', fontSize: '14px', cursor: 'pointer'
                }}>
                  Cancel
                </button>
                <button type="submit" disabled={loading} style={{
                  flex: 1, padding: '10px 16px', backgroundColor: theme.accent, color: '#ffffff',
                  border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500',
                  cursor: loading ? 'not-allowed' : 'pointer', opacity: loading ? 0.6 : 1
                }}>
                  {loading ? 'Saving...' : (editingIncentive ? 'Update' : 'Add Incentive')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

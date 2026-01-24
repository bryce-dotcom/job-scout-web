import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, X, DollarSign, User, ChevronRight, ChevronLeft, Target } from 'lucide-react'

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

const stages = [
  { id: 'New Lead', label: 'New Lead', color: '#5a6349' },
  { id: 'Quoted', label: 'Quoted', color: '#7c6f4a' },
  { id: 'Under Review', label: 'Under Review', color: '#8b7355' },
  { id: 'Approved', label: 'Approved', color: '#4a7c59' },
  { id: 'Lost', label: 'Lost', color: '#8b5a5a' },
  { id: 'Not Ready', label: 'Not Ready', color: '#6b6b6b' }
]

export default function SalesPipeline() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const salesPipeline = useStore((state) => state.salesPipeline)
  const leads = useStore((state) => state.leads)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const fetchSalesPipeline = useStore((state) => state.fetchSalesPipeline)

  const [showModal, setShowModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [formData, setFormData] = useState({
    lead_id: '',
    customer_id: '',
    salesperson_id: '',
    stage: 'New Lead',
    quote_amount: '',
    quote_status: '',
    contract_required: false,
    contract_signed: false,
    notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchSalesPipeline()
  }, [companyId, navigate, fetchSalesPipeline])

  const getItemsByStage = (stageId) => {
    return salesPipeline.filter(item => item.stage === stageId)
  }

  const moveToStage = async (item, newStage) => {
    await supabase
      .from('sales_pipeline')
      .update({ stage: newStage, updated_at: new Date().toISOString() })
      .eq('id', item.id)

    await fetchSalesPipeline()
  }

  const openAddModal = () => {
    setEditingItem(null)
    setFormData({
      lead_id: '',
      customer_id: '',
      salesperson_id: '',
      stage: 'New Lead',
      quote_amount: '',
      quote_status: '',
      contract_required: false,
      contract_signed: false,
      notes: ''
    })
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (item) => {
    setEditingItem(item)
    setFormData({
      lead_id: item.lead_id || '',
      customer_id: item.customer_id || '',
      salesperson_id: item.salesperson_id || '',
      stage: item.stage || 'New Lead',
      quote_amount: item.quote_amount || '',
      quote_status: item.quote_status || '',
      contract_required: item.contract_required || false,
      contract_signed: item.contract_signed || false,
      notes: item.notes || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingItem(null)
    setError(null)
  }

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const payload = {
      company_id: companyId,
      lead_id: formData.lead_id || null,
      customer_id: formData.customer_id || null,
      salesperson_id: formData.salesperson_id || null,
      stage: formData.stage,
      quote_amount: formData.quote_amount || null,
      quote_status: formData.quote_status || null,
      contract_required: formData.contract_required,
      contract_signed: formData.contract_signed,
      notes: formData.notes,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingItem) {
      result = await supabase
        .from('sales_pipeline')
        .update(payload)
        .eq('id', editingItem.id)
    } else {
      result = await supabase
        .from('sales_pipeline')
        .insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchSalesPipeline()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async () => {
    if (!editingItem || !confirm('Delete this pipeline item?')) return

    await supabase.from('sales_pipeline').delete().eq('id', editingItem.id)
    await fetchSalesPipeline()
    closeModal()
  }

  const formatCurrency = (amount) => {
    if (!amount) return ''
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
  }

  const totalByStage = (stageId) => {
    return getItemsByStage(stageId).reduce((sum, item) => sum + (parseFloat(item.quote_amount) || 0), 0)
  }

  // Styles
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
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: theme.text
        }}>
          Sales Pipeline
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
          Add Deal
        </button>
      </div>

      {/* Pipeline Summary */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '12px',
        marginBottom: '24px'
      }}>
        {stages.slice(0, 4).map((stage) => (
          <div
            key={stage.id}
            style={{
              backgroundColor: theme.bgCard,
              borderRadius: '12px',
              border: `1px solid ${theme.border}`,
              padding: '16px',
              textAlign: 'center'
            }}
          >
            <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>{stage.label}</p>
            <p style={{ fontSize: '20px', fontWeight: '600', color: theme.text }}>
              {getItemsByStage(stage.id).length}
            </p>
            {totalByStage(stage.id) > 0 && (
              <p style={{ fontSize: '12px', color: theme.accent, marginTop: '4px' }}>
                {formatCurrency(totalByStage(stage.id))}
              </p>
            )}
          </div>
        ))}
      </div>

      {/* Kanban Board */}
      <div style={{
        display: 'flex',
        gap: '16px',
        overflowX: 'auto',
        paddingBottom: '16px'
      }}>
        {stages.map((stage) => (
          <div key={stage.id} style={{ flexShrink: 0, width: '280px' }}>
            {/* Column Header */}
            <div style={{
              backgroundColor: stage.color,
              color: '#ffffff',
              padding: '12px 16px',
              borderRadius: '12px 12px 0 0'
            }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{ fontWeight: '500', fontSize: '14px' }}>{stage.label}</span>
                <span style={{
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  padding: '2px 8px',
                  borderRadius: '12px',
                  fontSize: '12px'
                }}>
                  {getItemsByStage(stage.id).length}
                </span>
              </div>
              {totalByStage(stage.id) > 0 && (
                <p style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>
                  {formatCurrency(totalByStage(stage.id))}
                </p>
              )}
            </div>

            {/* Column Content */}
            <div style={{
              backgroundColor: theme.accentBg,
              padding: '12px',
              borderRadius: '0 0 12px 12px',
              minHeight: '400px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px'
            }}>
              {getItemsByStage(stage.id).map((item) => (
                <div
                  key={item.id}
                  onClick={() => openEditModal(item)}
                  style={{
                    backgroundColor: theme.bgCard,
                    borderRadius: '10px',
                    padding: '14px',
                    border: `1px solid ${theme.border}`,
                    cursor: 'pointer',
                    transition: 'box-shadow 0.2s'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)'}
                  onMouseLeave={(e) => e.currentTarget.style.boxShadow = 'none'}
                >
                  <h4 style={{
                    fontWeight: '500',
                    color: theme.text,
                    fontSize: '14px',
                    marginBottom: '6px'
                  }}>
                    {item.lead?.customer_name || item.customer?.name || 'Unnamed'}
                  </h4>

                  {item.quote_amount && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: '#4a7c59',
                      fontSize: '13px',
                      marginBottom: '8px'
                    }}>
                      <DollarSign size={14} />
                      <span>{formatCurrency(item.quote_amount)}</span>
                    </div>
                  )}

                  {item.salesperson && (
                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      color: theme.textMuted,
                      fontSize: '12px'
                    }}>
                      <User size={12} />
                      <span>{item.salesperson.name}</span>
                    </div>
                  )}

                  {/* Stage navigation */}
                  <div style={{
                    display: 'flex',
                    gap: '6px',
                    marginTop: '12px',
                    paddingTop: '10px',
                    borderTop: `1px solid ${theme.border}`
                  }}>
                    {stages.map((s, idx) => {
                      const currentIdx = stages.findIndex(st => st.id === item.stage)
                      const isNext = idx === currentIdx + 1
                      const isPrev = idx === currentIdx - 1

                      if (!isNext && !isPrev) return null

                      return (
                        <button
                          key={s.id}
                          onClick={(e) => {
                            e.stopPropagation()
                            moveToStage(item, s.id)
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '4px',
                            padding: '4px 8px',
                            fontSize: '11px',
                            borderRadius: '6px',
                            border: 'none',
                            cursor: 'pointer',
                            backgroundColor: isNext ? theme.accentBg : 'rgba(0,0,0,0.04)',
                            color: isNext ? theme.accent : theme.textMuted
                          }}
                        >
                          {isPrev && <ChevronLeft size={12} />}
                          {s.label}
                          {isNext && <ChevronRight size={12} />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}

              {getItemsByStage(stage.id).length === 0 && (
                <div style={{
                  textAlign: 'center',
                  padding: '32px 16px',
                  color: theme.textMuted,
                  fontSize: '13px'
                }}>
                  <Target size={24} style={{ opacity: 0.4, marginBottom: '8px' }} />
                  <p>No deals</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

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
            maxWidth: '480px',
            maxHeight: '90vh',
            overflowY: 'auto'
          }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '20px',
              borderBottom: `1px solid ${theme.border}`,
              position: 'sticky',
              top: 0,
              backgroundColor: theme.bgCard,
              borderRadius: '16px 16px 0 0'
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: theme.text
              }}>
                {editingItem ? 'Edit Deal' : 'Add Deal'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '8px',
                  cursor: 'pointer',
                  color: theme.textMuted,
                  borderRadius: '8px'
                }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} style={{ padding: '20px' }}>
              {error && (
                <div style={{
                  marginBottom: '16px',
                  padding: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1px solid #fecaca',
                  borderRadius: '8px',
                  color: '#dc2626',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={labelStyle}>Lead</label>
                  <select
                    name="lead_id"
                    value={formData.lead_id}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select Lead --</option>
                    {leads.filter(l => l.status !== 'Not Qualified').map(lead => (
                      <option key={lead.id} value={lead.id}>{lead.customer_name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={labelStyle}>Customer</label>
                  <select
                    name="customer_id"
                    value={formData.customer_id}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="">-- Select Customer --</option>
                    {customers.map(cust => (
                      <option key={cust.id} value={cust.id}>{cust.name}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Stage</label>
                    <select
                      name="stage"
                      value={formData.stage}
                      onChange={handleChange}
                      style={inputStyle}
                    >
                      {stages.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>Salesperson</label>
                    <select
                      name="salesperson_id"
                      value={formData.salesperson_id}
                      onChange={handleChange}
                      style={inputStyle}
                    >
                      <option value="">-- Select --</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Quote Amount</label>
                    <input
                      type="number"
                      name="quote_amount"
                      value={formData.quote_amount}
                      onChange={handleChange}
                      step="0.01"
                      style={inputStyle}
                    />
                  </div>

                  <div>
                    <label style={labelStyle}>Quote Status</label>
                    <select
                      name="quote_status"
                      value={formData.quote_status}
                      onChange={handleChange}
                      style={inputStyle}
                    >
                      <option value="">-- Select --</option>
                      <option value="Draft">Draft</option>
                      <option value="Sent">Sent</option>
                      <option value="Viewed">Viewed</option>
                      <option value="Accepted">Accepted</option>
                      <option value="Declined">Declined</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '24px' }}>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      name="contract_required"
                      checked={formData.contract_required}
                      onChange={handleChange}
                      style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                    />
                    <span style={{ fontSize: '14px', color: theme.text }}>Contract Required</span>
                  </label>

                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer'
                  }}>
                    <input
                      type="checkbox"
                      name="contract_signed"
                      checked={formData.contract_signed}
                      onChange={handleChange}
                      style={{ width: '16px', height: '16px', accentColor: theme.accent }}
                    />
                    <span style={{ fontSize: '14px', color: theme.text }}>Contract Signed</span>
                  </label>
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea
                    name="notes"
                    value={formData.notes}
                    onChange={handleChange}
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical' }}
                  />
                </div>
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px'
              }}>
                {editingItem && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    style={{
                      padding: '10px 16px',
                      color: '#dc2626',
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderRadius: '8px',
                      fontSize: '14px',
                      cursor: 'pointer'
                    }}
                  >
                    Delete
                  </button>
                )}
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: 'transparent',
                    color: theme.text,
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '10px 16px',
                    backgroundColor: theme.accent,
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.6 : 1
                  }}
                >
                  {loading ? 'Saving...' : (editingItem ? 'Update' : 'Add Deal')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

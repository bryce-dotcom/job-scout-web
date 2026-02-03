import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { Plus, Pencil, Trash2, X, User, Phone, Mail, Building2, Search } from 'lucide-react'

const emptyCustomer = {
  name: '',
  business_name: '',
  email: '',
  phone: '',
  address: '',
  job_title: '',
  salesperson_id: '',
  status: 'Active',
  preferred_contact: 'Phone',
  notes: '',
  secondary_contact_name: '',
  secondary_contact_email: '',
  secondary_contact_phone: '',
  secondary_contact_role: '',
  marketing_opt_in: false
}

export default function Customers() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const fetchCustomers = useStore((state) => state.fetchCustomers)

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || {
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

  const [showModal, setShowModal] = useState(false)
  const [editingCustomer, setEditingCustomer] = useState(null)
  const [formData, setFormData] = useState(emptyCustomer)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  // Guard clause - redirect if no company
  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchCustomers()
  }, [companyId, navigate, fetchCustomers])

  const filteredCustomers = customers.filter(customer => {
    const matchesSearch = searchTerm === '' ||
      customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.business_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase())

    const matchesStatus = statusFilter === 'all' || customer.status === statusFilter

    return matchesSearch && matchesStatus
  })

  const openAddModal = () => {
    setEditingCustomer(null)
    setFormData(emptyCustomer)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (customer) => {
    setEditingCustomer(customer)
    setFormData({
      name: customer.name || '',
      business_name: customer.business_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      job_title: customer.job_title || '',
      salesperson_id: customer.salesperson_id || '',
      status: customer.status || 'Active',
      preferred_contact: customer.preferred_contact || 'Phone',
      notes: customer.notes || '',
      secondary_contact_name: customer.secondary_contact_name || '',
      secondary_contact_email: customer.secondary_contact_email || '',
      secondary_contact_phone: customer.secondary_contact_phone || '',
      secondary_contact_role: customer.secondary_contact_role || '',
      marketing_opt_in: customer.marketing_opt_in || false
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingCustomer(null)
    setFormData(emptyCustomer)
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
      ...formData,
      company_id: companyId,
      salesperson_id: formData.salesperson_id || null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingCustomer) {
      result = await supabase
        .from('customers')
        .update(payload)
        .eq('id', editingCustomer.id)
    } else {
      result = await supabase
        .from('customers')
        .insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchCustomers()
    closeModal()
    setLoading(false)
  }

  // Soft delete - set status to Inactive
  const handleDelete = async (customer) => {
    if (!confirm(`Are you sure you want to deactivate ${customer.name}?`)) return

    const { error } = await supabase
      .from('customers')
      .update({ status: 'Inactive', updated_at: new Date().toISOString() })
      .eq('id', customer.id)

    if (!error) {
      await fetchCustomers()
    }
  }

  const getStatusStyle = (status) => {
    switch (status) {
      case 'Active':
        return { backgroundColor: 'rgba(34,197,94,0.1)', color: '#16a34a' }
      case 'Inactive':
        return { backgroundColor: theme.bg, color: theme.textMuted }
      case 'Prospect':
        return { backgroundColor: 'rgba(234,179,8,0.1)', color: '#ca8a04' }
      default:
        return { backgroundColor: theme.bg, color: theme.textMuted }
    }
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none'
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: theme.text
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <h1 style={{
          fontSize: '24px',
          fontWeight: '700',
          color: theme.text
        }}>
          Customers
        </h1>
        <button
          onClick={openAddModal}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            backgroundColor: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'pointer'
          }}
        >
          <Plus size={20} />
          Add Customer
        </button>
      </div>

      {/* Search and Filter */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: 1, minWidth: '200px' }}>
          <Search
            size={20}
            style={{
              position: 'absolute',
              left: '12px',
              top: '50%',
              transform: 'translateY(-50%)',
              color: theme.textMuted
            }}
          />
          <input
            type="text"
            placeholder="Search customers..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              ...inputStyle,
              paddingLeft: '40px',
              backgroundColor: theme.bgCard
            }}
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            ...inputStyle,
            width: 'auto',
            minWidth: '140px',
            backgroundColor: theme.bgCard
          }}
        >
          <option value="all">All Status</option>
          <option value="Active">Active</option>
          <option value="Inactive">Inactive</option>
          <option value="Prospect">Prospect</option>
        </select>
      </div>

      {/* Customer List */}
      {filteredCustomers.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <Building2 size={48} style={{ color: theme.textMuted, marginBottom: '16px' }} />
          <p style={{ color: theme.textSecondary }}>
            {searchTerm || statusFilter !== 'all'
              ? 'No customers match your search.'
              : 'No customers yet. Add your first customer to get started.'}
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
          gap: '16px'
        }}>
          {filteredCustomers.map((customer) => (
            <div
              key={customer.id}
              onClick={() => navigate(`/customers/${customer.id}`)}
              style={{
                backgroundColor: theme.bgCard,
                borderRadius: '12px',
                border: `1px solid ${theme.border}`,
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.15s ease'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = theme.bgCardHover
                e.currentTarget.style.borderColor = theme.textMuted
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = theme.bgCard
                e.currentTarget.style.borderColor = theme.border
              }}
            >
              <div style={{
                display: 'flex',
                alignItems: 'flex-start',
                justifyContent: 'space-between',
                marginBottom: '16px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{
                    width: '48px',
                    height: '48px',
                    backgroundColor: theme.accentBg,
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <User size={24} style={{ color: theme.accent }} />
                  </div>
                  <div>
                    <h3 style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: theme.text,
                      marginBottom: '2px'
                    }}>
                      {customer.name}
                    </h3>
                    {customer.business_name && (
                      <p style={{
                        fontSize: '14px',
                        color: theme.textSecondary
                      }}>
                        {customer.business_name}
                      </p>
                    )}
                  </div>
                </div>
                <div
                  style={{ display: 'flex', gap: '4px' }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => openEditModal(customer)}
                    style={{
                      padding: '8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: theme.textMuted,
                      cursor: 'pointer',
                      borderRadius: '6px'
                    }}
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(customer)}
                    style={{
                      padding: '8px',
                      backgroundColor: 'transparent',
                      border: 'none',
                      color: theme.textMuted,
                      cursor: 'pointer',
                      borderRadius: '6px'
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {customer.email && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    color: theme.textSecondary
                  }}>
                    <Mail size={14} />
                    <span style={{
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap'
                    }}>
                      {customer.email}
                    </span>
                  </div>
                )}
                {customer.phone && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    fontSize: '14px',
                    color: theme.textSecondary
                  }}>
                    <Phone size={14} />
                    <span>{customer.phone}</span>
                  </div>
                )}
              </div>

              <div style={{
                marginTop: '16px',
                paddingTop: '16px',
                borderTop: `1px solid ${theme.border}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <span style={{
                  fontSize: '12px',
                  padding: '4px 10px',
                  borderRadius: '20px',
                  ...getStatusStyle(customer.status)
                }}>
                  {customer.status}
                </span>
                {customer.salesperson && (
                  <span style={{
                    fontSize: '12px',
                    color: theme.textMuted
                  }}>
                    {customer.salesperson.name}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <>
          <div
            onClick={closeModal}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.3)',
              zIndex: 50
            }}
          />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            border: `1px solid ${theme.border}`,
            width: '100%',
            maxWidth: '640px',
            maxHeight: '90vh',
            overflow: 'auto',
            zIndex: 51
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
              zIndex: 1
            }}>
              <h2 style={{
                fontSize: '18px',
                fontWeight: '600',
                color: theme.text
              }}>
                {editingCustomer ? 'Edit Customer' : 'Add Customer'}
              </h2>
              <button
                onClick={closeModal}
                style={{
                  padding: '4px',
                  backgroundColor: 'transparent',
                  border: 'none',
                  color: theme.textMuted,
                  cursor: 'pointer'
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
                  backgroundColor: 'rgba(220,38,38,0.08)',
                  border: '1px solid rgba(220,38,38,0.2)',
                  borderRadius: '8px',
                  color: '#b91c1c',
                  fontSize: '14px'
                }}>
                  {error}
                </div>
              )}

              {/* Primary Contact */}
              <h3 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: theme.text,
                marginBottom: '16px',
                paddingBottom: '8px',
                borderBottom: `1px solid ${theme.border}`
              }}>
                Primary Contact
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px',
                marginBottom: '16px'
              }}>
                <div>
                  <label style={labelStyle}>Name *</label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleChange}
                    required
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Business Name</label>
                  <input
                    type="text"
                    name="business_name"
                    value={formData.business_name}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Job Title</label>
                  <input
                    type="text"
                    name="job_title"
                    value={formData.job_title}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Preferred Contact</label>
                  <select
                    name="preferred_contact"
                    value={formData.preferred_contact}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                    <option value="Text">Text</option>
                  </select>
                </div>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Address</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows={2}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Secondary Contact */}
              <h3 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: theme.text,
                marginBottom: '16px',
                paddingBottom: '8px',
                borderBottom: `1px solid ${theme.border}`
              }}>
                Secondary Contact
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px',
                marginBottom: '24px'
              }}>
                <div>
                  <label style={labelStyle}>Name</label>
                  <input
                    type="text"
                    name="secondary_contact_name"
                    value={formData.secondary_contact_name}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Role</label>
                  <input
                    type="text"
                    name="secondary_contact_role"
                    value={formData.secondary_contact_role}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Email</label>
                  <input
                    type="email"
                    name="secondary_contact_email"
                    value={formData.secondary_contact_email}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label style={labelStyle}>Phone</label>
                  <input
                    type="tel"
                    name="secondary_contact_phone"
                    value={formData.secondary_contact_phone}
                    onChange={handleChange}
                    style={inputStyle}
                  />
                </div>
              </div>

              {/* Status & Assignment */}
              <h3 style={{
                fontSize: '14px',
                fontWeight: '600',
                color: theme.text,
                marginBottom: '16px',
                paddingBottom: '8px',
                borderBottom: `1px solid ${theme.border}`
              }}>
                Status & Assignment
              </h3>

              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: '16px',
                marginBottom: '16px'
              }}>
                <div>
                  <label style={labelStyle}>Status</label>
                  <select
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                    style={inputStyle}
                  >
                    <option value="Active">Active</option>
                    <option value="Inactive">Inactive</option>
                    <option value="Prospect">Prospect</option>
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
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>{emp.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                marginBottom: '16px'
              }}>
                <input
                  type="checkbox"
                  name="marketing_opt_in"
                  id="marketing_opt_in"
                  checked={formData.marketing_opt_in}
                  onChange={handleChange}
                  style={{ accentColor: theme.accent }}
                />
                <label
                  htmlFor="marketing_opt_in"
                  style={{ fontSize: '14px', color: theme.text }}
                >
                  Marketing opt-in
                </label>
              </div>

              <div style={{ marginBottom: '24px' }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  name="notes"
                  value={formData.notes}
                  onChange={handleChange}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* Buttons */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  type="button"
                  onClick={closeModal}
                  style={{
                    flex: 1,
                    padding: '12px',
                    backgroundColor: 'transparent',
                    border: `1px solid ${theme.border}`,
                    borderRadius: '8px',
                    color: theme.textSecondary,
                    fontSize: '14px',
                    fontWeight: '500',
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
                    padding: '12px',
                    backgroundColor: theme.accent,
                    border: 'none',
                    borderRadius: '8px',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  {loading ? 'Saving...' : (editingCustomer ? 'Update' : 'Add Customer')}
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  )
}

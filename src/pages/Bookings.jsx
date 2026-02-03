import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { BOOKING_STATUS } from '../lib/schema'
import { Plus, Pencil, Trash2, X, CalendarCheck, Search, Phone, Mail, MapPin } from 'lucide-react'

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
  'Confirmed': { bg: 'rgba(90,155,213,0.12)', color: '#5a9bd5' },
  'Scheduled': { bg: 'rgba(74,124,89,0.12)', color: '#4a7c59' },
  'Cancelled': { bg: 'rgba(194,90,90,0.12)', color: '#c25a5a' }
}

const emptyBooking = {
  customer_name: '',
  email: '',
  phone: '',
  address: '',
  service_type: '',
  business_unit: '',
  preferred_date: '',
  status: 'Pending',
  notes: ''
}

export default function Bookings() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const bookings = useStore((state) => state.bookings)
  const serviceTypes = useStore((state) => state.serviceTypes)
  const fetchBookings = useStore((state) => state.fetchBookings)

  const [showModal, setShowModal] = useState(false)
  const [editingBooking, setEditingBooking] = useState(null)
  const [formData, setFormData] = useState(emptyBooking)
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
    fetchBookings()
  }, [companyId, navigate, fetchBookings])

  const filteredBookings = bookings.filter(booking => {
    const matchesSearch = searchTerm === '' ||
      booking.customer_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      booking.phone?.includes(searchTerm)
    const matchesStatus = statusFilter === 'all' || booking.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const openAddModal = () => {
    setEditingBooking(null)
    setFormData(emptyBooking)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (booking) => {
    setEditingBooking(booking)
    setFormData({
      customer_name: booking.customer_name || '',
      email: booking.email || '',
      phone: booking.phone || '',
      address: booking.address || '',
      service_type: booking.service_type || '',
      business_unit: booking.business_unit || '',
      preferred_date: booking.preferred_date || '',
      status: booking.status || 'Pending',
      notes: booking.notes || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingBooking(null)
    setFormData(emptyBooking)
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
      customer_name: formData.customer_name,
      email: formData.email || null,
      phone: formData.phone || null,
      address: formData.address || null,
      service_type: formData.service_type || null,
      business_unit: formData.business_unit || null,
      preferred_date: formData.preferred_date || null,
      status: formData.status,
      notes: formData.notes || null,
      updated_at: new Date().toISOString()
    }

    // Generate booking_id for new bookings
    if (!editingBooking) {
      payload.booking_id = `BK-${Date.now().toString(36).toUpperCase()}`
    }

    let result
    if (editingBooking) {
      result = await supabase.from('bookings').update(payload).eq('id', editingBooking.id)
    } else {
      result = await supabase.from('bookings').insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchBookings()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (booking) => {
    if (!confirm(`Delete booking for ${booking.customer_name}?`)) return
    await supabase.from('bookings').delete().eq('id', booking.id)
    await fetchBookings()
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
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
    <div style={{ padding: '24px' }}>
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
          Bookings
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
          Add Booking
        </button>
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
            placeholder="Search bookings..."
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
          {BOOKING_STATUS.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      {/* Bookings Grid */}
      {filteredBookings.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <CalendarCheck size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
            No bookings found. Create your first booking request.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px'
        }}>
          {filteredBookings.map((booking) => {
            const statusStyle = statusColors[booking.status] || statusColors['Pending']
            return (
              <div
                key={booking.id}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '12px',
                  border: `1px solid ${theme.border}`,
                  padding: '20px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <div>
                    <p style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px' }}>
                      {booking.booking_id}
                    </p>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                      {booking.customer_name}
                    </h3>
                  </div>
                  <span style={{
                    padding: '4px 10px',
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.color,
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {booking.status}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
                  {booking.email && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                      <Mail size={14} />
                      {booking.email}
                    </div>
                  )}
                  {booking.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                      <Phone size={14} />
                      {booking.phone}
                    </div>
                  )}
                  {booking.address && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                      <MapPin size={14} />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {booking.address}
                      </span>
                    </div>
                  )}
                </div>

                {booking.service_type && (
                  <div style={{ marginBottom: '12px' }}>
                    <span style={{
                      display: 'inline-block',
                      padding: '4px 10px',
                      backgroundColor: theme.accentBg,
                      color: theme.accent,
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      {booking.service_type}
                    </span>
                  </div>
                )}

                {booking.preferred_date && (
                  <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                    Preferred: {formatDate(booking.preferred_date)}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '8px', borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
                  <button
                    onClick={() => openEditModal(booking)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '8px',
                      backgroundColor: theme.accentBg,
                      border: 'none',
                      borderRadius: '6px',
                      color: theme.accent,
                      fontSize: '13px',
                      cursor: 'pointer'
                    }}
                  >
                    <Pencil size={14} /> Edit
                  </button>
                  <button
                    onClick={() => handleDelete(booking)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'rgba(194,90,90,0.1)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#c25a5a',
                      cursor: 'pointer'
                    }}
                  >
                    <Trash2 size={14} />
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
            maxWidth: '500px',
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
                {editingBooking ? 'Edit Booking' : 'New Booking'}
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
                <div>
                  <label style={labelStyle}>Customer Name *</label>
                  <input type="text" name="customer_name" value={formData.customer_name} onChange={handleChange} required style={inputStyle} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Email</label>
                    <input type="email" name="email" value={formData.email} onChange={handleChange} style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Phone</label>
                    <input type="tel" name="phone" value={formData.phone} onChange={handleChange} style={inputStyle} />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Address</label>
                  <input type="text" name="address" value={formData.address} onChange={handleChange} style={inputStyle} />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Service Type</label>
                    <select name="service_type" value={formData.service_type} onChange={handleChange} style={inputStyle}>
                      <option value="">-- Select --</option>
                      {serviceTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select name="status" value={formData.status} onChange={handleChange} style={inputStyle}>
                      {BOOKING_STATUS.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Preferred Date</label>
                  <input type="date" name="preferred_date" value={formData.preferred_date} onChange={handleChange} style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Notes</label>
                  <textarea name="notes" value={formData.notes} onChange={handleChange} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
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
                  {loading ? 'Saving...' : (editingBooking ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

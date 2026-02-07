import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { ROUTE_STATUS } from '../lib/schema'
import { Plus, Pencil, Trash2, X, Route, Search, Calendar, Truck, User, MapPin } from 'lucide-react'

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
  'Planned': { bg: 'rgba(90,155,213,0.12)', color: '#5a9bd5' },
  'In Progress': { bg: 'rgba(212,148,10,0.12)', color: '#d4940a' },
  'Completed': { bg: 'rgba(74,124,89,0.12)', color: '#4a7c59' },
  'Cancelled': { bg: 'rgba(194,90,90,0.12)', color: '#c25a5a' }
}

const emptyRoute = {
  route_id: '',
  date: new Date().toISOString().split('T')[0],
  team: '',
  status: 'Planned',
  total_distance: '',
  total_time: ''
}

export default function RoutesPage() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const routes = useStore((state) => state.routes)
  const employees = useStore((state) => state.employees)
  const fleet = useStore((state) => state.fleet)
  const fetchRoutes = useStore((state) => state.fetchRoutes)

  const [showModal, setShowModal] = useState(false)
  const [editingRoute, setEditingRoute] = useState(null)
  const [formData, setFormData] = useState(emptyRoute)
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
    fetchRoutes()
  }, [companyId, navigate, fetchRoutes])

  const filteredRoutes = routes.filter(route => {
    const matchesSearch = searchTerm === '' ||
      route.route_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      route.team?.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesStatus = statusFilter === 'all' || route.status === statusFilter
    return matchesSearch && matchesStatus
  })

  const openAddModal = () => {
    setEditingRoute(null)
    setFormData(emptyRoute)
    setError(null)
    setShowModal(true)
  }

  const openEditModal = (route) => {
    setEditingRoute(route)
    setFormData({
      route_id: route.route_id || '',
      date: route.date || '',
      team: route.team || '',
      status: route.status || 'Planned',
      total_distance: route.total_distance || '',
      total_time: route.total_time || ''
    })
    setError(null)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditingRoute(null)
    setFormData(emptyRoute)
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
      route_id: formData.route_id || null,
      date: formData.date,
      team: formData.team || null,
      status: formData.status,
      total_distance: formData.total_distance ? parseFloat(formData.total_distance) : null,
      total_time: formData.total_time ? parseFloat(formData.total_time) : null,
      updated_at: new Date().toISOString()
    }

    let result
    if (editingRoute) {
      result = await supabase.from('routes').update(payload).eq('id', editingRoute.id)
    } else {
      result = await supabase.from('routes').insert([payload])
    }

    if (result.error) {
      setError(result.error.message)
      setLoading(false)
      return
    }

    await fetchRoutes()
    closeModal()
    setLoading(false)
  }

  const handleDelete = async (route) => {
    if (!confirm(`Delete route "${route.route_name}"?`)) return
    await supabase.from('routes').delete().eq('id', route.id)
    await fetchRoutes()
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
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
          Routes
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('/routes/calendar')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              backgroundColor: theme.bgCard,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <Calendar size={18} />
            Calendar View
          </button>
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
            Add Route
          </button>
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
            placeholder="Search routes..."
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
          {ROUTE_STATUS.map(status => (
            <option key={status} value={status}>{status}</option>
          ))}
        </select>
      </div>

      {/* Routes Grid */}
      {filteredRoutes.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '48px 24px',
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <Route size={48} style={{ color: theme.textMuted, marginBottom: '16px', opacity: 0.5 }} />
          <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
            No routes found. Create your first route.
          </p>
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
          gap: '16px'
        }}>
          {filteredRoutes.map((route) => {
            const statusStyle = statusColors[route.status] || statusColors['Planned']
            return (
              <div
                key={route.id}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '12px',
                  border: `1px solid ${theme.border}`,
                  padding: '20px'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                    {route.route_name || 'Unnamed Route'}
                  </h3>
                  <span style={{
                    padding: '4px 10px',
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.color,
                    borderRadius: '20px',
                    fontSize: '12px',
                    fontWeight: '500'
                  }}>
                    {route.status}
                  </span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                    <Calendar size={16} />
                    {formatDate(route.route_date)}
                  </div>
                  {route.assigned_to && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                      <User size={16} />
                      {route.assigned_to.name}
                    </div>
                  )}
                  {route.fleet && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                      <Truck size={16} />
                      {route.fleet.name}
                    </div>
                  )}
                  {route.start_location && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', color: theme.textSecondary }}>
                      <MapPin size={16} />
                      {route.start_location}
                    </div>
                  )}
                </div>

                {route.estimated_distance && (
                  <p style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '12px' }}>
                    Est. {route.estimated_distance} miles
                    {route.estimated_duration && ` / ${route.estimated_duration} hours`}
                  </p>
                )}

                <div style={{ display: 'flex', gap: '8px', borderTop: `1px solid ${theme.border}`, paddingTop: '12px' }}>
                  <button
                    onClick={() => openEditModal(route)}
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
                    onClick={() => handleDelete(route)}
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
                {editingRoute ? 'Edit Route' : 'New Route'}
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
                  <label style={labelStyle}>Route Name *</label>
                  <input type="text" name="route_name" value={formData.route_name} onChange={handleChange} required style={inputStyle} placeholder="e.g., Downtown Morning Route" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Route Date *</label>
                    <input type="date" name="route_date" value={formData.route_date} onChange={handleChange} required style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Status</label>
                    <select name="status" value={formData.status} onChange={handleChange} style={inputStyle}>
                      {ROUTE_STATUS.map(status => (
                        <option key={status} value={status}>{status}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Assigned To</label>
                    <select name="assigned_to" value={formData.assigned_to} onChange={handleChange} style={inputStyle}>
                      <option value="">Select employee</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>Vehicle</label>
                    <select name="fleet_id" value={formData.fleet_id} onChange={handleChange} style={inputStyle}>
                      <option value="">Select vehicle</option>
                      {fleet.map(v => (
                        <option key={v.id} value={v.id}>{v.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Start Location</label>
                  <input type="text" name="start_location" value={formData.start_location} onChange={handleChange} style={inputStyle} placeholder="Starting address" />
                </div>

                <div>
                  <label style={labelStyle}>End Location</label>
                  <input type="text" name="end_location" value={formData.end_location} onChange={handleChange} style={inputStyle} placeholder="Ending address" />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                  <div>
                    <label style={labelStyle}>Est. Distance (miles)</label>
                    <input type="number" name="estimated_distance" value={formData.estimated_distance} onChange={handleChange} step="0.1" style={inputStyle} />
                  </div>
                  <div>
                    <label style={labelStyle}>Est. Duration (hours)</label>
                    <input type="number" name="estimated_duration" value={formData.estimated_duration} onChange={handleChange} step="0.25" style={inputStyle} />
                  </div>
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
                  {loading ? 'Saving...' : (editingRoute ? 'Update' : 'Create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

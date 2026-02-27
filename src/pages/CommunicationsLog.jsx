import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import {
  MessageSquare,
  Plus,
  Search,
  Mail,
  Phone,
  MessageCircle,
  FileText,
  Filter,
  X
} from 'lucide-react'

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

const commTypes = ['Email', 'SMS', 'Call', 'Note']
const commStatuses = ['Sent', 'Delivered', 'Failed', 'Completed']

const typeIcons = {
  Email: Mail,
  SMS: MessageCircle,
  Call: Phone,
  Note: FileText
}

const typeColors = {
  Email: '#5a9bd5',
  SMS: '#9b59b6',
  Call: '#4a7c59',
  Note: '#f4b942'
}

const statusColors = {
  Sent: '#5a9bd5',
  Delivered: '#4a7c59',
  Failed: '#c25a5a',
  Completed: '#4a7c59'
}

export default function CommunicationsLog() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const customers = useStore((state) => state.customers)
  const communications = useStore((state) => state.communications)
  const fetchCommunications = useStore((state) => state.fetchCommunications)

  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('')
  const [filterDateStart, setFilterDateStart] = useState('')
  const [filterDateEnd, setFilterDateEnd] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    customer_id: '',
    type: 'Email',
    recipient: '',
    status: 'Sent',
    notes: ''
  })

  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchCommunications()
  }, [companyId, navigate, fetchCommunications])

  // Filter communications
  const filteredComms = communications.filter(comm => {
    // Search filter
    const searchLower = searchTerm.toLowerCase()
    const matchesSearch = !searchTerm ||
      comm.customer?.name?.toLowerCase().includes(searchLower) ||
      comm.recipient?.toLowerCase().includes(searchLower) ||
      comm.notes?.toLowerCase().includes(searchLower)

    // Type filter
    const matchesType = !filterType || comm.type === filterType

    // Date filter
    const commDate = comm.sent_date || comm.communication_date
    const matchesDateStart = !filterDateStart || (commDate && commDate >= filterDateStart)
    const matchesDateEnd = !filterDateEnd || (commDate && commDate <= filterDateEnd)

    return matchesSearch && matchesType && matchesDateStart && matchesDateEnd
  })

  const handleSubmit = async (e) => {
    e.preventDefault()

    const data = {
      company_id: companyId,
      customer_id: formData.customer_id || null,
      type: formData.type,
      recipient: formData.recipient,
      status: formData.status,
      response: formData.notes || null,
      employee_id: user?.id,
      sent_date: new Date().toISOString()
    }

    const { error } = await supabase.from('communications_log').insert(data)

    if (error) {
      alert('Error saving: ' + error.message)
    } else {
      setShowModal(false)
      setFormData({ customer_id: '', type: 'Email', recipient: '', status: 'Sent', notes: '' })
      fetchCommunications()
    }
  }

  const formatDateTime = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  }

  const clearFilters = () => {
    setFilterType('')
    setFilterDateStart('')
    setFilterDateEnd('')
    setSearchTerm('')
  }

  const hasActiveFilters = filterType || filterDateStart || filterDateEnd || searchTerm

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <MessageSquare size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Communications Log</h1>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
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
          <Plus size={18} /> Log Communication
        </button>
      </div>

      {/* Filters */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        padding: '16px',
        marginBottom: '20px'
      }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {/* Search */}
          <div style={{ position: 'relative', flex: '1', minWidth: '200px', maxWidth: '300px' }}>
            <Search size={18} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
            <input
              type="text"
              placeholder="Search..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                width: '100%',
                padding: '10px 12px 10px 40px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bg,
                color: theme.text,
                fontSize: '14px'
              }}
            />
          </div>

          {/* Type Filter */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Filter size={16} style={{ color: theme.textMuted }} />
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bg,
                color: theme.text,
                fontSize: '14px'
              }}
            >
              <option value="">All Types</option>
              {commTypes.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          {/* Date Range */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="date"
              value={filterDateStart}
              onChange={(e) => setFilterDateStart(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bg,
                color: theme.text,
                fontSize: '14px'
              }}
            />
            <span style={{ color: theme.textMuted }}>to</span>
            <input
              type="date"
              value={filterDateEnd}
              onChange={(e) => setFilterDateEnd(e.target.value)}
              style={{
                padding: '10px 12px',
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                backgroundColor: theme.bg,
                color: theme.text,
                fontSize: '14px'
              }}
            />
          </div>

          {hasActiveFilters && (
            <button
              onClick={clearFilters}
              style={{
                padding: '10px 16px',
                backgroundColor: 'rgba(194,90,90,0.1)',
                color: '#c25a5a',
                border: 'none',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: '500',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <X size={14} /> Clear Filters
            </button>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{
        backgroundColor: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden'
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ backgroundColor: theme.accentBg }}>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Date</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Type</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Customer</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Recipient</th>
              <th style={{ padding: '14px 16px', textAlign: 'center', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Status</th>
              <th style={{ padding: '14px 16px', textAlign: 'left', fontSize: '13px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}` }}>Logged By</th>
            </tr>
          </thead>
          <tbody>
            {filteredComms.length === 0 ? (
              <tr>
                <td colSpan="6" style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>
                  No communications found
                </td>
              </tr>
            ) : (
              filteredComms.map(comm => {
                const TypeIcon = typeIcons[comm.type] || MessageSquare
                return (
                  <tr key={comm.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text }}>
                      {formatDateTime(comm.sent_date || comm.communication_date)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 10px',
                        borderRadius: '12px',
                        backgroundColor: `${typeColors[comm.type]}15`,
                        color: typeColors[comm.type]
                      }}>
                        <TypeIcon size={14} />
                        <span style={{ fontSize: '12px', fontWeight: '500' }}>{comm.type}</span>
                      </div>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text, fontWeight: '500' }}>
                      {comm.customer?.name || '-'}
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary }}>
                      {comm.recipient || '-'}
                    </td>
                    <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '500',
                        backgroundColor: `${statusColors[comm.status] || theme.textMuted}15`,
                        color: statusColors[comm.status] || theme.textMuted
                      }}>
                        {comm.status}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary }}>
                      {comm.employee?.name || '-'}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Add Modal */}
      {showModal && (
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
          <div style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px'
          }}>
            <h2 style={{ fontSize: '20px', fontWeight: '700', color: theme.text, marginBottom: '20px' }}>
              Log Communication
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                    Customer
                  </label>
                  <select
                    value={formData.customer_id}
                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
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
                    <option value="">Select Customer (Optional)</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                      Type *
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                      required
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
                      {commTypes.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                      Status *
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      required
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
                      {commStatuses.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                    Recipient (Email or Phone)
                  </label>
                  <input
                    type="text"
                    value={formData.recipient}
                    onChange={(e) => setFormData({ ...formData, recipient: e.target.value })}
                    placeholder="email@example.com or (555) 123-4567"
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
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: theme.textSecondary, marginBottom: '6px' }}>
                    Notes / Response
                  </label>
                  <textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={4}
                    placeholder="Communication details, response received, etc."
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
              </div>

              <div style={{ display: 'flex', gap: '12px', marginTop: '24px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
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
                  type="submit"
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
                  Save Communication
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

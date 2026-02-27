import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Truck, Search, Plus, AlertTriangle, Calendar, Wrench, Settings } from 'lucide-react'

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

const typeOptions = ['Vehicle', 'Trailer', 'Equipment', 'Tool']

const statusColors = {
  'Available': { bg: 'rgba(74,124,89,0.15)', text: '#4a7c59' },
  'In Use': { bg: 'rgba(90,99,73,0.15)', text: '#5a6349' },
  'Maintenance': { bg: 'rgba(194,139,56,0.15)', text: '#c28b38' },
  'Out of Service': { bg: 'rgba(194,90,90,0.15)', text: '#c25a5a' }
}

const typeIcons = {
  'Vehicle': Truck,
  'Trailer': Truck,
  'Equipment': Settings,
  'Tool': Wrench
}

export default function Fleet() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const fleet = useStore((state) => state.fleet)
  const fetchFleet = useStore((state) => state.fetchFleet)

  const [searchTerm, setSearchTerm] = useState('')
  const [filterType, setFilterType] = useState('all')
  const [filterStatus, setFilterStatus] = useState('all')
  const [showModal, setShowModal] = useState(false)
  const [formData, setFormData] = useState({
    asset_id: '',
    name: '',
    type: 'Vehicle',
    status: 'Available',
    mileage_hours: 0,
    last_pm_date: '',
    next_pm_due: '',
    maintenance_alert: ''
  })

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchFleet()
  }, [companyId, navigate, fetchFleet])

  // Filter fleet
  const filteredFleet = fleet.filter(asset => {
    // Search filter
    const assetName = asset.name?.toLowerCase() || ''
    const assetId = asset.asset_id?.toLowerCase() || ''
    const searchLower = searchTerm.toLowerCase()

    if (searchTerm && !assetName.includes(searchLower) && !assetId.includes(searchLower)) {
      return false
    }

    // Type filter
    if (filterType !== 'all' && asset.type !== filterType) {
      return false
    }

    // Status filter
    if (filterStatus !== 'all' && asset.status !== filterStatus) {
      return false
    }

    return true
  })

  // Calculate stats
  const availableCount = fleet.filter(a => a.status === 'Available').length
  const inUseCount = fleet.filter(a => a.status === 'In Use').length
  const maintenanceCount = fleet.filter(a => a.status === 'Maintenance').length
  const overdueCount = fleet.filter(a => {
    if (!a.next_pm_due) return false
    return new Date(a.next_pm_due) < new Date()
  }).length

  const generateAssetId = () => {
    const timestamp = Date.now().toString(36).toUpperCase()
    return `FLT-${timestamp}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const insertData = {
      company_id: companyId,
      asset_id: formData.asset_id || generateAssetId(),
      name: formData.name,
      type: formData.type,
      status: formData.status,
      mileage_hours: parseInt(formData.mileage_hours) || 0,
      last_pm_date: formData.last_pm_date || null,
      next_pm_due: formData.next_pm_due || null,
      maintenance_alert: formData.maintenance_alert || null
    }

    const { error } = await supabase.from('fleet').insert(insertData)

    if (error) {
      alert('Error adding asset: ' + error.message)
    } else {
      setShowModal(false)
      setFormData({
        asset_id: '',
        name: '',
        type: 'Vehicle',
        status: 'Available',
        mileage_hours: 0,
        last_pm_date: '',
        next_pm_due: '',
        maintenance_alert: ''
      })
      fetchFleet()
    }
  }

  const updateStatus = async (asset, newStatus) => {
    const { error } = await supabase
      .from('fleet')
      .update({ status: newStatus })
      .eq('id', asset.id)

    if (error) {
      alert('Error updating status: ' + error.message)
    } else {
      fetchFleet()
    }
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const isPMOverdue = (asset) => {
    if (!asset.next_pm_due) return false
    return new Date(asset.next_pm_due) < new Date()
  }

  const getDaysUntilPM = (asset) => {
    if (!asset.next_pm_due) return null
    const diff = new Date(asset.next_pm_due) - new Date()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Truck size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            Fleet
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate('/fleet/calendar')}
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
            Calendar
          </button>
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
            <Plus size={18} />
            Add Asset
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            Available
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#4a7c59' }}>
            {availableCount}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            In Use
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.accent }}>
            {inUseCount}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            In Maintenance
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#c28b38' }}>
            {maintenanceCount}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            PM Overdue
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '28px', fontWeight: '700', color: '#c25a5a' }}>
              {overdueCount}
            </span>
            {overdueCount > 0 && (
              <AlertTriangle size={20} style={{ color: '#c25a5a' }} />
            )}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '20px',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
          <Search size={18} style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: theme.textMuted
          }} />
          <input
            type="text"
            placeholder="Search fleet..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              borderRadius: '8px',
              border: `1px solid ${theme.border}`,
              backgroundColor: theme.bgCard,
              color: theme.text,
              fontSize: '14px'
            }}
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bgCard,
            color: theme.text,
            fontSize: '14px',
            minWidth: '140px'
          }}
        >
          <option value="all">All Types</option>
          {typeOptions.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '10px 12px',
            borderRadius: '8px',
            border: `1px solid ${theme.border}`,
            backgroundColor: theme.bgCard,
            color: theme.text,
            fontSize: '14px',
            minWidth: '150px'
          }}
        >
          <option value="all">All Statuses</option>
          <option value="Available">Available</option>
          <option value="In Use">In Use</option>
          <option value="Maintenance">Maintenance</option>
          <option value="Out of Service">Out of Service</option>
        </select>
      </div>

      {/* Fleet Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '16px'
      }}>
        {filteredFleet.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            padding: '40px',
            textAlign: 'center',
            color: theme.textMuted,
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`
          }}>
            No fleet assets found
          </div>
        ) : (
          filteredFleet.map(asset => {
            const TypeIcon = typeIcons[asset.type] || Truck
            const statusStyle = statusColors[asset.status] || statusColors['Available']
            const overdue = isPMOverdue(asset)
            const daysUntil = getDaysUntilPM(asset)

            return (
              <div
                key={asset.id}
                onClick={() => navigate(`/fleet/${asset.id}`)}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '12px',
                  border: `1px solid ${overdue ? '#c25a5a' : theme.border}`,
                  padding: '20px',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s'
                }}
                onMouseOver={(e) => e.currentTarget.style.backgroundColor = theme.bgCardHover}
                onMouseOut={(e) => e.currentTarget.style.backgroundColor = theme.bgCard}
              >
                {/* Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start',
                  marginBottom: '12px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '44px',
                      height: '44px',
                      borderRadius: '10px',
                      backgroundColor: theme.accentBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}>
                      <TypeIcon size={22} style={{ color: theme.accent }} />
                    </div>
                    <div>
                      <div style={{
                        fontSize: '16px',
                        fontWeight: '600',
                        color: theme.text
                      }}>
                        {asset.name}
                      </div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>
                        {asset.asset_id} · {asset.type}
                      </div>
                    </div>
                  </div>

                  {/* Status Badge */}
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    backgroundColor: statusStyle.bg,
                    color: statusStyle.text
                  }}>
                    {asset.status}
                  </span>
                </div>

                {/* PM Overdue Warning */}
                {overdue && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 12px',
                    backgroundColor: 'rgba(194,90,90,0.1)',
                    borderRadius: '8px',
                    marginBottom: '12px'
                  }}>
                    <AlertTriangle size={16} style={{ color: '#c25a5a' }} />
                    <span style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#c25a5a'
                    }}>
                      PM OVERDUE
                    </span>
                  </div>
                )}

                {/* Details */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '12px',
                  marginBottom: '16px'
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>
                      {asset.type === 'Vehicle' ? 'Mileage' : 'Hours'}
                    </div>
                    <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                      {asset.mileage_hours?.toLocaleString() || 0}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>Last PM</div>
                    <div style={{ fontSize: '14px', color: theme.text }}>
                      {formatDate(asset.last_pm_date)}
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>Next PM Due</div>
                    <div style={{
                      fontSize: '14px',
                      fontWeight: daysUntil !== null && daysUntil <= 7 ? '600' : '400',
                      color: overdue ? '#c25a5a' : (daysUntil !== null && daysUntil <= 7 ? '#c28b38' : theme.text)
                    }}>
                      {formatDate(asset.next_pm_due)}
                      {daysUntil !== null && !overdue && daysUntil <= 14 && (
                        <span style={{ marginLeft: '8px', fontSize: '12px' }}>
                          ({daysUntil} days)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Quick Actions */}
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  paddingTop: '12px',
                  borderTop: `1px solid ${theme.border}`
                }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => navigate(`/fleet/${asset.id}`)}
                    style={{
                      flex: 1,
                      padding: '8px 12px',
                      backgroundColor: theme.accent,
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    View Details
                  </button>

                  {asset.status === 'Available' && (
                    <button
                      onClick={() => updateStatus(asset, 'In Use')}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'rgba(90,99,73,0.1)',
                        color: theme.accent,
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Check Out
                    </button>
                  )}

                  {asset.status === 'In Use' && (
                    <button
                      onClick={() => updateStatus(asset, 'Available')}
                      style={{
                        padding: '8px 12px',
                        backgroundColor: 'rgba(74,124,89,0.1)',
                        color: '#4a7c59',
                        border: 'none',
                        borderRadius: '6px',
                        fontSize: '13px',
                        fontWeight: '500',
                        cursor: 'pointer'
                      }}
                    >
                      Return
                    </button>
                  )}
                </div>

                {asset.maintenance_alert && (
                  <div style={{
                    marginTop: '12px',
                    padding: '10px',
                    backgroundColor: 'rgba(194,139,56,0.08)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#c28b38'
                  }}>
                    <strong>Alert:</strong> {asset.maintenance_alert}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Add Asset Modal */}
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
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: theme.text,
              marginBottom: '20px'
            }}>
              Add Fleet Asset
            </h2>

            <form onSubmit={handleSubmit}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: theme.textSecondary,
                      marginBottom: '6px'
                    }}>
                      Asset ID
                    </label>
                    <input
                      type="text"
                      value={formData.asset_id}
                      onChange={(e) => setFormData({ ...formData, asset_id: e.target.value })}
                      placeholder={generateAssetId()}
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
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: theme.textSecondary,
                      marginBottom: '6px'
                    }}>
                      Type
                    </label>
                    <select
                      value={formData.type}
                      onChange={(e) => setFormData({ ...formData, type: e.target.value })}
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
                      {typeOptions.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Asset Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="e.g., Work Truck #1"
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: theme.textSecondary,
                      marginBottom: '6px'
                    }}>
                      Status
                    </label>
                    <select
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
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
                      <option value="Available">Available</option>
                      <option value="In Use">In Use</option>
                      <option value="Maintenance">Maintenance</option>
                      <option value="Out of Service">Out of Service</option>
                    </select>
                  </div>

                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: theme.textSecondary,
                      marginBottom: '6px'
                    }}>
                      {formData.type === 'Vehicle' ? 'Mileage' : 'Hours'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.mileage_hours}
                      onChange={(e) => setFormData({ ...formData, mileage_hours: e.target.value })}
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
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: theme.textSecondary,
                      marginBottom: '6px'
                    }}>
                      Last PM Date
                    </label>
                    <input
                      type="date"
                      value={formData.last_pm_date}
                      onChange={(e) => setFormData({ ...formData, last_pm_date: e.target.value })}
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
                    <label style={{
                      display: 'block',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: theme.textSecondary,
                      marginBottom: '6px'
                    }}>
                      Next PM Due
                    </label>
                    <input
                      type="date"
                      value={formData.next_pm_due}
                      onChange={(e) => setFormData({ ...formData, next_pm_due: e.target.value })}
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
                </div>

                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Maintenance Alert
                  </label>
                  <input
                    type="text"
                    value={formData.maintenance_alert}
                    onChange={(e) => setFormData({ ...formData, maintenance_alert: e.target.value })}
                    placeholder="e.g., Check brakes, oil change needed"
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
              </div>

              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px',
                justifyContent: 'flex-end'
              }}>
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
                  Add Asset
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

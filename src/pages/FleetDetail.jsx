import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { ArrowLeft, Truck, Wrench, Calendar, Plus, AlertTriangle, DollarSign, Clock, Settings } from 'lucide-react'

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

const statusColors = {
  'Available': { bg: 'rgba(74,124,89,0.15)', text: '#4a7c59' },
  'In Use': { bg: 'rgba(90,99,73,0.15)', text: '#5a6349' },
  'Maintenance': { bg: 'rgba(194,139,56,0.15)', text: '#c28b38' },
  'Out of Service': { bg: 'rgba(194,90,90,0.15)', text: '#c25a5a' }
}

const rentalStatusColors = {
  'Active': { bg: 'rgba(90,99,73,0.15)', text: '#5a6349' },
  'Completed': { bg: 'rgba(74,124,89,0.15)', text: '#4a7c59' },
  'Cancelled': { bg: 'rgba(125,138,127,0.15)', text: '#7d8a7f' }
}

const maintenanceTypes = [
  'Oil Change',
  'Tire Rotation',
  'Brake Service',
  'Inspection',
  'Repair',
  'Scheduled PM',
  'Other'
]

const typeIcons = {
  'Vehicle': Truck,
  'Trailer': Truck,
  'Equipment': Settings,
  'Tool': Wrench
}

export default function FleetDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const fleet = useStore((state) => state.fleet)
  const fleetMaintenance = useStore((state) => state.fleetMaintenance)
  const fleetRentals = useStore((state) => state.fleetRentals)
  const fetchFleet = useStore((state) => state.fetchFleet)
  const fetchFleetMaintenance = useStore((state) => state.fetchFleetMaintenance)
  const fetchFleetRentals = useStore((state) => state.fetchFleetRentals)

  const [activeTab, setActiveTab] = useState('maintenance')
  const [showMaintenanceModal, setShowMaintenanceModal] = useState(false)
  const [showRentalModal, setShowRentalModal] = useState(false)
  const [showMileageModal, setShowMileageModal] = useState(false)

  const [maintenanceForm, setMaintenanceForm] = useState({
    type: 'Oil Change',
    date: new Date().toISOString().split('T')[0],
    mileage_hours: '',
    description: '',
    cost: ''
  })

  const [rentalForm, setRentalForm] = useState({
    rental_customer: '',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    rental_rate: 'Daily',
    status: 'Active'
  })

  const [newMileage, setNewMileage] = useState('')

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchFleet()
    fetchFleetMaintenance()
    fetchFleetRentals()
  }, [companyId, navigate, fetchFleet, fetchFleetMaintenance, fetchFleetRentals])

  const asset = fleet.find(a => a.id === parseInt(id))

  // Filter maintenance and rentals for this asset
  const assetMaintenance = fleetMaintenance.filter(m => m.asset_id === parseInt(id))
  const assetRentals = fleetRentals.filter(r => r.asset_id === parseInt(id))

  if (!asset) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: defaultTheme.textMuted }}>
        Asset not found
      </div>
    )
  }

  const TypeIcon = typeIcons[asset.type] || Truck
  const statusStyle = statusColors[asset.status] || statusColors['Available']

  const isPMOverdue = () => {
    if (!asset.next_pm_due) return false
    return new Date(asset.next_pm_due) < new Date()
  }

  const getDaysUntilPM = () => {
    if (!asset.next_pm_due) return null
    const diff = new Date(asset.next_pm_due) - new Date()
    return Math.ceil(diff / (1000 * 60 * 60 * 24))
  }

  const formatDate = (dateStr) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    })
  }

  const formatCurrency = (amount) => {
    if (!amount) return '$0.00'
    return '$' + parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2 })
  }

  const handleAddMaintenance = async (e) => {
    e.preventDefault()

    const insertData = {
      company_id: companyId,
      asset_id: parseInt(id),
      type: maintenanceForm.type,
      date: maintenanceForm.date,
      mileage_hours: parseInt(maintenanceForm.mileage_hours) || asset.mileage_hours,
      description: maintenanceForm.description || null,
      cost: parseFloat(maintenanceForm.cost) || 0
    }

    const { error } = await supabase.from('fleet_maintenance').insert(insertData)

    if (error) {
      alert('Error adding maintenance: ' + error.message)
      return
    }

    // Update asset with new mileage and PM dates
    const updateData = {
      mileage_hours: parseInt(maintenanceForm.mileage_hours) || asset.mileage_hours,
      last_pm_date: maintenanceForm.date
    }

    // Calculate next PM due (90 days from now as default)
    const nextPM = new Date(maintenanceForm.date)
    nextPM.setDate(nextPM.getDate() + 90)
    updateData.next_pm_due = nextPM.toISOString().split('T')[0]

    await supabase.from('fleet').update(updateData).eq('id', parseInt(id))

    setShowMaintenanceModal(false)
    setMaintenanceForm({
      type: 'Oil Change',
      date: new Date().toISOString().split('T')[0],
      mileage_hours: '',
      description: '',
      cost: ''
    })
    fetchFleet()
    fetchFleetMaintenance()
  }

  const handleAddRental = async (e) => {
    e.preventDefault()

    const insertData = {
      company_id: companyId,
      asset_id: parseInt(id),
      rental_customer: rentalForm.rental_customer,
      start_date: rentalForm.start_date,
      end_date: rentalForm.end_date || null,
      rental_rate: rentalForm.rental_rate,
      status: rentalForm.status
    }

    const { error } = await supabase.from('fleet_rentals').insert(insertData)

    if (error) {
      alert('Error adding rental: ' + error.message)
      return
    }

    // Update asset status if rental is active
    if (rentalForm.status === 'Active') {
      await supabase.from('fleet').update({ status: 'In Use' }).eq('id', parseInt(id))
    }

    setShowRentalModal(false)
    setRentalForm({
      rental_customer: '',
      start_date: new Date().toISOString().split('T')[0],
      end_date: '',
      rental_rate: 'Daily',
      status: 'Active'
    })
    fetchFleet()
    fetchFleetRentals()
  }

  const handleUpdateMileage = async () => {
    const { error } = await supabase
      .from('fleet')
      .update({ mileage_hours: parseInt(newMileage) || 0 })
      .eq('id', parseInt(id))

    if (error) {
      alert('Error updating mileage: ' + error.message)
    } else {
      setShowMileageModal(false)
      setNewMileage('')
      fetchFleet()
    }
  }

  const updateAssetStatus = async (newStatus) => {
    const { error } = await supabase
      .from('fleet')
      .update({ status: newStatus })
      .eq('id', parseInt(id))

    if (error) {
      alert('Error updating status: ' + error.message)
    } else {
      fetchFleet()
    }
  }

  const overdue = isPMOverdue()
  const daysUntil = getDaysUntilPM()

  // Calculate total maintenance cost
  const totalMaintenanceCost = assetMaintenance.reduce((sum, m) => sum + (m.cost || 0), 0)

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button
            onClick={() => navigate('/fleet')}
            style={{
              padding: '10px',
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              cursor: 'pointer',
              color: theme.textSecondary
            }}
          >
            <ArrowLeft size={20} />
          </button>

          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '12px',
            backgroundColor: theme.accentBg,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <TypeIcon size={28} style={{ color: theme.accent }} />
          </div>

          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {asset.name}
              </h1>
              <span style={{
                padding: '4px 12px',
                borderRadius: '12px',
                fontSize: '12px',
                fontWeight: '600',
                backgroundColor: statusStyle.bg,
                color: statusStyle.text
              }}>
                {asset.status}
              </span>
            </div>
            <div style={{ fontSize: '14px', color: theme.textMuted }}>
              {asset.asset_id} · {asset.type}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={() => {
              setMaintenanceForm({ ...maintenanceForm, mileage_hours: asset.mileage_hours || '' })
              setShowMaintenanceModal(true)
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
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
            <Wrench size={16} />
            Log Maintenance
          </button>
          <button
            onClick={() => setShowRentalModal(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              backgroundColor: theme.bgCard,
              color: theme.text,
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            <Calendar size={16} />
            Rent Out
          </button>
        </div>
      </div>

      {/* PM Overdue Warning */}
      {overdue && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          padding: '16px 20px',
          backgroundColor: 'rgba(194,90,90,0.1)',
          borderRadius: '12px',
          marginBottom: '24px',
          border: '1px solid rgba(194,90,90,0.3)'
        }}>
          <AlertTriangle size={24} style={{ color: '#c25a5a' }} />
          <div>
            <div style={{ fontSize: '16px', fontWeight: '600', color: '#c25a5a' }}>
              Preventive Maintenance Overdue
            </div>
            <div style={{ fontSize: '14px', color: '#c25a5a' }}>
              PM was due on {formatDate(asset.next_pm_due)}
            </div>
          </div>
        </div>
      )}

      {/* Info Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
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
            {asset.type === 'Vehicle' ? 'Current Mileage' : 'Current Hours'}
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>
              {asset.mileage_hours?.toLocaleString() || 0}
            </span>
            <button
              onClick={() => {
                setNewMileage(asset.mileage_hours?.toString() || '')
                setShowMileageModal(true)
              }}
              style={{
                padding: '6px 12px',
                backgroundColor: theme.accentBg,
                color: theme.accent,
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                cursor: 'pointer'
              }}
            >
              Update
            </button>
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            Last PM
          </div>
          <div style={{ fontSize: '24px', fontWeight: '600', color: theme.text }}>
            {formatDate(asset.last_pm_date)}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${overdue ? '#c25a5a' : theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            Next PM Due
          </div>
          <div style={{
            fontSize: '24px',
            fontWeight: '600',
            color: overdue ? '#c25a5a' : theme.text
          }}>
            {formatDate(asset.next_pm_due)}
          </div>
          {daysUntil !== null && (
            <div style={{
              fontSize: '13px',
              color: overdue ? '#c25a5a' : (daysUntil <= 14 ? '#c28b38' : theme.textMuted)
            }}>
              {overdue ? 'Overdue' : `${daysUntil} days remaining`}
            </div>
          )}
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            Total Maintenance Cost
          </div>
          <div style={{ fontSize: '24px', fontWeight: '600', color: theme.text }}>
            {formatCurrency(totalMaintenanceCost)}
          </div>
        </div>
      </div>

      {/* Quick Status Actions */}
      <div style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <span style={{ fontSize: '14px', color: theme.textMuted, marginRight: '8px', alignSelf: 'center' }}>
          Set Status:
        </span>
        {['Available', 'In Use', 'Maintenance', 'Out of Service'].map(status => (
          <button
            key={status}
            onClick={() => updateAssetStatus(status)}
            style={{
              padding: '8px 16px',
              backgroundColor: asset.status === status ? statusColors[status].bg : theme.bg,
              color: asset.status === status ? statusColors[status].text : theme.textSecondary,
              border: `1px solid ${asset.status === status ? statusColors[status].text : theme.border}`,
              borderRadius: '8px',
              fontSize: '13px',
              fontWeight: asset.status === status ? '600' : '400',
              cursor: 'pointer'
            }}
          >
            {status}
          </button>
        ))}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '4px',
        marginBottom: '20px',
        borderBottom: `1px solid ${theme.border}`,
        paddingBottom: '1px'
      }}>
        <button
          onClick={() => setActiveTab('maintenance')}
          style={{
            padding: '12px 24px',
            backgroundColor: activeTab === 'maintenance' ? theme.bgCard : 'transparent',
            color: activeTab === 'maintenance' ? theme.accent : theme.textMuted,
            border: activeTab === 'maintenance' ? `1px solid ${theme.border}` : 'none',
            borderBottom: activeTab === 'maintenance' ? `2px solid ${theme.bgCard}` : 'none',
            borderRadius: '8px 8px 0 0',
            fontSize: '14px',
            fontWeight: activeTab === 'maintenance' ? '600' : '400',
            cursor: 'pointer',
            marginBottom: '-1px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Wrench size={16} />
            Maintenance History ({assetMaintenance.length})
          </div>
        </button>
        <button
          onClick={() => setActiveTab('rentals')}
          style={{
            padding: '12px 24px',
            backgroundColor: activeTab === 'rentals' ? theme.bgCard : 'transparent',
            color: activeTab === 'rentals' ? theme.accent : theme.textMuted,
            border: activeTab === 'rentals' ? `1px solid ${theme.border}` : 'none',
            borderBottom: activeTab === 'rentals' ? `2px solid ${theme.bgCard}` : 'none',
            borderRadius: '8px 8px 0 0',
            fontSize: '14px',
            fontWeight: activeTab === 'rentals' ? '600' : '400',
            cursor: 'pointer',
            marginBottom: '-1px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Calendar size={16} />
            Rental History ({assetRentals.length})
          </div>
        </button>
      </div>

      {/* Maintenance Tab */}
      {activeTab === 'maintenance' && (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: theme.accentBg }}>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.border}`
                }}>Date</th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.border}`
                }}>Type</th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.border}`
                }}>Description</th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'right',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.border}`
                }}>{asset.type === 'Vehicle' ? 'Mileage' : 'Hours'}</th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'right',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.border}`
                }}>Cost</th>
              </tr>
            </thead>
            <tbody>
              {assetMaintenance.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: theme.textMuted
                  }}>
                    No maintenance records
                  </td>
                </tr>
              ) : (
                assetMaintenance.map(record => (
                  <tr key={record.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text }}>
                      {formatDate(record.date)}
                    </td>
                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        padding: '4px 10px',
                        borderRadius: '12px',
                        fontSize: '12px',
                        fontWeight: '500',
                        backgroundColor: theme.accentBg,
                        color: theme.accent
                      }}>
                        {record.type}
                      </span>
                    </td>
                    <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary }}>
                      {record.description || '-'}
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: '14px',
                      color: theme.text,
                      textAlign: 'right'
                    }}>
                      {record.mileage_hours?.toLocaleString() || '-'}
                    </td>
                    <td style={{
                      padding: '14px 16px',
                      fontSize: '14px',
                      fontWeight: '500',
                      color: theme.text,
                      textAlign: 'right'
                    }}>
                      {formatCurrency(record.cost)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Rentals Tab */}
      {activeTab === 'rentals' && (
        <div style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ backgroundColor: theme.accentBg }}>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.border}`
                }}>Customer</th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.border}`
                }}>Start Date</th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.border}`
                }}>End Date</th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'left',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.border}`
                }}>Rate</th>
                <th style={{
                  padding: '14px 16px',
                  textAlign: 'center',
                  fontSize: '13px',
                  fontWeight: '600',
                  color: theme.textMuted,
                  borderBottom: `1px solid ${theme.border}`
                }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {assetRentals.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{
                    padding: '40px',
                    textAlign: 'center',
                    color: theme.textMuted
                  }}>
                    No rental records
                  </td>
                </tr>
              ) : (
                assetRentals.map(rental => {
                  const rentalStyle = rentalStatusColors[rental.status] || rentalStatusColors['Active']
                  return (
                    <tr key={rental.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '14px 16px', fontSize: '14px', fontWeight: '500', color: theme.text }}>
                        {rental.rental_customer}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text }}>
                        {formatDate(rental.start_date)}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.text }}>
                        {formatDate(rental.end_date)}
                      </td>
                      <td style={{ padding: '14px 16px', fontSize: '14px', color: theme.textSecondary }}>
                        {rental.rental_rate}
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          backgroundColor: rentalStyle.bg,
                          color: rentalStyle.text
                        }}>
                          {rental.status}
                        </span>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Maintenance Modal */}
      {showMaintenanceModal && (
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
              Log Maintenance
            </h2>

            <form onSubmit={handleAddMaintenance}>
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
                      Type *
                    </label>
                    <select
                      value={maintenanceForm.type}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, type: e.target.value })}
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
                      {maintenanceTypes.map(type => (
                        <option key={type} value={type}>{type}</option>
                      ))}
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
                      Date *
                    </label>
                    <input
                      type="date"
                      value={maintenanceForm.date}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, date: e.target.value })}
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
                      {asset.type === 'Vehicle' ? 'Mileage' : 'Hours'}
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={maintenanceForm.mileage_hours}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, mileage_hours: e.target.value })}
                      placeholder={asset.mileage_hours?.toString() || '0'}
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
                      Cost
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={maintenanceForm.cost}
                      onChange={(e) => setMaintenanceForm({ ...maintenanceForm, cost: e.target.value })}
                      placeholder="0.00"
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
                    Description
                  </label>
                  <textarea
                    value={maintenanceForm.description}
                    onChange={(e) => setMaintenanceForm({ ...maintenanceForm, description: e.target.value })}
                    rows={3}
                    placeholder="Details about the maintenance performed..."
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

              <div style={{
                display: 'flex',
                gap: '12px',
                marginTop: '24px',
                justifyContent: 'flex-end'
              }}>
                <button
                  type="button"
                  onClick={() => setShowMaintenanceModal(false)}
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
                  Log Maintenance
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Rental Modal */}
      {showRentalModal && (
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
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: theme.text,
              marginBottom: '20px'
            }}>
              Add Rental
            </h2>

            <form onSubmit={handleAddRental}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div>
                  <label style={{
                    display: 'block',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Customer *
                  </label>
                  <input
                    type="text"
                    value={rentalForm.rental_customer}
                    onChange={(e) => setRentalForm({ ...rentalForm, rental_customer: e.target.value })}
                    required
                    placeholder="Customer name"
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
                      Start Date *
                    </label>
                    <input
                      type="date"
                      value={rentalForm.start_date}
                      onChange={(e) => setRentalForm({ ...rentalForm, start_date: e.target.value })}
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
                      End Date
                    </label>
                    <input
                      type="date"
                      value={rentalForm.end_date}
                      onChange={(e) => setRentalForm({ ...rentalForm, end_date: e.target.value })}
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
                      Rate
                    </label>
                    <select
                      value={rentalForm.rental_rate}
                      onChange={(e) => setRentalForm({ ...rentalForm, rental_rate: e.target.value })}
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
                      <option value="Daily">Daily</option>
                      <option value="Weekly">Weekly</option>
                      <option value="Monthly">Monthly</option>
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
                      Status
                    </label>
                    <select
                      value={rentalForm.status}
                      onChange={(e) => setRentalForm({ ...rentalForm, status: e.target.value })}
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
                      <option value="Active">Active</option>
                      <option value="Completed">Completed</option>
                      <option value="Cancelled">Cancelled</option>
                    </select>
                  </div>
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
                  onClick={() => setShowRentalModal(false)}
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
                  Add Rental
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Update Mileage Modal */}
      {showMileageModal && (
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
            maxWidth: '400px'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: theme.text,
              marginBottom: '20px'
            }}>
              Update {asset.type === 'Vehicle' ? 'Mileage' : 'Hours'}
            </h2>

            <div style={{ marginBottom: '20px' }}>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '500',
                color: theme.textSecondary,
                marginBottom: '6px'
              }}>
                Current: {asset.mileage_hours?.toLocaleString() || 0}
              </label>
              <input
                type="number"
                min="0"
                value={newMileage}
                onChange={(e) => setNewMileage(e.target.value)}
                placeholder="Enter new value"
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

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => setShowMileageModal(false)}
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
                onClick={handleUpdateMileage}
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
                Update
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { Package, Search, Plus, AlertTriangle, Minus, Check, X } from 'lucide-react'

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

const locationOptions = [
  'Warehouse',
  'Truck 1',
  'Truck 2',
  'Truck 3',
  'Office',
  'Shop',
  'Storage Unit',
  'Other'
]

export default function Inventory() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const inventory = useStore((state) => state.inventory)
  const products = useStore((state) => state.products)
  const fetchInventory = useStore((state) => state.fetchInventory)

  const [searchTerm, setSearchTerm] = useState('')
  const [filterLocation, setFilterLocation] = useState('all')
  const [filterLowStock, setFilterLowStock] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const [showAdjustModal, setShowAdjustModal] = useState(false)
  const [selectedItem, setSelectedItem] = useState(null)
  const [adjustAmount, setAdjustAmount] = useState(0)
  const [formData, setFormData] = useState({
    item_id: '',
    name: '',
    product_id: '',
    quantity: 0,
    min_quantity: 0,
    location: 'Warehouse',
    available: true,
    ordering_trigger: ''
  })

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchInventory()
  }, [companyId, navigate, fetchInventory])

  // Filter inventory
  const filteredInventory = inventory.filter(item => {
    // Search filter
    const itemName = item.name?.toLowerCase() || ''
    const productName = item.product?.name?.toLowerCase() || ''
    const searchLower = searchTerm.toLowerCase()

    if (searchTerm && !itemName.includes(searchLower) && !productName.includes(searchLower)) {
      return false
    }

    // Location filter
    if (filterLocation !== 'all' && item.location !== filterLocation) {
      return false
    }

    // Low stock filter
    if (filterLowStock && item.quantity >= (item.min_quantity || 0)) {
      return false
    }

    return true
  })

  // Calculate stats
  const totalItems = inventory.length
  const lowStockCount = inventory.filter(item =>
    item.quantity < (item.min_quantity || 0)
  ).length
  const totalValue = inventory.reduce((sum, item) => {
    const unitPrice = item.product?.unit_price || 0
    return sum + (item.quantity * unitPrice)
  }, 0)

  // Get unique locations from inventory
  const usedLocations = [...new Set(inventory.map(item => item.location).filter(Boolean))]

  const generateItemId = () => {
    const timestamp = Date.now().toString(36).toUpperCase()
    return `INV-${timestamp}`
  }

  const handleSubmit = async (e) => {
    e.preventDefault()

    const insertData = {
      company_id: companyId,
      item_id: formData.item_id || generateItemId(),
      name: formData.name,
      product_id: formData.product_id || null,
      quantity: parseInt(formData.quantity) || 0,
      min_quantity: parseInt(formData.min_quantity) || 0,
      location: formData.location,
      available: formData.available,
      ordering_trigger: formData.ordering_trigger || null,
      last_updated: new Date().toISOString()
    }

    const { error } = await supabase.from('inventory').insert(insertData)

    if (error) {
      alert('Error adding inventory item: ' + error.message)
    } else {
      setShowModal(false)
      setFormData({
        item_id: '',
        name: '',
        product_id: '',
        quantity: 0,
        min_quantity: 0,
        location: 'Warehouse',
        available: true,
        ordering_trigger: ''
      })
      fetchInventory()
    }
  }

  const handleAdjustQuantity = async () => {
    if (!selectedItem) return

    const newQuantity = selectedItem.quantity + adjustAmount

    const { error } = await supabase
      .from('inventory')
      .update({
        quantity: Math.max(0, newQuantity),
        last_updated: new Date().toISOString()
      })
      .eq('id', selectedItem.id)

    if (error) {
      alert('Error adjusting quantity: ' + error.message)
    } else {
      setShowAdjustModal(false)
      setSelectedItem(null)
      setAdjustAmount(0)
      fetchInventory()
    }
  }

  const toggleAvailable = async (item) => {
    const { error } = await supabase
      .from('inventory')
      .update({
        available: !item.available,
        last_updated: new Date().toISOString()
      })
      .eq('id', item.id)

    if (error) {
      alert('Error updating availability: ' + error.message)
    } else {
      fetchInventory()
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

  const getStockStatus = (item) => {
    if (!item.available) return 'unavailable'
    if (item.quantity < (item.min_quantity || 0)) return 'low'
    return 'ok'
  }

  const stockStatusStyles = {
    ok: {
      border: '2px solid #4a7c59',
      badge: { backgroundColor: 'rgba(74,124,89,0.15)', color: '#4a7c59' }
    },
    low: {
      border: '2px solid #c25a5a',
      badge: { backgroundColor: 'rgba(194,90,90,0.15)', color: '#c25a5a' }
    },
    unavailable: {
      border: '2px solid #7d8a7f',
      badge: { backgroundColor: 'rgba(125,138,127,0.15)', color: '#7d8a7f' }
    }
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
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Package size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
            Inventory
          </h1>
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
          <Plus size={18} />
          Add Item
        </button>
      </div>

      {/* Stats Cards */}
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
            Total Items
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: theme.text }}>
            {totalItems}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            Low Stock
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <span style={{ fontSize: '28px', fontWeight: '700', color: '#c25a5a' }}>
              {lowStockCount}
            </span>
            {lowStockCount > 0 && (
              <AlertTriangle size={20} style={{ color: '#c25a5a' }} />
            )}
          </div>
        </div>

        <div style={{
          backgroundColor: theme.bgCard,
          padding: '20px',
          borderRadius: '12px',
          border: `1px solid ${theme.border}`
        }}>
          <div style={{ fontSize: '13px', color: theme.textMuted, marginBottom: '4px' }}>
            Total Value
          </div>
          <div style={{ fontSize: '28px', fontWeight: '700', color: '#4a7c59' }}>
            ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
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
            placeholder="Search inventory..."
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
          value={filterLocation}
          onChange={(e) => setFilterLocation(e.target.value)}
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
          <option value="all">All Locations</option>
          {usedLocations.map(loc => (
            <option key={loc} value={loc}>{loc}</option>
          ))}
        </select>

        <button
          onClick={() => setFilterLowStock(!filterLowStock)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            backgroundColor: filterLowStock ? '#c25a5a' : theme.bgCard,
            color: filterLowStock ? '#ffffff' : theme.text,
            border: `1px solid ${filterLowStock ? '#c25a5a' : theme.border}`,
            borderRadius: '8px',
            fontSize: '14px',
            cursor: 'pointer'
          }}
        >
          <AlertTriangle size={16} />
          Low Stock Only
        </button>
      </div>

      {/* Inventory Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: '16px'
      }}>
        {filteredInventory.length === 0 ? (
          <div style={{
            gridColumn: '1 / -1',
            padding: '40px',
            textAlign: 'center',
            color: theme.textMuted,
            backgroundColor: theme.bgCard,
            borderRadius: '12px',
            border: `1px solid ${theme.border}`
          }}>
            No inventory items found
          </div>
        ) : (
          filteredInventory.map(item => {
            const status = getStockStatus(item)
            const styles = stockStatusStyles[status]

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: theme.bgCard,
                  borderRadius: '12px',
                  border: styles.border,
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px'
                }}
              >
                {/* Header */}
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'flex-start'
                }}>
                  <div>
                    <div style={{
                      fontSize: '16px',
                      fontWeight: '600',
                      color: theme.text,
                      marginBottom: '4px'
                    }}>
                      {item.name || item.product?.name || 'Unnamed Item'}
                    </div>
                    {item.item_id && (
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>
                        {item.item_id}
                      </div>
                    )}
                  </div>

                  {/* Status Badge */}
                  <span style={{
                    padding: '4px 10px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: '600',
                    ...styles.badge
                  }}>
                    {status === 'low' ? 'LOW STOCK' : status === 'unavailable' ? 'UNAVAILABLE' : 'IN STOCK'}
                  </span>
                </div>

                {/* Quantity */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  backgroundColor: theme.accentBg,
                  borderRadius: '8px'
                }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>Quantity</div>
                    <div style={{
                      fontSize: '24px',
                      fontWeight: '700',
                      color: status === 'low' ? '#c25a5a' : theme.text
                    }}>
                      {item.quantity}
                    </div>
                  </div>
                  <div style={{
                    borderLeft: `1px solid ${theme.border}`,
                    paddingLeft: '12px'
                  }}>
                    <div style={{ fontSize: '12px', color: theme.textMuted }}>Min</div>
                    <div style={{ fontSize: '18px', fontWeight: '600', color: theme.textSecondary }}>
                      {item.min_quantity || 0}
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {item.location && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', color: theme.textMuted }}>Location</span>
                      <span style={{ fontSize: '13px', color: theme.text, fontWeight: '500' }}>
                        {item.location}
                      </span>
                    </div>
                  )}
                  {item.product && (
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '13px', color: theme.textMuted }}>Unit Price</span>
                      <span style={{ fontSize: '13px', color: theme.text, fontWeight: '500' }}>
                        ${item.product.unit_price?.toFixed(2) || '0.00'}
                      </span>
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '13px', color: theme.textMuted }}>Updated</span>
                    <span style={{ fontSize: '13px', color: theme.text }}>
                      {formatDate(item.last_updated)}
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div style={{
                  display: 'flex',
                  gap: '8px',
                  marginTop: 'auto',
                  paddingTop: '12px',
                  borderTop: `1px solid ${theme.border}`
                }}>
                  <button
                    onClick={() => {
                      setSelectedItem(item)
                      setAdjustAmount(0)
                      setShowAdjustModal(true)
                    }}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
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
                    Adjust Qty
                  </button>
                  <button
                    onClick={() => toggleAvailable(item)}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: item.available ? 'rgba(194,90,90,0.1)' : 'rgba(74,124,89,0.1)',
                      color: item.available ? '#c25a5a' : '#4a7c59',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '13px',
                      fontWeight: '500',
                      cursor: 'pointer'
                    }}
                  >
                    {item.available ? 'Mark Unavailable' : 'Mark Available'}
                  </button>
                </div>

                {status === 'low' && item.ordering_trigger && (
                  <div style={{
                    padding: '10px',
                    backgroundColor: 'rgba(194,90,90,0.08)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: '#c25a5a'
                  }}>
                    <strong>Reorder Note:</strong> {item.ordering_trigger}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Add Item Modal */}
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
              Add Inventory Item
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
                      Item ID
                    </label>
                    <input
                      type="text"
                      value={formData.item_id}
                      onChange={(e) => setFormData({ ...formData, item_id: e.target.value })}
                      placeholder={generateItemId()}
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
                      Location
                    </label>
                    <select
                      value={formData.location}
                      onChange={(e) => setFormData({ ...formData, location: e.target.value })}
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
                      {locationOptions.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
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
                    Item Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                    placeholder="Enter item name"
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
                    Link to Product (optional)
                  </label>
                  <select
                    value={formData.product_id}
                    onChange={(e) => setFormData({ ...formData, product_id: e.target.value })}
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
                    <option value="">No linked product</option>
                    {products.map(prod => (
                      <option key={prod.id} value={prod.id}>
                        {prod.name} (${prod.unit_price?.toFixed(2) || '0.00'})
                      </option>
                    ))}
                  </select>
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
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.quantity}
                      onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
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
                      Min Quantity
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={formData.min_quantity}
                      onChange={(e) => setFormData({ ...formData, min_quantity: e.target.value })}
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
                    Reorder Note
                  </label>
                  <input
                    type="text"
                    value={formData.ordering_trigger}
                    onChange={(e) => setFormData({ ...formData, ordering_trigger: e.target.value })}
                    placeholder="e.g., Contact supplier ABC"
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

                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer'
                }}>
                  <input
                    type="checkbox"
                    checked={formData.available}
                    onChange={(e) => setFormData({ ...formData, available: e.target.checked })}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontSize: '14px', color: theme.text }}>
                    Available for use
                  </span>
                </label>
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
                  Add Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Adjust Quantity Modal */}
      {showAdjustModal && selectedItem && (
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
              marginBottom: '8px'
            }}>
              Adjust Quantity
            </h2>
            <p style={{
              fontSize: '14px',
              color: theme.textSecondary,
              marginBottom: '20px'
            }}>
              {selectedItem.name || selectedItem.product?.name}
            </p>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              padding: '20px',
              backgroundColor: theme.accentBg,
              borderRadius: '12px',
              marginBottom: '20px'
            }}>
              <button
                onClick={() => setAdjustAmount(adjustAmount - 1)}
                style={{
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#c25a5a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                <Minus size={24} />
              </button>

              <div style={{ textAlign: 'center', minWidth: '120px' }}>
                <div style={{ fontSize: '12px', color: theme.textMuted }}>
                  Current: {selectedItem.quantity}
                </div>
                <div style={{
                  fontSize: '32px',
                  fontWeight: '700',
                  color: adjustAmount >= 0 ? '#4a7c59' : '#c25a5a'
                }}>
                  {adjustAmount >= 0 ? '+' : ''}{adjustAmount}
                </div>
                <div style={{ fontSize: '14px', color: theme.textSecondary }}>
                  New: {Math.max(0, selectedItem.quantity + adjustAmount)}
                </div>
              </div>

              <button
                onClick={() => setAdjustAmount(adjustAmount + 1)}
                style={{
                  width: '48px',
                  height: '48px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#4a7c59',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '20px',
                  cursor: 'pointer'
                }}
              >
                <Plus size={24} />
              </button>
            </div>

            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setShowAdjustModal(false)
                  setSelectedItem(null)
                  setAdjustAmount(0)
                }}
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
                onClick={handleAdjustQuantity}
                disabled={adjustAmount === 0}
                style={{
                  padding: '10px 20px',
                  backgroundColor: adjustAmount === 0 ? theme.border : theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: adjustAmount === 0 ? 'not-allowed' : 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
